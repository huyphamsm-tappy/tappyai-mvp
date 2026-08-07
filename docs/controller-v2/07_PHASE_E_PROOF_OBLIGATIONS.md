# Component 7 — Phase E: proof obligations for the remaining assumptions

**Branch:** `feat/controller-v2-component7-audit-chain` · **Status:** verification, **no SQL, no migration**

**Epistemic note, up front.** Everything below is derived from PostgreSQL's
documented semantics. **None of it was executed** — there is no PostgreSQL
running in this session. Claims are therefore labelled:

- **[G]** — *guaranteed*: stated in the PostgreSQL documentation as contractual behaviour.
- **[I]** — *implementation-derived*: follows from how the engine is built, stable across versions in practice, but not stated as a contract I can cite.
- **[T]** — *must be proven by test* against a real PostgreSQL before it is believed.

The Component 1 `min(uuid)` defect passed code review, tsc, lint, 535 tests,
architecture and build because **none of those execute SQL**. Every **[T]** below
exists so that does not repeat.

---

# PART A — the transaction-local memo

`set_config('audit.chain_head', <value>, is_local := true)` is the function form
of `SET LOCAL`. Its behaviour is GUC (Grand Unified Configuration) behaviour, and
GUC state is maintained on a **nest-level stack** that follows transaction and
subtransaction boundaries.

## A1. Visibility between multiple BEFORE INSERT invocations in one transaction

**[G] Safe.** GUC values are session/transaction state, not per-call state. A
value set by one trigger invocation is readable by the next via
`current_setting('audit.chain_head', true)` — the second argument
(`missing_ok`) returns `NULL` rather than raising when the setting was never
established, which is exactly what the genesis case needs.

This is the property the memo exists for (Phase D §2.3), and it is the one
property that is unambiguously documented.

## A2. Nested function calls

**[G] Safe by default.** GUCs are not scoped to a call frame, so a function
called from the trigger — or a function that calls the trigger's statement —
sees the same value.

**⚠️ One documented exception that must be respected.** A function declared with
a `SET` clause (e.g. `CREATE FUNCTION … SECURITY DEFINER SET search_path = …`)
has *those named settings* saved on entry and restored on exit. The existing
Controller functions (`fn_grant_admin_role`, `fn_revoke_admin_role`,
`fn_is_platform_owner`) all use `SET search_path = public, pg_temp`, so the
pattern is already in this codebase.

`audit.chain_head` is not named in any such clause, so it survives. **But if
anyone ever adds `SET audit.chain_head` to a function definition, that function
would silently restore the old value on exit and the memo would go stale
mid-transaction.** → Precondition P8.

## A3. Savepoint rollback

**[I] Rolled back with the savepoint — and this is the behaviour we want.**

GUC changes are pushed onto a stack keyed by transaction nest level and unwound
on subtransaction abort. So `ROLLBACK TO SAVEPOINT` reverts the memo to its value
at the savepoint.

That is **correct for us**: if the row insert is rolled back, the memo must
revert too, otherwise the next insert would chain to a hash whose row no longer
exists. The memo and the row are rolled back together, which is precisely the
alignment the design needs.

I label this **[I]** rather than **[G]** because I am confident in the mechanism
but am not able, in this session, to cite the exact documentation sentence that
makes it contractual. **[T] — must be tested:** insert inside a savepoint, roll
back, insert again, verify the second row chains to the pre-savepoint head.

## A4. Exception handling — **the dangerous one**

**[G]** In PL/pgSQL, a `BEGIN … EXCEPTION WHEN … END` block is an **implicit
subtransaction**. This is documented explicitly, along with its cost.

Consequence: if the trigger body contains an exception handler and an error
occurs after `set_config`, the memo is reverted along with the subtransaction —
but any *side effects the handler then performs* proceed with the reverted memo.
Reasoning about which of several partially-rolled-back states the memo holds is
exactly the kind of analysis that produces a subtle, rare, unreproducible chain
fork.

**Design rule, not a mitigation: the trigger function must contain no
`EXCEPTION` block at all.** There is nothing for it to do — every failure mode
here should abort the insert loudly, and the application already treats a failed
audit insert as fatal-to-that-row (it swallows it, Phase C §F2). Adding a handler
would convert a loud failure into a silent chain defect. → Precondition P7.

## A5. AFTER trigger visibility

**[G] Visible.** AFTER triggers execute inside the same transaction, so they read
the memo set by the BEFORE trigger.

The design does not use an AFTER trigger and should not acquire one: an AFTER
trigger cannot modify `NEW`, so anything it did to the chain would require an
`UPDATE`, contradicting append-only (Phase D §3).

## A6. Transaction rollback

**[G] Discarded.** `SET LOCAL` effects "last only till the end of the current
transaction, whether committed or not". On rollback the memo vanishes with
everything else. No cleanup code, no leakage into the next transaction on the
same pooled connection — which matters, because PostgREST reuses connections.

## A7. Backend crash

**[G] Discarded, trivially.** GUC state lives in backend memory. If the backend
dies, the session and all its settings die with it. The advisory lock is released
by the same event (Phase C), so crash recovery needs no design at all: the next
insert reads the head from the table, because the memo is empty.

## A8. A trap the design has not yet addressed

**`row_hash` is `BYTEA`; a GUC value is `TEXT`.**

Storing the hash in the memo requires an explicit, symmetric encoding —
`encode(…, 'hex')` on write and `decode(…, 'hex')` on read. An implicit
`bytea → text` cast produces PostgreSQL's `\x…` output format, which does **not**
round-trip through `decode(…, 'hex')` and would corrupt the chain in exactly the
batched-insert case the memo was introduced to fix.

**[T]** This must be covered by a test that inserts two rows in one statement and
verifies the chain, not merely by inspection. → Precondition P9.

---

# PART B — the snapshot assumption

The Phase D proof rests on: *"each `SELECT` inside the VOLATILE trigger function
takes a fresh READ COMMITTED snapshot."*

## B1. Why VOLATILE matters — it is load-bearing, not incidental

**[G]** PostgreSQL documents this directly under function volatility categories:
`STABLE` and `IMMUTABLE` functions use a snapshot established **as of the start
of the calling query**, whereas `VOLATILE` functions obtain a **fresh snapshot at
the start of each query they execute**.

Apply that to the trigger:

| Volatility | Snapshot used by the head `SELECT` | Chain result |
|---|---|---|
| `VOLATILE` (default) | fresh, taken **after** the advisory lock was acquired | ✅ sees the previous holder's committed row |
| `STABLE` / `IMMUTABLE` | the **calling INSERT's** snapshot, taken **before** the lock | ❌ blind to the previous holder — **fork** |

So `VOLATILE` is not a stylistic default that happens to be fine. **It is the
mechanism that makes the proof true.** Declaring the trigger function `STABLE` —
a plausible thing for someone to do believing it a harmless optimisation —
silently produces forks under concurrency and nothing else changes. → P4.

## B2. Can a trigger function accidentally invalidate the proof?

Yes, in four ways, all silent:

1. **Declaring it `STABLE`/`IMMUTABLE`** — B1. The chain still builds; it is just
   wrong.
2. **Moving the head `SELECT` before the lock** — the fresh snapshot is then
   taken outside the critical section and the proof's fact (iii) fails.
3. **Adding an `EXCEPTION` block** — A4.
4. **Hoisting the head lookup into a helper function.** If the helper is
   `LANGUAGE sql` and gets inlined, it stops being a separate query and adopts
   the caller's snapshot — see B3.

None of these produce an error. All of them produce a chain that verifies
incorrectly later, which the verifier will report as **tampering**. A false
tampering alarm is the expensive failure mode identified in Phase D §3.

## B3. Do SQL functions behave differently? — Yes

**[G]** A `LANGUAGE sql` function whose body is a single expression may be
**inlined** by the planner. Once inlined it is no longer a separate query; it is
evaluated as part of the calling query and therefore uses the **calling query's
snapshot**, regardless of the volatility label on the original function.

Two consequences:

- The trigger function itself **cannot** be `LANGUAGE sql` — a trigger function
  must return type `trigger`, which SQL-language functions cannot. So the trigger
  is necessarily `plpgsql`. The repo already establishes this pattern
  (`fn_grant_admin_role` is `LANGUAGE plpgsql`, while `fn_is_platform_owner` is
  `LANGUAGE sql` — both styles are in use, so the distinction is live here).
- A **helper** could be `LANGUAGE sql`, get inlined, and quietly move the head
  lookup onto the wrong snapshot. → **The head lookup must be written inline in
  the plpgsql trigger body**, not delegated. P5.

## B4. Could a future refactor silently break correctness?

Yes. Consolidated list of silent breakers, each of which leaves the system
running and only shows up as a spurious tampering report:

| # | Change | Breaks |
|---|---|---|
| 1 | Trigger declared `STABLE`/`IMMUTABLE` | B1 |
| 2 | Head `SELECT` moved before the lock | Phase D proof (iii) |
| 3 | Audit write wrapped in `REPEATABLE READ`/`SERIALIZABLE` | Phase D §2.2 |
| 4 | `.insert([…])` batch form in `audit.ts` | Phase D §2.3 — memo required |
| 5 | `EXCEPTION` block added to the trigger | A4 |
| 6 | Head lookup moved into a `LANGUAGE sql` helper | B3 |
| 7 | `SET audit.chain_head` added to some function's `SET` clause | A2 |
| 8 | Advisory lock changed to session-scoped, or keyed per row | Phase C |
| 9 | `seq` given a column default again | Phase C §4 |

**This is why the concurrency test is not optional.** A sequential test passes
under every one of the nine. Only genuinely parallel inserts distinguish a
correct chain from a broken one.

---

# Implementation Preconditions

Every condition that must remain true for the chain proof to hold. Numbered so
they can be cited in the migration, in review, and in the tests.

| # | Precondition | Source | Enforced how |
|---|---|---|---|
| **P1** | The transaction isolation level is **READ COMMITTED** | Phase D §2.2 | Trigger asserts `current_setting('transaction_isolation')` and raises otherwise |
| **P2** | The advisory lock is **transaction-scoped** (`pg_advisory_xact_lock`), on a single fixed key, acquired **before** any chain read | Phase C | Code review + concurrency test |
| **P3** | `seq` has **no column default**; it is allocated by `nextval` **inside** the lock | Phase C §4 | Schema (no `DEFAULT`) + concurrency test |
| **P4** | The trigger function is **`VOLATILE`** (the default — must not be overridden) | B1 | Explicit `VOLATILE` in the definition, so a future edit is a visible change |
| **P5** | The head lookup is written **inline in the plpgsql trigger**, never delegated to a `LANGUAGE sql` helper | B3 | Code review |
| **P6** | Reads consult the **transaction-local memo first**, the table second | Phase D §2.3 | Multi-row insert test |
| **P7** | The trigger contains **no `EXCEPTION` block** | A4 | Code review |
| **P8** | No function names `audit.chain_head` in a `SET` clause | A2 | Code review |
| **P9** | The memo encodes the hash **symmetrically** (`encode`/`decode` hex), never an implicit `bytea→text` cast | A8 | Multi-row insert test |
| **P10** | The hash input uses **explicit field separation** or length-prefixing | Phase D §5 | Test with adversarial field boundaries |
| **P11** | `jsonb::text` is deterministic for a stored value | Phase D §5 | Test against real PostgreSQL |
| **P12** | Audit inserts are **single-row**, or the memo covers batches | Phase D §2.3 | Multi-row insert test |

## Proof obligations that must be discharged by test — not by reading

**[T]** items, restated as the minimum test set:

1. **Concurrency** — parallel inserts from independent connections; assert the
   chain verifies and that `seq` order equals chain order. Fails under P2, P3,
   P4, P8, P9 violations.
2. **Multi-row insert** — a single statement inserting two rows; assert no fork.
   Fails under P6, P9, P12.
3. **Savepoint rollback** — insert, savepoint, insert, roll back, insert; assert
   the chain is intact (A3).
4. **Isolation assertion** — attempt an insert under `REPEATABLE READ`; assert it
   **raises** rather than silently forking (P1).
5. **Adversarial hashing** — two rows whose field boundaries differ but whose
   naive concatenation is identical; assert different hashes (P10).
6. **JSONB determinism** — same logical metadata written with different key
   order; assert identical `row_hash` (P11).
7. **Tamper detection RED/GREEN** — modify a row, delete a row, insert a
   backdated row; assert the verifier reports each.

All seven require a **real PostgreSQL**. The repository already has the harness:
`supabase/tests/platform_owner_bootstrap.test.ts` runs the actual `.sql` files
against `embedded-postgres`, including the `initdbFlags: ['--encoding=UTF8',
'--locale=C']` workaround without which initdb inherits the Windows locale and
creates a WIN1252 cluster.

---

**Proof complete. No implementation. Awaiting approval.**

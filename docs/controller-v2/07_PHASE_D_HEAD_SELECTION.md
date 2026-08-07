# Component 7 — Phase D: chain head selection

**Branch:** `feat/controller-v2-component7-audit-chain` · **Status:** design verification, **no SQL, no migration**
**Outcome:** `ORDER BY seq DESC LIMIT 1` is **correct — under two preconditions that must be enforced.** One of them is not satisfied by the naive design. See §3.

---

> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 1. The model, restated precisely

Everything below assumes the Phase C decision:

```
BEFORE INSERT ON audit_log FOR EACH ROW:
  1. pg_advisory_xact_lock(K)          -- K a fixed key
  2. NEW.seq := nextval(S)             -- inside the lock (Phase C §4)
  3. prev  := <head selection>         -- the subject of this phase
  4. NEW.prev_hash := prev
  5. NEW.row_hash  := sha256(…)
```

Two properties of `pg_advisory_xact_lock` matter and are easy to misread:

- It is held **until the transaction commits or aborts**, not until the trigger
  returns. The critical section therefore *includes* the insert itself.
- It is released on commit, rollback **and backend crash**. There is no
  stuck-lock recovery path to design.

> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 2. Can `ORDER BY seq DESC LIMIT 1` return the wrong predecessor?

#> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 2.1 Under the accepted model — **No.** Proof.

The claim to prove: when transaction B runs step 3, the row inserted by any
transaction A that committed before B acquired the lock **is visible to B**.

It rests on three facts:

**(i) The lock totally orders the critical sections.** Only one transaction holds
`K` at a time, and it holds it through commit. So for any two inserters A and B,
either A commits before B acquires `K`, or vice versa. There is no interleaving.

**(ii) Under READ COMMITTED, each SQL statement inside a VOLATILE PL/pgSQL
function takes a fresh snapshot.** Trigger functions are VOLATILE by default (and
`fn_grant_admin_role` in this repo already uses `LANGUAGE plpgsql`, so the style
is established). B's step-3 `SELECT` is therefore evaluated against a snapshot
taken **at the moment it runs** — which, by (i), is after A committed.

**(iii) Step 3 runs after step 1.** The ordering inside the trigger body is what
makes (ii) useful. A `SELECT` placed *before* the lock would read a pre-lock
snapshot and the proof collapses.

**Timeline:**

```
A: acquire K ──── nextval → 5 ──── SELECT head → 4 ──── write ──── COMMIT (releases K)
                                                                      │
B: INSERT begins ─── acquire K … blocked ─────────────────────────────┘
                     acquires K ──── nextval → 6 ──── SELECT head → sees A's row 5 ✅
```

B's `SELECT` is a new statement in a VOLATILE function, executed strictly after
K was acquired, which was strictly after A's commit. A's row is committed and
therefore visible. B chains to 5. **Sequence order, lock order and chain order
coincide.** ∎

#> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 2.2 Under REPEATABLE READ or SERIALIZABLE — **Yes, it breaks.**

If the transaction's isolation level is REPEATABLE READ or higher, the snapshot
is fixed at **transaction start**, and fact (ii) no longer holds. B's step-3
`SELECT` would not see A's row even though A committed first:

```
B: BEGIN (snapshot taken — A not yet committed)
A:                        acquire K … seq 5 … COMMIT
B: acquire K ── nextval → 6 ── SELECT head → sees row 4, NOT row 5  ✗
```

Result: rows 5 and 6 both chain to row 4. **A fork, produced by two honest
writes**, and the verifier would report tampering.

**This is a precondition, not a hypothetical.** It is satisfied today — Phase C
§F1 established that every insert arrives through PostgREST as its own implicit
transaction at the PostgreSQL default, READ COMMITTED — but nothing in the
database *enforces* it. A future RPC that wraps audit writes in a
`REPEATABLE READ` transaction would silently corrupt the chain.

**Mitigation:** the trigger asserts its own precondition —
`current_setting('transaction_isolation')` must be `read committed`, otherwise
raise. Cheap, and it converts a silent corruption into a loud failure.

#> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 2.3 Multi-row `INSERT` in a single statement — **Yes, it breaks.**

This one the lock cannot help with, because both rows are inside the *same*
transaction and the *same* command.

```
INSERT INTO audit_log VALUES (row_x), (row_y);   -- one statement, two rows

trigger fires for row_x:  acquire K (ok) … seq 5 … SELECT head → 4 … chain to 4
trigger fires for row_y:  K already held by self (re-entrant, returns immediately)
                          seq 6 … SELECT head → still 4, because row_x was
                          inserted by the SAME command and is not visible to it
                          → chain to 4   ✗ FORK
```

Two facts combine: a transaction already holding an advisory lock re-acquires it
without blocking, and rows inserted by the current command are not visible to
that command's own snapshot.

**Is it reachable today?** No — `audit.ts:54` passes a single object, and no
array form exists anywhere in the repo. But it is one character away
(`.insert([a, b])`), and Component 4 already showed that one request can produce
two audit rows. The design must not depend on nobody ever batching.

**Mitigation:** a **transaction-local memo**. After computing `row_hash`, the
trigger stores it with `set_config('audit.chain_head', …, is_local := true)`.
Step 3 reads the memo first and falls back to the table only when it is empty.
`is_local := true` scopes the value to the current transaction and discards it on
commit or rollback — no cleanup, no leakage between transactions.

This closes both the multi-row case **and** the case of several separate audit
inserts inside one future explicit transaction.

> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 3. Option comparison

| | **1. `ORDER BY seq DESC LIMIT 1`** | **2. `MAX(seq)`** | **3. Singleton head table** | **4. `SELECT … FOR UPDATE` on the tail** |
|---|---|---|---|---|
| **Correctness** | ✅ with §2.2 + §2.3 mitigations | ✅ identical semantics | ✅ | ⚠️ no row to lock on the first insert; `FOR UPDATE` with `ORDER BY … LIMIT` needs `SKIP LOCKED` care |
| **Interaction with the advisory lock** | ✅ clean — the lock provides ordering, the query provides the value | ✅ same | ⚠️ the row lock on the singleton is itself a serialization point, making the advisory lock partly redundant — two overlapping mechanisms | ⚠️ two lock types to reason about |
| **Index usage** | ✅ `UNIQUE(seq)` btree → backward index scan, `O(log n)`, one lookup | ⚠️ same plan, but fetching the hash needs a second lookup (`WHERE seq = (SELECT MAX…)`) | ✅ single-row table, trivial | ✅ index scan + lock |
| **Concurrency** | ✅ serialized by the lock | ✅ | ✅ serialized by the row lock | ⚠️ lock-wait behaviour harder to reason about |
| **Crash recovery** | ✅ nothing to recover; the table *is* the state | ✅ | ⚠️ **new failure mode** — head row and table tail can diverge (restore, partial backfill) and a divergence reads as tampering | ✅ |
| **Implementation complexity** | ✅ lowest | ✅ low | ❌ new table, bootstrap row, backfill must update both, migration must keep them consistent | ⚠️ medium |
| **Operational risk** | ✅ low | ✅ low | ❌ a second source of truth for the same fact | ⚠️ medium |

#> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## Why not the singleton head table, despite one real advantage

It has a genuine benefit: because the head is stored independently, deleting the
tail does **not** move it, so the next insert chains to a hash whose row is gone
and the break is immediate. That is threat **T4** (tail truncation), which the
Phase B threat model listed as *not detectable without an external checkpoint*.

But the advantage is smaller than it looks. An attacker holding the service-role
key — the adversary in this threat model — can update the head table just as
easily as they can delete the row. It raises the cost from one statement to two;
it does not make T4 *hard*. Genuine T4 detection needs an anchor **outside the
database**, which is exactly what Phase B deferred.

Against that modest gain: a second authoritative copy of the same fact, which can
diverge from the table through a restore, a partial backfill or a botched
migration — and a divergence is indistinguishable from tampering. **For an audit
system, a false "tampering detected" is expensive**: it costs an investigation
and, worse, it teaches operators to distrust the alarm.

**Rejected for Component 7.** Recorded here so the trade-off is visible rather
than unconsidered.

#> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## Other PostgreSQL-native approaches considered and rejected

- **Deferred constraint trigger** (`AFTER INSERT … DEFERRABLE`): runs at commit,
  when `NEW` can no longer be modified. Writing the hash would need an `UPDATE`,
  contradicting append-only.
- **Generated column**: cannot reference other rows.
- **`pg_sequence_last_value`**: returns a number, not a hash.
- **Computing the chain in the `INSERT` statement itself**: unreachable — Phase C
  §F1 established the application cannot compose statements through PostgREST.

> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 4. The definitive algorithm

```
BEFORE INSERT ON audit_log FOR EACH ROW
────────────────────────────────────────────────────────────────────
 0. PRECONDITION
      assert current_setting('transaction_isolation') = 'read committed'
      -- §2.2: any stricter level pins the snapshot at transaction start
      -- and two honest writes fork the chain. Fail loudly instead.

 1. SERIALIZE
      pg_advisory_xact_lock(K)              -- K a fixed, documented key
      -- held through COMMIT, so the critical section includes the insert;
      -- released automatically on commit, rollback or backend crash.

 2. ASSIGN seq
      NEW.seq := nextval(S)                 -- NO column default (Phase C §4)
      -- inside the lock ⇒ lock order = sequence order = chain order.

 3. LOCATE prev_hash
      prev := nullif(current_setting('audit.chain_head', true), '')
      if prev is null then
          prev := (SELECT row_hash FROM audit_log ORDER BY seq DESC LIMIT 1)
      end if
      -- memo first (§2.3: same-command and same-transaction rows are not
      -- visible to the table read); table second, correct by §2.1.
      -- Empty table ⇒ NULL ⇒ genesis row.

 4. COMPUTE row_hash
      NEW.prev_hash := prev
      NEW.row_hash  := sha256(
            coalesce(prev, '\x00')
         || NEW.seq
         || NEW.actor_id || NEW.actor_email || NEW.actor_role
         || NEW.action
         || coalesce(NEW.target_type,'')  || coalesce(NEW.target_id,'')
         || coalesce(NEW.before_state::text,'') || coalesce(NEW.after_state::text,'')
         || coalesce(NEW.metadata::text,'')
         || coalesce(NEW.ip_address::text,'') || coalesce(NEW.user_agent,'')
         || NEW.created_at
      )
      -- every column is covered, including the four the read API never
      -- returns — otherwise before_state is the safe place to tamper.
      -- Field separator required: see §5.

 5. MEMO
      set_config('audit.chain_head', NEW.row_hash, true)
      -- is_local := true ⇒ scoped to this transaction, discarded on
      -- commit or rollback. No cleanup, no cross-transaction leakage.
────────────────────────────────────────────────────────────────────
```

**Verification walks the same order:** for each row in ascending `seq`, recompute
step 4 and compare to the stored `row_hash`, and compare `prev_hash` to the
previous row's `row_hash`. A mismatch localises the tampering to a row; a
sequence gap localises a deletion to an interval.

> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 5. Two details that must not be left to the implementer

**Field separation.** Concatenating fields without a separator is forgeable:
`action='a', target_id='bc'` and `action='ab', target_id='c'` hash identically.
The concatenation must use an unambiguous separator or length-prefixing. This is
a classic hashing mistake and it silently destroys the property being bought.

**JSONB canonicalisation.** `jsonb::text` is deterministic for a given stored
value because PostgreSQL normalises key order and whitespace on input. The chain
depends on it, so it must be **asserted by test** against a real PostgreSQL, not
assumed from documentation.

> ⚠️ **CORRECTED BY MEASUREMENT during the second adversarial pass.** This
> document's "BREAKS #2" claims a multi-row `INSERT` forks *unconditionally*
> without the transaction-local memo. On PostgreSQL 17.5 it does not. plpgsql
> executes each statement through SPI, which performs a `CommandCounterIncrement`
> first, so the head lookup sees rows inserted earlier in the same command. A
> memo-less build was driven with multi-row `VALUES`, `INSERT ... SELECT` and
> writable CTEs and chained correctly every time (test **B-22**), and the whole
> suite passes with the memo disabled.
>
> The memo is retained as defence in depth — the behaviour it guards is a
> plpgsql implementation detail, not a documented guarantee — but it is
> redundancy, not the mechanism, and **no test fails without it**. Keeping the
> original wording would have left a load-bearing claim that nothing verifies.
>
> The memo was also not free: trusting the GUC without proof of origin produced
> two reproduced defects (a poisoned chain head, and a silent total audit outage
> from a malformed value). Both are fixed by stamping it with the transaction id.

## 6. What Phase D changed

| | |
|---|---|
| Head selection | **`ORDER BY seq DESC LIMIT 1`** — chosen, and proven correct rather than assumed |
| Isolation level | **new precondition + assertion** — the algorithm is correct only under READ COMMITTED |
| Multi-row inserts | **new mitigation** — transaction-local memo; without it a batched insert forks the chain |
| Hash input | **new requirement** — explicit field separation |
| Singleton head table | considered, rejected, with the T4 trade-off recorded |

---

**The design is now mathematically complete. No implementation. Awaiting approval.**

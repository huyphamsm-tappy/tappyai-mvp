# Component 7 — Phase C: chain serialization decision

**Branch:** `feat/controller-v2-component7-audit-chain` · **Status:** design verification, **no code**
**Outcome:** recommendation **unchanged** (advisory lock) — but the design **must be corrected**. See §4.

---

## 1. Two facts that decide this comparison

Both were measured in the repository, and each rules out an option on its own.

### F1 — the application cannot open a transaction

`src/lib/supabase/{admin,client,server}.ts` construct supabase-js clients against
`NEXT_PUBLIC_SUPABASE_URL`. There is **no `DATABASE_URL`, no pooler port, no
direct Postgres connection anywhere in the repo**. Every write reaches the
database through **PostgREST over HTTPS**.

Consequence: a single `.insert()` is its **own implicit transaction**, and the
client has no way to say `BEGIN ISOLATION LEVEL SERIALIZABLE`. This is precisely
why every existing multi-step operation in this codebase is an RPC —
`fn_grant_admin_role`, `fn_revoke_admin_role`, `fn_upsert_activation`,
`fn_upsert_user_acquisition`. There is no other mechanism available.

### F2 — a failed audit write is silently discarded

`src/lib/admin/audit.ts:51` — the write is `void (async () => …)` and every error
is caught and logged, never thrown. Callers do not await it.

Consequence: **any strategy whose failure mode is "abort and retry" loses audit
rows silently**, because there is nothing to retry and nothing to notice. This is
the single most important criterion, and it is not a hypothetical: the rows most
likely to conflict are concurrent administrative actions — exactly the rows an
audit log exists for.

## 2. The three strategies

### Option 1 — `pg_advisory_xact_lock` in a `BEFORE INSERT` trigger

| Criterion | Assessment |
|---|---|
| **Correctness** | ✅ Strong. Serializes the read-tail → compute-hash → write critical section. Only one inserter is inside it at a time. |
| **Deterministic ordering** | ✅ **Only if the sequence is allocated inside the lock** — see §4. With a column default it is **not** deterministic. |
| **Concurrent inserts** | ✅ Handled by blocking, not by failing. The second writer waits, then proceeds. Nothing is lost. |
| **Deadlock risk** | ✅ Effectively none. One lock, one key, always acquired first and alone — there is no second resource to order against, so no cycle can form. |
| **Operational complexity** | ✅ Low. One trigger, one lock key. No client change, no retry logic, no isolation-level plumbing. |
| **Supabase/PostgreSQL compat** | ✅ Best of the three. `pg_advisory_xact_lock` is **transaction-scoped** and released at commit, which makes it safe under any pooling mode — unlike session-scoped `pg_advisory_lock`, which leaks under transaction pooling. Works through PostgREST because it lives server-side. |
| **Recovery** | ✅ Lock is released automatically on commit, rollback **or backend crash**. No stuck-lock class of incident. |
| **Failure modes** | Contention → waiting. A pathological wait would hit the statement timeout and the insert fails → **silently dropped** (F2). At this volume that is remote, but it is the honest worst case. |

### Option 2 — sequence-based ordering only, no lock

| Criterion | Assessment |
|---|---|
| **Correctness** | ❌ **Fails the objective.** Without serialization, two concurrent triggers read the *same* tail and both chain to it. The chain **forks**, and the verifier reports a break that is a race, not tampering. A verifier that cries wolf is worse than none. |
| **Deterministic ordering** | ⚠️ The sequence orders rows, but sequence order ≠ chain order without a lock. |
| **Concurrent inserts** | ⚠️ Never blocked — but produces a corrupt chain. |
| **Deadlock risk** | ✅ None. |
| **Operational complexity** | ✅ Lowest. |
| **Supabase compat** | ✅ Fine. |
| **Recovery** | ❌ A fork is not self-healing; it must be repaired by hand or by re-anchoring. |
| **Failure modes** | Sequence gaps occur naturally — rolled-back transactions burn values, and sequence `cache` burns blocks per backend. **A gap is therefore not evidence of deletion**, so this option cannot even deliver the weaker guarantee on its own. |

**Where it does help:** the sequence is still needed — for total order and for gap
*signals*. It is a necessary component, not a sufficient strategy.

### Option 3 — `SERIALIZABLE` transaction

| Criterion | Assessment |
|---|---|
| **Correctness** | ✅ In principle SSI guarantees a serial order. |
| **Deterministic ordering** | ⚠️ Serializable guarantees *a* serial order exists, not that it matches `seq`. The same allocation problem as §4 applies. |
| **Concurrent inserts** | ❌ **Conflicts abort with `40001 could not serialize access`.** The contract is *"retry the whole transaction"*. |
| **Deadlock risk** | ⚠️ Not deadlock, but serialization failures — which at this write pattern would be routine, not exceptional. |
| **Operational complexity** | ❌ Highest. Requires (a) converting the insert into an RPC because F1 leaves no way to set an isolation level from supabase-js, and (b) a retry loop with backoff. Both contradict *"preserve the existing API"*. |
| **Supabase compat** | ❌ Not reachable from supabase-js without the RPC rewrite. |
| **Recovery** | ❌ Depends entirely on the retry loop being correct. |
| **Failure modes** | ❌ **Disqualifying.** Combined with F2, a serialization failure means the audit row is *silently discarded*. The strategy's normal, expected behaviour under concurrency is to drop exactly the records this component exists to protect. |

## 3. Recommendation

# → Option 1: `pg_advisory_xact_lock`, unchanged

Not because it is elegant, but because of how the three fail:

- **Option 2 fails correctness** — it produces forks that are indistinguishable
  from tampering, defeating the purpose.
- **Option 3 fails safely for a normal table and catastrophically for this one.**
  Its designed response to contention is to abort, and this write path swallows
  aborts. It would trade "tampering is undetectable" for "concurrent audit rows
  silently vanish", which is not an improvement.
- **Option 1 responds to contention by waiting**, which at this volume costs
  microseconds and loses nothing.

The decisive evidence is F2, and it is a property of code already in production
that Component 7 was told not to redesign.

**The sequence from Option 2 is still adopted** — for total order and gap
signalling. The comparison is not lock-versus-sequence; it is *what serializes
the chain*, and the answer is the lock.

## 4. Required correction to the design — a real flaw found in Phase C

The Phase B design said `seq BIGSERIAL`. **That is wrong, and it would have
produced a chain that fails verification under concurrency.**

In PostgreSQL, **column defaults are evaluated when the tuple is formed, before
`BEFORE ROW` triggers fire**. So `nextval()` runs *outside* the advisory lock:

```
txn A: seq := 5   (default evaluated)          ─┐ both already numbered
txn B: seq := 6   (default evaluated)          ─┘ before either takes the lock

txn B acquires the lock first → prev_hash := hash(seq 4)   → commits as seq 6
txn A acquires the lock second → prev_hash := hash(seq 6)  → commits as seq 5
```

Verified in `seq` order the chain reads 4 → 5 → 6, but row 5 links to row 6.
**The verifier would report tampering on a perfectly honest pair of writes.**

**Correction:** do not give `seq` a column default. Allocate it *inside the
trigger, after acquiring the lock*:

```
1. pg_advisory_xact_lock(<fixed key>)
2. NEW.seq := nextval(<sequence>)
3. prev := row_hash of the current MAX(seq)
4. NEW.prev_hash := prev ; NEW.row_hash := sha256(…)
```

Now **lock order == sequence order == chain order**, by construction.

This also removes a second-order problem: with a default, a transaction that
rolls back after taking a number leaves a gap *and* the chain is unaffected —
but the two facts become hard to reason about together. Allocating under the
lock keeps "gap" meaning one thing.

### Consequences of the correction

| | |
|---|---|
| Application code | still **zero change** — the trigger does all of it |
| Backfill | unchanged; existing rows are numbered in physical order at migration time |
| Rollback | still `DROP TRIGGER`; the sequence and columns can remain |
| New risk | the trigger now owns sequence allocation, so a bug there stops audit inserts entirely. Must be covered by the real-PostgreSQL test, including the concurrent case |

## 5. Residual risks, unchanged by this decision

- **A blocked insert that times out is silently lost** (F2). Component 7 does not
  fix the fire-and-forget write path — that is a deliberate scope boundary, and
  it means the chain proves the integrity of rows that *were* written, never that
  every intended row exists (threat T6).
- **A consistent full rewrite or a tail truncation still verify** — closing those
  needs the external checkpoint, still deliberately not proposed (no consumer).

## 6. What Phase C changed

| | |
|---|---|
| Serialization strategy | **unchanged** — advisory lock, now with evidence rather than assertion |
| Sequence allocation | **changed** — moved inside the lock; a column default would have broken the chain under concurrency |
| Everything else | unchanged |

---

**Stopping after the design decision. No SQL, no migration, no implementation.**

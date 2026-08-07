# Component 7 — Phase F: executable test specification

**Branch:** `feat/controller-v2-component7-audit-chain` · **Status:** specification, **no implementation, no SQL**
**Design frozen:** Phases A–E. Preconditions **P1–P12** are from Phase E.

---

## Conventions

- **Harness:** `embedded-postgres` running a real server, as
  `supabase/tests/platform_owner_bootstrap.test.ts` already does — executing the
  actual `.sql` files read from disk, never a pasted copy. `initdbFlags:
  ['--encoding=UTF8', '--locale=C']` is mandatory; without it initdb inherits the
  Windows locale, builds a WIN1252 cluster, and the suite fails for reasons
  unrelated to the code.
- **Verifier PASS** = `fn_verify_audit_chain()` returns **zero rows**.
  **Verifier FAIL** = it returns ≥ 1 row, and the test asserts *which* problem
  and *which* `seq`.
- **`CI`** = runs on every push. **`MANUAL`** = run before release; too slow or
  too resource-hungry for CI.
- Every test seeds a **fresh database**. Chain state is global; a leaked row from
  a previous test is itself a source of false failures.

---

# PART 1 — Test matrix

## 1.1 Chain construction

| ID | Purpose | Setup | Operations | Expected | Failure meaning |
|---|---|---|---|---|---|
| **C-01** | Genesis row | empty table | insert 1 row | `seq`=1, `prev_hash` **IS NULL**, `row_hash` non-null; verifier PASS | Genesis handling wrong — every later test is meaningless |
| **C-02** | Second row links | C-01 | insert 1 row | `seq`=2, `prev_hash` = row 1's `row_hash`; verifier PASS | The chain does not link at all |
| **C-03** | Long chain | empty | insert 100 sequentially | `seq` 1..100 contiguous; every `prev_hash[n]` = `row_hash[n-1]`; verifier PASS | Linkage breaks at scale or at a page boundary |
| **C-04** | All-NULL optionals | empty | insert with `target_type`, `target_id`, `before_state`, `after_state`, `metadata`, `ip_address`, `user_agent` all NULL | insert succeeds; verifier PASS | NULL handling in the hash input — the most common source of a `NULL`-poisoned hash |
| **C-05** | All optionals populated | empty | insert with every column non-NULL | verifier PASS | A column is missing from the hash input |
| **C-06** | Empty string ≠ NULL | empty | row A `target_id = ''`, row B `target_id = NULL` | the two rows produce **different** `row_hash` | `coalesce(x,'')` collapses NULL and empty — two distinct records become indistinguishable |
| **C-07** | Unicode and control bytes | empty | `actor_email` with emoji, `user_agent` with a newline and a tab | verifier PASS; hash stable across re-verification | Encoding instability in the hash input |
| **C-08** | Very large payload | empty | `before_state` ≈ 1 MB JSONB | insert succeeds; verifier PASS | Truncation or a size limit in the hash path |

## 1.2 Hash-input integrity (P10)

| ID | Purpose | Setup | Operations | Expected | Failure meaning |
|---|---|---|---|---|---|
| **H-01** | **Field-boundary forgery** | empty | row A: `action='a'`, `target_id='bc'`; row B: `action='ab'`, `target_id='c'` | `row_hash(A) ≠ row_hash(B)` | **P10 violated** — fields concatenated without separation. Two different records hash identically, and the chain can be forged by shifting a boundary |
| **H-02** | Separator injection | empty | a field whose value contains the separator byte itself | hashes remain distinct from the shifted-boundary equivalent | The separator is not escaped or length-prefixed |
| **H-03** | `seq` participates | empty | two rows identical in every column but `seq` | different `row_hash` | `seq` omitted from the input — rows become reorderable |
| **H-04** | `prev_hash` participates | empty | recompute row 2's hash with row 1's hash swapped | differs from stored | `prev_hash` omitted — it is a list of hashes, not a chain |
| **H-05** | `created_at` participates | empty | two rows identical but for `created_at` | different `row_hash` | timestamps rewritable undetected (see T-09) |

---

# PART 2 — Concurrency

The core obligation. **A sequential test passes under all nine silent breakers in
Phase E §B4** — only genuine parallelism distinguishes a correct chain.

Each test uses **independent connections**, not one connection issuing
statements in sequence.

| ID | Purpose | Setup | Operations | Expected | Failure meaning |
|---|---|---|---|---|---|
| **K-02** | Minimum contention | empty | **2** connections insert simultaneously, released by a common barrier | both succeed; `seq` = {1,2}; chain linear; verifier PASS | The lock does not serialize, or `seq` is allocated outside it (**P2/P3**) |
| **K-10** | Moderate | empty | **10** concurrent inserts | `seq` 1..10 contiguous, no duplicates; each `prev_hash` = predecessor's `row_hash`; verifier PASS | As above, at a scale where a race is likely rather than possible |
| **K-100** | Heavy | empty | **100** concurrent inserts | `seq` 1..100 contiguous; verifier PASS; no deadlock; no timeout | Lock contention, deadlock, or statement timeout under load |
| **K-ORD** | **Order equivalence** | empty | 20 concurrent inserts | **`seq` order == chain order**: sorting by `seq` yields a chain where every `prev_hash` matches the previous row | **P3 violated** — the Phase C flaw. `seq` allocated by a column default, so lock order and sequence order diverge |
| **K-DUP** | No duplicate `seq` | empty | 100 concurrent | `UNIQUE(seq)` never violated | Sequence allocated outside the lock, or the unique constraint missing |
| **K-FORK** | No two rows share a predecessor | empty | 100 concurrent | `count(DISTINCT prev_hash) = count(*) - 1` (only genesis has NULL) | **Two rows chained to the same predecessor — a fork.** The canonical symptom of every Phase E breaker |

## 2.2 Adversarial scheduling

Concurrency tests that only ever exercise the scheduler's preferred order prove
very little. These force the orders that matter.

| ID | Purpose | Method | Expected |
|---|---|---|---|
| **K-ADV-1** | **Commit order reversed relative to start order** | 2 connections; A begins its `INSERT` first but is made to commit *second* (barrier held after the trigger, released in reverse) | verifier PASS. `seq` reflects **lock acquisition order**, not statement-start order — which is the correctness claim, stated positively |
| **K-ADV-2** | Blocked writer resumes correctly | A holds the lock and sleeps inside its transaction; B blocks; A commits | B's `prev_hash` = A's `row_hash`. **This is the direct test of the Phase D §2.1 proof** — that B's post-lock `SELECT` sees A's committed row |
| **K-ADV-3** | Waiter aborts mid-wait | A holds the lock; B blocks; B is cancelled; C then inserts | C chains to A. The sequence number B consumed (if any) is a benign gap — see R-01 |
| **K-ADV-4** | All permutations, small N | 3 connections; enumerate all **6** commit orders explicitly | verifier PASS in all 6. Exhaustive at N=3 rather than probabilistic |
| **K-ADV-5** | Randomised soak | 50 rounds × 20 connections, random pre-commit delays | verifier PASS every round; **any failure must be captured with its full row dump**, because a chain fork is exactly the class of bug that does not reproduce |

**Why `MANUAL` for K-100 and K-ADV-5:** connection-count and wall-clock cost.
K-02, K-10, K-ORD, K-DUP, K-FORK, K-ADV-1, K-ADV-2, K-ADV-4 are **CI**.

---

# PART 3 — Multi-row insert

Phase D §2.3 established that without the memo every row of a batch chains to the
same predecessor, because a transaction re-acquires its own advisory lock without
blocking and rows inserted by the current command are invisible to that command's
snapshot.

**All three forms fire `BEFORE INSERT … FOR EACH ROW` triggers**, so the memo
should carry the chain across them. That is the hypothesis these tests exist to
falsify — not to confirm.

| ID | Purpose | Operations | Expected | Failure meaning |
|---|---|---|---|---|
| **M-01** | `VALUES` multi-row | `INSERT … VALUES (a),(b),(c)` in one statement | `seq` contiguous; **linear chain** a→b→c; verifier PASS | **P6/P9 violated.** Either the memo is not consulted, or the BYTEA↔TEXT encoding does not round-trip (Phase E §A8) and the memo returns garbage |
| **M-02** | `INSERT … SELECT` | insert 50 rows from a `SELECT` | linear chain across all 50; verifier PASS | Same as M-01, at a scale where the failure is unmistakable |
| **M-03** | `COPY FROM` | `COPY audit_log (…) FROM STDIN` with 50 rows | linear chain; verifier PASS | COPY is the path a bulk import would use; if the memo fails here, any future data migration silently forks the chain |
| **M-04** | Batch + concurrency | one connection runs a 10-row `VALUES` insert while another runs 10 single inserts | verifier PASS; no fork | The memo and the advisory lock interact incorrectly |
| **M-05** | Batch inside an explicit transaction | `BEGIN; INSERT…; INSERT…; COMMIT;` — separate statements, one transaction | linear chain | Memo must span statements within a transaction, not just rows within a statement |
| **M-06** | **Triggers disabled** | `ALTER TABLE audit_log DISABLE TRIGGER …; INSERT; ENABLE;` then insert again | The inserted row has NULL `row_hash` ⇒ verifier **FAIL**, naming that `seq` | A row can enter the table unchained and the verifier does not notice. This is a genuine tamper path, not a hypothetical |

**If any of M-01…M-03 fails**, the expected failure is specified, not open-ended:
every row after the first in the batch carries `prev_hash` equal to the
pre-batch head, and `K-FORK`'s distinct-predecessor assertion fails. The remedy
is the memo (P6) and its encoding (P9) — not a redesign.

---

# PART 4 — Isolation levels

| ID | Level | Operations | Expected | Rationale |
|---|---|---|---|---|
| **I-01** | **READ COMMITTED** | normal insert | **succeeds**; verifier PASS | The only accepted level (**P1**). This is what PostgREST gives every insert |
| **I-02** | **REPEATABLE READ** | `BEGIN ISOLATION LEVEL REPEATABLE READ; INSERT; COMMIT` | **MUST RAISE.** The insert fails with the trigger's precondition error naming `transaction_isolation` | Phase D §2.2: the snapshot is pinned at transaction start, so a second writer cannot see the first — two honest writes fork. **Failing loudly is the design decision**; corrupting silently is the alternative |
| **I-03** | **SERIALIZABLE** | same, SERIALIZABLE | **MUST RAISE**, same error | Same reason. Also Phase C: its response to contention is to abort, and the write path swallows aborts |
| **I-04** | Concurrent REPEATABLE READ pair | two connections, both REPEATABLE READ | **both raise**; **zero rows inserted**; verifier PASS on the unchanged table | Proves the assertion fires before any row is written — a partial write here would be worse than the fork it prevents |
| **I-05** | Level set *after* `BEGIN` | `BEGIN; SET TRANSACTION ISOLATION LEVEL REPEATABLE READ; INSERT` | MUST RAISE | The assertion must read the *effective* level at trigger time, not a session default |
| **I-06** | Session default changed | `SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL REPEATABLE READ;` then a plain insert | MUST RAISE | A session-level change is the realistic way this breaks in production, not an explicit `BEGIN` |

**Accepted:** READ COMMITTED only.
**Must fail:** REPEATABLE READ, SERIALIZABLE — by raising, never by inserting.

---

# PART 5 — Rollback

The key property to establish: **a benign gap and a malicious deletion are
distinguishable**, because the chain records what the writer actually saw.

| ID | Scenario | Operations | Expected chain afterwards | Failure meaning |
|---|---|---|---|---|
| **R-01** | **Transaction rollback** | insert row 1 (commit); `BEGIN; INSERT; ROLLBACK;`; insert (commit) | Rows have `seq` **1 and 3** — a gap, because `nextval` is non-transactional and the rolled-back attempt burns a number. Row 3's `prev_hash` = row 1's `row_hash`. **Verifier PASS.** The gap is reported as *informational*, never as tampering | If the verifier calls this tampering it will cry wolf on ordinary rollbacks and operators will learn to ignore it |
| **R-02** | **Deletion vs rollback are distinguishable** | build 1,2,3; `DELETE` row 2 | Row 3's `prev_hash` still equals the *deleted* row 2's hash ⇒ **verifier FAIL** with `prev_mismatch` at `seq`=3 | The whole point. R-01 gaps pass, R-02 gaps fail — if both behave the same, the verifier carries no information |
| **R-03** | **Savepoint rollback** | insert 1; `SAVEPOINT s; INSERT; ROLLBACK TO s; INSERT; COMMIT` | Final row chains to row 1, **not** to the rolled-back row. Verifier PASS | **Phase E §A3 [I] discharged.** If the memo survived the savepoint, the surviving row would chain to a hash that was never committed — an unresolvable break |
| **R-04** | Savepoint released (not rolled back) | insert 1; `SAVEPOINT s; INSERT 2; RELEASE s; INSERT 3; COMMIT` | linear 1→2→3; verifier PASS | Memo must survive a *released* savepoint |
| **R-05** | **Trigger raises** | force the precondition failure (I-02) mid-transaction after a successful insert in the same transaction | the whole transaction aborts; **no partial rows**; earlier committed rows untouched; verifier PASS | A partially applied transaction would leave the chain and the sequence inconsistent |
| **R-06** | **Backend termination** | begin a transaction, insert, then `pg_terminate_backend` before commit | no row; advisory lock released automatically; a subsequent insert from a new connection succeeds and chains to the last **committed** row; verifier PASS | **Phase E §A7 discharged.** A stuck advisory lock here would wedge all audit writes — the failure mode with the worst blast radius |
| **R-07** | Crash during the *lock wait* | A holds the lock; B waits; A's backend is terminated | B acquires the lock and proceeds; verifier PASS | Lock release on crash is what makes this design need no recovery procedure |

---

# PART 6 — Tamper detection (RED/GREEN)

Every test: build a clean 5-row chain, assert verifier **PASS** (GREEN), apply
the tamper, assert verifier **FAIL** (RED) with the stated problem and `seq`.

A test that only asserts FAIL is worth little — the GREEN half proves the
verifier is not simply always-failing.

| ID | Tamper | Verifier | Problem reported | Notes |
|---|---|---|---|---|
| **T-01** | `UPDATE` `action` on row 3 | **FAIL** | `hash_mismatch` at 3, `prev_mismatch` at 4 | The canonical case. Two problems, because both the row and its successor's link are now wrong |
| **T-02** | `DELETE` row 3 | **FAIL** | `prev_mismatch` at 4 + `sequence_gap` at 3 | Deleting a middle row |
| **T-03** | **`DELETE` the tail** (rows 4,5) | **PASS** ⚠️ | none | **Known limit, T4 in the threat model.** The chain is internally consistent after truncation. Detecting this needs the external checkpoint that Phase B deliberately deferred. **This test exists to pin the limitation as a documented fact**, so nobody later assumes it is covered |
| **T-04** | `INSERT` a forged row with hand-written `seq`/hashes | **FAIL** | `hash_mismatch` at the forged `seq` | Forging requires recomputing every later hash — which T-05 covers |
| **T-05** | **Consistent full rewrite** — rewrite rows 3–5 *and* recompute their hashes correctly | **PASS** ⚠️ | none | **Known limit, T5.** A chain verifies internal consistency, not authenticity. Pinned as a fact, and it is the strongest argument for the external anchor |
| **T-06** | Rewrite `metadata` | **FAIL** | `hash_mismatch` | `metadata` carries `is_platform_owner` and the Component 4 decision reasons — a prime target |
| **T-07** | Rewrite `before_state` | **FAIL** | `hash_mismatch` | **The read API never returns this column.** If it were omitted from the hash, this would be the safest place in the system to tamper |
| **T-08** | Rewrite `after_state` | **FAIL** | `hash_mismatch` | Same reasoning |
| **T-09** | Rewrite `created_at` | **FAIL** | `hash_mismatch` | Backdating an action |
| **T-10** | Rewrite `actor_role` | **FAIL** | `hash_mismatch` | Reassigning blame — e.g. `owner` → `admin` |
| **T-11** | Rewrite `actor_id` | **FAIL** | `hash_mismatch` | Reassigning blame to a different person |
| **T-12** | **JSON key reordering only** | **PASS** | none | `{"a":1,"b":2}` vs `{"b":2,"a":1}` — PostgreSQL normalises JSONB on input, so these are the *same stored value*. The hash must be stable. A FAIL here means the chain breaks whenever a client serialises keys differently |
| **T-13** | JSON value change, same keys | **FAIL** | `hash_mismatch` | Distinguishes T-12's normalisation from actual content change |
| **T-14** | `UPDATE` `row_hash` to match the tampered row | **FAIL** | `prev_mismatch` at the successor | Repairing one row is not enough; the successor still points at the old hash |
| **T-15** | `UPDATE` `prev_hash` only | **FAIL** | `prev_mismatch` | |
| **T-16** | `setval` the sequence backwards, then insert | **FAIL** | `UNIQUE(seq)` violation, or `sequence_gap` | Attempting to reuse a burnt number |
| **T-17** | `TRUNCATE audit_log` | **PASS** on an empty table ⚠️ | none | **Known limit.** Total erasure is indistinguishable from a new install without an external anchor. Pinned deliberately |

**T-03, T-05 and T-17 must be asserted as PASS.** They are the boundary of what
this component buys. Writing them as expected-FAIL would be wishful, and writing
them not at all would let a future reader assume they are covered.

---

# PART 7 — PostgreSQL behaviour: verify, do not trust

Phase E labelled claims **[G]/[I]/[T]**. These tests convert every **[I]** and
**[T]** into a measurement. They test *PostgreSQL*, not our code — deliberately,
because the design's correctness rests on them.

| ID | Assumption (Phase E ref) | Method | Expected | If it fails |
|---|---|---|---|---|
| **PG-01** | `jsonb::text` is deterministic (**P11**) | insert the same logical JSON with different key order and whitespace, twice | identical `row_hash` | The chain breaks on ordinary traffic. Would force explicit canonicalisation instead of `::text` |
| **PG-02** | `jsonb::text` stable across a dump/restore | insert; `pg_dump`; restore; re-verify | verifier PASS | Backups would break the chain — a serious operational finding |
| **PG-03** | `set_config(…, true)` visible to later trigger invocations in one transaction (**A1**) | two inserts in one transaction; read the memo between them | second sees the first's value | The memo does not work at all; Part 3 fails wholesale |
| **PG-04** | Memo **rolled back** by savepoint (**A3 [I]**) | set inside a savepoint, roll back, read | value reverts to the pre-savepoint one | Converts an **[I]** into a measured fact. If it does *not* revert, R-03 fails and the design needs rework |
| **PG-05** | Memo discarded at transaction end (**A6**) | set; commit; read on the **same pooled connection** | empty | Leakage across transactions on a reused PostgREST connection would chain unrelated transactions together |
| **PG-06** | **VOLATILE takes a fresh snapshot** (**B1 [G]**) | a VOLATILE helper that selects a row committed by another connection *after* the calling statement began | sees the row | The foundation of the Phase D proof |
| **PG-07** | **STABLE does *not*** (**B1**) | same helper declared `STABLE` | does **not** see the row | Proves P4 is load-bearing rather than decorative. If STABLE also saw it, the precondition could be relaxed — but it must be *measured*, not assumed either way |
| **PG-08** | `LANGUAGE sql` helper inlining (**B3**) | a SQL helper doing the head lookup, called from the trigger, under concurrency | demonstrates the wrong-snapshot behaviour, or proves it does not occur | Justifies P5 with evidence instead of caution |
| **PG-09** | **Trigger execution order** | add a second `BEFORE INSERT` trigger named alphabetically before ours | our trigger runs second; confirm the chain still forms correctly | PostgreSQL fires BEFORE triggers in **name order**. A future trigger named `aaa_…` would run first and could modify `NEW` after we hashed it — a silent, name-dependent corruption |
| **PG-10** | **Sequence allocation timing** (**P3**) | compare a column-default `BIGSERIAL` against in-trigger `nextval` under concurrency | the default form **reproduces the Phase C fork**; the in-trigger form does not | Demonstrates the Phase C flaw empirically. **This test documents why the design is what it is** |
| **PG-11** | `nextval` is non-transactional | rollback a transaction that consumed a number; insert again | a gap appears | Underpins R-01's "gaps are benign" |
| **PG-12** | Advisory lock is re-entrant within a transaction | acquire twice in one transaction | second acquisition does not block | The mechanism behind the Part 3 hazard |
| **PG-13** | Advisory lock released on backend crash | terminate a backend holding it; acquire from elsewhere | acquires | Underpins R-06/R-07 |
| **PG-14** | BEFORE ROW triggers fire for `COPY` | `COPY` one row | trigger ran; `row_hash` populated | If false, M-03's expectation is wrong and COPY becomes a bypass |

**PG-09 is the one most likely to be skipped and most likely to bite.** Trigger
order is alphabetical, nothing warns about it, and the failure is a corrupted
hash on rows that look ordinary.

---

# PART 8 — Performance

Measured on the CI machine class; absolute numbers matter less than the shape of
the curve and the absence of pathological behaviour.

| ID | Scale | Measure | Acceptable limit | Rationale |
|---|---|---|---|---|
| **P-01** | 10 k rows | insert latency, p50 / p95 | **p95 ≤ 5 ms** added over the un-triggered baseline | One `sha256` plus one indexed backward scan. Anything larger means the head lookup is not using the `UNIQUE(seq)` index |
| **P-02** | 100 k rows | insert latency, p95 | **no more than +20 % over P-01** | The head lookup is `O(log n)`; a linear trend means a sequential scan |
| **P-03** | 1 M rows | insert latency, p95 | **no more than +20 % over P-02** | `MANUAL` |
| **P-04** | 10 k | full verification wall time | **≤ 10 s** | Establishes the baseline throughput figure |
| **P-05** | 100 k | full verification | **≤ 100 s**, i.e. **linear** in row count | Super-linear verification means the verifier re-reads predecessors per row instead of streaming in `seq` order |
| **P-06** | 1 M | full verification | linear extrapolation holds; **ranged** verification of the last 10 k stays ≤ 10 s | `MANUAL`. The ranged case is what the Controller would actually run |
| **P-07** | Lock contention | 100 concurrent inserters | **zero deadlocks**, **zero statement timeouts**, max wait ≤ 1 s | A timeout here is silent data loss: the write path swallows the error (Phase C §F2) |
| **P-08** | Throughput ceiling | sustained concurrent insert for 60 s | record inserts/sec; **document it**, do not gate on it | The lock serializes audit writes globally. The number is not a pass/fail — it is the figure the Owner needs in order to know when this design stops being adequate |
| **P-09** | Index verification | `EXPLAIN` the head lookup at 1 M rows | **Index Scan Backward**, never a Seq Scan | The single assertion that keeps P-02/P-03 honest |

**Honest limit:** these run on `embedded-postgres` on CI hardware, not on
Supabase's production instance class. They detect *algorithmic* regressions —
a sequential scan, a lock storm, super-linear verification. They do **not**
predict production latency, and the report must say so rather than implying a
production guarantee.

---

# PART 9 — Acceptance criteria

Component 7 **cannot be marked ACCEPTED** unless every box below passes **on a
real PostgreSQL instance**. Code review, `tsc`, lint, the architecture guard and
the build do not execute SQL — Component 1's `min(uuid)` defect passed all six.

## Correctness

- [ ] **C-01 … C-08** — chain construction, including NULL, empty-string, Unicode and 1 MB payloads
- [ ] **H-01 … H-05** — hash-input integrity; **H-01 (field-boundary forgery) is mandatory**
- [ ] **M-01 … M-06** — every multi-row path, including `COPY` and disabled triggers
- [ ] **R-01 … R-07** — rollback; **R-01 vs R-02 must differ**, or the verifier carries no information
- [ ] **I-01 … I-06** — READ COMMITTED accepted; REPEATABLE READ and SERIALIZABLE **raise**, never insert

## Concurrency

- [ ] **K-02, K-10, K-100** — no duplicate `seq`, no fork, verifier PASS
- [ ] **K-ORD** — `seq` order equals chain order
- [ ] **K-FORK** — no two rows share a predecessor
- [ ] **K-ADV-1 … K-ADV-4** — adversarial commit orders, exhaustive at N=3
- [ ] **K-ADV-5** — 50-round soak clean (`MANUAL`)

## Tamper detection

- [ ] **T-01, T-02, T-04, T-06 … T-16** — verifier **FAIL**, each naming the right problem and `seq`
- [ ] Each has a **GREEN half** asserting PASS before the tamper
- [ ] **T-03, T-05, T-12, T-17 asserted as PASS** — the documented limits, pinned so they cannot be quietly assumed away

## PostgreSQL assumptions

- [ ] **PG-01 … PG-14** — every Phase E **[I]** and **[T]** converted into a measurement
- [ ] **PG-10** reproduces the Phase C `BIGSERIAL` fork, demonstrating why the design is what it is
- [ ] **PG-09** trigger-name ordering verified

## Preconditions — explicit mapping

A self-check of this specification found P2, P7, P8 and P12 asserted in prose but
never mapped to an ID. A checklist item that cannot be pointed at a test is not a
checklist item.

| # | Precondition | Discharged by |
|---|---|---|
| **P1** | READ COMMITTED only | **I-02, I-03, I-04, I-05, I-06** |
| **P2** | Advisory lock is transaction-scoped, one fixed key, acquired **before** any chain read | **K-ADV-2** (blocked writer sees the committed row), **PG-12** (re-entrancy), **PG-13** (released on crash), **R-06/R-07** |
| **P3** | `seq` has no column default; allocated inside the lock | **K-ORD**, **K-DUP**, **PG-10** (reproduces the Phase C fork with a default) |
| **P4** | Trigger function is VOLATILE | **PG-06** (VOLATILE sees it), **PG-07** (STABLE does not) |
| **P5** | Head lookup inline, never a `LANGUAGE sql` helper | **PG-08** |
| **P6** | Memo consulted first, table second | **M-01 … M-05**, **PG-03** |
| **P7** | **No `EXCEPTION` block in the trigger** | **S-01** — static assertion over the migration source (below), plus **R-05** for the abort behaviour it protects |
| **P8** | **No function names `audit.chain_head` in a `SET` clause** | **S-02** — static assertion (below) |
| **P9** | Memo encodes the hash symmetrically (hex), never an implicit `bytea→text` cast | **M-01**, **M-03**, **PG-03** |
| **P10** | Explicit field separation in the hash input | **H-01**, **H-02** |
| **P11** | `jsonb::text` deterministic | **PG-01**, **PG-02**, **T-12** |
| **P12** | Inserts are single-row, or the memo covers batches | **M-01 … M-06**, **K-FORK** |

### Static assertions (P7, P8)

Two preconditions are properties of the **source**, not of runtime behaviour. A
runtime test cannot observe the absence of an `EXCEPTION` block; it can only fail
to notice its consequences. These follow the pattern
`singleDecisionPath.test.ts` established in Component 4 — reading the source tree
so a future edit fails loudly rather than silently.

| ID | Assertion | Failure meaning |
|---|---|---|
| **S-01** | The trigger function body contains no `EXCEPTION` keyword | An implicit subtransaction was introduced; the memo can revert while a handler proceeds (Phase E §A4) |
| **S-02** | No `CREATE FUNCTION … SET audit.chain_head` anywhere in `supabase/` | A function would restore a stale memo on exit (Phase E §A2) |
| **S-03** | The trigger is declared `VOLATILE` **explicitly**, not by default | Makes P4 a visible change in any future diff rather than an invisible default someone can flip |
| **S-04** | `seq` has no `DEFAULT` in the schema | P3, caught at review time instead of by a concurrency test |

- [ ] **P1–P12** each mapped above, and every mapped test passes
- [ ] **S-01 … S-04** static assertions pass
- [ ] The preconditions are reproduced as comments in the migration, so the next reader meets them before changing anything

## Compatibility

- [ ] `/api/admin/audit` response shape **byte-identical** before and after
- [ ] `AuditViewer` renders unchanged
- [ ] `writeAuditLog` signature, behaviour and all six call sites **unchanged**
- [ ] Existing audit action strings unchanged
- [ ] Zero new API routes, zero new env vars

## Performance

- [ ] **P-01, P-02, P-04, P-05, P-07, P-09** pass in CI
- [ ] **P-03, P-06, P-08** run manually and recorded
- [ ] The report states plainly that CI numbers do not predict production latency

## Operational

- [ ] Rollback rehearsed: `DROP TRIGGER` restores pre-Component-7 insert behaviour, verified by test
- [ ] The migration is idempotent — running it twice is a no-op
- [ ] Backfill is resumable
- [ ] Retention interaction documented (Phase B §B7): pruning breaks a naive chain

---

**Specification complete. No implementation, no SQL. Awaiting approval.**

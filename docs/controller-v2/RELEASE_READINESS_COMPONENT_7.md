# Release Readiness Report — Component 7 (Tamper-evident audit chain)

> ⚠️ **HISTORICAL — PRE-MERGE POINT-IN-TIME REPORT (corrected 2026-08-08).**
> This document captured C7's state *before* it shipped. C7 has since merged
> (`f3caf59`), deployed to production (`origin/main` = `526157a`), and been
> hardened by F-04 (PR #18) and PH-0. The "READY TO OPEN PR — not merged, not
> deployed" verdict below is therefore **superseded**; the authoritative current
> status is **IMPLEMENTED · DEPLOYED · NOT YET UAT-VERIFIED** in
> [`STATUS.md`](STATUS.md) (row 7). The body is left intact as a historical
> record and is **not** rewritten.

**Branch:** `feat/controller-v2-component7-audit-chain`
**Merge base:** `e8d4eb9` (`origin/main`)
**Merge strategy:** merge commit — never squash.

---

# ✅ VERDICT: READY TO OPEN PR

Not merged, not deployed, and **the migration has not been applied to any
database**.

---

## 1. What changed

A SHA-256 hash chain over `audit_log`, built by a `BEFORE INSERT` trigger and
checked by `fn_verify_audit_chain()`. Tampering becomes **evident**; it does not
become impossible. Prevention is a credential and grant problem, deferred by
design (§B8 of the design document).

**Zero production TypeScript.** The only file under `src/` is a test:

```
git diff --name-only e8d4eb9..HEAD -- src
  src/lib/admin/auditChainInvariants.test.ts
```

`writeAuditLog` keeps its signature, its behaviour and all six call sites.
`/api/admin/audit` returns exactly the columns it returned before. That was the
design's central claim, and it is now checkable in one command rather than
asserted in prose.

## 2. Three review passes, seven reproduced defects

Nothing below was found by reading. Each was reproduced against the built
migration, and each regression test was proven RED by reverting its own fix.

### Pass 1 — the design, after it was frozen

| | Defect | Was |
|---|---|---|
| **A-1** | `id` was absent from the hash input while the design said "every column is covered" | `UPDATE audit_log SET id = …` verified **clean** |
| **A-2** | A full scan never compared the first row's `prev_hash` | `DELETE FROM audit_log WHERE seq <= 3` verified **clean** |

A-2 is **not** the documented tail-truncation limit. Tail truncation genuinely
needs an external anchor; head truncation does not, because the surviving first
row still carries a `prev_hash` pointing at nothing.

Two Phase F tests were also **unsatisfiable as written** and were corrected in
the specification rather than worked around: K-ADV-4 asked for six commit orders
that the advisory lock makes five-sixths unreachable, and S-01 asked for "no
`EXCEPTION` keyword" in a trigger whose isolation assertion is a `RAISE
EXCEPTION`.

### Pass 2 — the built artefact

| | Defect | Was |
|---|---|---|
| **D-1** | `READ UNCOMMITTED` rejected by string equality | PostgreSQL documents it as behaving like READ COMMITTED, so this was a false precondition failure — and `writeAuditLog` swallows errors, so the audit row vanished with only a console line |
| **D-2** | The memo was trusted without proof of origin | `SET audit.chain_head = 'deadbeef'` made an honest row chain to a fabricated predecessor |
| **D-3** | Same root cause, worse outcome | `SET audit.chain_head = 'not-hex'` made `decode()` raise, so **every** insert failed and all of them were swallowed — a silent, total audit outage |
| **D-4** | The trigger-ordering comment was exactly backwards | A trigger sorting *after* ours edits `NEW` post-hash, so an untouched table reports `hash_mismatch` on every row forever. `trg_` sorts before all of `u`–`z` |
| **D-5** | The verifier was callable by `anon`, straight through RLS | PostgreSQL grants EXECUTE to PUBLIC by default, so `GRANT … TO service_role` narrowed nothing |

D-2 and D-3 are closed by stamping the memo with `pg_current_xact_id()` and
believing it only when the stamp matches. Wrong input now degrades to the table
read instead of to corruption or an outage.

D-5 deserves emphasis: with RLS refusing `anon` a plain `SELECT`, `SET ROLE
anon` followed by a call to the verifier still returned the `seq` and `id` of
tampered rows. That is a **tamper-detection oracle for the attacker the chain is
aimed at**, plus an unauthenticated unbounded full-table SHA-256 recomputation
reachable through PostgREST's `/rpc`.

### Pass 3 — this freeze review

| | Defect | Was |
|---|---|---|
| **F-01** | The migration was not safe applied **non-atomically** | An audit write between the backfill and `SET NOT NULL` produced a NULL `seq`, and the migration then aborted **half-applied** — trigger installed, both NOT NULL constraints silently missing |
| **F-02** | `fn_audit_part` and `fn_audit_ts` were declared `IMMUTABLE` while calling STABLE built-ins | PostgreSQL does not check a volatility label; it trusts it and constant-folds on the strength of it |
| **F-03** | Dead state in the verifier | `v_started` was unconditionally true by the time it was tested — and reading it as conditional is *precisely* the A-2 defect |

**Why F-01 matters here specifically.** This project applies SQL to production
by hand, section by section, in the Supabase SQL editor — the Component 1
runbook was executed exactly that way. "The migration is atomic" is an
assumption that deployment method does not grant. The fix is a reorder, not new
logic: the trigger is installed **before** the backfill and the constraints, so
from that point every insert is chained, the backfill has nothing to catch up
with, and the constraints cannot find a NULL.

### One design claim corrected by measurement

Phase D states a multi-row `INSERT` forks *"unconditionally"* without the
transaction-local memo. **It does not.** The entire suite passes with the memo
disabled, so **B-22** builds the design memo-less on a probe table and drives
multi-row `VALUES`, `INSERT … SELECT` and writable CTEs: all chain correctly,
because plpgsql runs every statement through SPI, which performs a
`CommandCounterIncrement` first.

The memo is retained as defence in depth — the behaviour it guards is a plpgsql
implementation detail, not a documented guarantee — but it is **redundancy, not
the mechanism, and no test fails without it**. Said plainly here rather than
left as coverage that does not exist. It was not free either: it caused D-2 and
D-3.

## 3. SQL object summary

| Object | Kind | Volatility | Security | search_path | Grants |
|---|---|---|---|---|---|
| `audit_log_seq` | sequence | — | — | — | — |
| `audit_log.seq` | column `BIGINT NOT NULL` | — | — | — | — |
| `audit_log.prev_hash` | column `BYTEA NULL` | — | — | — | — |
| `audit_log.row_hash` | column `BYTEA NOT NULL` | — | — | — | — |
| `audit_log_seq_key` | `UNIQUE (seq)` | — | — | — | — |
| `fn_audit_part(TEXT)` | function | **STABLE** | INVOKER | default | PUBLIC **revoked** |
| `fn_audit_ts(TIMESTAMPTZ)` | function | **STABLE** | INVOKER | default | PUBLIC **revoked** |
| `fn_audit_row_hash(15 args)` | function | **STABLE** | INVOKER | default | PUBLIC **revoked** |
| `fn_audit_log_chain()` | trigger function | **VOLATILE** | **DEFINER** | `public, pg_temp` | not revoked — see below |
| `zzz_audit_log_chain` | `BEFORE INSERT … FOR EACH ROW` | — | — | — | — |
| `fn_verify_audit_chain(BIGINT, BIGINT)` | function | STABLE | **DEFINER** | `public, pg_temp` | PUBLIC **revoked**, `service_role` granted |

**No dead objects.** Every function has call sites (`fn_audit_part` 14,
`fn_audit_ts` 1, `fn_audit_row_hash` 3, `fn_audit_log_chain` 1 via the trigger).
`fn_verify_audit_chain` is deliberately consumer-free in the application — the
design refused a route for it (§B4), because an engine with no consumer is the
mistake this project has made four times. It is reachable from SQL and from a
later Controller screen.

**`fn_audit_log_chain` keeps the default PUBLIC grant, and that is not a hole.**
Measured: `SELECT fn_audit_log_chain()` raises *"trigger functions can only be
called as triggers"* regardless of privilege. A `REVOKE` there would be a no-op
that implies a hole existed.

**Index usage, measured on 500 rows with `EXPLAIN`:** the trigger's head lookup
and the verifier's ranged predecessor lookup both use `audit_log_seq_key` with a
**Backward Index Scan**. No sequential scan on either hot path, and no redundant
index was added — the one index is the UNIQUE constraint's, and it serves both.

**`seq` deliberately has no column default** (P3). Column defaults are evaluated
when the tuple is formed, *before* `BEFORE ROW` triggers fire and therefore
outside the advisory lock; two concurrent inserts could then take sequence
numbers in the opposite order to the lock and the verifier would report
tampering on two honest writes. **PG-10** reproduces that fork on a probe table.

## 4. Migration summary

Seven sections, in this order and for this reason:

1. sequence and the three columns (nullable)
2. hash functions
3. **the trigger** — before anything that could reject an insert
4. backfill of existing rows, resumable (`WHERE seq IS NULL`)
5. constraints — `UNIQUE (seq)`, then both `SET NOT NULL`
6. verifier
7. `REVOKE … FROM PUBLIC`, then `GRANT … TO service_role`

**Idempotent.** Re-running is a no-op: `CREATE SEQUENCE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, a guarded `ADD
CONSTRAINT`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`, and a backfill
that only touches rows still missing a `seq`. Verified by test.

**Refuses to install** over a `BEFORE INSERT ROW` trigger on `audit_log` whose
name sorts after `zzz_audit_log_chain`, naming the offender — because such a
trigger edits `NEW` after it has been hashed and turns every honest insert into
a `hash_mismatch`.

**Upgrade from the current production schema** is covered by a test that seeds
the two `owner.override` rows Component 4 actually wrote, applies the migration,
and asserts both are backfilled, the chain verifies, and the read API's nine
columns are unchanged.

## 5. Rollback summary

`supabase/migrations/rollback/20260807_audit_chain_rollback.sql`.

**Step 1 alone restores pre-Component-7 insert behaviour**: drop the trigger
(both the current name and the pre-rename one), then drop both `NOT NULL`
constraints so later inserts do not violate them. Verified: after rollback,
writes succeed with NULL `seq`/`row_hash` exactly as before, the read API is
unaffected, and running the rollback twice is a no-op.

There is **no application rollback to coordinate**, because no application code
changed.

Steps 2 and 3 — dropping the functions and the columns — are left commented out.
They are destructive of evidence and additive-safe to leave in place. Re-applying
the migration after a rollback backfills whatever accumulated in between, and
the chain verifies; that round trip is tested.

## 6. Test summary

| Suite | Tests | What it is |
|---|---|---|
| `supabase/tests/audit_chain.test.ts` | **101** | Real PostgreSQL (`embedded-postgres` 17.5), running the `.sql` files **from disk** |
| `src/lib/admin/auditChainInvariants.test.ts` | **16** | Source-tree assertions for the preconditions no runtime test can observe |

This suite exists because tsc, lint, the architecture guard and the build **do
not execute SQL**. Component 1's seed shipped `MIN(uuid)` — a function
PostgreSQL does not have — and passed all of them.

**Every guard was mutation-tested.** Planting the violation it exists to catch
must turn it RED: 9/9 for the static assertions, 7/7 for the second pass, 3/3
for the grants, 2/2 for this freeze review. Component 9a shipped a guard that was
inert — a heredoc turned `\b` into a literal `U+0008` and CI reported 8/8 passing
over a live violation. An inert guard is worse than no guard: it manufactures
confidence.

**Stability:** the suite was run repeatedly and with `--sequence.shuffle`; 101/101
each time. No duplicated test id, no unused constant, no test left skipped.

One flake was found and fixed during this work: PG-13 asserted immediately after
`pg_terminate_backend`, which returns when the *signal* is sent, not when the
backend has exited and released its locks. It was green in isolation and red
under a loaded full-suite run. It now polls `pg_stat_activity` for the observable
condition.

## 7. Gate summary

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `vitest run` | **860 / 860** across 75 files |
| `npm run architecture:check` | **8 / 8** rules |
| `npm run lint` | 0 errors (pre-existing warnings only, none in changed files) |
| `npm run build` | compiled successfully |

## 8. Known limitations that intentionally remain

These are the boundary of what a hash chain buys. They are **asserted as passing
tests**, not omitted — writing them expected-FAIL would be wishful, and leaving
them out would let a future reader assume they are covered.

| | Limit | Why it stays |
|---|---|---|
| **T-03** | Tail truncation (deleting the last N rows) verifies clean | The chain is internally consistent after truncation. Detecting it needs the external checkpoint Phase B deliberately deferred — there is no consumer for one yet |
| **T-05** | A consistent full rewrite verifies clean | A chain verifies internal consistency, not authenticity. This is the strongest argument for an external anchor |
| **T-17** | `TRUNCATE` verifies clean on the empty table | Total erasure is indistinguishable from a fresh install without an anchor |
| — | Ranged verification trusts the boundary row's **stored** hash | Inherent to ranged verification; the caller chooses the range. A full scan is the authoritative check |
| — | A `BEFORE INSERT` trigger added **after** this migration and sorting after ours is not caught | The migration checks at apply time only. PG-09b pins the resulting behaviour so the cause is documented rather than mysterious |
| — | The advisory lock **serializes every audit write** globally | Phase C chose waiting over failing precisely because `writeAuditLog` swallows errors. Under `statement_timeout` a blocked insert is cancelled and the row is lost silently — measured, and the reason the throughput note below matters |
| — | Lock key `477100701` is registered nowhere | Any unrelated holder of that key stalls audit writes |
| — | Prevention, as opposed to detection | Out of scope by design (§B1). It is a credential and grant problem, and the deferred `service_role` hardening is where it belongs |
| **BL-C7-01** | Component 1's three SECURITY DEFINER functions carry the same PUBLIC grant D-5 fixed here | Filed, not fixed — scope discipline. `fn_is_platform_owner(UUID)` is an enumeration oracle for `anon` and is the item with real value to an attacker |

**Performance, measured on `embedded-postgres` and therefore not a prediction of
production latency.** Verification is linear: 1 000 rows in 9 ms, 5 000 rows in
39 ms (~8 µs/row). Insert latency with 5 000 rows present: 0.4 ms. These numbers
detect *algorithmic* regressions — a sequential scan, a lock storm, a
super-linear verifier — and nothing more.

## 9. Compatibility

- **PostgreSQL:** requires 13+ for `pg_current_xact_id()`. Measured on 17.5;
  Supabase runs 15/17.
- **Supabase / PostgREST:** no schema-cache reload needed. `writeAuditLog`
  inserts an explicit column list that excludes the three new columns, and the
  read API selects an explicit list that excludes them too. A static test fails
  if either starts using `select('*')`.
- **Schema change:** additive only. Three nullable-safe columns (two later made
  `NOT NULL`), one unique constraint, one sequence, one trigger, five functions.
  No table dropped, no column removed, no type changed.
- **Policy change:** none. No RLS policy is added, removed or altered; the
  `REVOKE`s apply only to functions this migration creates.
- **API change:** none. Zero new routes, zero new environment variables.

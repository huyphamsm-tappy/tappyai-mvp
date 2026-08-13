# Controller V2 — Component 8: Event Bus — CONTRACT

**Status:** CONTRACT — design complete, **no open questions**. §9 decided (D2, 2026-08-13); §9b resolved (`CRON_8_CAPACITY_CONFIRMED`, 2026-08-13); §9c ratified (missing-handler policy, 2026-08-13). Cleared for implementation
**Date:** 2026-08-13 · **Baseline:** `origin/main` = `77e8cc9`
**Binding source:** [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §7 "Design commitments" — **ratified as the C8 contract by Owner decision 2026-08-13**

> This resolves the standing conflict with [`FOUNDATION_01_CONTRACTS.md`](FOUNDATION_01_CONTRACTS.md) §6, which listed ordering, persistence, retry, idempotency, delivery and consumer registration as *"OPEN — defer to C8, not invented here"*. Those are now defined by §7 plus the four parameters below. §6's **event field freeze** is unchanged and already implemented.

---

## 1. Owner-decided parameters (2026-08-13)

| # | Parameter | Decision |
|---|---|---|
| **P1** | Retry count | **N = 3 attempts, then DLQ.** No age-based retry, no additional `X` parameter |
| **P2** | Delivery substrate | **Vercel Cron (B1).** No QStash, no worker, no new infrastructure |
| **P3** | Outbox granularity | **One row per (event, consumer)** — independent status, attempts, `next_attempt_at`, `last_error`, DLQ state |
| **P4** | Transaction boundary | **Same Postgres transaction as the business write**, via RPC. T2 and T3 rejected |

## 2. ⚠️ Delivery latency — stated plainly, as required

The delivery loop runs on **Vercel Cron**, whose smallest usable interval here is **daily** (all 7 existing crons are daily or weekly).

Therefore:

- An event may wait **up to ~24 hours** before its first delivery attempt.
- With **N = 3** and one attempt per cron tick, a persistently failing consumer reaches **DLQ after roughly 3 days**.

**C8 is not near-real-time delivery and must never be described as such.** It is durable, eventually-delivered, at-least-once fan-out. Any future requirement for sub-daily latency needs a different substrate and its own decision.

## 3. Envelope — already frozen, already implemented

`ControllerEvent` (`src/lib/controller/types.ts`) matches `FOUNDATION_01 §6` exactly: `id`, `type`, `version`, `producer`, `actor`, `timestamp`, `correlationId`, `securityClass`, `payload?`, `metadata?`.

Naming stays `<hub>.<entity>.<past_tense_verb>`; schema evolution is additive with `schema_version` on every row.

## 4. Outbox schema (S2 — one row per event × consumer)

Columns derive from existing precedents, not invention:

| Column | Precedent |
|---|---|
| `event_id uuid NOT NULL` | `user_events.event_id` + `uq_user_events_event_id` UNIQUE — the idempotency pattern §7 cites |
| `schema_version smallint NOT NULL DEFAULT 1` | `20260713_analytics_envelope_foundation.sql:22` |
| `type`, `producer`, `actor`, `correlation_id`, `security_class`, `event_version`, `payload jsonb`, `metadata jsonb`, `occurred_at` | the 10 frozen envelope fields |
| `consumer_id text NOT NULL` | S2 — from `manifest.events.consumes` |
| `status text NOT NULL` | `pending` \| `delivered` \| `dead` |
| `attempts smallint NOT NULL DEFAULT 0` | P1 |
| `next_attempt_at timestamptz NOT NULL` | P2 |
| `last_error text` | DLQ triage |
| `created_at`, `delivered_at` | `audit_log` convention |

**Uniqueness:** `UNIQUE (event_id, consumer_id)` — one delivery obligation per consumer per event. This is what preserves dedupe under P3: re-publishing the same `event_id` cannot create a second obligation for the same consumer.

Grants follow **ADR-019**: `REVOKE ... FROM PUBLIC, anon, authenticated` explicitly, never `REVOKE FROM PUBLIC` alone.

## 5. Transaction boundary (P4 = T1) — and how it is *enforced*

**Constraint that forces the design:** the app tier uses only `@supabase/supabase-js` / `@supabase/ssr` (PostgREST over HTTP). There is no `pg` client and no connection pool, so **two PostgREST calls are two transactions**. Atomicity is only reachable inside a single Postgres function — the repo already has 15 such RPCs.

C8 therefore ships **`fn_outbox_publish(...)`**, which only inserts outbox rows and is designed to be **called from inside a producer's own Postgres function**. Because a function call shares the caller's transaction, the business write and the outbox insert commit or roll back together. That is T1.

**The enforcement matters more than the intention.** If `fn_outbox_publish` were callable from the app tier, a caller could invoke it standalone and silently get T2 semantics — a business write committed with no event, which is precisely the lost-event window T1 exists to close. Postgres cannot reliably detect whether a function is nested, so the guarantee is enforced through **grants instead**:

> `REVOKE EXECUTE ON FUNCTION fn_outbox_publish(...) FROM PUBLIC, anon, authenticated, service_role;`

With no EXECUTE for any PostgREST role, the function is unreachable from the app tier. Only another `SECURITY DEFINER` function — i.e. a real producer, inside its own transaction — can call it. **The lost-event window is closed by construction, not by convention.**

C8 creates **no producers**. It ships the mechanism that makes a future producer atomic.

## 6. Cron polling semantics

One new route, `/api/cron/outbox-drain`, authorised by `CRON_SECRET` like the existing seven.

**Claim.** Rows are claimed with `FOR UPDATE SKIP LOCKED`, so two overlapping invocations never process the same row and neither blocks the other:

```
SELECT … FROM event_outbox
 WHERE status = 'pending' AND next_attempt_at <= now()
 ORDER BY created_at
 FOR UPDATE SKIP LOCKED
 LIMIT <batch>
```

**`attempts` increments at CLAIM time — Owner decision 2026-08-13.** A row being claimed *is* a delivery attempt. The alternative, incrementing on settle, was rejected: a consumer that kills the drain process mid-delivery would never record an attempt and would retry forever, never reaching the DLQ. Under claim-time increment a crash still consumes an attempt, so **P1 = 3 remains a real bound** rather than one that only applies to failures the process survives.

| Step | Behaviour |
|---|---|
| Attempt | `attempts` increments by 1 at claim time — one claim = one attempt |
| Success | `status = 'delivered'`, `delivered_at = now()`. Terminal |
| Failure, `attempts < 3` | stays `pending`, `last_error` recorded, `next_attempt_at = now()` — the daily cron supplies the spacing (§2) |
| Failure, `attempts >= 3` | `status = 'dead'`. Terminal. Never selected again |
| Already `dead` or `delivered` | excluded by the `status = 'pending'` predicate |

**There is no separate backoff schedule.** Under P2 the cron cadence *is* the backoff; inventing an exponential curve would be decoration that the substrate cannot honour.

## 7. Failure and duplicate semantics

| Case | Behaviour | Source |
|---|---|---|
| Consumer throws | caught, `attempts++`, `last_error` set, retry or DLQ per §6 | §7 "a failing consumer NEVER rolls back the producer" |
| A consumer fails, others succeed | independent rows ⇒ unaffected | P3 |
| Duplicate delivery | permitted. **Consumers must be idempotent** — dedupe on `event_id`, the `user_events.event_id` UNIQUE pattern | §7 |
| Republished `event_id` | `UNIQUE (event_id, consumer_id)` rejects a second obligation | §4 |
| Ordering | per-aggregate only. **No global ordering is offered** | §7 |

## 8. Zero consumers — derived, not invented

Under P3 a published event produces one row per consumer. With **zero** consumers it produces **zero rows**. Nothing is queued and nothing is lost: §7 records the event in the C7 audit chain at publish, independently of the outbox.

The alternative — writing a placeholder row so a future consumer could pick the event up — is exactly the *future-consumer semantics* the Owner ruled out, and would also require retention rules that no source defines. Rejecting a publish that has no listeners contradicts §7's "modules publish facts; the kernel routes".

So: **0 consumers ⇒ 0 outbox rows, publish succeeds, event is audited.** This follows arithmetically from P3; it is not a new policy.

## 9. Disabled consumer — **D2**, Owner decision 2026-08-13

C6 defines `ready = enabled && available`. §7 defines what happens to a *failing* consumer but not to a deliberately disabled one. The Owner chose **D2**:

- Consumers are bound from the manifest as normal; a disabled consumer **does** get an outbox row.
- When the drain reaches a row whose consumer is not `ready`:

| | |
|---|---|
| Counted as a delivery failure | **no** |
| `attempts` incremented | **no** |
| Moved to DLQ | **no** |
| Marked `delivered` | **no** |
| Row state | **stays `pending`** |
| Next cron tick | retried, and delivered once the consumer is ready again |

- **No new backlog row** may be created for the same `(event_id, consumer_id)` — the UNIQUE constraint in §4 enforces this.
- **An event is never lost because a consumer was temporarily disabled.**
- No further semantics beyond this decision may be added.

**Accepted consequence, recorded deliberately:** a consumer disabled indefinitely accumulates `pending` rows that never drain. That is the cost of preserving at-least-once across a disable/re-enable cycle, and it was chosen with that trade-off visible. Any future retention or purge policy for such rows is a separate decision and must not be invented here.

## 9b. ✅ RESOLVED — cron capacity is confirmed: `CRON_8_CAPACITY_CONFIRMED`

C8 requires an **8th** cron job (`/api/cron/outbox-drain`). This section was a blocker; it is now closed on official documentation. The investigation is kept in full — first what the product surfaces could *not* tell us, then the probe, then the source that settled it.

### 9b.1 In-product surfaces (2026-08-13) — insufficient

| Fact | Source |
|---|---|
| Plan = **Hobby** | Vercel dashboard (project + usage pages) |
| **7** cron jobs registered and **Enabled** | `vercel cron ls` **and** dashboard Cron Jobs page |
| Cron Job Invocations = 136, **no quota shown** | dashboard Usage page |
| **Hobby cron jobs fire within a flexible 1-hour window** | dashboard Cron Jobs page |

**The maximum number of cron jobs permitted on Hobby could not be verified from any in-product source:** `vercel usage` returns 404, `vercel contract` reports no commitments, `vercel crons --help` exposes only add/list/run, the Cron Jobs settings page shows no count limit, and the Usage page has no "number of cron jobs" metric at all.

At that point it was **not** established that an 8th cron job could be added, and implementation was correctly held.

### 9b.2 Empirical probe (2026-08-13) — result: **INCONCLUSIVE** (unchanged)

A single-purpose probe added an 8th cron to `vercel.json` on branch `probe/cron-capacity` (commit `3a36895`, PR #55, never merged) and deployed it to Preview (`dpl_5Pyc6KqZk33ALAcdrTeJfeoZ1bsY`).

| Observation | Value |
|---|---|
| Preview build | `Build Completed in /vercel/output [1m]` · `Deployment completed` · status **Ready** |
| Rejection, limit or quota message | **none** anywhere in the build log |
| Occurrences of the string `Cron` in the build log | **0** |
| `vercel crons ls` after the Preview deployed | still **7** |

**The absence of a rejection is not evidence of acceptance.** The build log contains no cron processing at all, and the Preview did not register an 8th job — Vercel registers crons from **Production** deployments only. The `/api/cron/*` lines in the log are the Next.js route table, not cron registration; the giveaway is that they include `/api/cron/behavior-rollup`, which has **no entry in `vercel.json`** and is not a registered cron.

So the Preview never exercised the cron-count limit, and this probe yields **no information about the Hobby maximum**. It must not be recorded as "8 is allowed". **PR #55 was a valid diagnostic that returned no answer; its verdict stays `INCONCLUSIVE` permanently.** It was closed unmerged and no second probe was run.

### 9b.3 Official resolution (2026-08-13) — `CRON_8_CAPACITY_CONFIRMED`

Settled from Vercel's own documentation, which the probe could not reach. Sources verified 2026-08-13:

| # | Source | Page date | Statement |
|---|---|---|---|
| 1 | <https://vercel.com/docs/limits> | last updated 2026-08-03 | General limits table: `Cron Jobs (per project)` = **100** for Hobby, Pro **and** Enterprise |
| 2 | <https://vercel.com/docs/cron-jobs/usage-and-pricing> | last updated 2026-07-15 | Hobby: **100 cron jobs per project**, minimum interval **once per day**, scheduling precision **per-hour (±59 min)** |
| 3 | <https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan> | published **2026-01-20** | Confirms the change from the previous **20-per-project** cap with team-level allowances (2 Hobby / 40 Pro / 100 Enterprise) to **100 per project on all plans**, with no team-level restriction |

**The changelog date is load-bearing.** Before 2026-01-20 the Hobby team allowance was **2** cron jobs — the 7 already in production would have been impossible and C8's 8th hard-blocked. The capacity C8 relies on has existed only since 2026-01-20.

### 9b.4 The numbers

| | |
|---|---|
| Count limit (Hobby) | **100 per project** |
| Current production count | **7** |
| C8 required count | **8** |
| Headroom | **92** |
| Count blocker | **none remains** |

### 9b.5 Count is not the Hobby restriction — frequency is

The 100-per-project cap is **identical on Hobby, Pro and Enterprise**. What is genuinely Hobby-specific is *how often* and *how punctually* a cron runs, not how many exist:

- **Minimum interval — once per day.** Per source 2, *"Cron expressions that would run more frequently will fail during deployment"*, with the error *"Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day."* **C8's daily schedule is valid** and remains so.
- **Scheduling precision — per-hour, ±59 min.** A job set to `0 3 * * *` fires anywhere in the 03:00–03:59 hour.

This also explains §9b.2's silence: the check Hobby enforces at deploy time is **frequency**, and the probe's 8th entry used a legal daily expression. There was no count violation to report because 8 ≪ 100.

**These four dimensions must never be conflated** — number of jobs registered (100/project), invocation count (no cron-specific limit; cron jobs invoke Functions, so Function usage applies), execution duration (a Function limit, not a cron limit), and schedule frequency/precision (the Hobby-specific restrictions above).

### 9b.6 Latency semantics — unchanged, now sourced

§2 said "up to ~24 hours". The accurate statement remains **up to ~24 hours plus up to 1 hour of scheduling jitter**, and the ~3-day DLQ figure carries the same jitter. The ±59-minute window is now confirmed by source 2 rather than inferred from the dashboard.

**P1 (N = 3), P2 (Vercel Cron), P3, P4 and D2 are all unchanged by this resolution.** No substrate change, no QStash, no cron consolidation, no workaround.

## 9c. ✅ RATIFIED — a bound, ready consumer with NO dispatch handler

**Owner decision 2026-08-13.** This was the last open question in C8; it is closed. What follows is **C8 delivery policy**, not merely an implementation guard, and it is the only defined behaviour for this state.

### 9c.1 The state being defined

`ModuleManifest.events.consumes` names the event types a module is owed, but the manifest carries **no handler function**. Delivery therefore needs a runtime callable that the manifest cannot supply. C8 holds it in a `ConsumerDispatch` map, which is an implementation mechanism, *not* a second consumer registry — it cannot bind a consumer the manifest did not, and `resolveConsumers` never reads it.

That leaves one state:

> a module **declares** `events.consumes`, **is** C6-ready (`enabled && available`), and has **no entry** in `ConsumerDispatch`.

### 9c.2 The policy — REFUSE THE TICK, fail closed

If **any** bound, C6-ready consumer has no dispatch handler, `/api/cron/outbox-drain` **refuses the entire tick before claiming any rows**:

| | |
|---|---|
| HTTP status | **501** |
| Error code | **`C8_UNDEFINED_MISSING_HANDLER`** |
| Rows claimed | **zero** |
| `attempts` incremented | **zero** |
| State transitions | **none** |
| Partial delivery | **never** — refusal is whole-tick, never per-row |
| Fallback delivery semantics | **none** |
| DLQ | **not reached** — no row is touched, so none can die |
| Retry increment | **none** |
| C6 readiness | **unmodified** — this state does not change `ready` |

The check runs **before** the claim, and that ordering is what makes "zero attempts" a fact rather than an aspiration: under claim-time increment (§6) a claim *is* an attempt, so a guard placed after it would already have burned one.

**Refusal is whole-tick deliberately.** Draining the healthy consumers and passing over the handler-less one would be a per-row fallback — the "skip silently" semantics rejected in §9c.3 — and would let a broken deployment run indefinitely with no signal. The cost is stated plainly and accepted: **one handler-less consumer stops delivery for every consumer** until the deployment is corrected. Nothing is lost while it is stopped; every row stays `pending` with its attempts untouched and drains on the first healthy tick.

**The error code keeps its name.** `C8_UNDEFINED_MISSING_HANDLER` names the *configuration* that is undefined — a consumer whose handler was never deployed — not the policy, which is now defined here. It is a wire-visible identifier, so it is frozen as-is.

### 9c.3 Alternatives rejected — kept as the record

| Option | Consequence | Verdict |
|---|---|---|
| Claim it, let dispatch fail | burns all 3 attempts and DLQs a valid event because of a deployment ordering accident | rejected |
| Skip it silently | D2's behaviour without D2's authority — indefinite `pending` with no record of why | rejected |
| Treat as not-ready | extends C6, which owns `ready = enabled && available` | **rejected 2026-08-13** |
| Reject at registration | changes C6 registration — out of C8's scope | rejected |
| **Refuse the tick (501)** | one misconfigured consumer halts the drain; nothing delivered, nothing lost, nothing guessed | ✅ **RATIFIED 2026-08-13** |

An earlier revision resolved the state by treating "no handler" as not-ready and routing the row through D2. That was rejected because C6 owns the definition of `ready`, C8 may not widen it, and D2 must not be used to conceal a semantics that was never approved. The extension was removed, `eligibleConsumerIds()` no longer exists, and readiness in the drain is **C6 verbatim** via `readyConsumerIds()`.

**The detector stays a detector.** `undispatchableConsumerIds()` reports the state — bound, C6-ready, no handler — and decides nothing. The policy lives in the route, in one place, before the claim. There is deliberately **no `if (!handler) throw` fallback** in the per-row delivery path: a second answer there would be a quieter delivery semantics for a question this section has already answered, and the non-null assertion is what keeps the answer in one place.

### 9c.4 Reachability

**This state is unreachable today**: no manifest declares `events.consumes`, so the bound set is empty and the detector always returns `[]`. A test pins that fact, so the day a real consumer is declared the suite fails until a handler is registered with it. That forcing function is unchanged — what changed is that the runtime behaviour behind it is now defined rather than open.

## 10. Out of scope

No producers · no consumers · no QStash · no worker · no changes to PDP, C6, C10, F-10 · no Resource Enforcement · no F-11 · no migration of existing business mutations to create a demo event.

## 11. Authoritative-source audit — every C8 behaviour, and where it comes from

The rule this table exists to enforce: **no C8 behaviour is invented by implementation.** Each row names the source that decides the behaviour and the artefact that enforces it. "Enforced by" is where the behaviour would break if the source were violated — a comment is never an enforcement.

| # | Behaviour | Authoritative source | Enforced by |
|---|---|---|---|
| 1 | 0 consumers ⇒ 0 outbox rows; publish still succeeds | §8, arithmetic of **P3** | `fn_outbox_publish` inserts one row per element of `p_consumer_ids`; an empty array inserts nothing |
| 2 | Disabled consumer keeps its row, stays `pending`, no attempt, no DLQ (**D2**) | §9 — Owner decision 2026-08-13 | `readyConsumerIds()` exclusion: the id never reaches `fn_outbox_claim`, so no branch can regress it |
| 3 | Bound, ready consumer with **no handler** ⇒ whole tick refused, `501 C8_UNDEFINED_MISSING_HANDLER`, zero rows claimed | **§9c — Owner decision 2026-08-13 (ratified)** | route guard on `undispatchable.size > 0`, placed before the claim; `undispatchableConsumerIds()` is the detector only |
| 4 | `attempts` increments at **claim** time — one claim = one attempt, a crash still consumes it | §6 — Owner decision 2026-08-13 | `fn_outbox_claim`'s `UPDATE … SET attempts = o.attempts + 1` inside the claiming statement |
| 5 | 3 attempts then DLQ; boundary is `>=`, not `>` | **P1** (§1, §6) | `fn_outbox_settle` `attempts >= 3 THEN 'dead'`; `settleOutcome()` mirrors it for reporting only |
| 6 | Republishing an `event_id` cannot create a second obligation | §4, §7 | `UNIQUE (event_id, consumer_id)` + `ON CONFLICT (event_id, consumer_id) DO NOTHING` |
| 7 | Business write and outbox insert commit or roll back together (**P4 = T1**) | §5 | `REVOKE EXECUTE ON FUNCTION fn_outbox_publish FROM PUBLIC, anon, authenticated, service_role` — unreachable from the app tier, so only a producer's own `SECURITY DEFINER` function can call it |
| 8 | Grants are explicit per role, never `FROM PUBLIC` alone | **ADR-019**, §4 | migration `REVOKE`/`GRANT` block; table writes closed to every PostgREST role, `service_role` keeps `SELECT` |
| 9 | The drain is authorised by `CRON_SECRET` | §6, and the seven existing crons as precedent | route returns `401` unless `authorization === Bearer ${CRON_SECRET}` |
| 10 | Overlapping drains never contend on the same row | §6, architecture §7 | `FOR UPDATE SKIP LOCKED` inside `fn_outbox_claim` — unexpressible through PostgREST, which is why the claim is a function |
| 11 | `delivered` and `dead` are terminal — never claimed again | §6 | `status = 'pending'` predicate in **both** `fn_outbox_claim` and `fn_outbox_settle` (the second stops a late settle resurrecting a dead row) |
| 12 | A failing consumer never rolls back the producer; failures are per-row independent | architecture §7, **P3** | one row per (event, consumer); dispatch errors are caught in the route and settled per row |
| 13 | Duplicate delivery is permitted; consumers must dedupe on `event_id` | architecture §7 | at-least-once by construction — documented obligation, deliberately not enforced by C8 |
| 14 | Ordering is per-aggregate only; no global ordering | architecture §7 | claim orders by `created_at` within the batch and offers nothing stronger |
| 15 | The envelope handed to a consumer is FOUNDATION_01 §6's 10 frozen fields, with no delivery bookkeeping | FOUNDATION_01 §6 | `envelopeOf()` rebuilds the envelope from the row rather than passing the row |
| 16 | Delivery is daily, ±59 min, ~3 days to DLQ — never described as near-real-time | **P2** (§2), §9b.5, §9b.6 | `vercel.json` `0 3 * * *`; Hobby's own frequency limit is the ceiling |
| 17 | An 8th cron job is permitted | §9b.3 — Vercel docs + changelog 2026-01-20 (100/project on every plan) | `vercel.json` carries 8; a test pins `<= 100` |

**No row reads "undefined".** Row 3 was the last one that did; §9c now decides it. Behaviour deliberately *not* defined by C8 — retention/purge for rows of an indefinitely disabled consumer (§9), producers, consumers — is named as out of scope in §10 rather than left as a gap in this table.

**How rows 4–11 are proven.** They are enforced by PostgreSQL, and they are now **executed** against a real PostgreSQL 17 by [`supabase/tests/c8_event_outbox.test.ts`](../../supabase/tests/c8_event_outbox.test.ts) — 39 tests that apply this migration and exercise it: the UNIQUE constraint rejecting a duplicate obligation, `FOR UPDATE SKIP LOCKED` letting a concurrent drain skip rather than block, the claim-time `attempts` increment surviving with no settle, the third failure reaching the DLQ, terminal rows refusing a late settle, D2 leaving a disabled consumer's row untouched, and every grant tested by *executing as* `anon`, `authenticated` and `service_role` and requiring `42501`.

The structural assertions in [`src/lib/controller/__tests__/outbox.test.ts`](../../src/lib/controller/__tests__/outbox.test.ts) remain and are not weakened. The two fail for different reasons: one when the migration text drifts, the other when the database's behaviour drifts.

**What is still not proven here:** that *production* carries these objects. That is a read-only production check (`pg_proc.proacl`, `information_schema`) taken **after** the Owner applies the migration by hand. A green local run says the migration is correct, not that it has been applied.

> **Correction, 2026-08-13 — the original reason for structural-only evidence was wrong, and is now closed.** It was recorded as an impossibility: no local PostgreSQL, so production is the only reachable database. That was false. `supabase/tests/` boots a real PostgreSQL 17 through the `embedded-postgres` devDependency — no Docker, no `psql`, no `DATABASE_URL` — and eight suites already used it, including `platform_owner_revoke` and `platform_hardening_phase0`, which prove grants at runtime. ROADMAP.md carries the standing requirement this violated: *"Any `.sql` file must be executed against a real PostgreSQL before it is called verified."* The gap is closed by the suite above; this note stays as the record that the Owner ratified structural-only evidence on a premise that was untrue.

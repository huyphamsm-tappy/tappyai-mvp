# Phase 2 — Activation Analytics — Step 4 Implementation Report

**Step scope:** Rollup strategy + the real caller (§6, §14 item 3) — extend the existing `analytics-snapshot` cron with an Activation stage that (a) discovers candidate users from Step 1's domain events, (b) runs them through the Step 2 Engine/Provider + Step 3 writer via one new orchestrator, and (c) recomputes `activation_daily_rollup`. **No** API, no dashboard. Migrations are files only, **not applied**.

---

## 1. What was implemented (3 new files, 1 edited file, 1 migration file)

| File | Role |
|---|---|
| `supabase/migrations/20260714_activation_daily_rollup.sql` | **New — file only, NOT applied.** `activation_daily_rollup` table, grain `(snapshot_date, platform, signup_source, rule_version)` per spec §6/§14 item 2, mirroring `auth_daily_rollup`'s structure/RLS posture exactly. `fn_rollup_activation_daily(from, to)` — set-based GROUP BY over `user_acquisition`, idempotent recompute-overwrite (`ON CONFLICT ... DO UPDATE`), non-activated signups bucketed under `rule_version='none'` (an honest state, not a fabricated rate). |
| `src/lib/admin/analytics/activationEvaluationRunner.ts` | **New — the orchestrator (the "real caller" this step introduces).** `toDomainEvent()` (pure adapter, raw `user_events` row → Engine's `DomainEvent`) + `evaluateAndUpsertActivation(userId, events, client, provider?)` — resolves the active rule via the Provider, evaluates via the Step 2 Engine, and calls the Step 3 writer only when it activates. This is the **one** place Engine+Provider+Writer are wired together — reused by the cron, not duplicated in it. |
| `src/lib/admin/analytics/activationEvaluationRunner.test.ts` | 5 unit tests (fully mocked Supabase client — no live DB). |
| `src/app/api/cron/analytics-snapshot/route.ts` | **Edited — additive only.** One new stage 4 appended after the three existing Phase 1 stages: discover candidate users (anyone with a Rule-v1 signal event — `chat_response_received`/`search_result_saved` — in the reconcile window), fetch each candidate's full matching-event history, call the new runner, then recompute `activation_daily_rollup` for the window. Response JSON gains 4 new fields (`activationReadError`, `activationProcessed`, `activatedCount`, `activationRollupError`); the 3 existing Phase 1 fields are untouched. |

## 2. Why this design (spec §6/§14 conformance)

- **Grain includes `rule_version`** exactly as frozen — a future Rule v2 lands as new rows, never overwriting v1's history, without any table/column change.
- **Candidate discovery reuses Step 1's domain events**, not an activation-specific query — the cron asks "who has a `chat_response_received`/`search_result_saved` row in this window," derived generically from `activeRule.signals.map(s => s.eventType)` rather than hardcoding the two event names in the cron. This means a future Rule v2 referencing different events would automatically change what the cron looks for, with **zero edit to the cron file** — the cron only ever asks the Provider "what does the active rule's signals need," never encodes rule-specific knowledge itself.
- **Full per-user event history is fetched (not window-limited) before evaluating**, because Rule v1's window is session-based, not date-based — a signal event that arrived just before the reconcile window started could still be in the same "first session" as one arriving inside it. Limiting to the window would risk incorrectly missing an activation. This mirrors the same reasoning that led Step 2 to make "first session" a property of the full event set, not a date filter.
- **`fn_upsert_activation`'s existing first-write-wins guard (`WHERE activated_at IS NULL`, Step 3) makes safe, idempotent re-processing free** — re-running the cron, or re-evaluating an already-activated user, is a harmless no-op UPDATE. No new idempotency mechanism was needed at this layer.
- **Per-step error isolation preserved**: exactly like the three existing Phase 1 stages, every Supabase call in the new stage returns `{data, error}` (never throws), and its error is captured into the response rather than aborting the request — a failure in the new Activation stage cannot block or corrupt the three already-existing, already-shipped Authentication Analytics stages that run before it.

## 3. Reuse (SR-1 → SR-6) — nothing duplicated

- **Engine, Provider, Rule Source (Step 2) untouched** — the runner only calls `provider.getActiveRule()` and `evaluateActivationRule()`, no copy of their logic.
- **Writer (Step 3) untouched** — the runner calls `activationInputFromResult()` + `upsertActivation()` as-is.
- **Cron pattern reused, not reinvented**: same `CRON_SECRET` gate, same `reconcileWindow`, same "query with `.limit(5000)`, loop, capture per-row/step errors" idiom already used for Phase 1's signup-processing stage — the new Activation stage is structurally a sibling of the existing acquisition-processing loop, not a new pattern.
- **No second orchestrator**: `activationEvaluationRunner.ts` is the only place Engine+Provider+Writer are composed; the cron calls it, nothing else does yet (a future API/dashboard need would call the same runner, or the underlying service methods once Step 5 exists — not a new orchestration path).

## 4. Verification results

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean |
| `next lint` | ✅ Clean — no warnings in any new/edited file |
| `npm test` (vitest) | ✅ **108/108 passing** (13 files: 12 prior + 1 new `activationEvaluationRunner.test.ts` with 5 tests) |
| `npm run build` | ✅ "Compiled successfully"; the one logged `Dynamic server usage` line is `/api/subscription`'s pre-existing, unrelated `request.headers` usage |
| `architecture:check` | ✅ 7/7 rules passed |

## 5. Critical audit

- **Authentication Analytics stages genuinely unaffected:** re-read the full edited cron file — stages 1–3 (auth rollup, acquisition processing, last-login sync) are byte-for-byte unchanged above the new stage; their code paths, error fields, and execution order are untouched. The new stage runs strictly after them and cannot throw into their execution (it runs after they've already completed and returned their own captured errors).
- **No activation-prefixed event queried or emitted:** the candidate-discovery query filters on `signalEventTypes` derived from the active rule's *existing* domain-event signals (`chat_response_received`/`search_result_saved` for v1) — `grep -rn "'activation_" src/` remains empty; `activation_aha_reached` is still not emitted anywhere (this step writes to the dimension/rollup directly, per the frozen spec's design — the event is a later concern if/when it's needed for a consumer, not fabricated here).
- **Idempotency verified by design, not just claimed:** re-running the new stage twice in the same window re-evaluates the same candidates and calls the same first-write-wins RPC — confirmed by reading `fn_upsert_activation`'s `WHERE activated_at IS NULL` guard (Step 3) and `fn_rollup_activation_daily`'s `ON CONFLICT ... DO UPDATE` (this step); neither can double-count.
- **Known scalability boundary (disclosed, not hidden, consistent with the frozen spec's own TD-2):** the candidate loop processes users sequentially with one event-fetch query per user, capped implicitly by the `5000`-row candidate-discovery query — same order-of-magnitude pattern as the existing Phase 1 acquisition-processing loop it sits beside, not a new or worse limitation. Not fixed here, since no real volume problem exists yet (SR-4 — same "build only when a real consumer/need exists" principle just reaffirmed by the owner for Step 3's own follow-ups).
- **No new abstraction beyond what was needed:** no `WindowEvaluator` (explicitly deferred, per the owner's Step 2 note), no `ActivationWriter` abstraction between Engine and persistence (explicitly deferred, per the owner's Step 3 note) — the runner is a plain function, not a class/interface, because nothing yet requires swapping its implementation.
- **Migrations confirmed not applied:** only file creation, no database connection made.
- **Scope discipline:** 3 new files + 1 additive edit to the cron + 1 new migration file; 0 changes to the frozen specification; 0 changes to any Authentication Analytics file beyond the cron's additive stage.

## 6. Technical debt (owner-approved addendum, documented only — not implemented)

**Sequential candidate-evaluation loop.** The cron's Activation stage currently processes candidate users one at a time (one event-fetch query + one evaluate/upsert per user). This is fine at current volume but will not scale indefinitely. When event volume grows, the recommended replacement is:

```
Candidate Discovery → Cursor/Batch Processing → Parallel Evaluation → Bulk Upsert
```

Not implemented now, per SR-4 (build only when a real consumer/need exists) — there is no real volume problem yet. Recorded here as technical debt only.

---

**Step 4 status: Implemented, code-verified (tsc/lint/build/108 tests/architecture 7/7 all green).** The Activation Engine now has a real caller: the cron discovers candidates from existing domain events, evaluates them, persists activation state (Step 3), and rolls up the result — all read-idempotent and error-isolated from Authentication Analytics. Still no API or dashboard.

*Stopping here. Do not proceed to Step 5 until explicitly approved.*

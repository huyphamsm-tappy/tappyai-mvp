# Analytics Platform — Production Readiness Report

**Scope:** Authentication Analytics (Steps 1.0–6, F1-fixed) + Activation Analytics (Steps 1–7), reviewed as one end-to-end platform.
**No code changed, no migration applied, nothing deployed** as part of this review.
**Companion document:** `ANALYTICS_PRODUCTION_VERIFICATION_PLAN.md` (the executable checklist this report's risks feed into).

---

## 1. What was reviewed

Every migration (6 files), the cron (`analytics-snapshot`), both services (`authAnalyticsService`, `activationAnalyticsService`), both APIs (`/api/admin/analytics/auth`, `/api/admin/analytics/activation`), both dashboards, RBAC/rate-limiting/env-var dependencies, and the Rule Provider/Engine layer — end to end, as one system, not module-by-module in isolation.

## 2. Risk register (classified, with proposed fixes — no code changed)

### R1 — Blocker: Migration filenames do not sort into correct dependency order
**Finding:** The 6 migration files, if applied by naive lexicographic/directory order (the default behavior of most migration tooling, including a bulk "apply all pending" action), apply in an order that violates real dependencies twice:
- `20260713_auth_daily_rollup.sql` sorts **before** `20260713_user_acquisition_dimension.sql`, but `fn_sync_last_login` (in the former) writes to `user_acquisition` (created by the latter).
- `20260714_activation_daily_rollup.sql` sorts **before** `20260714_activation_dimension.sql`, but `fn_rollup_activation_daily` (in the former) reads `activated_at`/`activation_rule_version` (added by the latter).

**Why it's a Blocker, not just theoretical:** PostgreSQL does not validate a `LANGUAGE sql` function body's referenced tables/columns at `CREATE FUNCTION` time (resolution is deferred to first execution) — so the migrations themselves would likely *apply without error* in the wrong order, silently masking the problem until the cron actually **invokes** `fn_sync_last_login` or `fn_rollup_activation_daily` against a table/column that doesn't exist yet, at which point it fails in production, mid-cron-run, potentially confusing whoever is debugging it (the migrations "succeeded," so the failure looks unrelated to migration order).
**Proposed fix (not applied):** Do not rely on directory/filename order. Apply the 5 pending migrations one at a time, manually, in the explicit order documented in the Verification Plan §2.1. Optionally, for future safety, rename migration files to include a time component (not just a date) so lexicographic order matches dependency order automatically.

### R2 — High: Rate limiter is in-memory, not enforced globally across serverless instances
**Finding:** `src/lib/security/rateLimit.ts` uses an in-memory `Map`, explicitly documented in its own comment as "scoped per serverless instance." On Vercel, concurrent cold-started lambda instances each keep their own counter — the "100 req/min" cap on both analytics API routes is actually ~100/min **per warm instance**, not a true global cap.
**Impact:** Under real concurrent admin/dashboard load (multiple analysts, or a runaway client-side polling bug), the effective rate limit could be several times higher than intended. This is a defense-in-depth control, not the primary access gate (RBAC is), so it does not block launch, but it should not be assumed to behave as a hard global cap.
**Proposed fix (not applied):** Acceptable to ship as-is for initial internal-admin-only traffic (low volume, trusted users). If/when a Redis/Upstash-backed limiter is introduced for other reasons, this endpoint should adopt it too — no urgency to build one specifically for this feature now (consistent with this phase's own SR-4 discipline of not building ahead of a real need).

### R3 — High: `NEXT_PUBLIC_SITE_URL` misconfiguration silently breaks both dashboards in production only
**Finding:** `isSameOrigin` (`src/lib/admin/rbac.ts:117-121`) returns `true` when no `Origin` header is present, but requires an exact match to `process.env.NEXT_PUBLIC_SITE_URL` when one is. Local/dev/test requests typically lack an `Origin` header, so this check is effectively **untested by the existing test suite and by local manual testing** — the first real exercise of this path is production browser traffic.
**Impact:** If `NEXT_PUBLIC_SITE_URL` is unset, mistyped, or mismatched (e.g. `https://tappyai.vn` vs `https://www.tappyai.vn`), every real dashboard request gets 403 in production while everything appeared to work in every prior verification step — a classic "works everywhere except prod" failure mode.
**Proposed fix (not applied):** Explicit pre-deploy checklist item (already in the Verification Plan §3/§4) to confirm the exact value in the Vercel production environment matches the real production origin, including the `www`/apex distinction, **before** relying on any other verification step's "it worked" result.

### R4 — High: Live migration-applied state cannot be confirmed from the repo
**Finding:** There is no migration-history file checked into the repo; the only evidence any of the 5 pending migrations are unapplied is each file's own header comment stating so, plus prior-session conversation history. This is trustworthy but not independently re-verifiable without direct Supabase access.
**Impact:** If Production Verification proceeds assuming "all 5 are unapplied" and one was in fact partially applied by a prior manual action, re-running `CREATE TABLE IF NOT EXISTS`/`CREATE OR REPLACE FUNCTION` statements is safe (idempotent), **except** the one-time backfill `INSERT ... SELECT ... ON CONFLICT DO NOTHING` in `20260713_user_acquisition_dimension.sql` — safe to re-run (conflict-safe), but worth confirming it hasn't already run partially with different assumptions.
**Proposed fix (not applied):** First live action of Production Verification (§1 of the Verification Plan) must be a direct query against the production database confirming actual current schema state, not an assumption carried over from this report.

### R5 — Medium: `CRON_SECRET`/Supabase env vars are shared across many unrelated cron routes
**Finding:** `CRON_SECRET` gates 9+ different cron/debug routes across the codebase, not just `analytics-snapshot`; `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are used by effectively every admin/service-role code path in the app.
**Impact:** Not a defect specific to this feature — if these are already correctly set (which prior session history suggests, per the "Vercel env gaps" correction on file), this Analytics work inherits working configuration for free. Flagged as Medium only because a future *rotation* of `CRON_SECRET` or the Supabase key without re-deploying would silently break this cron alongside every other one — a shared-blast-radius risk, not unique to Analytics.
**Proposed fix (not applied):** No action needed specific to this feature; note the shared blast radius for whoever manages secret rotation going forward.

### R6 — Medium: Sequential, unbatched candidate-evaluation loop in the cron (already-documented technical debt)
**Finding:** Carried over from `PHASE2_STEP_4_IMPLEMENTATION_REPORT.md` §6 (owner-approved, not re-litigated here) — the Activation stage of the cron processes candidate users sequentially, one event-fetch + evaluate/upsert per user, capped at 5000 candidates per run.
**Impact:** Fine at current expected volume (mirrors the existing Phase 1 acquisition-processing loop's own scale); would need the documented batch/parallel redesign if signup+signal volume grows substantially. Already tracked as technical debt, not a new finding.
**Proposed fix:** None needed now (SR-4) — re-flagging here only so it's visible in the consolidated risk register, not because it's changed since Step 4.

### R7 — Low: `getEvaluationResult` and `view=rule` are unused by any dashboard yet
**Finding:** `activationAnalyticsService.getEvaluationResult` (diagnostic, per-user rule evaluation) and the API's `view=rule` output are both implemented and tested but have no dashboard/tool consumer wired up yet — they exist for a future debugging workflow.
**Impact:** None — dead-but-tested code is not a production risk, just an unused capability. No fix needed; noted for completeness of the audit.

### R8 — Low: Naming/UI-consistency and shared-abstraction items (already-documented technical debt)
**Finding:** Carried over from Steps 5/6/7 (owner-approved, not re-litigated): breakdown-method naming differences between `authAnalyticsService`/`activationAnalyticsService`; no shared Analytics API Contract; no shared Analytics UI Design System. All explicitly deferred per SR-4 until enough real consumers exist.
**Impact:** Cosmetic/maintainability only; zero functional risk. Re-listed here only for a complete consolidated register.

## 3. What is confirmed solid (no action needed)

- **RBAC**: `requireAdminRole`/`isSameOrigin` correctly gate both endpoints and both pages; `admin_roles` already seeded with at least one `super_admin` from the already-applied Phase 0 migration.
- **Idempotency**: every rollup function (`fn_rollup_auth_daily`, `fn_rollup_activation_daily`) is a full-window recompute-overwrite (`ON CONFLICT ... DO UPDATE`), safe to re-run any number of times. Every dimension writer (`fn_upsert_user_acquisition`, `fn_upsert_activation`) is first-write-wins, safe against duplicate/out-of-order events.
- **F1 already fixed**: `fn_sync_last_login` is `SECURITY DEFINER` with `search_path` pinned — the one previously-identified Medium defect from the Auth Analytics audit is resolved in the pending migration.
- **Error isolation**: every stage of the cron independently captures its own error into the response without aborting other stages — a partial failure degrades gracefully rather than cascading.
- **No cross-contamination**: nothing in Activation Analytics modifies, depends on modifying, or risks corrupting any Authentication Analytics table, function, or code path — confirmed by re-reading every migration and the cron's diff history across all 7 Activation steps.
- **Test coverage**: 150/150 unit tests passing across both features; `tsc`/`lint`/`build`/`architecture:check` green at every step's own verification gate.
- **No activation-prefixed event ever emitted** — confirmed by repo-wide grep at every step; `activation_aha_reached` is not yet wired to any persisted event (by design, per the owner's "computed on demand only" refinement) — this is expected, not a gap.

## 4. Final Go / No-Go recommendation

**CONDITIONAL GO — code is production-ready; the gate is entirely procedural (migration apply order + env var confirmation), not a code defect.**

Required before deploy, in this order:
1. **Resolve R1** — apply the 5 pending migrations manually, in the exact dependency order documented in the Verification Plan, not by directory default.
2. **Resolve R4** — confirm actual live-DB schema state directly (don't assume this report's table is still accurate) immediately before applying anything.
3. **Resolve R3** — confirm `NEXT_PUBLIC_SITE_URL` (and the other 3 env vars, §3 of the Verification Plan) are correctly set in the Vercel **production** environment specifically, not just preview/local.
4. Deploy, then execute the full Verification Plan's §5 checklist end-to-end with real evidence recorded per item.

R2/R5/R6/R7/R8 are non-blocking and require no action before launch.

---

*No code changed, no migration applied, no deployment performed. Stopping here for owner review and approval before any live action.*

# Analytics Platform — Production Verification Plan

**Scope:** Authentication Analytics (Steps 1.0–6, F1-fixed) + Activation Analytics (Steps 1–7).
**Status:** Planning only. **No migration applied, no deploy, no code changed** as part of this document.
**Purpose:** A complete, objective, PASS/FAIL-evidence checklist to execute once the owner authorizes deployment — not executed now.

---

## 1. Current known state (from repo inspection + prior session history)

| Migration (apply order below) | Live DB state |
|---|---|
| `20260713_backoffice_phase0.sql` | **Applied** (owner confirmed via Chrome SQL editor; `super_admin` seeded; PV-5 passed in a prior session) |
| `20260713_analytics_envelope_foundation.sql` | **Not applied** |
| `20260713_user_acquisition_dimension.sql` | **Not applied** |
| `20260713_auth_daily_rollup.sql` | **Not applied** (includes the F1 `SECURITY DEFINER` fix on `fn_sync_last_login`) |
| `20260714_activation_dimension.sql` | **Not applied** |
| `20260714_activation_daily_rollup.sql` | **Not applied** |

This cannot be independently re-verified from the repo alone (no migration-history file is checked in) — **the first live action of Production Verification must be to confirm actual applied-migration state directly in the Supabase dashboard/SQL editor**, not assume the table above.

---

## 2. Deployment order

### 2.1 Migration apply order — **must be manual, not directory-default**

**Finding (see Risk R1 in the companion Readiness Report): the six files' names do NOT sort into correct dependency order.** A tool or operator that applies migrations by naive filename/lexicographic order will apply them in the **wrong order** in two places. The required order is:

| # | File | Depends on (must already exist) |
|---|---|---|
| 1 | `20260713_analytics_envelope_foundation.sql` | (none — extends pre-existing `user_events`) |
| 2 | `20260713_user_acquisition_dimension.sql` | `profiles`, `auth.users`, `auth.identities` (pre-existing) |
| 3 | `20260713_auth_daily_rollup.sql` | **`user_acquisition` table (#2)** — `fn_sync_last_login` writes to it |
| 4 | `20260714_activation_dimension.sql` | **`user_acquisition` table (#2)** — `ALTER TABLE` |
| 5 | `20260714_activation_daily_rollup.sql` | **`activated_at`/`activation_rule_version` columns (#4)** — `fn_rollup_activation_daily` reads them |

`20260713_backoffice_phase0.sql` is independent of all five and is already applied — not in this sequence.

**Naive lexicographic order would instead apply:** `analytics_envelope_foundation → auth_daily_rollup → backoffice_phase0 → user_acquisition_dimension → activation_daily_rollup → activation_dimension` — i.e. **`auth_daily_rollup` before `user_acquisition_dimension`**, and **`activation_daily_rollup` before `activation_dimension`**. Both are backwards relative to the dependency table above.

**Action required before applying anything:** apply the 5 pending files **one at a time, in the numbered order above**, verifying each succeeds before running the next — do **not** use a bulk "apply all pending migrations" action that relies on filename order.

### 2.2 Application deployment order
1. Apply the 5 pending migrations (§2.1), in order, with a verification query after each (§4).
2. Deploy the application code (this is the branch already containing all Steps 1.0–6 + 1–7 — no separate deploy per step; one deploy covers everything, since none of it has shipped yet).
3. Confirm the Vercel Cron entry for `/api/cron/analytics-snapshot` (`vercel.json`, schedule `5 17 * * *` = 00:05 VN) is registered and firing post-deploy.
4. Do **not** perform real Google/Zalo logins or place-saves for verification until steps 1–3 are confirmed — premature real traffic before the schema exists will silently fail to record (event ingestion itself doesn't depend on these migrations, since `user_events`/`/api/track` already exists in production independently, but the **dimension/rollup/dashboard** will show nothing until the migrations land).

### 2.3 Rollback plan
All 5 pending migrations are additive-only (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`) — none rename, drop, or alter an existing column's type, and none touch RLS on pre-existing tables. Rollback options, in order of preference:

| Scenario | Rollback action |
|---|---|
| A migration fails partway (e.g. syntax error) | Nothing to roll back — `IF NOT EXISTS`/`CREATE OR REPLACE` means a failed statement doesn't leave partial state from *other* statements in a different file; re-run the fixed file. |
| A migration succeeds but the cron/dashboard misbehaves after deploy | **Do not drop tables.** Disable the Vercel Cron trigger (or the deployed function) to stop new writes; the dashboard pages can be hidden by reverting the `AdminShell` nav-entry commits (code rollback via `git revert`) without touching the DB. Data already written is inert (nothing reads it once the UI is hidden). |
| A specific function is wrong and needs correcting | `CREATE OR REPLACE FUNCTION` — safe to re-apply a corrected version of just that function; no DROP needed. |
| Full reversal is genuinely required | `DROP FUNCTION`/`DROP TABLE`/`ALTER TABLE ... DROP COLUMN` for exactly the objects each migration created (each file's own header comment lists what it creates) — **owner-gated, not part of this plan**, since Authentication Analytics' tables may already have real data by the time this is considered. |

**No rollback plan exists for `20260713_backoffice_phase0.sql`** — out of scope (already live, unrelated to this verification).

### 2.4 Cron dependencies
- `analytics-snapshot` (the single cron for both Auth + Activation) requires, in this order at runtime: `auth_daily_rollup`/`fn_rollup_auth_daily` (migration #3) → `user_acquisition`/`fn_upsert_user_acquisition` (#2) → `fn_sync_last_login` (#3) → **Activation stage**: `activation_ai_answer_received`/`search_result_saved` events already flowing via `/api/track` (pre-existing, Step 1 of Activation — no migration needed) → `fn_upsert_activation` (#4) → `fn_rollup_activation_daily` (#5).
- **If the cron fires before all 5 migrations are applied**, each stage independently captures its own error into the JSON response without crashing the others (verified in the Step 4 report) — so a partial-migration state produces partial, error-flagged results, not a hard failure. Still, the cron should not be relied upon to "self-heal" — verify migrations first (§2.1), then let the cron run.
- `CRON_SECRET` must be set in the deployment environment (see §3) or every cron invocation 401s.

---

## 3. Environment variables (must exist in the production environment before deploy)

| Variable | Used by (this scope) | Effect if missing |
|---|---|---|
| `CRON_SECRET` | `src/app/api/cron/analytics-snapshot/route.ts:28` (shared with several other unrelated crons) | Every cron run returns 401; rollups/dimension/activation never populate. |
| `NEXT_PUBLIC_SITE_URL` | `src/lib/admin/rbac.ts:120` (`isSameOrigin`, gates both `/api/admin/analytics/auth` and `/api/admin/analytics/activation`) | Any browser request carrying an `Origin` header (i.e. every real dashboard request) gets 403 — the dashboards would be unusable in production while working fine locally/in tests (no `Origin` header in test requests). |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/admin.ts` (admin client, used by every service/cron in this scope) | Admin client construction throws/misbehaves (non-null-asserted, no runtime guard) — every analytics read/write fails. |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts` (same) | Same failure mode as above. |

**Action:** confirm all four are set in the Vercel production environment (not just `.env.local`) before deploying — this is the single most likely "works in preview, breaks in prod" failure mode for this feature, specifically `NEXT_PUBLIC_SITE_URL` (§3 above), since local/dev testing rarely exercises real cross-origin browser requests the way production traffic does.

---

## 4. Production prerequisites checklist (pre-deploy gate)

- [ ] All 5 pending migrations applied in the exact order in §2.1 (verified by querying `information_schema.tables`/`information_schema.columns` for each new table/column, and `\df` or `pg_proc` for each new function).
- [ ] At least one `super_admin` (or `analyst`+) row exists in `admin_roles` (already true per Phase 0 — re-confirm it hasn't been altered).
- [ ] `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` all set in the Vercel production environment.
- [ ] Vercel Cron entry for `/api/cron/analytics-snapshot` present in `vercel.json` and recognized by the Vercel dashboard's Cron Jobs tab post-deploy.
- [ ] A dry-run of the full test suite (`npm test`, `tsc`, `lint`, `build`, `architecture:check`) passes on the exact commit being deployed (all previously verified green per-step; re-verify once more immediately before deploy in case of drift).

---

## 5. Verification items — objective PASS/FAIL evidence fields

Each item below must be executed against the real deployment and recorded with concrete evidence (a query result, an HTTP status, a screenshot, or a log line) — not a checkbox alone.

### 5.1 Migrations

| # | Item | Evidence field |
|---|---|---|
| M1 | `user_events` has envelope columns (`event_id`, `session_id`, `platform`, etc.) and `UNIQUE(event_id)` | `\d user_events` output / `information_schema` query result |
| M2 | `user_acquisition` table exists with all columns incl. `activated_at`, `activation_rule_version` | `\d user_acquisition` output |
| M3 | `auth_daily_rollup` table + `fn_rollup_auth_daily` + `fn_sync_last_login` exist | `\d auth_daily_rollup`; `\df fn_rollup_auth_daily fn_sync_last_login` |
| M4 | `fn_sync_last_login` is `SECURITY DEFINER` (F1 fix) | `SELECT prosecdef FROM pg_proc WHERE proname='fn_sync_last_login';` → `true` |
| M5 | `activation_daily_rollup` table + `fn_rollup_activation_daily` + `fn_upsert_activation` exist | `\d activation_daily_rollup`; `\df` |
| M6 | All 5 migrations applied in the correct order with no error | Migration history / SQL editor run log, one entry per file |

### 5.2 Cron

| # | Item | Evidence field |
|---|---|---|
| C1 | Cron fires at 00:05 VN (17:05 UTC) | Vercel Cron Jobs dashboard log timestamp |
| C2 | `CRON_SECRET` accepted, no 401 | HTTP response status from the logged invocation |
| C3 | `auth_daily_rollup` rows populate/update for the run's window | Row count / `updated_at` timestamp before vs. after |
| C4 | `user_acquisition` rows populate for new signups | Row count before vs. after a real signup |
| C5 | `last_login_at` syncs (F1 confirmation) | A known user's `last_login_at` matches `auth.users.last_sign_in_at` after a real login + cron run |
| C6 | Activation stage: candidate discovery + evaluation runs without throwing | `activationProcessed`, `activatedCount` fields in the cron's JSON response |
| C7 | `activation_daily_rollup` rows populate/update | Row count / `updated_at` before vs. after |
| C8 | Re-running the cron twice in the same window is idempotent (no double-counting) | Row values identical across two consecutive runs |

### 5.3 Event emission (real device/browser traffic)

| # | Item | Evidence field |
|---|---|---|
| E1 | `auth_signup_completed`/`auth_login_completed`/`auth_login_failed`/`auth_logout_completed` emit correctly on real auth flows | `/api/track` request log or `user_events` row inspection |
| E2 | `chat_response_received` emits on a real successful AI answer (any chat-category tool) | `user_events` row with correct `feature` property |
| E3 | `search_result_saved` emits on a real successful place save (`SavePlaceButton`) | `user_events` row present |
| E4 | A real user who gets one AI answer + saves one place in the same session ends up with `user_acquisition.activated_at` + `activation_rule_version='v1'` populated exactly once | Direct row query pre/post |
| E5 | A second AI-answer/save afterward does not move `activated_at` (first-write-wins) | Row unchanged after a second qualifying action |

### 5.4 API

| # | Item | Evidence field |
|---|---|---|
| A1 | `GET /api/admin/analytics/auth` as `analyst`+ returns 200 for every `view` | HTTP status + response body per view |
| A2 | `GET /api/admin/analytics/activation` as `analyst`+ returns 200 for every `view` incl. `rule` | Same |
| A3 | Non-admin → 401/403 on both endpoints | HTTP status |
| A4 | Cross-origin request → 403 | HTTP status (requires `NEXT_PUBLIC_SITE_URL` correctly set — see §3) |
| A5 | Bad query params → 422 | HTTP status |
| A6 | Rate limit engages at 100 req/min **per instance** (documented limitation, §Risk R2) | Response sequence showing 429 after ~100 requests within one warm instance |

### 5.5 Dashboard

| # | Item | Evidence field |
|---|---|---|
| D1 | `/admin/analytics/auth` renders KPI cards/tables/trend with real data as `analyst`+ | Screenshot + network tab showing 200s |
| D2 | `/admin/analytics/activation` renders KPI cards (incl. "Activation Rule: v1" label)/tables/trend with real data | Screenshot + network tab |
| D3 | Non-admin redirected away from both pages | Browser navigation result |
| D4 | Filters (date/platform/method/app_version/country/language on Auth; date/platform/rule_version on Activation) narrow results correctly | Before/after screenshots with a known filter |
| D5 | Empty range → empty states on both dashboards | Screenshot |
| D6 | Forced API error → error alerts render (`role="alert"`) | Screenshot / DOM inspection |
| D7 | Responsive at mobile/tablet/desktop widths | Screenshots at 3 breakpoints |
| D8 | Displayed numbers reconcile exactly to the underlying rollup tables | Manual cross-check: dashboard number vs. `SELECT` on `auth_daily_rollup`/`activation_daily_rollup` |

---

*This plan defines what "verified" means. It does not itself constitute verification — every item above requires real execution against a deployed environment, which has not happened. See the companion `ANALYTICS_PRODUCTION_READINESS_REPORT.md` for the risk register and Go/No-Go recommendation.*

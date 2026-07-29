# Production Bug List — 2026-07-17 (post-merge deployment)

Issues found during deployment verification and Founder Acceptance Test. Per task instructions, none were fixed — documentation only.

---

### 1. `/api/track` silently swallows database insert errors
- **Classification: Medium**
- **Location:** `src/app/api/track/route.ts:104-106`
- **Description:** the `admin.from('user_events').upsert(rows, {...})` call's returned `.error` is never checked or logged. Any DB-level rejection (constraint violation, type mismatch) is invisible to both the client (which still receives `{"ok":true}`) and server-side observability.
- **Status:** pre-existing, first documented in `docs/backoffice/phase-reports/PRODUCTION_DEPLOYMENT_AUDIT.md` during the earlier migration-application session. Unaffected by this merge/deploy — confirmed still present in the deployed code.
- **Not fixed** — out of scope ("Do NOT fix bugs").

### 2. `auth_daily_rollup` / `activation_daily_rollup` tables are empty in production
- **Classification: Medium**
- **Description:** both rollup tables have 0 rows. The `analytics-snapshot` cron is correctly registered on Vercel and correctly gated (401 without `CRON_SECRET`), but no successful rollup run has ever populated these tables.
- **Status:** pre-existing — same 0-row baseline was recorded before this session's earlier migration work, so this is not a regression from today's merge/deploy. Root cause not investigated (would require inspecting Vercel cron execution history/logs, out of scope for this task).
- **Not fixed** — flagged for follow-up investigation into whether the cron has ever fired successfully.

### 3. Four cron-route files exist without a corresponding schedule in `vercel.json`
- **Classification: Low**
- **Location:** `src/app/api/cron/weekly-recap`, `travel-reminder`, `lunch-reminder`, `behavior-rollup`
- **Description:** these routes implement the same `CRON_SECRET`-gated pattern as the 4 scheduled crons, but are not listed in `vercel.json`'s `crons` array, so Vercel never invokes them on a schedule.
- **Status:** unclear if intentional (manual-trigger-only endpoints) or an oversight. Not a regression from this deploy — same `vercel.json` cron list was already in place.
- **Not fixed** — needs owner confirmation of intent.

### 4. Google Cloud Console / Zalo Developer Console OAuth redirect URIs — not independently verified
- **Classification: Medium (risk-acceptance, not a confirmed defect)**
- **Description:** I have no credentials for either console and did not attempt to log in. Owner explicitly accepted this verification gap, citing that Google Sign-In was already confirmed working on production and no OAuth configuration changed in this merge.
- **Status:** accepted risk, not a bug — listed here for traceability.

---

## No Critical or High severity issues found.

## New Bug Discovered (this deployment pass)

None beyond what's listed above — items #1 and #2 were already known from the prior migration-verification session; this pass re-confirmed both are still present post-deploy but introduced no new defects.

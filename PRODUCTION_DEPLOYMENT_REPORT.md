# Production Deployment Report — 2026-07-17

## Summary

`feat/backoffice-phase0` merged into `main` via a standard (non-fast-forward) merge and deployed to production through Vercel's GitHub integration (auto-triggered on push). No code was modified as part of this task — merge and deploy only.

## Merge

- **Method:** `git merge --no-ff feat/backoffice-phase0` performed in an isolated worktree (`../tappyai-mvp-main-merge`), checked out to `main`, so the primary working tree's uncommitted WIP was never touched.
- **Result:** clean merge, no conflicts.
- **Commits merged (4):** `dc7fc84` (Backoffice Phase 0 — RBAC, audit log, admin shell), `3ade64c` (Analytics platform — Authentication + Activation Analytics), `27ac2f2` (iOS — Web Parity Sync Sprint), `c4a924b` (Android — complete app, all features).
- **Diff size:** 886 files changed, 83,616 insertions(+), 135 deletions(-) — 497 Android, 177 iOS, 111 docs, 85 `src/`, 8 `supabase/` migrations, remaining root config files.
- **Merge commit:** `07573ef2044777da23a8db240149acdf280d0a4c`
- **Pushed to:** `origin/main` (`a4fda40..07573ef`)

## Deployment

- Vercel's GitHub integration auto-deployed Production on push to `main` (no manual `vercel --prod` needed).
- **Deployment ID:** `dpl_4SEgtTPiSfYa8vjAGSdsni5ewgns`
- **Build status:** Ready (completed in ~70s)
- **Production URL:** https://www.tappyai.com

## Pre-deployment verification (this session)

| Check | Result |
|---|---|
| Vercel Production env vars | PASS — all code-referenced vars present or have safe fallbacks |
| `CRON_SECRET` | PASS — present in Production, checked consistently in all 8 cron routes |
| Google OAuth (Supabase side) | PASS — Site URL, redirect allowlist, provider config all correct |
| Google OAuth (Google Cloud Console side) | **Not independently verified** — owner confirmed Google Sign-In already tested successfully on production with their own account; accepted as sufficient given no OAuth config changed in this merge |
| Zalo OAuth (Zalo Developer Console side) | **Not independently verified** — owner accepted this risk; no OAuth config changed in this merge |
| Production domain | PASS — `www.tappyai.com` resolves, apex redirects correctly |
| SSL | PASS — valid Let's Encrypt cert (Jun 16 – Sep 14 2026) |

## Post-deployment verification

| Area | Result |
|---|---|
| Application accessible | PASS — `/` returns 200, ~1.3s response |
| Authentication | PASS — `/login` renders, Google OAuth button present, `/auth/callback` responds 307 (expected redirect behavior) |
| APIs | PASS — `/api/track` accepts correctly-shaped payloads (200, row persisted); malformed payload correctly returns 400 |
| Analytics pipeline | PASS — end-to-end test event posted to `/api/track`, verified present in `user_events` with correct `device_context`, then cleaned up |
| Cron jobs | PASS — all 4 crons (`analytics-snapshot`, `deal-notifications`, `morning-brief`, `price-check`) registered on Vercel matching `vercel.json`; all correctly return 401 without `CRON_SECRET` (confirms gating is live) |
| Environment variables | PASS — see pre-deployment table |
| Domain & SSL | PASS — see pre-deployment table |
| Production errors in logs | PASS — no errors in Vercel runtime logs since deploy; only my own verification traffic observed, all expected status codes |

## Findings / notes (not fixed, per instructions)

1. **Rollup tables (`auth_daily_rollup`, `activation_daily_rollup`) are empty.** Pre-existing condition (same 0-row baseline recorded in the migration audit prior to this deploy) — the `analytics-snapshot` cron is correctly registered and gated, but has not yet produced rollup rows. Not a regression from this deployment; next scheduled run is `5 17 * * *` UTC.
2. **`/api/track` silently swallows DB-level insert errors** (no `.error` check on the `upsert` call in `src/app/api/track/route.ts`) — documented previously in `PRODUCTION_DEPLOYMENT_AUDIT.md`, unchanged by this merge. See `PRODUCTION_BUGLIST.md`.
3. Four cron route files (`weekly-recap`, `travel-reminder`, `lunch-reminder`, `behavior-rollup`) exist in code but are not scheduled in `vercel.json` — likely intentional (manual-trigger only), flagged for owner confirmation.

## Not verified (owner-accepted risk)

- Google Cloud Console authorized redirect URI configuration.
- Zalo Developer Console callback URL configuration.

Both were explicitly accepted as manual-verification risk by the owner prior to deployment, on the basis that no OAuth configuration changed as part of this merge and Google Sign-In was already confirmed working in production.

## Outstanding owner action

- Revoke the temporary Supabase personal access token (`sbp_REDACTED-REVOKED-TOKEN`) used for this session's database verification queries — it remains active as of this report.

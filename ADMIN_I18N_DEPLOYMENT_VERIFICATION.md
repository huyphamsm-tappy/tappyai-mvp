# Admin Dashboard i18n — Deployment Verification Report

## Deployment
- Merged `feat/backoffice-phase0` → `main` (`--no-ff`, commit `62dcd2b`), pushed to `origin/main`.
- Vercel Git integration auto-triggered a Production deployment on push; completed successfully (Ready) at `https://tappyai-1yftg64v5-huyphamsm-tappys-projects.vercel.app`, aliased to `tappyai.com` / `www.tappyai.com` / `tappyai.vn` / `tappyai-mvp.vercel.app`.
- Pre-push checks on the merged `main` (isolated temp worktree, own `npm install`): `tsc --noEmit` clean, `vitest run` 176/176 passed, `next build` exit 0 with all `/admin/*` routes compiled.

## Post-deployment verification

| Check | Result |
|---|---|
| Admin routes compiled & live | ✅ `/admin`, `/admin/rbac`, `/admin/audit`, `/admin/analytics/auth`, `/admin/analytics/activation`, `/admin/settings` all present in the production build manifest. |
| RBAC still enforced (no regression) | ✅ Unauthenticated requests to `/admin*` pages resolve to the public landing/login page (no admin content served); `/api/admin/rbac/roles`, `/api/admin/analytics/auth`, `/api/admin/analytics/activation`, `/api/admin/audit` all return **401** without a session. |
| Analytics/API regression | ✅ No API or analytics logic was touched in this change (i18n-only diff); 401 gating behavior is identical to pre-deploy. |
| Language switcher, VI/EN rendering, persistence, locale-aware dates, Auth/Activation dashboard rendering | **NOT VERIFIED live** — these all require an authenticated `admin`/`analyst`+ session inside the Admin Dashboard UI. Per standing policy I do not click through real OAuth/login on production. This portion needs **Owner UAT**: log into `/admin`, confirm the VI/EN toggle in the header switches instantly, reload to confirm persistence, and check dates on the Audit Log / Roles tables render in the selected locale. |

## Code-level basis for the unverified items
Confirmed by reading the shipped code (not runtime-observed): `AdminShell` toggle calls the existing `setLocale`, which persists to `localStorage('tappy_lang')` and triggers a synchronous re-render via `useSyncExternalStore` (no reload) — same primitive already used and tested elsewhere in the app. `AuditViewer`/`RolesManager` date calls now branch on `locale` (`vi-VN` / `en-US`). All 176 unit tests, including the existing Auth/Activation dashboard component tests, passed against the merged code.

## Scope discipline
No analytics logic, API handlers, database schema, rollups, or tracking were changed — diff was limited to `src/app/admin/**`, `src/components/admin/**`, and `src/lib/i18n/**`.

Stopping here per instruction — Owner UAT needed to close out the live-session checks above.

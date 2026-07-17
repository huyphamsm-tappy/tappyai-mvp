# Admin Dashboard i18n — Implementation Report

## Scope
UI-only. No analytics logic, APIs, services, database, rollups, or tracking were touched.

## What changed
- New dictionary module `src/lib/i18n/admin/index.ts` — flat `vi`/`en` maps under the `admin.*` namespace, merged into the existing singleton store in `src/lib/i18n/useTranslation.ts` (same pattern as the `w2`/`w3` modules). Collision-free with all existing namespaces.
- Every admin surface now renders through `useTranslation()` / `t(...)`: `AdminShell` (nav, roles, shell chrome), Dashboard home, Auth Analytics (KPIs, filters, chart, tables, errors), Activation Analytics (same), Audit Log viewer, RBAC role manager, Settings.
- Server Component `page.tsx` files (which run `requirePageRole()` and can't use the client-only `useTranslation` hook) were reduced to RBAC guard + render; all title/subtitle and text now live in the underlying client components. `src/app/admin/settings/page.tsx` got a small new client wrapper (`SettingsView.tsx`) so its env-derived values could be passed as props and labeled via `t(...)`.
- Added a VI/EN toggle to `AdminShell`'s header, using the existing `setLocale`/`locale` primitives — switches instantly (no reload) and persists via the existing `localStorage('tappy_lang')` mechanism.
- Locale-dependent date formatting (`AuditViewer`, `RolesManager`) now follows the active UI locale (`vi-VN`/`en-US`) instead of being hardcoded to Vietnamese.
- Filter example-value placeholders (e.g. `web / android / ios`, `1.2.0`) were left as literal hints, not translated — they're syntax examples, not UI chrome.

## Verification
- **Typecheck**: `tsc --noEmit` — clean.
- **Lint**: `eslint` on admin scope — 0 errors (1 pre-existing unrelated warning in `analytics/page.tsx` about `<img>`).
- **Tests**: `vitest run` — 176/176 passed, including the existing `authComponents.test.tsx` / `activationComponents.test.tsx` suites (no assertions needed updating; jsdom defaults to `en` locale absent stored preference, matching prior hardcoded English expectations).
- **Build**: `next build` — exit 0, all `/admin/*` and `/api/admin/*` routes compiled successfully.
- **VI/EN coverage**: verified by reading through both dictionaries in `src/lib/i18n/admin/index.ts` — every UI-facing key has a paired `vi`/`en` entry, checked for duplicate keys (none found).

No further scope was pursued per the "stop after verification" instruction.

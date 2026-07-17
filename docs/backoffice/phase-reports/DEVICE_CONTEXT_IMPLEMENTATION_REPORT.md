# device_context — Implementation Report

**Scope:** Cross-platform `device_context` infrastructure only. No new analytics feature. Does not modify Authentication Analytics or Activation Analytics behavior. Follows the frozen envelope architecture. **Not committed, not pushed, not merged, not deployed** — implemented for review.

Design rationale + alternatives: see `DEVICE_CONTEXT_ARCHITECTURE_DECISION.md`. Critical audit: see `DEVICE_CONTEXT_AUDIT.md`.

---

## 1. Files changed

| File | Change | Purpose |
|---|---|---|
| `src/lib/tracking/deviceContext.ts` | **New** | The ONE Web device-detection module: `DeviceContext` type (**15-field contract**), `detectDeviceContext()`, `UNKNOWN_DEVICE_CONTEXT`. Single source of device detection. |
| `src/lib/tracking/envelope.ts` | **Modified** | Removed the local `getDeviceType`/`getOs` (moved into the module → no duplicate detection). `buildEnvelope()` now calls `detectDeviceContext()` once, attaches `device_context`, and **projects** the flat fields (`platform`, `os_name`, `os_version`, `device_type`, `app_version`, `language`←`locale`) from that same object. |
| `src/app/api/track/route.ts` | **Modified** | `IncomingEvent` accepts `device_context`; the row insert stores it in the new column (`device_context: e.device_context ?? null`). Existing flat-field handling unchanged. |
| `supabase/migrations/20260714_device_context.sql` | **New** | Additive `ALTER TABLE public.user_events ADD COLUMN IF NOT EXISTS device_context jsonb;` — nullable, no index, no backfill. Not applied. |
| `src/lib/tracking/deviceContext.test.ts` | **New** | 17 unit tests (jsdom) for detection across Chrome/Windows, iPhone Safari, iPad, Android Chrome (+model), Edge precedence, honest-unknown paths, screen-null path, app_version projection, manufacturer inference, pixel_ratio, color_scheme (dark/light/none), 15-key contract shape. |
| `docs/backoffice/phase-reports/DEVICE_CONTEXT_*.md` | **New** | This report + the Architecture Decision + the Audit. |

## 2. How the requirements are met

- **Web auto-populates every detectable field** — `os_name/os_version` (UA), `browser_name/browser_version` (UA, order-correct so Edge/Opera/Samsung aren't misread as Chrome), `device_type` (`phone`/`tablet`/`desktop`), `screen_width/height` (`window.screen`), `pixel_ratio` (`window.devicePixelRatio`), `color_scheme` (`matchMedia(prefers-color-scheme)`), `locale` (`navigator.language`), `timezone` (`Intl…timeZone`), `app_version` (`NEXT_PUBLIC_APP_VERSION`), `platform='web'`. `manufacturer` is factual UA inference (e.g. iPhone→Apple, SM-→Samsung) else `unknown`; `device_model` best-effort (Android UA) else `unknown`.
- **Contract finalized pre-release (15 fields)** — `manufacturer`, `pixel_ratio`, `color_scheme` were added after the initial 12 with **zero migration / zero `/api/track` / zero envelope change** (only the detection module grew) — the jsonb design's payoff. The device contract is now complete before production.
- **Unknown = explicit, never fabricated** — string fields → `'unknown'`; numeric `screen_*` → `null` (an honest "not available"; a number cannot hold `'unknown'` and a fabricated `0` would be a lie). Verified by tests.
- **Android/iOS fill the identical contract later** — the `DeviceContext` shape is platform-neutral; the endpoint + column already accept it; zero backend/schema change when native ships (see Architecture Decision §3).
- **Existing events need no caller change** — `track()` signature unchanged; the envelope auto-attaches `device_context` via the existing `...buildEnvelope()` spread.
- **Existing dashboards / APIs continue to work** — they read the flat columns, still written unchanged; `device_context` is consumed by nothing (verified).
- **Existing migrations remain valid** — untouched; only one additive nullable column added.

## 3. Verification results

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean |
| `next lint` | ✅ Clean — no warnings in `deviceContext.ts`, `envelope.ts`, or `api/track/route.ts` |
| `npm test` (vitest) | ✅ **167/167 passing** (19 files: 18 prior + 1 new `deviceContext.test.ts` with 17 tests; the prior 150 unchanged) |
| `npm run build` | ✅ "Compiled successfully" (the one logged `Dynamic server usage` line is `/api/subscription`'s pre-existing, unrelated `request.headers` usage) |
| `architecture:check` | ✅ 7/7 rules passed |

## 4. What was intentionally NOT done

- **No new columns beyond the one jsonb** (rejected the all-flat-columns option — see decision).
- **No change to Authentication/Activation Analytics logic, migrations, services, APIs, or dashboards.**
- **Migration not applied; nothing committed/pushed/merged/deployed** — left in the working tree for review.
- **No GIN index** on `device_context` — deferred until a real segmentation query needs it (avoid premature indexing).
- **No refactor of the pre-existing out-of-scope UA usages** (`login/page.tsx` isAndroid check, `audit.ts` raw-UA capture) — flagged in the Audit, not silently changed.

---

*Implementation complete and verified. Uncommitted, on top of the analytics commit (3ade64c). Awaiting review — no commit/push/merge/deploy performed.*

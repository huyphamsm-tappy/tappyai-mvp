# Parity Sync — App Connections / Membership / Video Upload — Production Report

**Date:** 2026-07-17
**Scope:** (1) hide App Connections, (2) hide Membership/Upgrade to Pro, (3) video upload 60s user-facing / 62s backend tolerance.
**Rules:** Web = Source of Truth; survey Web → Backend → Android; reuse existing backend contracts; STOP-and-report on any backend/API mismatch; preserve UI/UX; don't invent behavior.

## Outcome: COMPLETE (owner-approved product changes, applied Web/Backend-first, then Android)

The initial survey found all three instructions **contradicted or already-matched** the repo's Web source of truth, so I **stopped and reported** rather than guess. The owner then authorized two deliberate product changes (App Connections hidden on both platforms; video limit raised to 60s/62s Web-first). Those are now implemented, Web-first, with Android synced. `TEMP_VERIFY_HACK` fully removed.

---

## 1. Web Parity Verification

| Item | Web before | Web after (this change) | Android after |
|---|---|---|---|
| **App Connections** | Shown unconditionally (`ProfileView.tsx`) | **Hidden** behind `SHOW_APP_CONNECTIONS = false`; page + APIs intact | **Hidden** behind mirrored `SHOW_APP_CONNECTIONS = false`; screen + route intact |
| **Membership / Pro** | Hidden (`SHOW_PRO_UPGRADE = false`) | unchanged (already hidden) | unchanged (already hidden via mirrored flag) |
| **Video advertised limit** | 15s (`MAX_VIDEO_DURATION_SEC`) | **60s** | n/a — Android has no video-upload flow (see §2) |
| **Video tolerance** | 17s (`MAX_VIDEO_DURATION_ACCEPT_SEC`, backend-only) | **62s** (backend-only, never shown) | n/a |
| **Video UI copy** | "up to 15s" / "tối đa 15s" hint; error uses `{n}` | "up to 60s" / "tối đa 60s"; error auto-shows 60 | n/a |

- The Web reject logic (`reviews/new/page.tsx:334`) rejects at the **tolerance** (`MAX_VIDEO_DURATION_ACCEPT_SEC` = 62) but the user-facing error (`reviewNew.videoTooLong`) interpolates the **advertised** value (`MAX_VIDEO_DURATION_SEC` = 60) via `{n}`. So **62 is never shown to users** — verified by reading the code path and the i18n strings.
- **Membership** required **no change** on either platform — both already hide it via the same intentionally-mirrored flag.

## 2. Backend Contract Verification

- **`GET /api/config`** (`src/app/api/config/route.ts`) is the backend-owned single source of truth for all clients. Now serves:
  - `flags.showProUpgrade = false` (unchanged)
  - `flags.showAppConnections = false` (**new** field — added, mirrors `showProUpgrade`)
  - `upload.maxVideoDurationSec = 60` (was 15)
  - **62 is NOT exposed** — `MAX_VIDEO_DURATION_ACCEPT_SEC` is intentionally not part of the `/api/config` response (backend-only, as before).
- **`POST /api/upload/video`** unchanged (enforces size; duration validated client-side against the 62s tolerance).
- **Android ↔ backend contract:** Android's `AppConfigDto` deserializes **only the `onboarding` slice** of `/api/config` — it does not read `flags` or `upload`. So the new `showAppConnections`/`maxVideoDurationSec` values are contract-additive and cause no Android breakage. **No mismatch.**
- **Android video:** there is **no functional video-upload flow** on Android (the review composer's `ComposerMediaMode.Video` is a static "Choose video" placeholder; no `/api/upload/video` call exists; no duration text anywhere). Therefore there is **nothing to change on Android for the 60s/62s rule, and nothing that could expose 62.** The Web/Backend are the source of truth; a future Android video-upload implementation will read `maxVideoDurationSec = 60` from `/api/config`.

## 3. Files Modified

**Web / Backend:**
| File | Change |
|---|---|
| `src/lib/config/product.ts` | `MAX_VIDEO_DURATION_SEC` 15→**60**; `MAX_VIDEO_DURATION_ACCEPT_SEC` 17→**62** (comment updated); added `export const SHOW_APP_CONNECTIONS = false`. |
| `src/app/api/config/route.ts` | Import `SHOW_APP_CONNECTIONS`; add `flags.showAppConnections`. |
| `src/app/profile/ProfileView.tsx` | Import `SHOW_APP_CONNECTIONS`; gate the integrations `MenuItem` behind it (page/route/API kept intact). |
| `src/lib/i18n/w2/reviewNew.ts` | `videoHint` "15s"→"60s" (vi + en). |
| `src/app/reviews/new/page.tsx` | Comment accuracy: "still says 15s" → "(62s)…still says 60s". |

**Android:**
| File | Change |
|---|---|
| `android/.../profile/ProfileScreen.kt` | Added mirrored `private const val SHOW_APP_CONNECTIONS = false`; gated `if (SHOW_APP_CONNECTIONS) add(ProfileMenuItem.AppConnections)`. Enum value, `when` branch, route, and `AppConnectionsScreen` kept intact for future re-enable. |

No feature was deleted; no backend logic invented; only UI entry points gated + config values changed.

## 4. Build & Runtime Verification

- **Web:** `npx tsc --noEmit` → **no type errors** in the changed files (config/route, product.ts, ProfileView, reviewNew, reviews/new).
- **Android (per change):** `:app:compileDebugKotlin` → **BUILD SUCCESSFUL** after the App Connections gate.
- **Android (final):** `assembleDebug` + `testDebugUnitTest` → **BUILD SUCCESSFUL**, unit-test suite passing, on the reverted (no-hack) source.
- **Android runtime (emulator `emulator-5554`, screenshot captured):** Profile menu now reads **… What Tappy knows → My reviews …** with **no "App connections" row** between them (it was there before). Verified via a temporary `TEMP_VERIFY_HACK` (forced `AuthSessionState.Authenticated`) to reach the authenticated Profile.
- **`TEMP_VERIFY_HACK`:** removed — `grep -rn "TEMP_VERIFY_HACK" android --include=*.kt` → **zero** matches (exit 1). Final reverted APK reinstalled on the emulator.
- **Web runtime:** not exercised via a running dev server — the changes are config values, one added JSON field, one conditional render, and static strings, all `tsc`-verified; `/api/config`'s output is a deterministic passthrough of `product.ts`. (Known dev-server pitfalls made a full browser run disproportionate for these trivial, type-checked changes.)

## 5. Remaining Issues

- **None blocking.** 
- **Follow-ups (informational):**
  - When Play/production deploys, redeploy the Web so `/api/config` serves the new values (60s + `showAppConnections:false`).
  - **Standing product rule — apply when Android video upload is built** (composer Video tab is currently a placeholder, no `/api/upload/video` call). This is a long-term rule, not a one-off:
    - **UI:** show "Maximum 60 seconds" / "Videos up to 60 seconds"; the validation/too-long error must say "Maximum 60 seconds".
    - **Backend:** accept ≤ 62s; only reject > 62s.
    - **Never expose 62** anywhere in UI copy, help text, or errors — it is an internal encoding/timestamp tolerance only.
    - Read `maxVideoDurationSec` (= 60) from `/api/config` for all UI/validation copy; hardcode nothing.
  - Re-enabling either feature later = flip **both** the Web flag (`product.ts`) and the Android flag (`ProfileScreen.kt`) together, as documented in-code.

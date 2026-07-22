# Step 1 — Authentication Events — Implementation Report

**Status (owner decision, 2026-07-13 — Option C):**
- ✅ **Implemented**
- ✅ **Verified (code-level)** — tsc/lint/build/24 tests/architecture-check green; payload-acceptance confirmed
- ⏳ **Production Verification Pending** — all end-to-end runtime verification deferred to the Production Verification phase
- ⏳ **Owner Approval Pending**

**Scope:** Emit the approved auth events through the Step 1.0 unified pipeline. **No** rollups, dashboards, APIs, `user_acquisition`, `auth_daily_rollup`, or reports.
**Governance:** Analytics v1.1 implementation. No architecture change, no ADR.

> **Runtime verification deferred (Option C).** No migration applied, no production test data written. The complete runtime verification executes in the **Production Verification phase**, only after: (1) Step 1.0 migration applied, (2) new analytics code deployed, (3) the real app running, (4) real auth flows executable. Procedure + evidence targets: [`STEP_1_PRODUCTION_VERIFICATION.md`](STEP_1_PRODUCTION_VERIFICATION.md). Cross-platform contract: [`STEP_1_CROSS_PLATFORM_CONTRACT.md`](STEP_1_CROSS_PLATFORM_CONTRACT.md).
> **No Step 2 (`user_acquisition` + backfill) until Step 1 Production Verification passes and the owner approves.**

## 1. What was implemented (emission only)
| File | Change |
|---|---|
| `src/lib/analytics/authEvents.ts` | **New** — reusable emitters: `markAuthPending`, `emitAuthLoginFailed`, `emitAuthLogout`, `emitAuthLoginFromSession` (SR-4) |
| `src/hooks/useAuthEvents.ts` | **New** — global `onAuthStateChange` listener → emits login/signup once per real login |
| `src/components/TrackingProvider.tsx` | Mount `useAuthEvents()` alongside `useTrack()` |
| `src/app/login/page.tsx` | Google/Facebook/Zalo/OTP: `markAuthPending` + `emitAuthLoginFailed`; `?error=` handler for Zalo failure |
| `src/app/register/page.tsx` | Email signup: `markAuthPending('email')` + failure emit |
| `src/app/profile/SignOutButton.tsx` | `emitAuthLogout()` on sign-out |

**All emission goes through the existing `track()` → `/api/track`.** No new tracking system, no duplicated logic.

## 2. Events + `method` vocabulary (per Event Catalog §4 / spec §3)
- `auth_signup_completed{method}` · `auth_login_completed{method, is_first_login}` · `auth_login_failed{method, reason}` · `auth_logout_completed{}`
- `method`: `google` · `zalo` · `apple` · `email_otp` · `email` · `facebook` (open TEXT).

## 3. Verification requirement 1 — every authentication flow (emit-point map, code-level)
| Flow | Success emit | Failure emit | Evidence |
|---|---|---|---|
| **Google** | listener → `auth_login_completed{method:google,is_first_login}` on session return (`/auth/callback` → INITIAL_SESSION) | `emitAuthLoginFailed('google','oauth_denied')` on OAuth-init error | `login/page.tsx` handleGoogleLogin + `useAuthEvents` |
| **Zalo** | listener on session (zalo-finish → confirmUrl → session) | `?error=zalo_failed` → `emitAuthLoginFailed('zalo','oauth_denied')` (once; URL cleared) | `login/page.tsx` handleZaloLogin + `?error` effect |
| **Email OTP** | listener on `verifyOtp` success (SIGNED_IN) | send fail → `('email_otp','network')`; verify fail → `('email_otp','invalid_credentials')` | `login/page.tsx` handleSendOtp/handleVerifyOtp |
| **Email (signup)** | listener on `signUp` session → `auth_signup_completed{email}` + `auth_login_completed{is_first_login:true}` | `('email','invalid_credentials')` | `register/page.tsx` handleRegister |
| **Login Success** | `auth_login_completed{method, is_first_login}` (all providers) | — | `useAuthEvents` → `emitAuthLoginFromSession` |
| **Login Failure** | — | `auth_login_failed{method, reason}` | all failure branches above |
| **Signup** | `auth_signup_completed{method}` (first-time account) | — | `emitAuthLoginFromSession` (is_first heuristic) |
| **Logout** | `auth_logout_completed` | — | `SignOutButton` |
| **Apple** | Native only — see note | Native | §7 |

**Apple note:** the web app has **no Apple sign-in flow** (login page offers Google/Zalo/Email-OTP; Facebook config-disabled). `method:'apple'` is reserved in the open vocabulary and is emitted by the **iOS native** Sign-in-with-Apple tracker (SR-2 parity), which is outside the web Step 1 scope. No web code emits `apple` because no such flow exists to instrument.

## 4. Requirement 2 — anonymous & authenticated scenarios
- **Anonymous:** `auth_login_failed` (no session — e.g. Zalo/OAuth denial, OTP failure) is emitted with `anon_id`, `user_id` NULL. Verified: anonymous `POST /api/track` with these events → **`200`** (below).
- **Authenticated:** login/signup/logout carry the session `user_id` (server-set from session, un-spoofable) plus `anon_id`.

## 5. Requirement 3 — payloads match the approved schema (runtime evidence)
Constructed each auth event exactly as `tracker.track()` + `buildEnvelope()` produce, POSTed anonymously to `/api/track`:
```
events: auth_login_completed{method:google,is_first_login:false}, auth_signup_completed{method:email_otp},
        auth_login_completed{method:email_otp,is_first_login:true}, auth_login_failed{method:zalo,reason:oauth_denied},
        auth_logout_completed{}
→ HTTP 200 {"ok":true}
sample payload: { event_id, schema_version:1, anon_id, platform:'web', app_version, build_number, os_name,
                  os_version, device_type, language, session_id, client_timestamp, event_type:'auth_login_failed',
                  metadata:{ method:'zalo', reason:'oauth_denied' } }
```
✅ Full v1.1 envelope + correct `event_type` + `metadata` — accepted by ingestion.

## 6. Requirement 4 — no duplicate events
- **Client guards:** `emitAuthLoginFromSession` fires only when a **pending marker** exists (set at a real login attempt) and records an **emitted marker** (`user_id:attempt-time`) so repeated `SIGNED_IN`/`INITIAL_SESSION` (incl. React Strict-Mode double-invoke) emit **once**. The `?error` failure handler **clears the URL param** after emitting so it can't re-fire.
- **Server guard:** `event_id` idempotency (`ON CONFLICT DO NOTHING`, Step 1.0) — duplicate `event_id` → one row (effective once the migration is applied).

## 7. Requirements 5 & 6 — backward compatibility & no auth-flow regression
- **Static suite green:** `tsc` ✅ · `next lint` (all changed files) ✅ · `build` ✅ · `24 tests` ✅ · `architecture:check` 7/7 ✅.
- **No control-flow change to auth:** the added calls are a `sessionStorage` write (`markAuthPending`) and `track()` calls on the existing error/success branches — they do **not** alter `signInWithOAuth`/`verifyOtp`/`signUp`/`signOut` behavior, redirects, or error handling.
- **Existing tracker consumers unchanged** (Step 1.0 verification still holds).

## 8. Honest verification limitation
The preview environment **did not execute the page's React client effects** (evidence: `/login` served `200` but **no `POST /api/track`**, no `analytics_anon` key, `?error` not cleared — hydration/effects did not run in the preview). Therefore the **client emit *trigger*** (button click → real login → emitted event) could not be observed live here. It is verified by **code review + full static suite + payload-acceptance** above. **Live end-to-end confirmation is deferred to the production verification checklist** (§9) — the same pattern as other post-deploy checks.

## 9. Production verification checklist (run post-deploy, migration applied)
- [ ] Google login → one `auth_login_completed{method:google}` row.
- [ ] Zalo login success → `auth_login_completed{method:zalo}`; Zalo denial → one `auth_login_failed{method:zalo}`.
- [ ] Email-OTP verify success → `auth_login_completed{method:email_otp}`; bad code → `auth_login_failed`.
- [ ] Email signup → `auth_signup_completed{email}` + `auth_login_completed{is_first_login:true}`.
- [ ] Logout → `auth_logout_completed`.
- [ ] First vs returning login → `is_first_login` correct.
- [ ] No duplicate rows per login (client + `event_id` dedup).
- [ ] Anonymous failure events stored with `anon_id`, `user_id` NULL.

## 10. Not done (out of scope — later steps)
No `user_acquisition`, `auth_daily_rollup`, `authAnalyticsService`, APIs, dashboards, reports. Apple web flow (none exists) and native emission are separate.

---
*Phase 0 held; `8e68f42` awaits S6/S7; Step 1.0 migration not yet applied. Stopping for your review.*

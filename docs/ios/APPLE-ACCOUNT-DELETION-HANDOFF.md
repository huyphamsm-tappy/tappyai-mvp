# Apple account deletion (App Review 5.1.1(v)) — Web hotfix handoff

Branch `hotfix/apple-account-deletion`, based directly on `origin/main` `0edd2d1f1ff91b05fb9c9513ed8c74528bf5edd6` (= production when this was written). **Not the p7 branch; no Phase 7, no Agent, no migrations.**

**GATE STATUS: BLOCKED** — the Web code and the iOS code are written and tested, but four things outside the code are not done (section 7). Nothing here claims that Apple revocation works against the real Apple service: that needs the signing key, and only a real device with an authorized Apple ID proves it end to end.

## 1. What an Apple account's deletion now does

```
iOS  POST /api/account/delete { confirm }                         (no code on the first request)
 ←   409 { error: "apple_authorization_required" }                the SERVER knows the account has an Apple identity; nothing deleted
iOS  asks the person to confirm with Apple again (AppleReauthorizer) → fresh single-use authorizationCode
iOS  POST /api/account/delete { confirm, apple_authorization_code }   (the same request, once more)
srv  Apple /auth/token (code → refresh_token + id_token)
srv  id_token.sub must be THIS account's Apple identity            else 409 apple_identity_mismatch, nothing revoked, nothing deleted
srv  Apple /auth/revoke (refresh_token)                            only a 200 counts
srv  auth.admin.deleteUser                                          only after the revoke
 →   200 { ok: true, apple_revoked: true }
```

Why re-confirm at deletion instead of storing a token at sign-in: iOS signs in natively and Supabase keeps no Apple refresh token, so there is nothing to look up. Apple issues a code only when the person authorises, so the app asks again at the moment that matters. Result: **no Apple token, code or secret is ever stored, logged or returned**; the code lives in memory for one request.

Non-Apple accounts (Google, Zalo, email) behave exactly as in the p7 route: `{ confirm }` → delete → `{ ok: true }`. A code sent by mistake is ignored and never forwarded to Apple.

### Contract — `POST /api/account/delete` (auth required, Bearer or cookie)

| Status | `error` | Meaning | Account |
|---|---|---|---|
| 200 | — (`ok: true`, plus `apple_revoked: true` only when Apple confirmed the revoke) | deleted | gone |
| 400 | `confirm_required` | typed word missing/wrong | unchanged |
| 400 | `apple_authorization_invalid` | code expired / used / not for this app | unchanged |
| 401 | `unauthorized` | no session | unchanged |
| 403 | `account_required` | anonymous session | unchanged |
| 404 | `not_available` | `ACCOUNT_SELF_DELETE_ENABLED` is off here | unchanged |
| 409 | `staff_account` | staff must use the leaver runbook (checked **before** anything is revoked) | unchanged |
| 409 | `apple_authorization_required` | Apple account and no code | unchanged |
| 409 | `apple_identity_mismatch` | the code belongs to a different Apple ID (revoke endpoint not called) | unchanged |
| 500 | `delete_failed` | lookup or delete failed (incl. an identity lookup that errored — never read as "not Apple") | unchanged |
| 502 | `apple_revoke_failed` | Apple did not confirm | unchanged |
| 503 | `apple_revoke_unavailable` | Apple revocation is not configured on this deployment | unchanged |

Safety properties (each pinned by a test): an Apple account is **never** deleted without a confirmed revoke; a failed revoke leaves it untouched and retryable; if the revoke succeeds but the local delete fails the response is `500 delete_failed` **without** `apple_revoked`, and a retry with a fresh code completes; a second request after success finds the user gone and is harmless; every error carries a localized `message` (vi/en) saying the account was **not** deleted.

`GET /api/config` → `flags.accountSelfDelete` (boolean; `ACCOUNT_SELF_DELETE_ENABLED === 'true'` only). iOS offers in-app deletion only on `true`; otherwise it keeps the email request.

## 2. Files in this hotfix (and nothing else)

`src/app/api/account/delete/route.ts` (+ test) · `src/lib/account/selfDelete.ts` (p7 file, plus `staffStatus` and `lookupAppleIdentity`) · `src/lib/auth/appleRevoke.ts` (+ test) · `src/lib/i18n/serverMessages.ts` (+9 `account.*` strings) · `src/app/api/config/route.ts` (+`flags.accountSelfDelete`) and its test · `.env.local.example` (names only) · this document. **No migration, no SQL, no worker, no cron, no media-provider change.**

## 3. Required configuration (names only — values are secrets and never in git, chat or this file)

| Variable | Purpose |
|---|---|
| `APPLE_SIWA_TEAM_ID` | 10-character Apple Developer Team ID |
| `APPLE_SIWA_KEY_ID` | 10-character Key ID of a key with **Sign in with Apple** enabled for the primary App ID `com.tappyai.ios` |
| `APPLE_SIWA_PRIVATE_KEY` | that key's `.p8` contents (a literal `\n` is accepted for one-line storage) — Vercel Production env, **Sensitive** |
| `APPLE_SIWA_CLIENT_ID` | optional; defaults to the bundle id `com.tappyai.ios` (the id the native authorization code was issued for) |
| `ACCOUNT_SELF_DELETE_ENABLED` | `true` only after the clean-up in section 7 is live in that environment |

Unset or invalid Apple config → `appleRevokeConfig()` is `null` → an **Apple** account's deletion answers 503 and is not performed; everyone else is unaffected. The key is validated at use (P-256 only) and the client-secret JWT lives 5 minutes.

## 4. State of the pieces

| Piece | State | Evidence |
|---|---|---|
| Web route + Apple revoke code | implemented | this branch; tests below |
| Apple endpoints | confirmed against Apple's own OpenID configuration (`token_endpoint`, `revocation_endpoint`, `client_secret_post`) | live check `APPLE_LIVE_CONFIG_CHECK=1` in `appleRevoke.test.ts` |
| Client-secret JWT format (ES256, `iss`=team, `sub`=client id, `aud`=`https://appleid.apple.com`, `kid`) | implemented per Apple's documented format; signature verified against the public key in a test | **not provable against Apple without the real key** |
| Real exchange + revoke against Apple | **NOT VERIFIED** | needs the signing key (section 7) and a real authorization code |
| Supabase production Apple provider | **enabled**, Client ID `com.tappyai.ios` (05/10) | public `/auth/v1/settings` → `external.apple=true` |
| Production `/api/config` `flags.appleSignIn` | `true` (production `0edd2d1`) | `GET /api/config` |
| Production `/api/account/delete` | **404 (route absent)** until this hotfix is merged | `GET` returns 404 on `0edd2d1` |
| iOS | `AccountDeletionFlow` + `AppleReauthorizer` written; `AccountDeletionTests` 13/13; whole iOS suite 466 tests / 0 failures; `static_check.py` passes | iOS `ios/sync-2026-09-30` @ `046a7a9065f2632952a1fd14aa15c47c8d31288b`, CI run 37279257115 (Build + TappyAITests: success). The first attempt (run 37278526502) failed to compile one line of a TEST helper; fixed in `046a7a9`, product code unchanged. |
| Real iPhone + authorized Apple ID | **NO EVIDENCE** | — |

## 4b. CI evidence

Web PR #262, head `400374e942d796894ed1ce2935d927de5b902273`: all four required checks pass on both the push and the pull_request runs — *Test suite* (runs 37278449666, 37278470524), *Types, lint, SQL grants* (same runs), *AI architecture rules* (37278449646, 37278470538), *Brand registry validation* (same runs); Vercel preview pass. Local, on a clean `npm ci` of main + this commit: focused suites green, full suite 9,619 passed / 0 failed (required-suite gate OK, 44 suites), `tsc` 0, lint 0 errors, `next build` OK.

iOS run 37279257115 (`Build + TappyAITests`) succeeded: 466 tests, 0 failures (459 before; 7 new). The repo's *Regression Gate* workflow is red on the iOS branch and has been on every commit since 2026-10-03: the same 12 Web-side iOS-parity tests (`iosLocalization`, `iosParityGuards`, `iosParityScreens`, `scam-shield/nativeParity`) fail before and after these changes — 0 new failures introduced, 0 fixed.

## 5. Tests (Web)

`route.test.ts` (28): auth/confirm/flag/staff/idempotency preserved; Apple: revoke-before-delete order, code required, invalid code, wrong Apple ID, not configured, Apple down at exchange or revoke, delete failing after a revoke, repeat after success, staff-before-revoke, identity-lookup failure, no secret in responses or logs. `appleRevoke.test.ts` (19): config validation, ES256 signature verified with the public key, exchange/revoke form fields, every failure → reason code, timeout, no secret in outcomes, live endpoint check. Config tests: `flags.accountSelfDelete` and the Apple signal. Mutation-checked: removing the subject check, the revoke gate, or the staff-first order each fails the suite.

## 6. What this hotfix deliberately does not contain

The **data clean-up** behind the deletion promise — migrations D1/D2/D4 (`20260911b`, `20260925`, `20260925c`), the `account-deletion-jobs` worker and cron, and the GCS `listObjects/deleteObject` media-provider methods — lives on `p7/web-subscription` and is **not safe to port as-is**: D4 reads `public.shared_results` (created by the G1 migration, absent from production's migration history) and would fail there; the worker needs the media-provider changes (+127 lines in `gcs.ts`) and a shared cron-auth helper. They are the Phase 7 release line, not an auth hotfix.

## 7. What is still required before the gate can pass

1. **APPLE DEVELOPER CONFIGURATION REQUIRED** (checked 05/10: the Apple Developer portal is not signed in in the available browser - it shows the login page, which needs a password and 2FA on your device; no credentials were entered) — create a *Sign in with Apple* key (Certificates, Identifiers & Profiles → Keys; enable Sign in with Apple, configure it for `com.tappyai.ios`), download the `.p8` once, and put Team ID, Key ID and the key into the Vercel **Production** env as `APPLE_SIWA_*` (key as Sensitive). Nobody should paste the key into chat or git.
2. **Data clean-up live in production** — D1/D2/D4 (D4 needs a production-safe variant, see section 6) + the worker + cron + media methods, applied/deployed under the owner's migration process.
3. **`ACCOUNT_SELF_DELETE_ENABLED=true`** in Production, only after 2.
4. **Owner merges** this PR (and the iOS PR/branch change), production deploys, then verify: `/api/version`, `/api/config` (`accountSelfDelete: true`), and `GET /api/account/delete` is **405** (route exists) not 404.
5. **Real device**: Sign in with Apple on a TestFlight build with an authorized Apple ID → Settings → delete account → confirm → Apple sheet → account gone; then confirm the app no longer appears under the Apple ID's "Sign in with Apple" apps, and the same Apple ID creates a *fresh* account. Capture only non-sensitive evidence.

Remaining dependency: **APPLE DEVELOPER CONFIGURATION REQUIRED** (first), then the clean-up and the device test.

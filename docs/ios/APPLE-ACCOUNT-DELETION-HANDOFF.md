# Apple account deletion (App Review 5.1.1(v)) — Web hotfix handoff

**Web:** base `3c9dc7b85fd8bc107d181d591fecb407aaf3dd31`; hotfix head `8c1b04cacb7cb04f874ebfeab5a173300142bd90` on `hotfix/apple-account-deletion`; **PR #262 merged 2026-10-05 as `98b28d5125ce809016118838302ec08c333af197`**; production verified serving `98b28d5…` (later commits: `GET https://www.tappyai.com/api/version`). **iOS:** `046a7a9065f2632952a1fd14aa15c47c8d31288b` (`ios/sync-2026-09-30`). Not the p7 branch: no Phase 7, no Agent / Consultative / Luna, no subscription / commerce / discovery, no Android / iOS source, no Phase 8.

**GATE STATUS: BLOCKED — the only thing missing is real evidence.** Everything that can be done and checked without a real iPhone and a disposable Apple test account is done and verified **in production** (section 6 and 10). What has never run: the real Apple code exchange + revoke, and the iOS flow on a device (section 9). Do not read "route live + migration applied + CI green" as "Apple revocation works".

## 1. What an Apple account's deletion does

```
iOS  POST /api/account/delete { confirm }                         (no code on the first request)
 ←   409 { error: "apple_authorization_required" }                the SERVER knows the account has an Apple identity; nothing deleted
iOS  asks the person to confirm with Apple again (AppleReauthorizer) → fresh single-use authorizationCode
iOS  POST /api/account/delete { confirm, apple_authorization_code }   (the same request, once more; the code is never sent twice)
srv  Apple /auth/token (code → refresh_token + id_token)
srv  id_token.sub must be THIS account's Apple identity            else 409 apple_identity_mismatch, nothing revoked, nothing deleted
srv  Apple /auth/revoke (refresh_token)                            only a 200 counts
srv  auth.admin.deleteUser   → BEFORE DELETE trigger: queues files + Google grant, removes the stores with no cascade path
 →   200 { ok: true, apple_revoked: true }
```

No Apple token, code or secret is stored, logged or returned (the code lives in memory for one request). Non-Apple accounts (Google, Zalo, email) behave exactly as in the p7 route. Staff accounts are refused **before** anything is revoked.

### Contract — `POST /api/account/delete` (auth required, Bearer or cookie)

| Status | `error` | Meaning | Account |
|---|---|---|---|
| 200 | — (`ok: true`, plus `apple_revoked: true` only when Apple confirmed the revoke) | deleted | gone |
| 400 | `confirm_required` | typed word missing/wrong | unchanged |
| 400 | `apple_authorization_invalid` | code expired / used / not for this app | unchanged |
| 401 | `unauthorized` | no session | unchanged |
| 403 | `account_required` | anonymous session | unchanged |
| 404 | `not_available` | `ACCOUNT_SELF_DELETE_ENABLED` is off **or the clean-up migration is not installed** | unchanged |
| 409 | `staff_account` | staff must use the leaver runbook | unchanged |
| 409 | `apple_authorization_required` | Apple account and no code | unchanged |
| 409 | `apple_identity_mismatch` | the code belongs to a different Apple ID | unchanged |
| 500 | `delete_failed` | lookup or delete failed (an identity lookup that errored is never read as "not Apple") | unchanged |
| 502 | `apple_revoke_failed` | Apple did not confirm | unchanged |
| 503 | `apple_revoke_unavailable` | Apple revocation is not configured on this deployment | unchanged |

An Apple account is **never** deleted without a confirmed revoke. If the revoke succeeds but the local delete fails, the response is `500 delete_failed` **without** `apple_revoked`, and a retry with a fresh code completes. A second request after success finds the user gone and is harmless.

`GET /api/config` → `flags.accountSelfDelete` is `true` only when `ACCOUNT_SELF_DELETE_ENABLED === 'true'` **and** `public.account_deletion_ready()` is true in the database. iOS offers in-app deletion only on `true`; otherwise it keeps the email request.

## 2. The production trap this hotfix closes

`ACCOUNT_SELF_DELETE_ENABLED=true` was **already set in Vercel Production** (7 days before this work) while the clean-up it promises did not exist. With the flag as the only gate, merging the route would have switched deletion on instantly with no file/Google/memory clean-up. So the flag is no longer enough: the route and `/api/config` also call the read-only RPC `public.account_deletion_ready()` (fail closed on any error, timeout, redirect or missing function; cached 5 min). **Until the migration is applied, production keeps answering `404 not_available` and `accountSelfDelete: false`** — merging is safe in any order.

## 3. Files in this hotfix

Route + Apple: `src/app/api/account/delete/route.ts`, `src/lib/account/selfDelete.ts`, `src/lib/auth/appleRevoke.ts`, `src/lib/account/deletionReady.ts`, `src/lib/i18n/serverMessages.ts` (+9 strings), `src/app/api/config/route.ts` (`flags.accountSelfDelete`), `.env.local.example` (names only).
Clean-up: `supabase/migrations/20261005_account_deletion_cleanup.sql` (+ rollback), `src/lib/account/deletionJobs.ts`, `src/app/api/cron/account-deletion-jobs/route.ts`, `src/lib/security/cronAuth.ts`, `vercel.json` (one daily cron, 18:45 UTC), `src/lib/media/{key,types}.ts` and `providers/gcs.ts` (**additive**: owner-scoped `listObjects` / `deleteObject` only), `src/lib/integrations/googleCalendar.ts` (`revokeGoogleToken`). Tests alongside each, plus `supabase/tests/account_deletion_cleanup.test.ts` (real Postgres).

## 4. Why the p7 migrations were not copied — and what replaced them

| p7 file | Problem on production | Here |
|---|---|---|
| D1 `20260911b` | changes `user_memory.user_id` text→uuid and **deletes orphan rows** | not used |
| D2 `20260925` | FK additions (needs D1 first) | not needed |
| D4 `20260925c` | reads `public.shared_results` (G1 table absent in production): its `regclass` lookup raises | not used |

`20261005_account_deletion_cleanup.sql` **adds only**: the queue table `account_deletion_jobs` (RLS on; no client access; `service_role` may only SELECT/UPDATE), the `BEFORE DELETE` trigger on `auth.users`, and the readiness function. It changes **no** existing column, constraint, policy or row, is idempotent, and the trigger is atomic (any failure rolls the whole deletion back). Production catalog check (read-only, 05/10): most per-user tables already cascade; four stores do not and are removed by the trigger — `user_memory` (TEXT id), `decision_evidence`, `anon_chat_usage`, and notifications the user *caused* in other inboxes. The p7 Phase 7 line can still apply D1/D2/D4 later (same object names; idempotent).

## 5. Apple Developer, Supabase, Vercel — state on 2026-10-05 (no secret values anywhere)

| Item | State |
|---|---|
| Supabase Apple provider (production `fwznnobrdctuskgrvuik`) | **enabled**, Client ID `com.tappyai.ios`, secret empty (native-only); public `/auth/v1/settings` → `external.apple=true`; `/api/config` → `flags.appleSignIn: true` |
| Apple Developer key | created: name `Tappy SIWA account deletion`, **Key ID `MV69Z22JW7`**, service *Sign in with Apple*, primary App ID `com.tappyai.ios` (Team ID `6UAG75G2US`). The `.p8` was downloaded once (Apple removes the server copy) |
| Vercel Production env | `APPLE_SIWA_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY` (**Sensitive**, piped from the file; never printed or committed) — set 05/10, **present in production deployment `98b28d5`** (built after they were set). `ACCOUNT_SELF_DELETE_ENABLED=true` was already set |
| GCS | production bucket `tappyai-media-prod`: the media bridge service account holds `roles/storage.objectUser` (includes list + delete) — read from the bucket IAM policy |
| Production database | migration **APPLIED 2026-10-05** (section 6); `public.account_deletion_ready()` = true |

## 6. Production migration — APPLIED 2026-10-05

Run in the production SQL editor (`fwznnobrdctuskgrvuik`) from the merged file `supabase/migrations/20261005_account_deletion_cleanup.sql`. Before running: the editor content was checked byte-for-byte against the tested file (6,440 bytes, SHA-256 `8c4056c51fac8905…`), and a read-only pre-check confirmed all 10 columns the trigger uses exist with the right types and that none of the new objects existed. Supabase's generic "destructive operations" prompt appeared (it keys on `DROP`/`DELETE` text: a `DROP TRIGGER IF EXISTS` on a trigger that did not exist, and `DELETE`s inside the function body that run only when a user is deleted) and was confirmed. Result: **Success, no rows returned.**

Read-only verification afterwards: `account_deletion_ready()` = **true**; trigger `trg_enqueue_account_deletion` on `auth.users` = 1 and enabled; RLS on the queue; `anon` and `authenticated` have **no** privilege on it; `service_role` has SELECT but not INSERT; 0 jobs queued; both functions `SECURITY DEFINER` with `search_path=public, pg_temp`. The app's own probe (the public anon RPC) returns HTTP 200 `true`.

Rollback: `supabase/migrations/rollback/20261005_account_deletion_cleanup_rollback.sql` (keeps the queue table).

## 7. Tests (Web)

Full suite on a clean checkout of `main` + this branch: see the PR description / CI for the final numbers. Measured on this branch (all pass): deletion route 29, interlock end-to-end 5 (real route + real helper, network stubbed), readiness helper 11, Apple client 18 (+1 live check of Apple's advertised endpoints, off by default: `APPLE_LIVE_CONFIG_CHECK=1`), config route 13, cleanup worker cron 5, worker logic 10, cron auth 4, Google revoke 9, media list/delete 7, and **17 real-Postgres tests** (cleanup scoped to one user, other users untouched, atomic rollback on failure, queue contents, idempotent, existing constraints byte-identical, grants/RLS, readiness gate, rollback). Mutation-checked: removing the subject check, the revoke gate, the staff-first order, the interlock (flag alone / fail-open) or the `user_memory` delete each fails the suite. The repo's SQL-grants gate (ADR-019) passes.

## 8. iOS

`ios/sync-2026-09-30` @ `046a7a9`: `AccountDeletionFlow` + `AppleReauthorizer` match this contract (first request without a code; the server asks; a fresh code is sent once; Apple 409/400/502/503 map to their own "account NOT deleted" messages; any other 409 is still `staff_account`). iOS CI run 37279257115: 466 tests, 0 failures; `static_check.py` passes. **No iOS change was needed for the interlock** (`404 not_available` already falls back to the email request).

## 9. Not verified

* **Real device: NO EVIDENCE.** No iPhone / authorized Apple test account was available to this session (there is no macOS or simulator here), so the iOS flow has not been run on a device.
* **The real Apple exchange + revoke has never run against Apple.** The key is valid P-256 (checked locally before it was stored: 64-byte ES256 signature, self-verifies) and is stored as a Sensitive Vercel variable that cannot be read back, so its acceptance by Apple is only confirmed by a real call. An invalid stored value fails safe (`503 apple_revoke_unavailable`, nothing deleted). Test with a **disposable Apple ID**, never a real user's account.
* The cleanup trigger has not yet run on a real production deletion (it is covered by 17 real-Postgres tests and a read-only production catalog check).

## 10. Production verification (2026-10-05, after the merge deployed)

| Check | Result |
|---|---|
| `GET /api/version` | `98b28d5125ce809016118838302ec08c333af197` (the merge commit) |
| `GET /api/config` | `flags.accountSelfDelete: true`, `flags.appleSignIn: true`; `auth.providers` still google / zalo / email, all enabled; no secret-like content |
| `GET /api/account/delete` | **405** (route exists; was 404 before the merge) |
| unauthenticated `POST /api/account/delete` | **401** |
| `GET /api/cron/account-deletion-jobs` without the secret | **401** |
| Supabase Apple provider | enabled (`external.apple=true`), Client ID `com.tappyai.ios` |
| `account_deletion_ready()` (anon RPC, as the app calls it) | HTTP 200, `true` |

## 11. Tests and CI

* Web, branch before merge: full suite **9,690 passed / 0 failed**, required suites OK (46), lint 0 errors, `next build` OK, SQL-grants gate 0 errors. Measured per area: route 29, interlock 5, readiness 11, Apple client 18 (+1 live endpoint check, off by default), config 13, cron 7, worker 10, cron auth 4, Google revoke 9, media 7, 17 real-Postgres. Mutation-checked.
* PR #262 CI (all four required checks pass on both runs): head `8c1b04c` — Test suite + Types/lint/SQL grants runs 37285680267 and 37285686655; AI architecture rules + Brand registry runs 37285680319 and 37285686758.
* iOS `046a7a9`: run 37279257115 (Build + TappyAI Tests): 466 tests, 0 failures; `AccountDeletionTests` 13/13; `static_check.py` passes (re-run 2026-10-05). The repo's *Regression Gate* workflow is red on the iOS branch and has been since 2026-10-03: the same 12 Web-side iOS-parity tests fail before and after these changes (0 new).

## 12. What would make this PASS

One real run with a **disposable Apple ID** on a TestFlight build: Sign in with Apple → Settings → delete account → confirm → Apple sheet → account gone; then check the app no longer appears under that Apple ID's *Sign in with Apple* apps, and that signing in again creates a fresh account. Capture only non-sensitive evidence (never the code, token or key). If the server answers `503 apple_revoke_unavailable`, the stored key value is invalid: create a new key (Apple Developer → Keys) and replace `APPLE_SIWA_PRIVATE_KEY`.

Remaining dependency: **REAL DEVICE EVIDENCE REQUIRED.**

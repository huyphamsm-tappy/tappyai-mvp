# Apple account deletion (App Review 5.1.1(v)) — Web hotfix handoff

Branch `hotfix/apple-account-deletion`, based on `origin/main`. **Not the p7 branch: no Phase 7, no Agent / Consultative / Luna, no subscription / commerce / discovery, no Android / iOS source, no Phase 8.** Final Web SHA: `git rev-parse origin/hotfix/apple-account-deletion` (a commit cannot contain its own hash); production SHA: `GET https://www.tappyai.com/api/version`; iOS SHA: `046a7a9065f2632952a1fd14aa15c47c8d31288b` (`ios/sync-2026-09-30`).

**GATE STATUS: BLOCKED — one manual action left that I cannot perform: apply the migration (section 6).** Everything else that can be done from code and from the authenticated sessions is done and verified. Nothing here claims the Apple revoke works against the real Apple service or that iOS login/deletion works on a device: that needs one real Sign-in-with-Apple run (section 9).

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
| Vercel Production env | `APPLE_SIWA_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY` (**Sensitive**, piped from the file; never printed or committed) — set 05/10, **effective on the next deployment**. `ACCOUNT_SELF_DELETE_ENABLED=true` was already set |
| GCS | production bucket `tappyai-media-prod`: the media bridge service account holds `roles/storage.objectUser` (includes list + delete) — read from the bucket IAM policy |
| Production database | migration **NOT applied** (section 6) |

## 6. The one manual action: apply the migration to production

I opened the production SQL editor read-only to inspect the catalog; the session's permission layer then refused further programmatic edits there, and I did not route around it. So the migration is yours to run:

1. Supabase → project `fwznnobrdctuskgrvuik` → SQL Editor → paste the whole of `supabase/migrations/20261005_account_deletion_cleanup.sql` → Run (it is additive and idempotent; it adds a trigger on `auth.users`).
2. Verify: `select public.account_deletion_ready();` → `true`.
3. Within ~5 minutes (config cache) `GET /api/config` shows `flags.accountSelfDelete: true`, `GET /api/account/delete` answers **405** (route exists), and in-app deletion is live.
Rollback: `supabase/migrations/rollback/20261005_account_deletion_cleanup_rollback.sql` (keeps the queue table).

## 7. Tests (Web)

Full suite on a clean checkout of `main` + this branch: see the PR description / CI for the final numbers. Measured on this branch (all pass): deletion route 29, interlock end-to-end 5 (real route + real helper, network stubbed), readiness helper 11, Apple client 18 (+1 live check of Apple's advertised endpoints, off by default: `APPLE_LIVE_CONFIG_CHECK=1`), config route 13, cleanup worker cron 5, worker logic 10, cron auth 4, Google revoke 9, media list/delete 7, and **17 real-Postgres tests** (cleanup scoped to one user, other users untouched, atomic rollback on failure, queue contents, idempotent, existing constraints byte-identical, grants/RLS, readiness gate, rollback). Mutation-checked: removing the subject check, the revoke gate, the staff-first order, the interlock (flag alone / fail-open) or the `user_memory` delete each fails the suite. The repo's SQL-grants gate (ADR-019) passes.

## 8. iOS

`ios/sync-2026-09-30` @ `046a7a9`: `AccountDeletionFlow` + `AppleReauthorizer` match this contract (first request without a code; the server asks; a fresh code is sent once; Apple 409/400/502/503 map to their own "account NOT deleted" messages; any other 409 is still `staff_account`). iOS CI run 37279257115: 466 tests, 0 failures; `static_check.py` passes. **No iOS change was needed for the interlock** (`404 not_available` already falls back to the email request).

## 9. Not verified

* **Real device: NO EVIDENCE.** No iPhone / authorized Apple test account was available.
* **The real Apple exchange + revoke has never run.** The key exists and is valid P-256 (checked locally: 64-byte ES256 signature, self-verifies), but Apple only confirms it on a real call. The first real deletion with a disposable Apple test account is the proof; do not use a real user's account.
* Production behaviour after the migration (section 6 step 3) is expected, not yet observed.

Remaining dependency: **SUPABASE CONFIGURATION REQUIRED** (apply the migration), then the owner's merge of the PR, then the real-device test.

# Step 1 — Authentication Events: Production Verification Procedure

**Purpose:** the runtime verification for Step 1 (requirements 1 & 2). Executed after **Step 1.0 migration is applied** and **Step 1.0 + Step 1 code is deployed** (or run against a local dev server on the shared DB with the migration applied).

**Preconditions:**
1. Migration `20260713_analytics_envelope_foundation.sql` applied to the shared DB.
2. New code (Step 1.0 + Step 1) running.
3. A **real browser that executes client JS** (the in-app preview does not hydrate — use a normal browser). Real accounts for Google/Zalo/email.

**Evidence method per flow:** (a) capture the `POST /api/track` body (browser devtools/network), (b) read `user_events` in Supabase to confirm the stored row(s).

**Reusable DB checks (Supabase SQL editor):**
```sql
-- latest auth events
select event_id, event_type, metadata->>'method' as method, metadata->>'reason' as reason,
       metadata->>'is_first_login' as is_first, user_id, anon_id, platform, app_version,
       schema_version, is_unknown_event, created_at
from public.user_events
where event_type like 'auth_%'
order by created_at desc limit 20;

-- duplicate check (must be 0)
select event_id, count(*) from public.user_events
where event_type like 'auth_%' group by event_id having count(*) > 1;
```

---

## Success flows

| # | Flow | Steps | Expected analytics event | Expected DB state | Future dashboard |
|---|---|---|---|---|---|
| RV-1 | **Google login** | Log in via Google | `auth_login_completed{method:'google', is_first_login}` (+ `auth_signup_completed{method:'google'}` if new) | 1 row `auth_login_completed`, `method=google`, `user_id` = the account, `anon_id` present, `platform=web`, `schema_version=1`, unique `event_id`; no dup | Signups/logins by provider (Google slice) |
| RV-2 | **Zalo login** | Log in via Zalo | `auth_login_completed{method:'zalo', is_first_login}` (+ signup if new) | as above, `method=zalo` | Zalo slice |
| RV-3 | **Email OTP** | Request + verify OTP | `auth_login_completed{method:'email_otp'}` (+ signup if new) | `method=email_otp`, correct identity | Email-OTP slice |
| RV-4 | **Email signup** | Register (email+password) | `auth_signup_completed{method:'email'}` + `auth_login_completed{method:'email', is_first_login:true}` | 2 rows (signup + login), same `user_id`, distinct `event_id`s | Signups by provider; activation |
| RV-5 | **Logout** | Sign out | `auth_logout_completed` | 1 row `auth_logout_completed`, `user_id` = account | Session/logout metrics |

**For every success flow, confirm the 10 required attributes:** event emitted ✓, received by `/api/track` (200) ✓, stored in `user_events` ✓, `event_id` present+unique ✓, no duplicate ✓, correct `user_id`(auth)/`anon_id` ✓, correct `method` ✓, correct `platform` ✓, correct `app_version` ✓, `schema_version=1` ✓.

---

## Failure flows (requirement 2 — exactly one `auth_login_failed`, correct reason, anonymous)

| # | Failure | How to trigger | Expected event | Expected DB state |
|---|---|---|---|---|
| RF-1 | **Invalid OTP** | Enter a wrong 6-digit code | 1× `auth_login_failed{method:'email_otp', reason:'invalid_credentials'}` | 1 row; `user_id` NULL, `anon_id` present |
| RF-2 | **Cancelled Google OAuth** | Start Google, cancel/deny on Google | 1× `auth_login_failed{method:'google', reason:'oauth_denied'}` | 1 row; anonymous |
| RF-3 | **Cancelled Zalo OAuth** | Start Zalo, cancel/deny → `/login?error=zalo_failed` | 1× `auth_login_failed{method:'zalo', reason:'oauth_denied'}` | 1 row; anonymous; **verify only ONE** (URL-param cleared after emit) |
| RF-4 | **Network failure** | OTP send with network offline | 1× `auth_login_failed{method:'email_otp', reason:'network'}` | 1 row; anonymous |
| RF-5 | **Expired OTP** | Verify an expired code | 1× `auth_login_failed{method:'email_otp', reason:'invalid_credentials'\|'expired'}` | 1 row; anonymous |

**Each failure: assert exactly one event** (run the duplicate-check query → 0 duplicates), correct `reason`, `user_id` NULL + `anon_id` set.

---

## Objective evidence already captured (pre-deploy)
- **Payload schema + ingestion acceptance (anonymous):** all 5 auth events, constructed exactly as the emitters produce, `POST /api/track` → **`200 {ok:true}`** with full envelope + `metadata{method,reason,is_first_login}` (see `STEP_1_IMPLEMENTATION_REPORT.md` §5).
- **Static suite:** `tsc`/`lint`/`build`/`24 tests`/`architecture:check` green.
- **No-duplicate guards (code):** client pending+emitted markers + `?error` URL-clear; server `event_id` dedup.

## What remains for the runtime pass (owner-gated)
1. Apply the Step 1.0 migration to the shared DB.
2. Run new code + perform the real logins above in a real browser (Google/Zalo/email need owner credentials — cannot be automated).
3. Capture the network + DB evidence per row above.

**Cleanup (if verifying against prod):** test rows are identifiable by their `event_id`s / a chosen `session_id`; remove with a scoped `delete from public.user_events where event_id in (…)`.

---
*Requirements 3 (cross-platform contract) and 4 (this procedure) are complete. Requirements 1 & 2 execute via this procedure once the migration is applied and real logins are performed.*

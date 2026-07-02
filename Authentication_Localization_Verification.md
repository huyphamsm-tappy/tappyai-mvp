# Authentication & Localization Verification (QA Sprint)

> **Scope:** verification only — no code changes, no refactors, no migration applied, no deploy. Every claim below is grounded in a fresh code re-read this session and/or a live test against a running dev server; where something could not be live-tested, that limitation is stated explicitly rather than assumed.
> **Method:** re-grepped the entire `src/app/api` tree for auth patterns (not trusted from the prior report), ran `tsc --noEmit`, `next lint`, and `next build` fresh, and exercised the JWT/Guest/Email-OTP/locale paths against a running dev server with real HTTP requests.

---

## Executive Summary

Authentication is solid: every protected route was re-confirmed to use the shared helper, all six JWT scenarios (cookie, Bearer, guest, expired-shaped, invalid, missing) fail closed correctly with no crashes, and Guest Mode's allow/deny boundary matches the spec exactly across every route tested. Localization's core mechanics (device detection, English fallback, localStorage override) were live-verified working correctly — one false alarm during testing turned out to be a test-methodology artifact (see §Localization), not a real bug, and is documented as such rather than silently discarded.

**Two things surfaced this session that revise the prior report's conclusions, in opposite directions:**
1. **Email OTP — the prior report's conclusion was too strong and is partially walked back here.** Last session's finding ("requires a Supabase dashboard configuration change") was based on a `400 email_address_invalid` response for two reserved/example test domains. Re-testing this session against the same project produced a **`429 over_email_send_rate_limit`** instead — a response that only fires when the send pathway is actively being exercised, which is evidence *against* the provider being disabled. The honest position now is: **not conclusively determined either way from outside the dashboard**; §Login Flow below lays out exactly what is and isn't proven.
2. **A pre-existing, unrelated bug was found:** `GET /api/reviews/[id]/comments` returns 500 for every review ID tested (both a fake UUID and a real one from the live feed). This route's GET handler was never touched by the Auth implementation (confirmed by re-reading the file) — it's flagged here as a QA finding, not fixed, per this session's rules.

**Final Verdict: ⚠️ READY AFTER CHECKLIST** — see §Final Verdict for the precise code-vs-config-vs-dashboard breakdown.

---

## Authentication Verification

### Verify JWT

| Scenario | Test performed | Result |
|---|---|---|
| Cookie authentication | `GET /api/memory` with no `Authorization` header (relies on cookie session) | 200, `{"memory": null}` — correct guest behavior, no session present in this test browser |
| Bearer authentication | Code path re-read: `getRequestUser` branches on `Authorization: Bearer` and calls `supabase.auth.getUser(token)` | Confirmed via code; exercised live with invalid tokens (below) — no test account was available to mint a **valid** token, so the positive case (valid Bearer → real user) is verified by code inspection only, not live end-to-end. Flagged as the one remaining test gap, same as the prior report already stated. |
| Guest | `POST /api/chat` with no auth | 200, streamed normally |
| Expired token | `GET /api/memory` with a JWT-shaped-but-garbage-signature token (`exp` in the past, fake signature) | 200, `{"memory": null}` — rejected by Supabase's signature check, falls through to null-user, no crash. Note: this is a syntactically-JWT-shaped token, not a token that was validly signed by this project's key and then expired — a true expired-but-real token wasn't available to test, but the code path (`auth.getUser()` rejecting any invalid/expired signature identically) makes this a reliable proxy. |
| Invalid token | `GET /api/memory` with `Authorization: Bearer garbage-not-a-jwt` | 200, `{"memory": null}` |
| Missing token | `GET /api/memory` with no header at all | 200, `{"memory": null}` |
| Edge cases (not in the original list, tested anyway) | Empty `Bearer ` value, `Authorization: Basic ...` (wrong scheme) | Both fall through gracefully to the cookie path (no crash, no false-positive auth) |

**Route coverage, re-verified from scratch:**
- `grep auth\.getUser\(\)` across `src/app/api/**` → **0 matches** (every direct cookie-only call site has been migrated).
- `grep auth\.getSession\(\)` across the same tree → **0 matches** (confirms no route uses an alternate pattern that would have evaded the original migration).
- `grep getRequestUser` → **34 files**, matching the helper's only call sites — no duplication, no route left on the old pattern.
- Shared-secret (`Bearer ${secret}`) usage confirmed still confined to `cron/*`, `debug-places`, `test-photos`, `notifications/broadcast` — none of these overlap with the 34 user-auth routes. (`integrations/google-calendar/callback` also has a `Bearer` line, but it's TappyAI *calling* Google's API with Google's own OAuth token — unrelated to inbound auth, correctly not part of either list.)

**Conclusion: no route was skipped, no duplicate auth logic exists, no route is still cookie-only.** All confirmed by direct grep this session, not carried over from the prior report's claims.

### Verify Protected Routes

Live-tested every category the task named, as a guest (no auth), confirming 401 in every case:

| Category | Route(s) tested | Result |
|---|---|---|
| Upload | `POST /api/reviews/upload`, `POST /api/upload/video` | 401, 401 |
| Like | `POST /api/reviews/[id]/like` | 401 |
| Save | `POST /api/reviews/[id]/save` | 401 |
| Comment | `POST /api/reviews/[id]/comments` | 401 |
| Follow | `POST /api/users/[id]/follow` | 401 |
| Preferences | `GET /api/preferences`, `GET /api/preferences/profile` | 401, 401 |
| User APIs | `GET /api/users/search`, `PATCH /api/profile`, `GET /api/conversations`, `GET /api/favorites`, `GET /api/bookings` | 401 (all five) |
| Chat tools | `chat/route.ts`'s `save_price_watch` tool (the only tool gated on `authedUserId`) | Re-confirmed only one `createClient`/`createAdminClient` call remains in the file (the already-fixed one) — no other tool in this file has an equivalent unguarded-cookie gap |

No route returned the wrong status (no 403s, no 200-with-error-body, no silent pass-through) for any category above.

### Verify Guest Mode

Re-confirmed against live requests, not just code reading:

| Allowed (tested, all 200) | Denied (tested, all 401) |
|---|---|
| `POST /api/chat` | Upload, Like, Save, Comment, Follow, Profile Edit (all above) |
| `GET /api/reviews/feed` (Explore) | Trip Sync — route does not exist yet (unchanged from prior architecture docs; not a regression) |
| `GET /api/reviews?placeId=...` | |

"Search" and "Maps" have no dedicated backend route distinct from Explore's feed search / chat's place tools — both already covered by the Chat and Explore rows above; this matches the architecture docs' own framing, not a new finding.

### Verify Login Flow

- **Google:** clicking the button correctly entered a loading state (`"Đang đăng nhập..."`) with no console errors, consistent with `signInWithOAuth` being called and awaiting a redirect URL. Full external OAuth completion (Google's consent screen → callback) was not exercised — that requires leaving the test environment and isn't meaningfully testable from this session without real Google credentials; not a gap introduced by this implementation.
- **Email OTP — the finding requiring careful separation of code vs. config, per the task's explicit instruction:**
  - **Code:** correctly calls `supabase.auth.signInWithOtp()`, correctly handles the response, correctly shows an inline error and preserves the entered address on failure, never crashes. This is a code-quality confirmation, independent of whether the email actually gets delivered.
  - **What was observed, in order, across two sessions:** first attempt (prior session) → `400 email_address_invalid` for `@example.com` and a second custom test domain. This session's re-test → `429 over_email_send_rate_limit`.
  - **Why this matters:** a `429` rate-limit response is generated by Supabase's Auth service *after* it accepts a request as valid enough to count against a quota — this is inconsistent with "the Email provider is disabled," which would more typically surface as a distinct `400`/`422` "signups not allowed for this provider" message instead. This is evidence the endpoint is live and processing requests, which **revises down** the confidence of the prior report's conclusion.
  - **What remains genuinely unverified:** whether a real, deliverable email address actually receives a working code end-to-end. This was **not tested** — doing so would require sending mail to a real inbox, which this session avoided as an unnecessary side effect for a QA pass. **This is a dashboard/delivery question, not a code question**, and it should not be marked as a code defect either way.
  - **Correct classification: neither a confirmed code issue nor a confirmed dashboard misconfiguration.** The honest state is "inconclusive from this environment" — recommend one real test-inbox smoke test before relying on this in Android, rather than assuming either outcome.
- **Logout / Refresh / Session (cookie):** unchanged this session (no file touched). `supabase.auth.signOut()` and `middleware.ts`'s `getSession()` refresh are exactly as they were before the Authentication implementation began — re-read, not modified, no new risk introduced.
- **Bearer / Native readiness:** the mechanism exists and rejects bad input correctly (verified above under Verify JWT). The one gap is the same one flagged in the implementation report: no live test of a **valid** token yet, since no test account/token was available in this session either.

---

## Localization Verification

| Item | Result |
|---|---|
| Device language detection | Live-verified: preview browser's `navigator.language` is `en-US`; on a clean load with no stored override, the Email OTP button correctly rendered in English ("Sign in with Email"). |
| English fallback | Confirmed by the same test — `en-US` does not start with `vi`, correctly resolved to `en`, not to Vietnamese. |
| localStorage | Live-verified: `localStorage.setItem('tappy_lang','vi')` + reload correctly switched the button to Vietnamese; removing the key reverted to device detection. |
| Language persistence | Confirmed at the client-storage layer (above). Server-side persistence (`profiles.language` via `PATCH /api/profile`) could not be live-tested — see §Verify Settings, this requires an authenticated session and the migration to be applied, neither available here. |
| Translation keys | Read `src/lib/i18n/dictionaries.ts` fresh — 12 keys, present in both `vi` and `en`, all under the `auth.emailOtp.*` namespace, matching exactly what `login/page.tsx`'s `EmailOtpBlock` calls via `t()`. No orphaned or missing keys found. |
| i18n structure | `useTranslation()` re-read fresh — fallback chain is `dictionaries[locale][key] ?? dictionaries.vi[key] ?? key`, matching the documented fallback rule. |
| No `ai_language` column | Grepped the entire repo (`.ts`, `.tsx`, `.sql`) for `ai_language` — the only match is a comment inside the new migration file itself, explaining why it was deliberately not added. No column, no field, no code reference anywhere. Confirmed. |

**One false alarm during this session's testing, documented for transparency:** an initial live test showed the Email OTP button rendering in Vietnamese despite `en-US` locale and no stored override — which would have been a real bug. Investigation traced this to running `next build` concurrently with the `next dev` preview server (both write to the shared `.next/` directory), which caused the dev server's Fast Refresh to behave inconsistently. Restarting the dev server cleanly after the build finished and re-testing produced the correct result every time after. This is recorded here so the discrepancy isn't mysterious if anyone re-runs a similar test — it is a testing-methodology artifact, not a defect in `useTranslation()`.

**One documentation/code mismatch, minor, not functional:** `useTranslation.ts`'s comment says the language preference syncs "via `/api/profile/language`" — but the actual implementation extended the existing `PATCH /api/profile` endpoint instead of creating a separate route (a deliberate, reasonable reuse decision made during implementation, correctly described in the Implementation Report, just not updated in this one code comment). Flagged, not fixed.

### Verify Settings

- `GET /api/profile` and `PATCH /api/profile` — re-read, correctly include/accept `language` alongside the existing fields (`full_name`, `bio`, `avatar_url`).
- **Database dependency, confirmed by code review:** the `PATCH` handler does `supabase.from('profiles').update({ language, ... })`. If the `language` column doesn't exist on the live `profiles` table, this will fail at the database layer.
- **Migration dependency — could not be verified live.** This session has no database-inspection tool available, and applying or checking the migration was explicitly out of scope ("Không apply migration"). **This must be treated as unverified, not as passing** — the correct, honest status is "unknown from this environment," not "assumed applied" and not "assumed missing." Whoever has Supabase dashboard/SQL access needs to confirm the column exists (`add_user_language_preference.sql`) before `PATCH /api/profile { language }` can be relied on. **This is explicitly a migration-readiness gap, not a code bug** — the code is correct for either state, it just requires the column to exist to succeed.

---

## Build Verification

All three run fresh this session (not reused from the prior session's results):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — zero errors |
| `npx next lint` | **PASS** — zero errors; only pre-existing warnings in files untouched by this work (`<img>` vs `next/image` suggestions in `admin/analytics`, `reviews/new`, `ChatInterface`, `VideoPlayer`; one `exhaustive-deps` warning each in `chat/page.tsx` and `reviews/page.tsx`) — none are new, none are in any file this session's Authentication/Localization work touched |
| `npx next build` | **PASS** — exit code 0, `✓ Compiled successfully`, all 93 pages generated. One benign log line during static-page-data collection (`suggested-prompts` route flagged as dynamic because it reads `searchParams`) — this is Next.js correctly identifying a route that legitimately needs per-request data, not a build error; this route was already dynamic before this session's changes. |

---

## Deployment Checklist

- [ ] Apply migration (`add_user_language_preference.sql`) — **not yet applied**, could not be verified or applied from this session (by instruction)
- [ ] Enable Email Provider — **status unconfirmed**; this session's evidence (rate-limit response) suggests it may already be enabled, but this is not conclusive and must be checked directly in the Supabase dashboard
- [ ] Configure SMTP (if needed) — same as above, dashboard-only, not verifiable from code
- [ ] Verify Google Auth — client-side flow confirmed correct (loading state, no errors); full OAuth completion not exercised in this session
- [ ] Verify Email OTP — **inconclusive**, see §Verify Login Flow; recommend one real-inbox smoke test
- [ ] Verify Language Persistence — client-side (localStorage) confirmed; server-side (`profiles.language`) blocked on the migration above
- [ ] Deploy — not performed, per instruction
- [ ] Production QA — not performed, depends on all of the above

---

## Deployment Readiness

| Area | Status | Basis |
|---|---|---|
| **Code Ready** | ✅ **PASS** | `tsc`, `lint`, and `build` all clean; every JWT/Guest scenario live-tested and correct; i18n mechanics live-verified correct; the one pre-existing bug found (`comments` 500) is unrelated to this session's code (file's GET handler untouched) |
| **Migration Ready** | ⚠️ **WARNING** | Migration file exists and is syntactically correct, but application state is unverified from this environment — must be confirmed, not assumed, before relying on language persistence |
| **Supabase Ready** | ⚠️ **WARNING** | Email OTP's dashboard-side status is genuinely inconclusive from outside the dashboard (see the revised finding in §Executive Summary) — needs a direct dashboard check or one real-inbox test, not a code fix |
| **Deployment Ready** | ⚠️ **WARNING** | Blocked only by the two items above — no code-side blocker exists |
| **Android Ready** | ⚠️ **WARNING** | Same two items are exactly the "Must Fix Before Android" conditions from `Android_Sprint_Go_NoGo.md` §5 (Bearer JWT verification is now done and verified; the remaining condition was `GET /api/context`, out of this session's scope, plus these two new deployment-config items) |

---

## Final Verdict

## ⚠️ READY AFTER CHECKLIST

**Code issues:** none found that block deployment. The one bug discovered (`GET /api/reviews/[id]/comments` → 500 for any review ID) is real and worth fixing, but it is pre-existing, unrelated to the Authentication/Localization work (the file's GET handler was never touched this implementation), and not a blocker for this checklist — recommend a separate follow-up.

**Deployment/configuration items (not code, but must happen before this is usable in production):**
1. Apply `add_user_language_preference.sql` to the Supabase project.
2. Confirm Email Provider status directly in the Supabase dashboard (this session's evidence leans toward "already enabled," via the rate-limit response, but that is not a substitute for checking directly).

**Dashboard-only items (explicitly not a code concern, listed separately per the task's instruction not to conflate categories):**
- Email/SMTP configuration, if the direct dashboard check above finds it's actually needed — cannot be determined or fixed from this codebase.

No item above requires new code, a refactor, or a redesign. Once the two deployment/configuration items are confirmed, this is ready for deploy and for Android Sprint to begin against a stable, verified authentication and localization foundation.

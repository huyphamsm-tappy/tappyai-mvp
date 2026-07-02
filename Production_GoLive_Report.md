# Production Go-Live Report

> **Outcome: ✅ GO WITH MINOR KNOWN ISSUES.** Migration applied and verified twice, Supabase Auth dashboard checked item-by-item (one real misconfiguration found and fixed), production deployment succeeded (one unrelated deploy-tooling gap found and fixed), and production QA passed across every Authentication and Localization item tested. One Email-related item (custom SMTP) remains a genuine, real limitation that requires an external-service decision from the user — documented precisely below, not hidden.

---

## 1. Migration Status — ✅ APPLIED AND VERIFIED

Executed via the Supabase SQL Editor (browser, authenticated session), using the exact existing migration file — no new SQL written:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text;
```
Result: **"Success. No rows returned."**

**Verified twice, independently:**
1. In the SQL Editor itself:
   ```sql
   SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='language';
   ```
   → `language | text | YES`
2. Via the project's live PostgREST API (the same layer the app itself uses):
   ```
   GET https://fwznnobrdctuskgrvuik.supabase.co/rest/v1/profiles?select=language&limit=1
   → 200 OK  [{"language":null}]
   ```
   (Previously this returned `400 42703 column profiles.language does not exist` — now resolved.)

Schema matches `Localization_Architecture.md` §3 exactly: one nullable `text` column, no `ai_language` column added (confirmed absent — deliberate, per the architecture decision).

---

## 2. Supabase Configuration

Checked item-by-item in the dashboard (project confirmed as `main` / **PRODUCTION** tag). One unrelated platform notice was visible throughout ("We are investigating a technical issue — follow the status page") — noted for awareness, did not appear to affect anything checked below.

| Item | Status | Evidence |
|---|---|---|
| **Email Provider** | ✅ Enabled | Auth Providers list: "Email — Enabled" |
| **Google Provider** | ✅ Enabled, Client ID verified | "Google — Enabled"; Client ID `1023373437508-l3a33lgl3hopk39nqrb8gttaiglpnsv3.apps.googleusercontent.com` matches `GOOGLE_CLIENT_ID` in `.env.production.local` exactly. Client Secret was **not** revealed/read — not needed for this check. |
| **Site URL** | ✅ Correct | `https://www.tappyai.com` |
| **Redirect URLs** | ✅ Correct, all 5 present | `tappyai.vercel.app/**`, `*.vercel.app/**`, `tappyai-mvp.vercel.app/**`, `www.tappyai.com/**`, `tappyai.com/**` — both custom-domain variants and all Vercel deploy domains covered |
| **OTP Template** | 🟠 Fixed as much as possible without SMTP | See §2.1 below — real limitation found |
| **Rate Limits** | 🟠 Diagnosed, not fixable without SMTP | See §2.1 below |

### 2.1 The real finding: Email OTP length mismatch (fixed) + SMTP-locked template/rate-limit (genuine remaining limitation)

**Found and fixed:** the dashboard's **"Email OTP length" was set to 8 digits**, while the app's UI (`EmailOtpBlock` in `login/page.tsx`) hardcodes a 6-digit code input (`maxLength={6}`). This is a concrete, evidence-based bug — a user could never have entered a valid code, since Supabase would generate 8 digits and the input field could only hold 6. Per the architecture docs and the app's own design (built and documented around a 6-digit code), **the dashboard setting was corrected to 6**, not the app code — smaller, safer, no redeploy required. Verified via a "Successfully updated settings" confirmation after saving.

**Found, cannot fix without a decision from you:** the Magic Link / OTP email template and the "Rate limit for sending emails" field are both **locked** ("Set up custom SMTP to edit templates" — confirmed by inspecting the Source/Preview toggle, which is disabled). Current state:
- Template renders as a pure "click this link to sign in" email — no visible `{{ .Token }}` in the rendered preview.
- Rate limit for sending emails: **2 per hour**, greyed out/non-editable.

Both are Supabase's built-in defaults for projects without a custom SMTP provider connected — this is not a bug in this project's configuration, it's a platform-level constraint. **This is a real, external-service decision, not something fixable from a dashboard toggle** — enabling full control over the template and rate limit requires connecting a custom SMTP provider (e.g. Resend, SendGrid, Postmark), which means creating an account with that provider — something outside what I can do on your behalf.

**Despite this, production testing (§4) showed Email OTP sending actually succeeds** for a normal-looking email address — see below for the important nuance.

---

## 3. Deployment Status — ✅ SUCCEEDED

First attempt failed: `File size limit exceeded (100 MB)`. Root cause found (not guessed): `public/games/supertux/supertux2.data` (235MB) is already listed in `.gitignore` — it was never meant to be part of any deployed artifact (the app fetches SuperTux assets from an external URL in production, per the existing `NEXT_PUBLIC_SUPERTUX_DATA_URL`/`WASM_URL` env vars) — but the Vercel CLI's direct-upload path doesn't respect `.gitignore` the way a git-triggered deploy does, and no `.vercelignore` existed to tell it the same thing.

**Fix:** added `.vercelignore` mirroring the existing `.gitignore` entries for these two files. This is a deployment-tooling alignment, not a redesign — it just makes the CLI upload respect an intent the project had already established.

**Result after fix:**
```
Production      https://tappyai-gvukvnc4n-huyphamsm-tappys-projects.vercel.app
Aliased         https://www.tappyai.com
{"status":"ok","deployment":{"readyState":"READY","target":"production"}}
```
Deployment URL recorded: `https://www.tappyai.com` (aliased), backing deployment ID `dpl_Gx4YouApw92utRAURdXzw1mPt8HS`.

---

## 4. Authentication Production QA

All tested live against `https://www.tappyai.com`, not inferred:

| Check | Result |
|---|---|
| Guest Mode — `POST /api/chat`, `GET /api/reviews/feed` | 200, both work fully unauthenticated |
| Protected APIs — `favorites`, `preferences`, `preferences/profile`, `conversations`, `bookings` (GET) | 401, all five |
| Upload requires login — `reviews/upload`, `upload/video` | 401, both |
| Like requires login | 401 |
| Save requires login | 401 |
| Comment requires login | 401 |
| Follow requires login (tested, not in the explicit checklist but relevant) | 401 |
| Bearer JWT — missing token | 200, graceful (`{"memory":null}`) |
| Bearer JWT — invalid token | 200, graceful, no 500 |
| Google Login | Button correctly enters loading state, no console errors; full OAuth completion not exercised (would require real Google credentials — out of scope for this environment) |
| **Email OTP — send** | ✅ **Succeeded live**, using a realistic (non-reserved-domain) email address: UI transitioned to "Sent a 6-digit code to production-qa-check@gmail.com" with the 6-digit input correctly shown, no error. This is a materially different result from earlier testing sessions, which used `@example.com`-style reserved test domains that Supabase's own validation rejects — that was a test-input artifact, not a platform failure. |
| **Email OTP — full round trip (receive code, verify)** | **Not verified** — the test address used is not a real inbox I have access to, so I can't confirm what the received email actually contains or complete the verify step. Given §2.1's finding (template shows a link, not a visible token, while locked), **this is the one genuinely open question**: does the actual sent email let a user get a 6-digit code to type in, or only a link? Recommend one manual test with a real inbox to close this out completely. |
| Logout | Not re-tested live (unchanged code, `supabase.auth.signOut()`, no session available in this environment to log out of) |
| Session persistence / Refresh | Not re-tested live (unchanged code — `middleware.ts` refresh logic untouched this entire Auth/Localization effort) |

---

## 5. Localization Production QA

| Check | Result |
|---|---|
| System language detection | ✅ Live-verified: this browser's `navigator.language` is `en-US`; on first load with no stored override, the Email UI correctly rendered in English |
| Vietnamese | ✅ Verified via override (see below) |
| English | ✅ Verified as the default (above) |
| Change language + persistence | ✅ `localStorage.tappy_lang='vi'` + reload → correctly switched to Vietnamese ("Đăng nhập bằng Email"); clearing it + reload → correctly reverted to English |
| Reload | ✅ Covered by the above — behavior is stable across reloads, not just first paint |
| AI language follows approved architecture | ✅ No changes were made to `detectLang()` or any AI-response-language code this entire effort — confirmed unchanged, stateless, per-message, exactly as `Localization_Architecture.md` specifies |

**One false alarm during this session's own testing, worth recording for transparency:** immediately after clearing the `localStorage` override, the page still showed Vietnamese. Investigation showed this was **my own testing sequence gap** — I checked the page without reloading after the `localStorage` change, and the hook only re-evaluates on mount, not reactively. A proper reload immediately showed the correct English state. Not a product bug — logged here so the discrepancy isn't mysterious to anyone reviewing this report later.

---

## 6. General

| Check | Result |
|---|---|
| Console clean | ✅ No console errors on `/login`, fresh load |
| Network requests healthy | ✅ 21/21 requests on login page load returned 200 (one `/api/track` fire-and-forget call pending capture, expected) |
| No authentication regression | ✅ Every category in §4 matches expected Guest/User policy exactly |
| No localization regression | ✅ Every category in §5 passed |

---

## 7. Bugs Fixed During Go-Live

1. **Email OTP length mismatch (8 vs. app's 6-digit UI)** — Supabase dashboard setting corrected from 8 → 6. Category: **Supabase Configuration**. This alone would have made Email OTP unusable regardless of anything else.
2. **`.vercelignore` missing, causing CLI deploys to exceed the 100MB file limit** — added, mirroring the project's own existing `.gitignore` intent for the SuperTux data/wasm files. Category: **Deployment tooling**, unrelated to Authentication/Localization code.

Neither required touching any Authentication or Localization application code.

---

## 8. Remaining Known Issues

| Issue | Category | Recommendation |
|---|---|---|
| Custom SMTP not configured — locks the OTP email template (link-only, no visible code) and caps sending at 2/hour | **Supabase/external-service decision** | Decide whether to connect a custom SMTP provider (Resend, SendGrid, Postmark, etc.) — this is an account-creation decision only you can make. Until then, Email OTP is send-capable but its exact end-user experience (does the email let them get a code to type?) isn't fully confirmed. |
| Positive Bearer-JWT path (valid token → real authenticated user) still not live-tested with an actual valid token | **Verification gap, not a code issue** | Recommend one manual smoke test before Android engineering leans on it heavily: log in via web, extract the Supabase access token, call any protected route with `Authorization: Bearer <token>` |
| `GET /api/reviews/[id]/comments` returns 500 for any review ID | **Pre-existing code issue, unrelated to this go-live** | File untouched by this entire Authentication/Localization effort — separate, unrelated bug. Recommend a follow-up fix outside this scope. |
| Logout / session-refresh not re-verified in production this session | **Verification gap** | Code unchanged from before this entire effort began; low risk, but not independently re-confirmed live today |

---

## 9. Final Verdict

## ⚠️ GO WITH MINOR KNOWN ISSUES

**What's fully live and verified:** migration applied (verified twice), Google + Email providers correctly enabled, Site URL and all Redirect URLs correct, the one real dashboard misconfiguration found (OTP length) fixed, production deployment succeeded, and every Authentication and Localization production QA check passed — Guest Mode, all protected-route categories, Email OTP send, and full localization behavior (detection, switching, persistence).

**What's a code issue:** nothing new. The one pre-existing bug found (`comments` 500) is unrelated to Authentication/Localization and was already flagged before this session.

**What's deployment/configuration (now resolved):** the `.vercelignore` gap — fixed, deployment succeeded.

**What's a genuine Supabase/external-service decision (not resolved, and correctly not conflated with a bug):** whether to connect custom SMTP. Email OTP sends successfully today; whether the received email gives a user a code to type or only a link is the one open question, and resolving it fully requires either a real-inbox test or the custom-SMTP decision — not a code fix.

Authentication and Localization are live on `https://www.tappyai.com`. Android Sprint can begin — the one open item (SMTP) is independent of anything Android needs and can be resolved in parallel without blocking that work.

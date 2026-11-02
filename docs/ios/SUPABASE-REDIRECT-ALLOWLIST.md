# Supabase redirect allow-list — what the iOS app depends on

Project `fwznnobrdctuskgrvuik` (production) → Authentication → URL Configuration. **Read-only snapshot, 2026-10-09**
(from the dashboard page; nothing was changed):

- **Site URL:** `https://www.tappyai.com`
- **Redirect URLs (8):**
  - `https://tappyai.vercel.app/**`
  - `https://tappyai-mvp.vercel.app/**`
  - `https://www.tappyai.com/**`
  - `https://tappyai.com/**`
  - `tappyai://auth-callback`   ← the native entry (Android uses it; iOS now uses it)
  - `http://localhost:3000/**`
  - `https://uat.tappyai.com/auth/callback**`
  - `https://uat.tappyai.com/auth/confirm**`

## Why it matters
Supabase sends the browser to `redirect_to` only if it is in this list; **anything else is silently replaced by the Site URL**. iOS build 154
sent `tappyai://auth/callback` (a slash, not in the list), so after Google the in-app browser landed on the website Home page and never
returned to the app. iOS now sends `tappyai://auth-callback` (`AuthCallbackURL.googleRedirect`), which is already allow-listed. No
dashboard change is needed.

## Guard
`src/lib/auth/iosGoogleRedirect.test.ts` fails if the iOS redirect stops being an entry of this list or differs from Android's.
If the dashboard list changes, update this file in the same change. The guard cannot read the dashboard itself.

## Not covered by this list
Zalo does not use Supabase's redirect: the app's own backend returns the browser to `tappyai://auth/callback` with a state-bound
PKCE code (`ZaloAuthController`). Sign in with Apple is native (no browser).

# Sign in with Apple — Web hotfix handoff (branch `hotfix/apple-signin-capability`, PR #261, based on `origin/main` `f42ae4b`)

**STATUS (2026-10-05): Supabase Apple provider ENABLED in production; Web hotfix NOT YET MERGED OR DEPLOYED.** Production Web (`https://www.tappyai.com/api/version`) is still `f42ae4b`, so `/api/config` still has no `appleSignIn` and iOS still hides the button. The hotfix carries only the Apple capability signal: no Phase 7, no bounded Agent, no migration.

## What it changes (nothing else)

| File | Change |
|---|---|
| `src/lib/auth/appleCapability.ts` (new) | `appleSignInAvailable()` — reads Supabase's public `GET <project>/auth/v1/settings` and returns true only for `external.apple === true`; fail-closed; 5 min cache (30 s after a failure); never follows redirects; the public anon key is sent only to that path. |
| `src/app/api/config/route.ts` | +10 lines: import, `export const dynamic = 'force-dynamic'`, one `await`, and `flags.appleSignIn`. Every other field is byte-for-byte what main returns. |
| `src/lib/auth/appleCapability.test.ts` (new) | 14 tests: the body parser and every failure mode (no env, bad URL, 4xx/5xx, malformed/oversized body, redirect, network error, timeout, cache TTL). |
| `src/app/api/config/appleSignInConfig.test.ts` (new) | 9 tests: the flag follows the real source; **removing `flags.appleSignIn` from the response gives exactly main's previous response** (rebuilt from main's own constants); Google/Zalo/email unchanged; Apple not added to `auth.providers`; CDN header kept; no key/host/secret in the response; one probe per cache window. |
| `docs/ios/APPLE-SIGN-IN-HANDOFF.md` (new) | this file |

## The `/api/config` contract (iOS)

```
flags.appleSignIn : boolean   // always present; true ONLY while Supabase reports its Apple provider enabled
auth.providers    : [{id:"google",enabled:true},{id:"zalo",enabled:true},{id:"email",enabled:true}]   // unchanged
```

iOS (`AuthViewModel.swift:40-41`, `AppleSignIn.isEnabled`) shows the native button iff `flags.appleSignIn == true` or `auth.providers` has an enabled `"apple"`. Web never lists Apple in `auth.providers`. Enabled: iOS exchanges the Apple identity token **directly with Supabase** (`signInWithIdToken`), so Web needs no Apple endpoint. Disabled/absent/fetch failure: the button stays hidden (the state until this hotfix is deployed).

Apple Guideline 4.8 requires an equivalent login service when the covered third-party/social login pattern applies; Tappy is using Sign in with Apple as that equivalent option.

## Status of the pieces (not merged together)

| Piece | Status | Evidence |
|---|---|---|
| Web capability signal | implemented, tested, CI green, **not merged / not deployed** | PR #261 |
| Web Apple auth endpoint | not needed (iOS talks to Supabase directly) | no `signInWithIdToken` / `provider: 'apple'` in `src/` |
| Supabase Apple provider, production `fwznnobrdctuskgrvuik` | **ENABLED 2026-10-05** — `external.apple=true` on 3 consecutive no-cache probes of the public `/auth/v1/settings`; other enabled providers unchanged (`anonymous_users`, `email`, `facebook`, `google`); Client ID `com.tappyai.ios` saved and re-read after a reload; Secret Key left empty (native-only needs none) | dashboard Authentication → Providers → Apple; public settings probe |
| Production `/api/config` | no `appleSignIn` field yet (old build `f42ae4b`) | `GET https://www.tappyai.com/api/config` |
| Real iPhone sign-in | **NOT VERIFIED** | needs the deployed flag, a TestFlight build and an authorized Apple ID |

Dashboard trap found while configuring: Chrome had **autofilled** the Apple panel's *Client IDs* and *Secret Key* fields with a saved login. Saving the form untouched would have stored junk, so both fields were overwritten/emptied before saving. Anyone editing this panel in a browser with a password manager should check that neither field is autofilled.

## CI evidence (PR #261, head `05ae57e`)

All four required checks on `main` pass, on both the push and the pull_request runs: *Test suite* (runs 37272540675, 37272583553), *Types, lint, SQL grants* (same runs), *AI architecture rules* (37272540659, 37272583442), *Brand registry validation* (same runs). Vercel preview: pass. Local verification on a clean `npm ci` of main + this commit: focused 23/23, full suite 9,562 passed / 0 failed, `tsc` 0, lint 0 errors, `next build` OK.

## Still required, in this order

1. **Owner merges PR #261** (merge commit, as for hotfix PR #260). Vercel then builds production from `main`.
2. **Verify** `GET /api/version` shows the merge commit, and `GET /api/config` → `flags.appleSignIn: true` (allow up to ~1 h of CDN cache), `auth.providers` still google / zalo / email.
3. **Merge the hotfix back into `rc/web-uat`** the same day (`docs/uat/RELEASE-GOVERNANCE.md` on `rc/web-uat`, branch table; as for C2).
4. **Real-device test** on TestFlight with an authorized Apple ID.

Not part of this hotfix: Apple 5.1.1(v) token revocation on account deletion (needs an Apple signing key and a new flow; see the iOS request I8 item 3).

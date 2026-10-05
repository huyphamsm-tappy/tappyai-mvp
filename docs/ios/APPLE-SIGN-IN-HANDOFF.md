# Sign in with Apple — Web hotfix handoff (branch `hotfix/apple-signin-capability`, based on `origin/main` `f42ae4b`)

**STATUS: NOT DEPLOYED. Awaiting owner approval.** This hotfix carries only the Apple capability signal. It does not contain Phase 7, the bounded Agent, or any migration. Production (`https://www.tappyai.com/api/version` = `f42ae4b`) is unchanged by this branch.

## What it changes (4 files, nothing else)

| File | Change |
|---|---|
| `src/lib/auth/appleCapability.ts` (new) | `appleSignInAvailable()` — reads Supabase's public `GET <project>/auth/v1/settings` and returns true only for `external.apple === true`; fail-closed; 5 min cache (30 s after a failure); never follows redirects; the public anon key is sent only to that path. |
| `src/app/api/config/route.ts` | +10 lines: import, `export const dynamic = 'force-dynamic'`, one `await`, and `flags.appleSignIn`. Every other field is byte-for-byte what main returns. |
| `src/lib/auth/appleCapability.test.ts` (new) | 14 tests: the body parser and every failure mode (no env, bad URL, 4xx/5xx, malformed/oversized body, redirect, network error, timeout, cache TTL). |
| `src/app/api/config/appleSignInConfig.test.ts` (new) | 9 tests: the flag follows the real source; **removing `flags.appleSignIn` from the response gives exactly main's previous response** (rebuilt from main's own constants); Google/Zalo/email unchanged; Apple not added to `auth.providers`; CDN header kept; no key/host/secret in the response; one probe per cache window. |

## The `/api/config` contract (iOS)

```
flags.appleSignIn : boolean   // always present; true ONLY while Supabase reports its Apple provider enabled
auth.providers    : [{id:"google",enabled:true},{id:"zalo",enabled:true},{id:"email",enabled:true}]   // unchanged
```

iOS (`AuthViewModel.swift:40-41`, `AppleSignIn.isEnabled`) shows the native button iff `flags.appleSignIn == true` or `auth.providers` has an enabled `"apple"`. Web never lists Apple in `auth.providers`. Enabled: iOS exchanges the Apple identity token **directly with Supabase** (`signInWithIdToken`), so Web needs no Apple endpoint. Disabled/absent/fetch failure: the button stays hidden (the state today).

Apple Guideline 4.8 requires an equivalent login service when the covered third-party/social login pattern applies; Tappy is using Sign in with Apple as that equivalent option.

## Status of the pieces (not merged together)

| Piece | Status | Evidence |
|---|---|---|
| Web capability signal | implemented, tested, NOT deployed | this branch |
| Web Apple auth endpoint | not needed (iOS talks to Supabase directly) | no `signInWithIdToken` / `provider: 'apple'` in `src/` |
| Supabase Apple provider, production `fwznnobrdctuskgrvuik` | **DISABLED** (`external.apple=false`, probed read-only 05/10, repeated) | public `/auth/v1/settings` |
| Production `/api/config` | no `appleSignIn` field (old build `f42ae4b`) | `GET https://www.tappyai.com/api/config` |
| Real iPhone sign-in | **NOT VERIFIED** | needs a TestFlight build and an authorized Apple ID |

## Still required, in this order

1. **Owner approves** this hotfix.
2. **Supabase dashboard** (production): Authentication → Providers → **Apple** → enable, add `com.tappyai.ios` under *Client IDs*. Native-only needs no Services ID / key / secret per the Supabase guide. Re-probe `external.apple` until `true`.
3. **Deploy** this hotfix through the normal release flow (Vercel builds production from `main`).
4. **Verify** production `/api/config` → `flags.appleSignIn: true` (allow up to ~1 h of CDN cache), providers unchanged.
5. **Real-device test** on TestFlight.

Not part of this hotfix: Apple 5.1.1(v) token revocation on account deletion (needs an Apple signing key and a new flow; see the iOS request I8 item 3).

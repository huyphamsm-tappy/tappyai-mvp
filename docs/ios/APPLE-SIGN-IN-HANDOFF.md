# Sign in with Apple — Web → iOS handoff (2026-10-05)

**STATUS: WEB APPLE HANDOFF: BLOCKED** — the Web-side capability signal is implemented and tested, but the Supabase Apple provider is **disabled** on both the audit and the production project. Until the account owner enables it, `flags.appleSignIn` is correctly `false` and iOS correctly hides the button. Nothing here pretends production is ready.

| | |
|---|---|
| Web branch | `p7/web-subscription` |
| Web commit | the commit that adds this file (`git log -1 --format=%H --diff-filter=A -- docs/ios/APPLE-SIGN-IN-HANDOFF.md`); a commit cannot contain its own hash. Its parent is the previous verified Web FINAL `a43948d41684386a46857077b02b6f413e025d1f` (remote-verified 2026-10-05 before this change). |
| Remote SHA / CI run | reported with the push in the task report (not knowable before the commit exists) |
| iOS reference | `ios/sync-2026-09-30` @ `d300932e604a07b6c014e4a21adc9257fb9da083` — not modified |
| Apple policy | App Review Guideline 4.8 (Login Services): an app that uses a third-party / social login for the primary account must also offer an **equivalent login service** that (1) collects only name and email, (2) lets the user keep the email private, (3) does not collect app interactions for advertising without consent. The guideline does **not** name Sign in with Apple as the only way to comply (source: developer.apple.com/app-store/review/guidelines, read 2026-10-05). Sign in with Apple is used here because the iOS code already implements it. |

## 1. The `/api/config` contract

`GET /api/config` (unchanged shape, one field is now backed by a real capability):

```
flags.appleSignIn : boolean   // ALWAYS present. true ONLY while the Supabase project reports its Apple provider as enabled.
auth.providers    : [{id:"google",enabled:true},{id:"zalo",enabled:true},{id:"email",enabled:true}]   // unchanged; Apple is NOT listed
```

* **Capability source:** Supabase's own public provider state, `GET <SUPABASE_URL>/auth/v1/settings` → `external.apple === true` (only the literal `true`). Code: `src/lib/auth/appleCapability.ts` (`appleSignInAvailable`), wired in `src/app/api/config/route.ts` (the route is now `force-dynamic`; the response keeps `Cache-Control: public, max-age=300, stale-while-revalidate=3600`).
* **Fail closed:** missing env, non-https URL (http only for localhost), non-2xx, timeout (2.5 s), redirect, malformed or oversized body, any exception → `false`. Result cached 5 min (30 s after a failure).
* **Why not a hand-set flag:** a flag drifts from the dashboard; a button that fails is worse than no button. The probe sends only the *public* anon key, only to that one path, never follows a redirect, and nothing about the probe, the key or the Supabase host appears in the response (tested).
* **Why not `auth.providers`:** iOS accepts either signal; the flag is the one it already decodes. Apple is deliberately not added to `auth.providers`, so no client that renders from that list can draw a button for a flow that does not exist on Web.
* **Timing after the owner flips the switch:** server cache ≤ 5 min plus CDN `max-age=300` and `stale-while-revalidate=3600` — allow up to about an hour in the worst case before every client sees `true`.

## 2. iOS expectation (no iOS change needed)

`ios/TappyAI/Features/Auth/UI/AuthViewModel.swift:40-41` + `Data/AppleSignIn.swift` `isEnabled`: the button shows iff `flags.appleSignIn == true` **or** `auth.providers` contains an enabled `"apple"`.
* **Enabled (`true`):** iOS shows the native button; the Apple identity token is exchanged **directly with Supabase** (`signInWithIdToken(provider: .apple, idToken:, nonce:)`, `SupabaseAuthService.swift:63-65`). Web has no Apple endpoint and needs none; the resulting Supabase session is used with the Web API like any other (Bearer).
* **Disabled / absent / config fetch fails:** the button stays hidden (`try? await config.config()` → nil → hidden). This is the state today.

## 3. Status of each question (statuses are not merged)

| | Question | Status | Evidence |
|---|---|---|---|
| A | Web has a functional Apple auth path? | **NOT IMPLEMENTED** (and not required for iOS native) | `git grep` finds no `provider: 'apple'` and no `signInWithIdToken` in `src/`; login page offers Google / Zalo / email OTP; `docs/backoffice/phase-reports/STEP_1_IMPLEMENTATION_REPORT.md:44` “no Apple sign-in flow”; `docs/Authentication_Architecture.md` row “Apple — propose adding” |
| B | `/api/config` exposes whether Apple is really enabled? | **VERIFIED (this change)** — was NOT IMPLEMENTED | `route.ts` `flags.appleSignIn`; `src/lib/auth/appleCapability.test.ts` (14), `src/app/api/config/appleSignInConfig.test.ts` (9) |
| C | Supabase supports Apple auth now? | **BLOCKED BY EXTERNAL ACCOUNT CONFIG** | live read-only probe of the public `/auth/v1/settings`, 2026-10-05: audit project `external.apple=false`, production project `external.apple=false` (google/email `true`) |
| D | iOS already has the native implementation, depending only on a server signal? | **VERIFIED** | `AppleSignIn.swift`, `SupabaseAuthService.signInWithApple`, `AuthViewModel.finishApple`, `AuthFlowView` `SignInWithAppleButton`, `AppleSignInTests.swift` (iOS @ d300932); the model comment states “No server sends it yet” |
| E | Backend can process the native credential? | **Web: not involved (token goes iOS→Supabase). Supabase: NOT READY (provider disabled).** | the DB trigger tolerates an absent email (`supabase/migrations/20261001e_banned_identity_hash.sql:92`); Zalo accounts already use a placeholder email, so a hidden/relay Apple email is not a new case. Not tested end to end: no Apple credential exists to test with |

**APPLE PRODUCTION CONFIG: UNVERIFIED** beyond the single non-secret fact above (provider *disabled*). The Client IDs list (must contain `com.tappyai.ios`) is not publicly readable, so even a future `true` proves “provider enabled”, not “the bundle id is registered”; the first on-device sign-in with an authorized test Apple ID is the end-to-end proof.

## 4. Remaining external dependency — SUPABASE CONFIGURATION REQUIRED

1. **Supabase dashboard** (production project, then audit if wanted): *Authentication → Providers → Apple* → **Enable**, and under **Client IDs** add the iOS bundle id `com.tappyai.ios`. Per the current Supabase guide, native-only sign-in needs **no** Services ID, signing key or secret rotation (those are only for browser OAuth). Do not commit any key.
2. **Apple Developer:** App ID `com.tappyai.ios` has the *Sign in with Apple* capability (the iOS docs record it as enabled since 28/09 and in the provisioning profile; not re-verified here).
3. **Deploy:** this Web commit must be on production for `/api/config` to emit the field there (production currently serves an older build).
4. **Then verify:** `GET /api/config` shows `flags.appleSignIn: true`, and one real sign-in on a TestFlight build with an authorized test Apple ID.

**Separate, NOT part of this change (open, owner-visible):** Apple 5.1.1(v) requires revoking the Apple token when an account is deleted. That needs an Apple signing key and a new link/revoke flow (`docs/ios/IOS-REQUESTS.md` I8 item 3 in the iOS repo proposes `POST /api/auth/apple/link`). It would be an authentication-architecture change and was out of scope here; without it, deleting an account that signed in with Apple does not yet meet that Apple requirement.

## 5. Tests

`src/lib/auth/appleCapability.test.ts` and `src/app/api/config/appleSignInConfig.test.ts` — enabled → `true`; disabled → `false`; no env / bad URL → `false` with no network call; 4xx/5xx, malformed or oversized body, network error, refused redirect, timeout → `false`; cache hit / TTL expiry / short failure TTL; Google/Zalo/email list unchanged and Apple not added; every pre-existing block and flag still present and boolean; CDN header unchanged; no key, host or secret in the response. No Apple *auth endpoint* exists in Web, so there is no endpoint error behavior to test.

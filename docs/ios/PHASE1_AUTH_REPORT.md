# TappyAI iOS — Phase 1 (Authentication): Implementation Report

> Generated 2026-07-10. Implements **Authentication only** per the approved `PHASE1_AUTH_SURVEY.md` (+ §0 decisions), ADR-005, and the Implementation Plan. No other feature started. Code under [`ios/TappyAI/Features/Auth`](../../ios/TappyAI/Features/Auth). **This is a Windows environment — nothing was compiled; see Blockers.**

## 1. Completed files

**Auth module (15 files)** — `ios/TappyAI/Features/Auth/`
| File | Role |
|------|------|
| `Data/AuthService.swift` | Protocol for all auth ops (OTP, register, OAuth, refresh, sign-out) |
| `Data/SupabaseAuthService.swift` | supabase-swift implementation (transport only) |
| `Data/SupabaseTokenRefreshing.swift` | Bridges `SessionStore` refresh → SDK (replaces Phase 0 stub) |
| `Data/AnonymousSessionService.swift` | Consumes stable `POST /api/auth/anonymous` contract (D1) |
| `Data/ProfileGateService.swift` | Reads `profiles.onboarded` (RLS-bound) for the onboarding gate |
| `Data/OnboardingService.swift` | `POST /api/onboarding` |
| `Data/AuthModels.swift` | `Session→AuthTokens` map, `AnonymousSessionResponse`, `OnboardingPayload` |
| `AuthValidation.swift` | Pure client-side input checks (email/OTP/password/name) |
| `Web/WebAuthenticator.swift` | `ASWebAuthenticationSession` wrapper + presentation anchor |
| `Web/ZaloAuthController.swift` | Single-session Zalo driver (D2), existing routes |
| `AuthRepository.swift` | Orchestrates all flows; updates `SessionStore`; launch reconcile |
| `UI/AuthViewModel.swift` + `UI/AuthFlowView.swift` | Login: Google, Zalo, Email-OTP |
| `UI/RegisterView.swift` | Email+password registration (+ "check your email") |
| `UI/OnboardingView.swift` | Interests + city onboarding |

**Foundation wiring (edited, Phase-1 scope):**
- `Core/Session/SessionStore.swift` — added `anonymousId` + `adoptAnonymousSession(...)` (D1 anonymous-session support); `logout()` clears `anonymousId`.
- `App/AppDependencies.swift` — builds `SupabaseAuthService`, SDK-backed refresher, `AuthRepository`; `bootstrap()` now reconciles the session on launch.
- `App/AppRootView.swift` — `.onboarding` → `OnboardingView`.
- `App/Shell/PlaceholderShellView.swift` — **temporary** account toolbar button (present login / sign-out). Auth surface only, not the Profile feature.
- `Resources/Info.plist` — registered `tappyai://` URL scheme for OAuth callbacks.

**Tests:** `AuthValidationTests`, `AnonymousSessionDecodeTests` (+ existing `SessionStoreTests` cover refresh/logout).

Total iOS Swift files: **67**.

## 2. Feature coverage (approved scope)
- [x] Session restoration (SDK session adopted on launch via `reconcileOnLaunch`)
- [x] Anonymous session (stable `POST /api/auth/anonymous` contract; token in Keychain; Bearer)
- [x] Email OTP (send + verify)
- [x] Registration (email+password, "check your email")
- [x] Google login (`ASWebAuthenticationSession` + PKCE callback)
- [x] Zalo login (single `ASWebAuthenticationSession`, existing routes)
- [x] Logout (SDK sign-out → back to anonymous session)
- [x] Session refresh (single-flight, SDK-backed)
- [x] Protected session handling (Bearer via `SessionStore` authority; onboarding gate)
- [x] Onboarding (interests + city → `POST /api/onboarding`)

Not started (correctly out of scope): Home, Chat, Maps, Explore, Music, Shopping, Travel, Notifications, Settings, Profile.

## 3. Remaining TODOs
1. **Compile + fix on a Mac (Xcode 16).** Confirm the exact **supabase-swift 2.x** API surface used in `SupabaseAuthService`/`ProfileGateService` (`signInWithOTP`, `verifyOTP`, `signUp(data:)`, `getOAuthSignInURL`, `session(from:)`, `setSession`, `refreshSession`, `Provider`, query `.execute().value`). Names may differ slightly by version.
2. **Zalo final redirect (integration point):** the backend must land the last hop on `tappyai://auth/callback?code=…` (PKCE) or `?token_hash=…&type=magiclink` so the native app finalizes the session. This is a redirect-target change on **existing** routes (no new endpoint, per D2) — coordinate with backend.
3. **First-visit language modal** (otter mascot) — deferred with i18n; the `LocalizationManager` seam exists.
4. **Universal Links** (associated domains) in addition to the custom scheme (D4); update the Supabase redirect allow-list for `tappyai://`.
5. Richer error/empty/retry polish and OTP "resend" affordance (baseline states are in place).

## 4. Blockers
1. **No macOS/Xcode here (primary, standing).** Cannot generate the project, compile, run, or test. "Compile without warnings" is **UNVERIFIED**. All code is written to be Mac-ready; treat first compile as expected cleanup.
2. **Backend dependencies (Backend + Web first, ADR-011):**
   - `POST /api/auth/anonymous` (+ refresh) must exist and quota must key on `anonymous_id`. Until then, `AnonymousSessionService` fails gracefully (anonymous browsing still works, cookieless) — **not an iOS deviation** (survey §0 governance).
   - Zalo final-redirect target (TODO #2).
   - Anon→account carry-over guarantees (history preservation, no duplicate, seamless upgrade) are backend-owned; the client only relies on them.
3. **Supabase config:** enable Google provider + anonymous sign-ins; add `tappyai://auth/callback` to the redirect allow-list; real `SUPABASE_URL`/anon key in `Config/Secrets.xcconfig`.

## 5. Parity confirmation
- **Same methods as Web:** Google (enabled), Zalo (5-hop, existing backend), Email-OTP, register, anonymous; **Facebook stays disabled**; **no password on the login screen** (register-only) — matches survey §1.1–1.6.
- **Same gating:** onboarding gate on `profiles.onboarded`; limit responses (`401 anon_limit_reached`, `429 free_limit_reached`) mapped in `AppError`/`ErrorPresenter`; all quotas/rules enforced **server-side** (no business logic on the client).
- **Same identity model:** stable anonymous-session contract; convert/merge is backend-owned (client implementation-agnostic).
- **Thin Client + Backend/Client Boundary honored:** the client does transport, routing, and input validation only. Direct Supabase use limited to the delegated RLS read (`profiles.onboarded`) per docs/ios/14 §4.
- **Native, HIG-idiomatic:** `ASWebAuthenticationSession`, native forms, Keychain tokens, DS components — same product behavior, native feel (Native Design Principle).
- **No ADR changed, no product behavior modified, no scope expanded.**

**Stop point:** Authentication implemented (pending Mac compilation + the listed backend dependencies). No other feature started.

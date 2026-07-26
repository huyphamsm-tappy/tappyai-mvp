# Domain 09 — Auth, Navigation, Onboarding, Anonymous tier

**Baseline:** current working tree (uncommitted included), read directly 2026-07-26.
**Web truth:** `79d05f3` freeze package + live `src/`.

## Verdict

Auth **transport** is genuinely at parity (Bearer attach + 401 refresh-retry + encrypted token store, all verified). The two real gaps are both product-owner-sequenced and match the freeze's BLOCKED list: **Zalo login is absent** and the **anonymous 5-q/day tier is absent** (hard login wall). One freeze-doc claim is now **stale**: `/api/config` is NOT fully ignored — onboarding already consumes it. No P0 security/transport defect found in this domain.

---

## IMPLEMENTED (verified at parity)

- **[P1] Auth transport — Bearer attach.** `AuthInterceptor` adds `Authorization: Bearer <token>` to own-API-host requests only.
  EVIDENCE Android `android/core/network/.../AuthInterceptor.kt:35-49` · Web contract `docs/.../03_Backend.md:145-150` (`getRequestUser` accepts Bearer identically to cookie). Host-scoping (`:38`) is a correct hardening beyond Web. VERIFIED — matches freeze §3.1 (11_Android_Migration.md:98-108).
- **[P1] 401 refresh-and-retry-once.** `TokenAuthenticator` refreshes via `SessionRefresher` (impl = `AuthRepository.refreshSession`) and retries once; gives up after 2 responses; handles concurrent-refresh race.
  EVIDENCE `android/core/network/.../TokenAuthenticator.kt:34-67` + `AuthRepository.kt:198-207`.
- **[P2] Encrypted token storage + cold-start session re-import.** `EncryptedTokenStorage` = `EncryptedSharedPreferences` (synchronous reads for the interceptor); `AuthRepository.sessionState` re-imports tokens into supabase-kt (in-memory-only in 3.0.3) on first collection; `currentUserId()` decodes `sub` from JWT.
  EVIDENCE `android/core/security/.../EncryptedTokenStorage.kt:25-89` · `AuthRepository.kt:75-115,218-219`. Matches freeze §3.1 (11_Android_Migration.md:110-114).
- **[P1] Google sign-in (Credential Manager → Supabase IDToken).** EVIDENCE `LoginViewModel.kt:52-70` · `AuthRepository.kt:131-139`. Web parity: Google enabled in `AUTH_PROVIDERS` (`src/lib/auth/providers.ts:8-12`).
- **[P1] Email OTP (passwordless).** Send + verify; `createUser=true` set to match Web's `shouldCreateUser:true`; `@`-presence validation mirrors Web `login/page.tsx:183`.
  EVIDENCE `AuthRepository.kt:151-166` · `LoginViewModel.kt:84-108` · `EmailOtpVerificationViewModel.kt`. Web parity `providers.ts:23-27`.
- **[P2] Onboarding catalog — 6 interests + 8 cities, config-driven.** `interestLabelResFor` maps exactly `food/spa/travel/shopping/entertainment/hotel` (6), read from `GET /api/config`; cities passed straight through from config.
  EVIDENCE Android `OnboardingModels.kt:27-35` · `OnboardingRepository.kt:37-47` · `OnboardingApi.kt:23-24`. Web truth `src/lib/config/product.ts:51-62` (identical 6 interests + 8 cities). VERIFIED at parity.
- **[P3] Onboarding gate + fail-open.** Post-login: `needsOnboarding()` from `GET /api/profile.onboarded`, fails open (skip wizard) on error, matching Web.
  EVIDENCE `AppNavHostViewModel.kt:56` · `OnboardingRepository.kt:49-56` · gate at `AppNavHost.kt:120-131`.
- **[P3] Nav shell — 5 tabs Home/Chat/Explore/Maps/Profile.** EVIDENCE `android/app/.../home/HomeTab.kt:58-68`. Web tab 4 = Deals; Android tab 4 = Maps (Deals is a Home quick-action). APPROVED divergence D4 — NOT a bug (11_Android_Migration.md:87-90, 251).
- **[P3] Deep-link registration + retained-target handling.** Manifest registers `tappyai://auth-callback` and `tappyai://group/{id}`; group deep link retained until authenticated then navigated (survives cold start / logged-out tap).
  EVIDENCE `AndroidManifest.xml:51-52,67` · `AppNavHostViewModel.kt:66-106` · `AppNavHost.kt:84-99`.

## MISSING

- **[P1] Zalo login — not implemented in Kotlin.** Web renders a Zalo button (`window.location.href = /api/auth/zalo`) and `AUTH_PROVIDERS.zalo.enabled = true`. Android `LoginScreen` renders only Google + Email; no Zalo button, no Zalo code path anywhere (grep: only doc-comment/AppConnections/CTA/ADR mentions, zero login impl).
  EVIDENCE Web `src/lib/auth/providers.ts:18-22` + `src/app/login/page.tsx:149-152` · Android `LoginScreen.kt:77-115` (only Google + Email OTP). Confirms freeze §4.3 BLOCKED (11_Android_Migration.md:187) — backend already accepts `platform=android` (03_Backend.md:36-40); needs owner-sequenced mobile token/deep-link contract. **Current truth = still unimplemented.**
- **[P1] Anonymous / guest tier — hard login wall.** Web grants anonymous users 5 questions/day (`ANON_DAILY_LIMIT = 5`, `/api/auth/anonymous`). Android never calls `/api/auth/anonymous`; unauthenticated state routes straight to Login and the NavHost start destination is Login.
  EVIDENCE Web `src/lib/config/product.ts:16` + `03_Backend.md:36` · Android — no `/api/auth/anonymous` caller (grep hits are unrelated "anonymous review" strings); wall at `AppNavHost.kt:132-134,148-152`. Confirms freeze §4.3 BLOCKED (11_Android_Migration.md:188).

## DIFFERENT BEHAVIOR

- **[P2] Auth provider list is HARDCODED in the client, not config-driven.** `LoginScreen` shows Google unconditionally, Facebook behind a local `const SHOW_FACEBOOK_LOGIN = false`, and Email unconditionally — it does NOT read `/api/config` `auth.providers`. Web renders buttons from `AUTH_PROVIDERS`. So a backend flip of a provider would not reach Android auth UI.
  EVIDENCE `LoginScreen.kt:40,77-115` (hardcoded) vs Web `login/page.tsx:370`, `product.ts:38-45`. Aligns with freeze §3.3 direction (ADR-0004 Proposed/Deferred). NOTE the AppConfigDto deliberately drops the `auth` block (`OnboardingDtos.kt:6-12`).
- **[NOTE, corrects freeze] `/api/config` is NOT "currently ignored by Android".** Freeze 11_Android_Migration.md:123 (§3.3) and 03_Backend.md:240 state Android does not consume `/api/config`. **Reality: onboarding consumes it** for interests+cities (`OnboardingApi.kt:23`, `OnboardingRepository.kt:38`). Consumption is partial (freemium/flags/upload/auth blocks still dropped), but the blanket "ignored" claim is stale.

## BUGS

- None confirmed in this domain. Transport, OTP validation, onboarding gate, and back-stack clearing on auth transitions all read correct. (`AppNavHost.kt:105-137` correctly skips re-navigating the initial cold-start state and clears the auth graph via `popUpTo(graph.id, inclusive)` on login/logout.)

## REQUIRED BACKEND CONTRACTS (owner-sequenced)

- **[P1] Zalo mobile contract.** Web's browser-on-VN-IP `graph.zalo.me` flow is unportable; needs a mobile token/deep-link handoff. Backend partially prepared: `auth/zalo/*` + `/auth/confirm` accept `platform=android` and return tokens in the URL **fragment** to `tappyai://auth-callback` (03_Backend.md:36-40, 193-196).
  **[P2] Latent mismatch — UNVERIFIED impact:** `AuthDeepLinkParser` reads the `code` **query** param only (PKCE), not fragment tokens (`AuthDeepLinkParser.kt:17-25`). Fine for supabase-kt's native Google/`handleDeeplinks` PKCE path today, but the `platform=android` **fragment**-token contract (Zalo / `/auth/confirm`) is currently unhandled and will need parser work when Zalo is wired. Note Android scheme `tappyai://auth-callback` differs from iOS `tappyai://auth/callback` (03_Backend.md:196).
- **[P1] Anonymous session contract for native.** `/api/auth/anonymous` creates a Supabase anonymous session (rate-limited 5/min + 30/day, `Retry-After`); Android would need to call it on first launch and gate the chat quota copy (backend-owned `message`, freeze §5.9). Owner must sequence per 11_Android_Migration.md:275 (Phase 4).

## GATED OFF (correct — do NOT "fix")

- **[P3] Facebook login hidden.** `const SHOW_FACEBOOK_LOGIN = false` with capability retained (`onFacebookSignInClick`/`startFacebookSignIn` intact).
  EVIDENCE `LoginScreen.kt:40,82-89` · `AuthRepository.kt:147-149`. Matches Web `AUTH_PROVIDERS.facebook.enabled = false` (`providers.ts:13-17`). Confirms freeze §4.4 (11_Android_Migration.md:199). NOT a bug.
- **[P3] No email+password registration (OTP only).** Approved divergence D5 (11_Android_Migration.md:254).

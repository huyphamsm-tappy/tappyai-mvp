# TappyAI — Android Parity Report

> **Part of the `docs/ios/` design dossier** — canonical reference for the iOS build.
> **Source of truth:** the current production **Web + Backend** codebase. Android is an implementation being brought to parity, **not** authoritative. Where Android lags Web, iOS matches **Web** and the backend APIs.
> Generated 2026-07-10 from a direct read of production code; `file:line` citations retained inline.
>
> This documents how far the **Android** implementation has progressed toward the product spec. It is a **progress report, not a scope definition** — iOS targets the full Web feature set regardless of current Android gaps.

---

# TappyAI Native Android App — Implementation Audit

**Scope:** `android/` (Kotlin / Jetpack Compose / multi-module Gradle). Purpose: document the CURRENT
implementation state as one of two reference implementations (Web + Android) for the new iOS app.
CURRENT CODE is the only source of truth. All citations are `path:line`.

**Headline finding:** The Android app is an **architectural skeleton with real Auth only**. Every
product feature except Authentication is a **UI foundation with in-memory seed data and zero backend
wiring**. The web app is the true feature-parity target; Android is far behind it and catching up
feature-by-feature. iOS should mirror Android's *architecture* but must reach *Web's* feature scope.

---

## 1. Architecture

### 1.1 Module graph
Declared in `android/settings.gradle.kts:19-32`. 14 modules:

- **`:app`** — composition root. Hosts MainActivity, Application, the root NavHost, the post-auth
  shell, and ALL feature screens that don't yet warrant their own module (Home, Chat, Maps,
  Discovery, Profile, Settings, Notifications, Music, Membership).
- **`:features:auth`** — the ONLY real feature module (has UI + ViewModel + Repository + business
  logic + its own SDK). `android/features/auth/build.gradle.kts`.
- **`:core:*`** (12 modules): `designsystem`, `common`, `logging`, `analytics`, `featureflags`,
  `network-monitor`, `navigation`, `deeplink`, `datastore`, `security`, `network`, `database`.

Dependency direction is strict Clean Architecture: `core:*` never depends on `:app`; `:app` and
`:features:auth` depend downward on `core:*`. `BuildConfig` (per-variant secrets) is the one thing
that only `:app` sees, and it is injected into the Hilt graph via `@Named` qualifiers so `core:network`
and `features:auth` stay build-variant-ignorant (`app/.../di/AppModule.kt:18-38`).

The app module still lists `PlaceholderTabScreen.kt` in source but FEATURE_STATUS says it is no longer
used — all 5 tabs have real foundations (`app/.../home/PlaceholderTabScreen.kt`,
`android/docs/FEATURE_STATUS.md:32` region of memory note).

### 1.2 DI — Hilt (Dagger)
Yes, Hilt everywhere. Plugin declared top-level (`android/build.gradle.kts:9`), applied in `:app`
(`app/build.gradle.kts:10`) and `:features:auth`
(`features/auth/build.gradle.kts:7`). Pattern:
- `@Module @InstallIn(SingletonComponent::class) object XxxModule` per core module
  (`core/network/.../NetworkModule.kt:26-28`, `features/auth/.../di/SupabaseModule.kt:27-29`,
  `app/.../di/AppModule.kt:16-18`).
- ViewModels are `@HiltViewModel` + `@Inject constructor` (`app/.../chat/ChatViewModel.kt:27-28`,
  `features/auth/.../login/LoginViewModel.kt:31-36`).
- Application is `@HiltAndroidApp` (TappyAIApplication.kt), Activity is `@AndroidEntryPoint`
  (`app/.../MainActivity.kt:24-25`).
- Cross-module config passed by `@Named` string qualifiers: `"baseUrl"`, `"isDebug"`,
  `"supabaseUrl"`, `"supabaseAnonKey"`, `"googleWebClientId"` (`app/.../di/AppModule.kt:19-38`).
- Hilt version 2.52 (`gradle/libs.versions.toml:23`).

### 1.3 Networking stack — TWO separate stacks
1. **`core:network` = Retrofit 2.11 + OkHttp 4.12 + kotlinx.serialization** for the app's OWN backend
   (`core/network/.../NetworkModule.kt`). Provides a shared `Retrofit`/`OkHttpClient` singleton with
   `AuthInterceptor` + `HttpLoggingInterceptor` (BODY level on debug, `redactHeader("Authorization")`
   to keep the JWT out of Logcat — `NetworkModule.kt:47-62`). Timeouts: 15s connect / 30s read / 30s
   write (`:57-59`).
   - **CRITICAL: NO API SERVICE INTERFACES EXIST.** Grep for `@GET`/`@POST`/`retrofit.create` across
     the whole tree finds only doc-comments, never a real endpoint. `NetworkModule.kt:18-20`
     explicitly says "No concrete `@GET`/`@POST` API service interfaces are defined here… Feature
     modules call `retrofit.create(XxxApi::class.java)` once they define their own endpoints." **They
     never have.** So this Retrofit stack is fully built but **calls nothing**.
   - `safeApiCall` (`core/network/.../SafeApiCall.kt:18-34`) maps exceptions → `NetworkResult<T>`
     (`NetworkResult.kt` / `NetworkError.kt`) — the single try/catch funnel. Built, unused by any real
     call.
2. **`features:auth` = supabase-kt (Ktor engine)** — Supabase's official Kotlin Multiplatform client,
   `auth-kt` only, scoped to auth (`features/auth/build.gradle.kts:42-45`,
   `gradle/libs.versions.toml:77-78`). This is the **only stack that actually hits a server**. Ktor
   3.0.2 is supabase-kt's HTTP engine, deliberately separate from OkHttp/Retrofit
   (`libs.versions.toml:62-78`).

Version note: supabase pinned to **3.0.3, NOT 3.5.0** — 3.5.0's transitive Ktor/stdlib were built with
Kotlin ~2.3.x, binary-incompatible with the project's pinned Kotlin 2.0.21
(`libs.versions.toml:68-77`). `SessionStatus` has exactly 4 variants in 3.0.3: Authenticated,
Initializing, NotAuthenticated, RefreshFailure (`AuthRepository.kt:50-57`).

### 1.4 Auth / session
- **`AuthRepository`** (`features/auth/.../data/AuthRepository.kt`) is the single connection point
  between Supabase sessions and `core:security`'s token storage.
  - Exposes `sessionState: Flow<AuthSessionState>` mapped from `supabaseClient.auth.sessionStatus`
    (`:50-57`). States: Loading / Authenticated / Unauthenticated (`data/AuthSessionState.kt`).
  - Sign-in paths: **Google** (native, via Credential Manager ID token — `signInWithGoogleIdToken`
    `:61-69`), **Facebook** (browser/Custom-Tab OAuth redirect, `startFacebookSignIn` `:77-79`),
    **Email OTP** (`sendEmailOtp` `:81-85`, `verifyEmailOtp` `:87-90`). Sign-out `:109-112`.
  - On every successful sign-in, `persistSession()` writes `session.accessToken` +
    `session.refreshToken` into `TokenProvider` (`:114-121`).
- **Google Sign-In** (`features/auth/.../data/GoogleSignInClient.kt`): Credential Manager +
  `GetSignInWithGoogleOption`. Correctly sends the SHA-256 **hashed** nonce to Google and the **raw**
  nonce to Supabase (`:41-73`) — a real nonce-mismatch bug that was fixed during build verification.
- **Token storage** (`core:security`): `EncryptedTokenStorage` over `EncryptedSharedPreferences`
  (AES256-GCM master key, AES256-SIV keys / AES256-GCM values) — `EncryptedTokenStorage.kt:24-56`.
  Chosen over DataStore specifically because `AuthInterceptor` needs a **synchronous** token read
  inside OkHttp's `intercept()` (`:10-23`). `prefs` is `by lazy` to defer Keystore/disk touch off the
  Hilt-graph thread. `isAccessTokenExpired()` decodes the JWT `exp` via `JwtDecoder`
  (`:58-63`, `JwtDecoder.kt` / `JwtClaims.kt`).
- **AuthInterceptor** (`core/network/.../AuthInterceptor.kt`): attaches `Authorization: Bearer <token>`
  to outgoing requests **only when the host matches our own API host** (`:32-48`) — deliberate
  host-scoping so the singleton client can never leak the Supabase JWT to a future third-party call.
  Does NOT do refresh-on-401 yet (deliberate — `:23-26`). Note: since no Retrofit endpoints exist, this
  interceptor currently never fires against a real backend.
- **Deep-link OAuth callback**: `tappyai://auth-callback` intent-filter registered on MainActivity
  (`app/src/main/AndroidManifest.xml:43-50`), matched to `SupabaseModule`'s Auth plugin
  `scheme="tappyai"` / `host="auth-callback"` (`SupabaseModule.kt:39-46`). MainActivity forwards the
  intent to `AuthRepository.handleOAuthRedirectIntent` → `supabaseClient.handleDeeplinks(intent)`
  (`MainActivity.kt:57-68`, `AuthRepository.kt:104-107`).

### 1.5 Local storage
- **Room** (`core:database`): `TappyDatabase` version 1, single entity `CachedContextEntity`
  (`core/database/.../TappyDatabase.kt:13-20`), reserved for a future offline-first `ContextRepository`.
  Built, not used by any live feature yet.
- **DataStore Preferences** (`core:datastore`): `PreferencesDataSource` /
  `DataStorePreferencesDataSource` — plain settings, Flow-based. Built, minimal use.
- **EncryptedSharedPreferences** (`core:security`) — token storage (above), the one storage actively used.

### 1.6 Navigation pattern
- **Event-bus navigation**, not a NavController holder. `TappyNavigator` interface in
  `core:navigation` (`core/navigation/.../TappyNavigator.kt`) exposes `destinations: Flow<TappyRoute>`
  + suspend `navigateTo`/`navigateBack`. Feature ViewModels inject the *interface* and emit routes;
  they never touch a NavController (`LoginViewModel.kt:33-36,91`).
- **`TappyNavigatorImpl`** (`app/.../navigation/TappyNavigatorImpl.kt:24-39`) is a `@Singleton`
  `MutableSharedFlow` bus. `backEvents` is intentionally NOT on the interface (interface frozen) — only
  `:app` sees the concrete class.
- **Root `AppNavHost`** (`app/.../navigation/AppNavHost.kt`) collects the two flows to drive the real
  `NavController`, and reactively switches between the auth graph and post-auth `HomeShell` based on
  `sessionState` (`:48-114`). Loading state shows a spinner and defers NavHost composition so Login
  never flashes (`:84-89`). Type-safe routes via Navigation-Compose 2.8 `composable<T>()` with
  `@Serializable` route objects (`AppRoute.kt`, `AuthRoute.kt`).
- **Nested NavHosts (3 levels deep in places):**
  - Root: Auth graph ↔ `AppRoute.HomeShell` ↔ `AppRoute.DesignSystemShowcase`.
  - Shell: `HomeShellScreen` owns a nested NavHost over 5 `HomeTab` routes (Home/Chat/Explore/Maps/
    Profile) — `HomeShellScreen.kt:97-110`, single-source-of-truth `HomeTab` enum
    (`home/HomeTab.kt:48-59`). Tab reselect uses `saveState`/`restoreState`/`launchSingleTop`
    (`:120-126`).
  - Tab-level: Home tab has its OWN nested NavHost (`HomeTabHost` → Music Library → Sound Detail);
    Explore tab = `DiscoveryTab` with `DiscoveryRoute.Hub` → `Category`; Profile tab = `ProfileRoute.Hub`
    → Settings / Notifications / Membership.
- Selection is always *derived* from the back stack via `NavDestination.hasRoute()`, never tracked
  separately (`HomeShellScreen.kt:52-55`).

### 1.7 Design system + theming
- **`core:designsystem`** — app-agnostic, reuse-first. Theme in `theme/Theme.kt`: wraps
  `MaterialTheme` with **Material 3 dynamic color on API 31+**, falling back to the fixed Tappy brand
  palette below API 31 (`Theme.kt:30-46`).
- **Palette** (`theme/Color.kt`): translated 1:1 from web `docs/UI_GUIDELINES.md` — primary
  `#007AFF` blue, accent `#FF9500` orange, with a deliberate WCAG deviation (dark text on orange,
  `onSecondary = Neutral900`, `Color.kt:41-60`). Full `TappyLightColors` / `TappyDarkColors` schemes
  (`:41-81`).
- **Light/dark** driven by `MainActivity` (`isSystemInDarkTheme()` default, in-memory toggle override
  `MainActivity.kt:40-51`). There is NO user-facing persistent theme setting — the Settings screen
  deliberately omits a theme toggle (web has it in a global header).
- **Type**: Inter-based scale, responsive by window width (`theme/Type.kt`,
  `Theme.kt:38,42`). **Spacing/Elevation/Shape/Motion/WindowSize** are static token objects
  (`TappySpacing`, `TappyElevation`, `TappyShapes`, `TappyContainers` — content=768dp, feed=1280dp
  width caps), not CompositionLocals (`Theme.kt:16-23`).
- **Components** (`core/designsystem/.../component/`, ~22 files): `TappyAppBar`, `TappyAvatar`
  (person-icon placeholder when name blank), `TappyBottomNavBar`, `TappyNavRail`, `TappyBottomSheet`,
  `TappyButton`, `TappyCard` (has `contentPadding` param), `TappyChatBubble` (slot-based),
  `TappyComingSoonSheet`, `TappyDialog`, `TappyEmptyState`, `TappyErrorState`, `TappyImage` (Coil),
  `TappyLoadingIndicator`, `TappyMarkdown` (dependency-free renderer), `TappyMediaCard`,
  `TappyMenuRow` (the standard settings row), `TappySearchBar`, `TappySkeleton`, `TappyTextField`
  (1–6 line auto-grow). Plus `TappyComponentPreviews`.

---

## 2. Product features: implemented vs placeholder

**Every feature below Auth is "UI Foundation Complete" = full Compose UI + ViewModel + in-memory seed
data, explicitly NO network / NO backend / NO business logic.** Source of truth:
`android/docs/FEATURE_STATUS.md` + the feature files themselves.

| Feature | State | Backend? | Evidence |
|---|---|---|---|
| **Auth** | ✅ **REAL** — the only feature that talks to a live server | Supabase (Google/Facebook/Email OTP) | `AuthRepository.kt`, `LoginViewModel.kt`, `GoogleSignInClient.kt`, `SupabaseModule.kt` |
| **Navigation shell** | ✅ Real (composition-root) | n/a | `HomeShellScreen.kt`, responsive bottom-bar↔nav-rail |
| **Home** | UI foundation only | ❌ none | `home/HomeScreen.kt` — greeting, Ask-Tappy card (rotating local prompts), quick-actions grid, honest `UiState.Empty` sections. `HomeViewModel` emits `UiState.Empty`. |
| **Chat** | UI foundation only | ❌ **NO AI, NO network** | `chat/ChatViewModel.kt:19-28` — in-memory `SAMPLE_CONVERSATION`, `onSend` shows a fake "responding" state for 2.5s then clears, **never produces a reply** (`:46-60`). Bubbles + `TappyMarkdown` + composer. |
| **Maps** | UI foundation only | ❌ **NO map SDK, NO location, NO Places** | `maps/MapsScreen.kt` — `MapCanvas` is a styled placeholder + a documented swap seam. Seeded places in `MapsViewModel`. FABs/actions → `TappyComingSoonSheet`. Responsive tablet 2-pane. |
| **Discovery (Explore tab)** | UI foundation only | ❌ none | `discovery/` — hub with 5 domain-group tiles → category drill-down, all results `UiState.Empty`. Backend-stable `id`s on `DiscoveryCategory`/`DiscoveryGroup` (`DiscoveryModels.kt:21-72`). Social feed (MFS 4.1) **deferred**. |
| **Profile + Settings** | UI foundation only | ❌ no auth/network | `profile/` — placeholder identity (never a fake user), 11 web-matched account rows, most → coming-soon. |
| **Notifications** | UI foundation only | ❌ no push/FCM/permission | `notifications/` — local toggle ViewModel only. |
| **Music** | UI foundation only | ❌ no audio/catalog/social | `music/` — seeded `MusicSampleData`, `AudioPlayer` interface + `PreviewAudioPlayer` (state-only, no real sound; Media3 swap seam). Library → Sound Detail. Upload deferred. |
| **Membership** | UI foundation only | ❌ no Stripe/billing | `membership/` — mirrors web `/subscription`, honest Free banner, Free/Pro cards, CTA → coming-soon. |
| **DesignSystem Showcase / Diagnostics** | Dev screen | n/a | `showcase/` — reference screen, reached programmatically. |

---

## 3. How Android talks to the backend

- **Supabase directly, for auth only.** Via the supabase-kt SDK (Ktor engine) inside `features:auth`.
  Nothing calls the Next.js API routes. There are **zero Retrofit endpoints** in the codebase
  (confirmed by grep — only doc comments reference `@GET`/`@POST`).
- **Next.js API base URL is configured but unused.** `API_BASE_URL` build-config per variant:
  - debug: `http://10.0.2.2:3000/` (emulator loopback to host's `localhost:3000`) —
    `app/build.gradle.kts:58`.
  - staging: `TAPPYAI_API_BASE_URL_STAGING` override, default
    `https://staging.tappyai.example.com/` (`:69-73`).
  - release: `TAPPYAI_API_BASE_URL_RELEASE`, default `https://tappyai.example.com/` (`:80-84`).
  These are placeholders; no real endpoint is wired. When feature repositories are built they will call
  `retrofit.create(XxxApi)` against this base and rely on `AuthInterceptor` for the Bearer token.
- **Supabase config** injected via `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `GOOGLE_WEB_CLIENT_ID`
  build-config fields, supplied via `-PTAPPYAI_*` Gradle properties; placeholders by default so no
  login completes without real values (`app/build.gradle.kts:34-49`).
- **Auth token flow:** Supabase session → `AuthRepository.persistSession()` → `EncryptedTokenStorage`
  → `AuthInterceptor` reads it synchronously → attaches `Authorization: Bearer <jwt>` to own-host
  requests. The interceptor comment ties this to the web backend's own `getRequestUser()` Bearer
  pattern (`AuthInterceptor.kt:12-14`), so the contract is: **same Supabase JWT the web app uses,
  presented as a Bearer token to the Next.js API.** That contract is designed but not yet exercised.
- **Permissions/manifest:** only `INTERNET` + `ACCESS_NETWORK_STATE`
  (`AndroidManifest.xml:14-15`). No location, camera, notifications permissions yet — consistent with
  the "no real features" state.

---

## 4. Build / variant / toolchain facts

- `compileSdk = 36`, `minSdk = 26`, `targetSdk = 35`, `applicationId com.tappyai.app`, versionName
  `0.1.0` (`app/build.gradle.kts:14-23`). Debug appId suffix `.debug`.
- 3 build types: debug / staging (minified, `.staging`) / release (minified). Compose + BuildConfig
  enabled. Java/Kotlin target 17 (`:52-100`).
- AGP 8.9.1, Kotlin 2.0.21, KSP 2.0.21-1.0.28, Compose BOM 2024.12.01, Nav-Compose 2.8.4, Hilt 2.52
  (`gradle/libs.versions.toml:1-79`).
- Reserved-but-unused deps (pinned, not applied): Google Maps Compose 6.4.1, Firebase BOM 33.7.0 (push),
  WorkManager, baseline-profile/benchmark, Coil (used minimally). These mark the intended future stack.
- Build/emulator workflow is documented in the memory note `project_android_build_env`: JBR-only JDK 21,
  `gradlew.bat` via `cmd //c`, AVD `TappyAI_Test`, adb + uiautomator runtime verification.

---

## 5. Feature-build workflow the owner follows

Standing rule (memory `feedback_android_feature_workflow` + `docs/BUILD_CHECKLIST.md`), per feature:

**Build the feature's full UI → Runtime verify (adb install + `am start` + uiautomator dump/grep +
screencap + logcat FATAL check) → Polish immediately in-cycle → Close → Next.**

Key owner conventions:
- **No deferred "polish phases"** — small refinements fold into each feature's own cycle.
- Feature UI lives in `:app` until it has real UI+ViewModel+Repository+business logic; only THEN does it
  earn a `features:*` module (why only `features:auth` exists).
- `FEATURE_STATUS.md` updated ONLY after build PASS + runtime PASS + owner approval — never mid-milestone.
- One screenshot per meaningful state into `android/docs/screenshots/` at the verify step.
- **Reuse-first design system**: never add a new DS component if an existing one can be extended.
- **UI Consistency Baseline v1** locked (memory): person-icon identity placeholder (never fake user),
  `TappySpacing.xl` (16dp) edge/section padding, header conventions, width caps (content 768 / feed
  1280), documented icon scale. Maps is the deliberate full-bleed exception.
- Owner roadmap order (music onward): Music → Membership → Saved → PriceTracking → Bookings →
  ChatHistory → WhatTappyKnows → AppConnections → Reviews → GroupDining.

---

## 6. Gaps — what Android has NOT built (parity target is Web)

Android is a **thin slice** of the web app. Not built at all:
- **Any real AI chat / streaming** — Chat is a UI shell with fake responses. `core:ai` module doesn't
  exist.
- **Any real Retrofit API integration** — no endpoints, no repositories calling the Next.js backend.
  The entire `core:network` Retrofit stack is dormant.
- **Real maps** (no Google Maps SDK wired), **real location**, **Places/discovery data**, **reviews/
  social feed** (MFS 4.1 explicitly deferred), **music playback/catalog/UGC upload**, **payments/
  Stripe/membership backend**, **push notifications/FCM**, **games**, and every other MFS feature
  (Saved, Price tracking, Bookings, Chat history, Memory/"What Tappy knows", App connections, Group
  dining, Currency, Translate, Scan/OCR, Weather, Fortune/Horoscope, etc.).
- **Room/DataStore** are provisioned but hold no real feature data.
- **i18n** — copy is hardcoded English; the reactive dictionary system the web has is unwired on Android.
- **Tappy mascot art** — `TappyMascot` component exists but art isn't wired (memory
  `feedback_tappy_brand_workflow`).

**Net:** iOS should treat **Web as the functional parity target** (Web has the full 54-feature MFS live);
Android demonstrates the *shell + architecture + design language* but is early. Where Android and Web
disagree on a feature's shape, Web is authoritative (owner rule for Profile/Settings/Membership).

---

## 7. iOS parity notes — patterns worth mirroring

1. **Clean Architecture layering with a strict dependency direction.** Core (design system, networking,
   security, navigation, storage) is app-agnostic and never depends on features or the composition
   root. iOS equivalent: a `DesignSystem` + `Core*` set of SPM packages, feature modules on top, app
   target as composition root.
2. **Design-system-first, reuse-first.** All UI is built from `Tappy*` components with a token system
   (spacing/elevation/shape/type/color). Brand palette `#007AFF` / `#FF9500` with the deliberate
   dark-text-on-orange WCAG rule (`Color.kt`) — iOS must carry the same palette + rule. Support light/
   dark + dynamic color analog.
3. **Same backend contract as Web:** Supabase for auth, Supabase JWT presented as
   `Authorization: Bearer` to the Next.js API (`AuthInterceptor.kt:12-14`). iOS should use the same
   Supabase project + the same Bearer-to-Next.js pattern, not invent a new auth path.
4. **Auth details to copy:** native Google Sign-In sends **hashed** nonce to Google + **raw** nonce to
   Supabase (`GoogleSignInClient.kt`); OAuth completion via custom-scheme deep link
   `tappyai://auth-callback`; encrypted synchronous token storage so the request interceptor never
   blocks.
5. **Reactive session-driven navigation:** a single `sessionState` flow switches the whole app between
   auth graph and shell (`AppNavHost.kt`). iOS: an observable auth state driving root view switching.
6. **Event-bus navigation** decoupling feature VMs from the navigator (`TappyNavigator`). Optional on
   iOS but the decoupling principle (features don't know post-auth destinations) is worth keeping.
7. **Honest empty states, never fake data.** Every unbuilt data section renders a real
   `UiState.Empty`/placeholder, never mock content or a fabricated user. iOS should adopt the same
   discipline so its "foundation" screens read as honest.
8. **Responsive by window-size class**, not device type (bottom bar ↔ nav rail; tablet 2-pane maps).
   iOS: size-class-driven layouts for iPad.
9. **Swap-seam pattern** for heavy SDKs: `MapCanvas` (maps) and `AudioPlayer`/`PreviewAudioPlayer`
   (media) are interface/placeholder seams kept OUT of the design system so the SDK never pollutes the
   app-agnostic layer. iOS: protocol-based seams for MapKit/AVFoundation.

---

## Summary (5 lines)

1. Android is a **Clean-Architecture multi-module skeleton** (14 modules, Hilt DI, Compose, event-bus
   nav, `Tappy*` design system) that is **architecturally solid but feature-empty**.
2. **Auth is the ONLY real feature** — Supabase (Google/Facebook/Email-OTP) via supabase-kt/Ktor, with
   encrypted token storage and a Bearer-to-Next.js contract; everything else is UI-foundation-only with
   in-memory seed data and explicitly no backend.
3. The `core:network` Retrofit/OkHttp stack is fully built but **dormant — zero API endpoints exist**;
   `API_BASE_URL` (debug `http://10.0.2.2:3000/`) is a placeholder never called.
4. Feature scope (Chat, Maps, Discovery, Home, Profile, Notifications, Music, Membership) is far behind
   Web; **Web is the true parity target** and Android is catching up feature-by-feature via a strict
   build→verify→polish→close→next workflow.
5. iOS should mirror Android's **layering, DS-first tokens/palette, and Supabase+Bearer backend
   contract**, while targeting **Web's full feature set**.

**Report file written to:**
`C:\Users\Admin\AppData\Local\Temp\claude\C--Users-Admin-Claude-Projects-TappyAI-tappyai-mvp\9566a3be-90cf-4c52-b0ee-d4828df1a779\scratchpad\audit\10-android.md`

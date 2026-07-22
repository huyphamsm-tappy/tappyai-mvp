# TappyAI iOS — Phase 0 Foundation: Verification Report

> Generated 2026-07-10. Foundation only — no product features. Follows the approved architecture package (`docs/ios/`). Code lives in [`ios/`](../../ios/).

## 1. What was implemented

**46 Swift files + XcodeGen project + config + resources.** No product feature (Auth/Home/Chat/etc.) was started.

| Area | Delivered | Key files |
|------|-----------|-----------|
| **Xcode project** | XcodeGen `project.yml` (app + unit + UI test targets), Debug/Release configs, strict concurrency, Swift 6 (toggleable), bundle ids, `Info.plist`, asset catalog (AppIcon/AccentColor) | `project.yml`, `Config/*.xcconfig`, `Resources/*` |
| **Folder structure** | `App / Core / DesignSystem / Resources / Tests` — single app target, no over-modularization (per instruction) | whole tree |
| **Design System** | Tokens (Colors incl. brand #007AFF/#FF9500 + adaptive light/dark, Typography w/ Dynamic Type, Spacing/Radius/Elevation), Theme (Light/Dark/System + runtime switch), Components (Button, TextField, Card, BottomSheet, Confirm dialog, Loading, Empty, Error+retry, Skeleton), Foundations (Icons, Accessibility), Previews | `DesignSystem/**` |
| **Theme** | `ThemeManager` (Light/Dark/System, persisted, runtime switching) | `Theme/ThemeManager.swift` |
| **SessionStore** | Single JWT authority: state machine, Keychain token storage, **single-flight** refresh coordinator (actor), 401 force-refresh, logout | `Core/Session/**` |
| **Networking** | `APIClient` (URLSession), `RequestBuilder`, `ResponseDecoder`, `RetryPolicy` (backoff), `AuthInterceptor` (Bearer + 401→refresh→retry-once), streaming interface (`StreamingClient` + pure `DataStreamLineParser`), error mapping → `AppError`. **No endpoint code.** | `Core/Networking/**` |
| **DI** | Lightweight `DIContainer` + `@Injected`; composition root `AppDependencies` | `Core/DI/**`, `App/AppDependencies.swift` |
| **Navigation** | `AppTab` (5-tab IA), `AppRouter` (per-tab `NavigationPath`, sheets), `DeepLinkHandler` (path→tab). No feature nav. | `Core/Navigation/**` |
| **Storage** | Keychain, UserDefaults (typed), presentation `CacheStore` (TTL, ADR-007), TemporaryStorage | `Core/Storage/**` |
| **Localization** | `LocalizationManager` (vi/en, runtime switch, RTL-ready), String Catalog `Localizable.xcstrings` | `Core/Localization/**`, `Resources/Localizable.xcstrings` |
| **Logging** | `AppLogger` over `os.Logger`, categories, Release-quiet, perf marker | `Core/Logging/AppLogger.swift` |
| **Error handling** | Global `AppError` (network/auth/streaming/validation/cancellation/offline/unexpected) + `ErrorPresenter` | `Core/ErrorHandling/**` |
| **Lifecycle** | `TappyAIApp` (@main, scenePhase), `AppDelegate` (push registration hooks, memory warning), fast launch bootstrap (F12), `onOpenURL` deep links | `App/**` |
| **Payment seam** | Read-only `EntitlementService` → `.free` (StoreKit provider deferred, ADR-006) | `Core/Payments/EntitlementService.swift` |
| **Testing** | Unit tests (stream parser, SessionStore refresh/logout, deep links), mocks/fixtures, UI launch smoke, `#Preview` infra | `TappyAITests/**`, `TappyAIUITests/**` |
| **Verification harness** | `FoundationDiagnosticsView` (theme/language switch + DS showcase + session/env/entitlement state) — a harness, not a feature | `App/Diagnostics/**` |

**Architecture conformance:** Thin Client (no business logic on device), SessionStore single authority, single-flight refresh, streaming spec, launch sequence, native SwiftUI, Payment Abstraction (read-only seam), pragmatic layering (no pass-through UseCases — none created), backend-owned logic. All honored.

## 2. What remains for Phase 1

- Add **supabase-swift** (SPM) and implement the real `TokenRefreshing` (replaces `UnavailableTokenRefreshing`) + OAuth via `ASWebAuthenticationSession` (Google/Zalo), Email-OTP, register, anonymous handling (per R1 decision).
- Build the **Auth feature** (login/register/OTP/onboarding) and the **App shell** (TabView wiring the 5 tabs), replacing `FoundationDiagnosticsView`.
- Wire the first real endpoints against `04_API_CONTRACT.md` (profile/onboarding) through the existing `APIClient`.
- First-visit language modal (otter mascot) using the existing `LocalizationManager`.
- Finalize the **minimum iOS version** (Phase 0 process, ADR-003) and, if ≥17, migrate stores to `@Observable`.

## 3. Architectural deviations

**None from the approved architecture.** Two deliberate, documented alignment choices (not deviations):
1. **`ObservableObject` (not `@Observable`)** and a **provisional deployment target of 16.0** — chosen specifically to keep the min-iOS decision open (ADR-003 alignment). Swap to `@Observable` if the target lands ≥17.
2. **`FoundationDiagnosticsView`** exists only to verify the foundation on-device — explicitly permitted ("strictly required to verify the foundation") and removed when the App shell lands.

No product features were added; no ADR was violated; no scope changed.

## 4. Blockers

1. **No macOS/Xcode in this environment (primary blocker).** The project cannot be generated (`xcodegen generate`), compiled, run, or tested here (Windows). The quality gate **"compile without warnings" is UNVERIFIED** — it must be validated on a Mac with Xcode 16. All code is written to be Mac-ready; treat a first compile pass as expected cleanup, not rework.
2. **Signing:** `DEVELOPMENT_TEAM` is empty in `project.yml` — set locally before device builds.
3. **Config placeholders:** `SUPABASE_URL`/`SUPABASE_ANON_KEY` and the Release `TAPPY_API_BASE_URL` are placeholders — inject real values via `Config/Secrets.xcconfig` (gitignored) / CI. Confirm the canonical production domain.
4. **Min-iOS decision** (Phase 0 process) still to be made — affects the `@Observable` migration and the deployment target.

## 5. How to build (on a Mac)
```bash
cd ios
brew install xcodegen        # if not installed
xcodegen generate
open TappyAI.xcodeproj
# set DEVELOPMENT_TEAM + Config/Secrets.xcconfig, then Cmd-R (run) / Cmd-U (test)
```

## 6. Stop point
Per the Phase 0 directive: **no product feature was started** (no Auth, Home, or Chat). Foundation is complete pending Mac compilation. Ready to proceed to Phase 1 once the blockers above are cleared.

---

## 7. Post-approval refinements (2026-07-10)

Phase 0 was approved with three **architecture refinements** (not feature work). All applied. File count: **50 Swift files** (+4).

### R1 — State observation seam
`Core/Observation/AppObservation.swift` introduces `AppObservableObject` / `@AppPublished` / `@AppStateObject` / `@AppEnvironmentState` aliases. All stores (`SessionStore`, `ThemeManager`, `LocalizationManager`, `AppRouter`, `AppDependencies`) and views now use the seam instead of `ObservableObject`/`@Published`/`@EnvironmentObject` directly. Migrating to the Observation framework (`@Observable`) later is localized to the seam file + store annotations; view logic is unaffected. Current implementation still uses `ObservableObject` under the hood, as permitted.

### R2 — Supabase foundation (infrastructure, unused)
Added `supabase-swift` (SPM, `project.yml`), `Core/Supabase/SupabaseClientProvider.swift`, and registered a configured `SupabaseClient` in `AppDependencies` + `DIContainer`. The client **exists but is unused** — no authentication, no queries, no repositories. It is treated as infrastructure, wired to real use in later phases.

### R3 — Root flow
`FoundationDiagnosticsView` is **no longer the app root**. Root is now **Splash → (session-driven) Root Router → `PlaceholderShellView`** (the real 5-tab `TabView` + per-tab `NavigationStack` navigation architecture, driven by `AppRouter`), which future features attach to. Diagnostics is now a **DEBUG-only** screen presented as a sheet from the shell — never the root, absent entirely in Release.

### Validation
- **No ADR changed** — no file under `adr/` was modified; R1 aligns with existing ADR-003 intent.
- **No feature added** — the shell tabs render neutral "Coming soon" placeholders; Supabase is unused; diagnostics is DEBUG-only.
- **No architecture redesign** — three localized, additive refinements.
- **Thin Client preserved** — no business logic added on-device; Supabase unused.
- **Backend ownership preserved** — no rules/quotas/pricing/ranking on the client.
- **Phase 0 remains complete** — foundation only; still pending Mac compilation (blocker §4.1 unchanged).

**Stop point reaffirmed: Phase 1 not started.**

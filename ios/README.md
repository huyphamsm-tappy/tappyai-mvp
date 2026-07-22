# TappyAI — iOS (Phase 0 Foundation + Phase 1 Auth)

Foundation + **Auth** (Supabase email-OTP / register / Google OAuth / Zalo, anonymous session, onboarding — see `Features/Auth/`, PHASE1_AUTH_REPORT). All other product tabs are placeholders. It follows the approved architecture package in [`docs/ios/`](../docs/ios/).

## Requirements (build happens on macOS)
- macOS + **Xcode 16+** (for Swift 6 / strict concurrency; falls back to Swift 5.9 if needed).
- **XcodeGen** (`brew install xcodegen`) — the `.xcodeproj` is generated, not committed.

## Generate & open
```bash
cd ios
xcodegen generate      # produces TappyAI.xcodeproj from project.yml
open TappyAI.xcodeproj
```

## Provisional build values (finalize during Phase 0)
- **Deployment target** = `16.0` is a **provisional** value chosen only so the scaffold builds broadly. The final minimum iOS version is decided **during Phase 0** via the ADR-003 process — this repo does not pre-lock it. The foundation deliberately uses `ObservableObject` (not `@Observable`) so it compiles on either 16 or 17.
- **Swift version** = `6.0` with `SWIFT_STRICT_CONCURRENCY = complete`. If tooling is older, lower `SWIFT_VERSION` to `5.9` in `project.yml`.
- **Bundle IDs** = `com.tappyai.ios` (Release) / `com.tappyai.ios.debug` (Debug).
- **Backend base URL** and **Supabase URL/anon key** are read from build settings (see `Config/*.xcconfig`) — placeholders only; inject real values locally / via CI, never commit secrets.

## Architecture guardrails (do not violate)
- **Thin Client** — no business logic here beyond client orchestration. Backend owns rules (`docs/ios/14`).
- **AI Platform v1.0** — this client must NEVER name or know an AI provider, model id, or provider
  API key. All AI goes through backend `/api/chat` (data-stream protocol). See
  `docs/architecture/AI_PLATFORM.md` (frozen law) — the same rules the Web Architecture Guard enforces.
- **SessionStore** is the single JWT authority; single-flight refresh (ADR-004/005).
- **Payment Abstraction** — only a read-only entitlement seam ships until Pro is enabled (ADR-006).
- **Native HIG** presentation, **same product behavior** as Web (`docs/ios/06`, `09 §1b`).

## Layout
```
ios/
  project.yml            XcodeGen spec (targets, configs, settings)
  Config/                Debug/Release xcconfig (env, bundle id, base URLs)
  TappyAI/
    App/                 @main app, root view, lifecycle, environment
    Core/                DI, Networking, Session, Storage, Navigation, Localization, Logging, ErrorHandling
    DesignSystem/        Tokens, Theme, Components, Foundations
    Resources/           Assets, Info.plist, String Catalog
  TappyAITests/          Unit tests + mock infrastructure
  TappyAIUITests/        UI smoke tests
```

## What is NOT included yet
Home, Chat, Explore/Feed, Deals, Profile — all product tabs beyond Auth are placeholders.
See `docs/ios/10_IOS_IMPLEMENTATION_PLAN.md` for Phase 2+.

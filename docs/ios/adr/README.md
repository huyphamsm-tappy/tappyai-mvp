# Architecture Decision Records — TappyAI iOS

ADRs capture significant, hard-to-reverse decisions for the iOS app. They are **append-only**: a decision is changed by adding a superseding ADR, never by editing history. Each ADR has: **Context · Decision · Alternatives Considered · Consequences · Future Evolution**.

All decisions are constrained by the product rule (100% parity with Web/Backend, no scope expansion) and the Native Design Principle (native HIG presentation, identical behavior).

| ADR | Title | Status |
|-----|-------|--------|
| [001](ADR-001-architecture.md) | Overall architecture (Clean Architecture + SwiftUI; pragmatic layering) | Accepted · amended 2026-07-10 |
| [002](ADR-002-navigation.md) | Navigation (TabView + NavigationStack, session-driven root) | Accepted |
| [003](ADR-003-state-management.md) | State management (MVVM + Observation/Combine; min-iOS decided in Phase 0) | Accepted · amended 2026-07-10 |
| [004](ADR-004-networking.md) | Networking (URLSession client, streaming, dual data path) | Accepted · amended 2026-07-10 |
| [005](ADR-005-authentication.md) | Authentication (Supabase JWT + Bearer, web-auth OAuth) | Accepted · amended 2026-07-10 |
| [006](ADR-006-payment-abstraction.md) | Payment abstraction (StoreKit + backend entitlements; provider deferred) | Accepted · amended 2026-07-10 |
| [007](ADR-007-caching.md) | Caching (presentation-only, never rules/prices) | Accepted |
| [008](ADR-008-offline-strategy.md) | Offline strategy (read-through cache + honest states) | Accepted |
| [009](ADR-009-media.md) | Media (AVFoundation, ±1 player window, WKWebView for SuperTux) | Accepted · amended 2026-07-10 |
| [010](ADR-010-testing.md) | Testing (unit for deterministic + parsers, snapshot DS, contract tests) | Accepted |
| [011](ADR-011-stability-before-features.md) | Stability before features (backend-first gate + parity DoD) | Accepted |

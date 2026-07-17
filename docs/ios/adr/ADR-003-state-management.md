# ADR-003 — State Management

**Status:** Accepted · **Date:** 2026-07-10

## Context
Screens are mostly server-driven (render backend outputs) with local UX state (optimistic likes, player state, form input, language/theme). Business decisions are server-side (`14`), so client state is presentation + ephemeral interaction only.

## Decision
**MVVM** with one ViewModel per screen/feature. Use **`@Observable` (Observation framework, iOS 17+)** where available, falling back to `ObservableObject`/`@Published` for iOS 16. Async work via **async/await**; event streams (chat tokens, session changes) via **Combine/`AsyncSequence`**. Optimistic UI is allowed **only** with server-confirmed revert (e.g. like/follow same-sign-delta revert, `03`/`15 §3`). Global state limited to `SessionStore`, i18n store, theme store, and an `EntitlementService` — all thin.

## Alternatives Considered
- **Redux/TCA global store** — rejected for MVP (see ADR-001); unnecessary given server-owned logic.
- **Raw `@State` everywhere** — rejected; harms testability of parsing/optimistic logic.

## Consequences
- ViewModels are unit-testable (streaming parse, optimistic revert, quota rollover math).
- Minimal global state reduces drift risk.
- Mixed `@Observable`/`ObservableObject` during the iOS 16 support window.

## Amendment — 2026-07-10 alignment (F9) · Minimum iOS decided DURING Phase 0
The minimum supported iOS version is **not locked here** and is **not** a prerequisite to starting Phase 0. It will be decided during Phase 0 after evaluating: current iPhone usage distribution in Vietnam and target markets; feature requirements; development complexity; maintenance cost; and long-term support strategy. The architecture must remain compatible with **modern SwiftUI patterns** while keeping this decision open. State-management guidance: prefer `@Observable` on whatever target is chosen; if that target must include iOS 16, retain the `ObservableObject`/`@Published` fallback app-wide for a uniform pattern. No iOS version (16 or 17) is recommended as final — only the decision process is fixed.

## Future Evolution
Drop the `ObservableObject` fallback when the min target moves to iOS 17. Introduce a per-feature store if interaction state grows.

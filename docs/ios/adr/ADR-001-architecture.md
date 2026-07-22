# ADR-001 — Overall Architecture

**Status:** Accepted · **Date:** 2026-07-10

## Context
iOS must reach 100% parity with Web on a shared backend, stay maintainable long-term, and mirror Android's proven Clean Architecture so the two native apps evolve consistently. Clients must remain thin (`14_BACKEND_CLIENT_BOUNDARY.md`).

## Decision
Adopt **Clean Architecture** with **SwiftUI-first** UI, organized as `Core/*` + `Features/*` modules (see `09 §3`). Layering per feature: **View → ViewModel (Presentation) → UseCase → Repository → data source (Supabase / TappyAPIClient)**. `Core/*` never depends on `Features/*`. No business logic in Views; no server logic in the client.

## Alternatives Considered
- **MVC / massive view controllers** — rejected: poor testability, drifts from Android.
- **TCA (The Composable Architecture)** — powerful but heavy dependency + learning curve; overkill for a parity port and adds risk. Rejected for MVP (revisit if state complexity grows).
- **VIPER** — too much boilerplate for the team size.

## Consequences
- Parallels Android's module graph → shared mental model, easier parity reviews.
- Clear seams for testing (deterministic engines, parsers) and for platform SDK swaps (media, payments, push).
- Slightly more upfront structure than a flat app.

## Amendment — 2026-07-10 review (F1) · Required before Phase 0
**Pragmatic layering — no pass-through layers.** This decision is refined to enforce the Thin Client philosophy (`14`). The default per-feature layering is **View → ViewModel → Repository → data source**. A **UseCase object is introduced ONLY where genuine client-side business logic exists** — e.g. feed player orchestration, chat stream assembly/marker extraction, optimistic same-sign-delta revert, the deterministic fortune/split-bill engines, entitlement resolution. A UseCase that merely forwards a call to a Repository is a pass-through and is **forbidden** — call the Repository directly. Every layer must justify its existence; if it cannot, it is removed. This supersedes the mandatory UseCase layer described above.

## Future Evolution
If cross-cutting state grows (e.g. complex feed/session coordination), a lightweight unidirectional store can be introduced per-feature without rewriting the layering. TCA remains an option behind the ViewModel boundary.

# ADR-011 — Stability Before Features

**Status:** Accepted · **Date:** 2026-07-10

## Context
TappyAI is **one product** delivered on Web, Android, and iOS. The greatest long-term risk is not a missing feature — it is the three platforms **drifting apart** or a platform shipping unstable/half-built behavior to chase feature count. Architecture exists to preserve product consistency over a 5–10 year life. This ADR encodes the ordering discipline that protects that.

## Decision
**Stability and product consistency take precedence over feature expansion.** Before any new feature is introduced on any client, the following gate must be satisfied **in order**:

1. **Backend support must exist** — the server owns the logic; it lands first.
2. **API Contract must be finalized** (`04_API_CONTRACT.md` updated).
3. **Business Rules must be updated** (`03_BUSINESS_RULES.md`).
4. **Documentation must be updated** (the affected dossier docs — documentation is part of the product).
5. **The existing implementation must be production-ready** (Web, the source of truth).
6. **Only then** may parity implementation begin on the remaining platforms.

### Architecture principles
- Stability always comes before feature expansion.
- Product consistency is more important than platform-specific innovation.
- Feature parity is more important than platform-exclusive capabilities.
- The backend remains the owner of business logic; clients remain thin (`14`).
- Documentation is part of the product.
- **No platform may independently redefine product behavior.**

### Definition of Done
A feature is complete only when **all** hold:
- Backend complete
- Web complete
- Android complete
- iOS complete
- API Contract updated (`04`)
- Business Rules updated (`03`)
- Documentation updated
- QA passed
- Feature Parity Checklist passed

(This aligns with, and reinforces, the Definition of Done in `13_PARITY_GOVERNANCE.md §9`.)

## Alternatives Considered
- **Platform-parallel feature racing** (each client builds features independently) — rejected: guarantees drift and behavior divergence.
- **Client-first prototyping of product behavior** — rejected: violates the Thin Client boundary (`14`); product behavior must originate server-side.
- **Ship-then-document** — rejected: undocumented behavior is undefined behavior for the other platforms.

## Consequences
- New product behavior always flows Backend → Web → Android/iOS, never the reverse.
- Slightly slower to introduce a brand-new feature, but the three platforms never diverge and never ship half-built behavior.
- Documentation stays authoritative because it is a gate, not an afterthought.

## Future Evolution
If the team grows and platforms are staffed in parallel, the gate can allow Android and iOS parity work to begin **concurrently** once steps 1–5 are complete — but never before the backend + Web + contracts + docs are done.

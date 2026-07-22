# ADR-010 — Testing

**Status:** Accepted · **Date:** 2026-07-10

## Context
Parity depends on identical behavior and correct contract handling. The highest-value, highest-risk logic is deterministic or contract-bound: the chat stream parser, VN-midnight quota math, the ported fortune engine, split-bill, optimistic revert, and the API contract itself.

## Decision
Layered testing:
1. **Unit tests** for deterministic/pure logic: streaming line-parser + marker extractor (golden captured streams), VN UTC+7 quota rollover math, fortune engine (byte-identical to Web fixtures), split-bill, optimistic same-sign-delta revert, error mapping.
2. **Snapshot tests** for the DesignSystem components in **light and dark**.
3. **Contract tests** against a **staging Next.js/Supabase**: auth Bearer round-trip, feed pagination shape, upload token flow, like/save/follow toggles, error codes — to catch backend drift (R10).
4. **Manual device UAT** each phase (owner workflow) focused on the feed player state machine (R4), audio session, permissions, and push deep links.
5. **Parity QA script** (`13 §8`) run cross-platform for each locked feature.

CI runs unit + snapshot + contract on every PR; device UAT is gated per phase.

## Alternatives Considered
- **Heavy UI automation (XCUITest) for everything** — rejected as primary: brittle and slow; reserved for a few critical smoke flows (login, post a review, send a chat).
- **No contract tests** — rejected: backend drift is a top risk (R10).

## Consequences
- Confidence in the fragile parser/quota/engine code and in contract conformance.
- Some device-only behaviors (media/audio) still require manual UAT.

## Future Evolution
Add XCUITest smoke flows for the top 3 journeys once screens stabilize. Wire contract tests to a backend contract published from `04`.

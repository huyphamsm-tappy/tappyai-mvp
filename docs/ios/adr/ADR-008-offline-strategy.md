# ADR-008 — Offline Strategy

**Status:** Accepted · **Date:** 2026-07-10

## Context
Web assumes connectivity; it degrades with honest empty/error states rather than a full offline mode. iOS should match that behavior while using the presentation cache (ADR-007) to soften transient drops. No product feature requires offline authoring.

## Decision
**Read-through cache + honest states, no offline write queue** (matches Web). When online: fetch fresh, update cache. When offline/failed: show the last cached presentation data if available, else a native **empty/error state with retry** (`06`). Mutations (like/post/comment/upload) require connectivity: attempt online, use optimistic UI with **server-confirmed revert**, and surface a clear failure if offline. The deterministic local tools (fortune, split-bill, QR) work fully offline by design. Chat, feed writes, uploads, and anything rule-bound are **online-only**.

## Alternatives Considered
- **Full offline-first with sync engine** — rejected: exceeds Web parity, adds large complexity and drift risk, unnecessary for the product.
- **Hard-fail on any offline** — rejected: worse UX than showing cached reads.

## Consequences
- Matches Web's behavior exactly; low complexity.
- Users get cached reads + clear retry; no silent data loss (no queued writes to reconcile).

## Future Evolution
If the product later adds offline drafts (Web-first), introduce a bounded outbox with conflict rules. Not in MVP.

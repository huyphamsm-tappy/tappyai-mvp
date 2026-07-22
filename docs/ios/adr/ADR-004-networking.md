# ADR-004 — Networking

**Status:** Accepted · **Date:** 2026-07-10

## Context
The app has **two data paths** (`14 §4`): direct Supabase (anon key, RLS) for public/self-scoped data, and Next.js API (Bearer) for privileged logic. `/api/chat` streams the Vercel AI-SDK data-stream line protocol (`04 §chat`). Uploads are multipart → Vercel Blob.

## Decision
Build a thin **`TappyAPIClient` over `URLSession`** that (1) attaches `Authorization: Bearer <supabase-jwt>`, (2) exposes typed endpoints matching `04_API_CONTRACT.md`, (3) maps documented error codes (`401 anon_limit_reached`, `429 free_limit_reached`, `409`, `400`) to typed errors, and (4) consumes streams via `URLSession.bytes` with a **newline-buffered line parser** (`0/9/a/e/d` prefixes) plus a marker extractor. Use **supabase-swift** for the direct RLS path. Multipart uploads request a Blob token from `/api/upload/*` then upload direct. No third-party networking framework (no Alamofire) unless a concrete need appears.

## Alternatives Considered
- **Alamofire** — convenient but unnecessary; URLSession covers streaming/multipart and reduces dependencies.
- **GraphQL/OpenAPI codegen** — backend is REST route handlers; a hand-written typed client is simpler and matches the contract doc.
- **Everything through Next.js (no direct Supabase)** — rejected: Web reads catalog/feed directly; duplicating via API would diverge and add load.

## Consequences
- Minimal dependencies; full control over streaming.
- The contract doc (`04`) is the single spec; client stays in sync via contract tests (ADR-010).
- Requires careful stream-parser testing (R3).

## Amendment — 2026-07-10 review (F3, F4, F10)
**Token authority & refresh (F4) · Required before Phase 0.** `SessionStore` is the single owner of the JWT. `TappyAPIClient` reads the token from `SessionStore` at call time (never a cached copy). Refresh is **single-flight** (concurrent expiries coalesce into one refresh). A response interceptor implements **401 → refresh-once → retry-once**, then surfaces failure. The same `SessionStore` JWT feeds both supabase-swift and `TappyAPIClient` so the two data paths never diverge.

**Streaming resilience & cancellation (F3) · Required before Phase 2.** The stream consumer is two-stage: (1) a newline-framed decoder tolerant of **partial lines split across network chunks**; (2) a **stateful marker extractor that buffers until a marker closes** (`[TAPPY_PLAN]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]`) and, on malformed JSON, **falls back to rendering the raw text** — it never crashes and never drops the message. The in-flight stream **task is cancelled** when the user leaves the chat screen (no leaked tasks / wasted tokens). Golden-file + fuzz tests are a merge gate (see ADR-010).

**Client generation (F10) · Long-term optimization.** Keep the hand-written client for MVP. Finish `04_API_CONTRACT.md` to field level for the endpoints Phases 0–3 touch. Adopt OpenAPI-driven generation only when endpoint churn justifies it.

## Future Evolution
If endpoints proliferate, introduce lightweight code-gen from a formalized OpenAPI (see the `04` gap note). Add retry/backoff policy centrally.

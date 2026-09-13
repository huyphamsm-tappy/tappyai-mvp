# ADR-028 — Commerce Capability Platform (CCP) is an isolated, provider-agnostic module

**Status:** ✅ ACCEPTED — owner decisions D1–D11 confirmed 2026-09-13.
**Base:** `77b0bb7`, branch `feat/ccp-mvp` (worktree `.worktrees/ccp-mvp`).
**Inputs:** CCP Technical Architecture Plan v1 · CCP Implementation Readiness Review v1 · Transaction Depth Audit (13 Sep 2026).

## Context

TappyAI's product goal for commerce is *transaction depth*, not affiliate coverage:
the AI understands the request → the best provider is chosen → the deepest URL the
merchant honours for that exact request is generated → the user is handed to the
merchant, which owns authentication, CAPTCHA, payment and confirmation.

The repository at `77b0bb7` builds commerce links in three unrelated places
(`src/lib/platformLinks/*` search-level builders, `src/lib/ai/tools/*` marketplace
search links, prompt rule 18) with no notion of depth, freshness, authentication
boundary or tracking, and a hard-coded platform list that contradicts the verified
provider set (Tiki removed, TikTok Shop approved, DMX / Trip.com / PasGo / CGV /
Klook absent).

## Decision

1. **One module, `src/lib/ccp/`,** owns everything from an `Offer` onward: the
   provider registry (audit-verified facts), adapters (URL grammars), the Deep Link
   Resolver, validation, the optional affiliate wrapper, ranking, CTA projection and
   audit events. The AI layer, tools and clients consume `CommerceLink`s; they never
   spell a merchant host. Enforced by `scripts/architecture/check.mjs`
   (`no-commerce-merchant-hosts-outside-ccp`, `no-affiliate-keys-outside-ccp-tracking`)
   and `src/lib/ccp/ccpBoundary.test.ts`.
2. **Affiliate is optional** (D4). The direct URL is built first and is always the
   fallback. The ACCESSTRADE Deep Link endpoint is the only wrapper; it is applied
   only when the decoded destination equals the direct URL parameter for parameter
   (param echo). The Product Link tool is prohibited for Trip.com.
3. **Depth is a profile, not a number** (`guestDepth`, `authenticatedDepth`,
   `bestPossibleDepth`, `authRequiredAt`, `verifiedOn`, `evidence`). L5 never means
   TappyAI pays; it is the verified pre-payment boundary.
4. **Freshness is a contract** (`source`, `retrievedAt`, `expiresAt`,
   `freshnessType`, `confidence`) with per-provider TTLs in the registry; static
   data is never labelled realtime; registry confidence decays after 30 days.
5. **Ranking** uses the versioned weights of D3 with monetisation capped at 0.05;
   hard filters (rights, validation, guest-path policy) run before scoring.
6. **Rights gates** (D7): ACCESSTRADE feed fields are not displayed until the
   written data-rights confirmation is on file; feed merchants are link-only.
7. **Feed transport** (D6): authenticated HTTPS only; `datafeed.accesstrade.me`
   (expired certificate) is treated as unavailable; no plain HTTP; no TLS bypass.
8. **Audit events** (D5): six typed events to a server-side sink with a closed
   field set and PII/URL rejection; never `public.user_events` (those rows feed the
   AI behaviour rollup).
9. **Flags** live in `src/lib/config/product.ts` (`CCP_ENABLED=false` until the
   release gate passes; per-adapter gates; feed display/ingest off).

## Consequences

- `src/lib/platformLinks/*`, the marketplace links in `tools/shopping.ts` and prompt
  rules 15/18 are **legacy** and will be replaced by CCP-backed resolution in a
  single three-client change (D2) — Phase 6, after owner approval of the seams.
- `internal_booking` is never used by CCP; the legacy `/api/bookings` record-only
  flow stays untouched until the restaurant path migrates to PasGo.
- The committed tree at `77b0bb7` does not include `src/lib/observability/events.ts`
  (it exists only untracked in the owner's checkout); CCP therefore carries its own
  sink with the same discipline and a writer seam for the shared sink once committed.
- Every phase completes only as IMPLEMENTED → TESTED → PRODUCTION VERIFIED → OWNER
  APPROVED (Release Gate).

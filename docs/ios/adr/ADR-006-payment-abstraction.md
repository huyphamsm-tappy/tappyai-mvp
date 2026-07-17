# ADR-006 — Payment Abstraction

**Status:** Accepted · **Date:** 2026-07-10

## Context
Web sells Pro (99K/mo) via Stripe card checkout. Apple Guideline 3.1.1 requires StoreKit for in-app digital subscriptions. Entitlements must be identical across Web/Android/iOS. Pro is currently **gated OFF** (`SHOW_PRO_UPGRADE=false`), so MVP has no purchase surface (`03`, `09 §6`).

## Decision
Adopt a **Payment Abstraction Layer**: the **backend owns entitlements** (`subscriptions`/entitlement table with a `source` column); each platform plugs its own provider (Web→Stripe, Android→Play Billing, iOS→**StoreKit 2**). On iOS, purchase/restore via StoreKit → send the signed JWS transaction to a backend **`/api/iap/apple/verify`** endpoint (to be added) → backend verifies with Apple (App Store Server API / Server Notifications v2) → writes the **same entitlement row** all platforms read. Product logic never branches on provider; only the purchase UI differs. Client never trusts local purchase state as authoritative — the server entitlement is the truth. **MVP: build the seams, ship no purchase surface (Pro OFF).**

## Alternatives Considered
- **Embed Stripe in iOS** — rejected: App Store violation for IAP-governed subscriptions.
- **Client-trusted StoreKit entitlement (no server verify)** — rejected: insecure, un-unifiable across platforms.
- **Separate iOS entitlement store** — rejected: causes cross-platform drift; contradicts unified entitlements.

## Consequences
- Cross-platform entitlement parity; Apple-compliant.
- Requires a backend delta (verify endpoint + `source` column + Server Notifications handler) before Pro is enabled — additive, doesn't affect Web/Android.
- Restore-purchases + receipt refresh handled by the StoreKit provider.

## Amendment — 2026-07-10 review (F2) · Recommended after MVP
**Do not build the StoreKit provider or purchase UI while Pro is OFF.** For MVP, implement **only the `EntitlementService` protocol that reads the server entitlement** (needed anyway to gate features). Defer `StoreKitProvider`, the purchase/restore UI, and the backend Apple-verify endpoint until Pro is enabled product-wide — building them now is premature (StoreKit APIs/receipt flows will shift). No `Core/Payments` implementation code ships in the MVP beyond the read-only entitlement seam.

## Future Evolution
When Pro turns on, wire the StoreKit provider + backend verification. Support promotional offers / intro pricing through the same abstraction if the product adds them (Web-first).

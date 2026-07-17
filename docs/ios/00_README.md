# TappyAI — iOS Design Dossier (`docs/ios/`)

Generated **2026-07-10** from a full, direct read of the current production codebase (Web + Backend) and the in-progress native Android app. This dossier is the **single source of truth** for building the iOS application at **100% feature parity** with Web.

## Governing principles

1. **Source-of-truth hierarchy.** The latest production **Web + Backend** codebase is authoritative. **Android is an implementation being brought to parity — it is NOT a source of truth.** Where Android lags Web because a feature is still under development, iOS follows **Web + the backend APIs**. iOS must match the *final product specification*, never a temporary implementation gap.
2. **Same product, three platforms.** Web = Android = iOS in behavior, business logic, API usage, navigation, permissions, and product rules. Platform-specific code exists only where the OS demands it (UI, permissions, lifecycle, media, notifications, storage, payments).
3. **No scope expansion.** No new features, no redesigns, no iOS-exclusive capabilities (Live Activities, Dynamic Island, Siri, Widgets, Watch, etc. are **Future Enhancements**, excluded from MVP).
4. **Payment Abstraction Layer.** Backend owns **entitlements**; each platform plugs in its own provider (Web → Stripe, Android → Google Play Billing, iOS → StoreKit/IAP). See `09_IOS_ARCHITECTURE_BLUEPRINT.md`.
5. **Native Design Principle.** 100% parity of behavior/rules/flows/API/permissions/subscription/AI — but **NOT** pixel-perfect visual parity. iOS follows Apple HIG with idiomatic SwiftUI. It must *feel like an iPhone app while behaving exactly like the Web product.* See `09 §1b` and `06`.

## Document set

| # | Document | Purpose |
|---|----------|---------|
| 01 | [Product Specification](01_PRODUCT_SPECIFICATION.md) | What the product is: modules, flows, platform strategy, cross-cutting concerns. |
| 02 | [Feature Inventory](02_FEATURE_INVENTORY.md) | Exhaustive checklist of every production feature iOS must ship. |
| 03 | [Business Rules](03_BUSINESS_RULES.md) | Every limit, quota, gate, permission, moderation & safety rule (with enforcement points). |
| 04 | [API Contract](04_API_CONTRACT.md) | Every backend endpoint: method, auth, request/response, errors, limits, streaming. |
| 05 | [Database Contract](05_DATABASE_CONTRACT.md) | Schema, RLS, triggers, RPC, storage, and the iOS RLS boundary. |
| 06 | [UI/UX Spec](06_UI_UX_SPEC.md) | Navigation, interaction states, overlays, animations, theme — with iOS-native equivalents. |
| 07 | [Architecture Audit](07_ARCHITECTURE_AUDIT.md) | How Web and Android are built today; patterns iOS should mirror. |
| 08 | [Android Parity Report](08_ANDROID_PARITY_REPORT.md) | How far Android has progressed (progress report, not scope). |
| 09 | [iOS Architecture Blueprint](09_IOS_ARCHITECTURE_BLUEPRINT.md) | Proposed iOS architecture incl. Payment Abstraction Layer. |
| 10 | [iOS Implementation Plan](10_IOS_IMPLEMENTATION_PLAN.md) | Phased build plan mapped to the feature inventory. |
| 11 | [Consistency Review](11_CONSISTENCY_REVIEW.md) | Cross-document consistency matrix + resolved inconsistencies. |
| 12 | [Go / No-Go](12_GO_NO_GO.md) | Final readiness assessment for iOS implementation. |
| 13 | [Parity Governance](13_PARITY_GOVERNANCE.md) | How Web/Android/iOS stay the same product; workflows + Definition of Done. |
| 14 | [Backend/Client Boundary](14_BACKEND_CLIENT_BOUNDARY.md) | Client vs backend responsibilities; logic that stays server-side forever. |
| 15 | [Migration Strategy](15_MIGRATION_STRATEGY.md) | Per-module Web→iOS mapping (migration, not redesign). |
| 16 | [Risk Register](16_RISK_REGISTER.md) | Living risks: auth, StoreKit, streaming, media, push, review, etc. |
| 17 | [Architecture Review](17_ARCHITECTURE_REVIEW.md) | Independent adversarial review + scores + Go/No-Go for Phase 0. |
| 18 | [Review Actions](18_REVIEW_ACTIONS.md) | Applied fixes from the review, each classified P0/PF/RA/LT. |
| — | [ADRs](adr/) | Architecture Decision Records ADR-001…011 (001/003/004/005/006/009 amended 2026-07-10; 011 Stability-Before-Features added). |

## Key facts every iOS engineer must internalize (TL;DR)

- **Backend:** Supabase (Postgres + Auth + RLS) for data; **Next.js 14 API routes** for all privileged logic; **Vercel Blob** (not Supabase Storage) for all media.
- **Auth:** Supabase JWT. Native clients authenticate with `Authorization: Bearer <supabase-jwt>` — the backend's `getRequestUser()` reads Bearer, so most routes work for native. **Some limits are cookie-only and must be re-implemented server-side for native** (see 03 & 04).
- **AI:** AI runs behind the backend's **provider-abstracted AI capability layer** (`docs/architecture/AI_PLATFORM.md`); keys live server-side in the provider layer only. Native clients never name or know a provider/model. `/api/chat` streams the **Vercel AI SDK data-stream line protocol** (not SSE) — iOS needs a custom line parser. Structured markers (`[TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`) are embedded in the text stream.
- **Place data:** OSM/Overpass substrate; images from Serper gstatic thumbnails (not Google Places photos). No embedded map — outbound Google Maps links.
- **Subscription:** Pro (99K/mo) is currently **gated OFF** (`SHOW_PRO_UPGRADE=false`). MVP iOS can ship with **no purchase surface** and still match Web. When enabled, iOS must use **StoreKit**, not Stripe.
- **Languages:** exactly **vi + en** (UI). AI reply language is auto-detected per message, independent of UI language.

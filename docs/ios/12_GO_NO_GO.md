# TappyAI — iOS Architecture Package: Go / No-Go

> Part of the `docs/ios/` design dossier. Final readiness assessment before any Swift code is written. Assessed 2026-07-10.

## 1. Completeness checklist

| # | Item | Status | Evidence |
|---|------|:------:|----------|
| 1 | Product Specification complete | ✅ | `01_PRODUCT_SPECIFICATION.md` |
| 2 | Feature Inventory complete | ✅ | `02_FEATURE_INVENTORY.md` (every module, checklist) |
| 3 | Business Rules complete | ✅ | `03_BUSINESS_RULES.md` (quotas, gating, moderation, AI safety, enforcement points) |
| 4 | API Contract complete | ✅* | `04_API_CONTRACT.md` (all ~70 endpoints + core specs + auth map). *Non-core field-level bodies expandable from audit sections before freezing the network layer.* |
| 5 | Database Contract complete | ✅ | `05_DATABASE_CONTRACT.md` (~30 tables, RLS, triggers, RPC, storage, iOS boundary) |
| 6 | UI/UX Specification complete | ✅ | `06_UI_UX_SPEC.md` (states, overlays, theme, nav + iOS-native map) |
| 7 | Architecture Blueprint complete | ✅ | `09_IOS_ARCHITECTURE_BLUEPRINT.md` (+ Native Design Principle §1b) |
| 8 | Implementation Plan complete | ✅ | `10_IOS_IMPLEMENTATION_PLAN.md` (8 phases, DoD-aligned) |
| 9 | ADRs complete | ✅ | `adr/ADR-001…010` (Context/Decision/Alternatives/Consequences/Future) |
| 10 | Risk Register complete | ✅ | `16_RISK_REGISTER.md` (18 risks, owners, status) |
| 11 | Migration Strategy complete | ✅ | `15_MIGRATION_STRATEGY.md` (per-module Web→iOS) |
| 12 | Backend/Client Boundary complete | ✅ | `14_BACKEND_CLIENT_BOUNDARY.md` (server-forever logic) |
| 13 | Parity Governance complete | ✅ | `13_PARITY_GOVERNANCE.md` (workflows + Definition of Done) |
| 14 | Cross-document consistency verified | ✅ | `11_CONSISTENCY_REVIEW.md` (matrix + resolutions) |
| 15 | Architecture Audit (Web+Android) complete | ✅ | `07_ARCHITECTURE_AUDIT.md`, `08_ANDROID_PARITY_REPORT.md` |

**No checklist item is incomplete.** Item 4 carries one bounded, tracked enhancement (field-level expansion of non-core endpoints), which does not block implementation start — the endpoint set, auth model, streaming protocol, and all core contracts are fully specified.

## 2. Open decisions to make at kickoff (not blockers to the package)

These require a human/backend decision, not more documentation. They are captured in the risk register and blueprint:

1. **Minimum iOS version** — decided **during Phase 0** via a documented process (VN/target-market usage data, feature needs, dev complexity, maintenance cost, long-term support); **not pre-locked**, does not block starting. SuperTux imposes a WKWebView floor ≥15.2. — R17
2. **Native anon-chat quota** — server-authoritative token vs login-required chat (cookie unusable natively). — R1
3. **Backend deltas** (only when needed): APNs dispatch case + device tokens (for push); Apple IAP verify endpoint + entitlement `source` column (only when Pro is enabled). — R2/R8
4. **Copy reconciliation** on Web before store review: "SuperTux" (not "7 games"). — R14/R18. (15/day copy: ✅ RESOLVED 2026-07-11 — `/subscription` copy + remaining counter updated to 15/day on web.)
5. **SuperTux WebView acceptability** on iOS / App Store. — R14/R17

## 3. Guardrails confirmed

- ✅ 100% parity target (feature, business-rule, workflow, API, permission, subscription, AI behavior).
- ✅ No invented features; no removed features; no simplified workflows; no iOS-exclusive MVP capabilities (Live Activities/Widgets/Siri/etc. = Future Enhancements, excluded).
- ✅ Source of truth = Web + Backend; Android non-authoritative.
- ✅ Payment Abstraction Layer defined; StoreKit-not-Stripe; unified entitlements.
- ✅ Native Design Principle: HIG-native presentation, identical behavior.
- ✅ Thin client; server-side-forever logic enumerated.

## 4. Verdict

# ✅ READY FOR iOS IMPLEMENTATION

The architecture package is complete, internally consistent, and production-ready as the authoritative reference for the iOS build. Implementation may begin at **Phase 0** (`10_IOS_IMPLEMENTATION_PLAN.md`): project scaffold + DesignSystem + Network/Auth core.

The five kickoff decisions in §2 should be answered as Phase 0/1 proceeds; none block starting the foundation. All work is governed by `13_PARITY_GOVERNANCE.md` and the Definition of Done.

**Recommended first action:** begin Phase 0, and in parallel get owner/backend answers to the §2 decisions (especially R1 anon-quota and the min-iOS/SuperTux question).

> **Update 2026-07-10 (alignment):** the independent review (`17`) and its applied actions (`18`) are complete. All **P0** architectural fixes (F1 pragmatic layering, F4 token authority, F12 launch sequence) are encoded in the ADRs/blueprint. The **minimum-iOS version is intentionally left open and decided during Phase 0** (documented process) — it does **not** block starting foundation work. One item is flagged for **compliance investigation** before any implementation: **R19 UGC block/hide** — verify whether mandatory under current App Store guidelines; if so, implement backend→Web→Android→iOS at parity (never iOS-only). ADR-011 (Stability Before Features) added. Verdict stands: **Phase 0 may begin.**

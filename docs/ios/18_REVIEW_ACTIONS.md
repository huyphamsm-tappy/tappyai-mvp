# TappyAI — Architecture Review: Applied Actions & Classification

> Part of the `docs/ios/` design dossier. Resolves the findings in `17_ARCHITECTURE_REVIEW.md`. Every change is classified by **when it is needed**, and marked **APPLIED** (encoded into the docs now) or **DEFERRED/DECISION** (tracked, acted on at the right time). Only changes that strengthen the existing product **without expanding scope** are applied.

## Guardrails honored
- **No product scope added.** The only product-touching item (F6) is **not** added on recommendation. It is flagged as a **Compliance Investigation**: verify whether the current TappyAI feature set actually requires UGC block/hide/report-user under the latest App Store Review Guidelines. **Only if verified mandatory** is it implemented — and then **backend → Web → Android → iOS** at 100% parity, never iOS-only. Platform guidelines alone are not sufficient justification.
- **Thin Client preserved.** Layering refined so **UseCase objects exist only where genuine client-side business logic exists**; pass-through layers are forbidden.
- **No premature abstraction.** StoreKit provider and API-client codegen are explicitly deferred.

## Classification key
- **P0** = Required before Phase 0
- **PF** = Required before the related feature implementation
- **RA** = Recommended after MVP
- **LT** = Long-term optimization

## Actions

| # | Finding | Action taken | Class | Status | Where |
|---|---------|--------------|:----:|--------|-------|
| F1 | UseCase pass-through vs Thin Client | Pragmatic layering: `View→ViewModel→Repository→data`; UseCase only for real client logic; pass-through forbidden | **P0** | ✅ APPLIED | ADR-001 amend, `09 §4c`, `14 §2b` |
| F9 | Undecided min-iOS → dual state idiom | Min-iOS **left open**, decided *during* Phase 0 via documented process (no version pre-locked); keep modern-SwiftUI-compatible; pick state idiom once target set | **P0** (process, not a lock) | ✅ APPLIED | ADR-003 amend |
| F4 | No single token authority | `SessionStore` sole JWT owner; single-flight refresh; 401→refresh-once→retry; one token feeds both data paths | **P0** | ✅ APPLIED | ADR-004 amend, ADR-005 amend |
| F3 | Streaming parser under-specified | Two-stage tolerant decoder + buffered marker extractor + raw-text fallback + stream cancellation + golden/fuzz gate | **PF** (Chat / Phase 2) | ✅ APPLIED (spec) | ADR-004 amend |
| F5 | Native anon-chat quota hole | Decide server anon/device token vs login-required chat; backend implements | **PF** (Chat / Phase 2) | ⏳ DECISION | ADR-005 amend, R1 |
| F12 | Undefined launch sequence | Sync Keychain route → instant locale/theme → async refresh+entitlement; never block first frame | **P0/PF** (App shell, Phase 0–1) | ✅ APPLIED | `09 §4b` |
| F8 | AVPlayer retained across `TabView` | Tear down/pause feed players on tab-deselect + `scenePhase` background | **PF** (Feed / Phase 3) | ✅ APPLIED (spec) | ADR-009 amend |
| F7 | Progressive MP4 feed | ±1 prefetch + bounded buffer + concurrency cap (MVP); backend HLS transcode (future) | **PF** (prefetch) / **LT** (HLS) | ✅ APPLIED (spec) | ADR-009 amend |
| F6 | UGC block/hide missing (App Store 1.2) | **Compliance Investigation Required**: verify necessity under current guidelines. If mandatory → implement backend→Web→Android→iOS at parity (never iOS-only), minimal scope, + EULA terms; report already exists. | **PF** (investigate before submission) | ⏳ INVESTIGATE | This doc §F6, R19 |
| F2 | StoreKit provider built while Pro OFF | Ship **only** the read-only `EntitlementService` seam; defer provider/purchase UI/verify endpoint until Pro on | **RA** | ✅ APPLIED (deferral encoded) | ADR-006 amend |
| F10 | Hand-written client drift over years | Finish `04` field-level for Phase 0–3 endpoints now; OpenAPI codegen later | **PF** (field-level) / **LT** (codegen) | ✅ APPLIED (policy) | ADR-004 amend, `04 §4` |
| F14 | Fortune/split-bill "byte-identical" untested | Generate Web fixtures (input→output), assert in CI as a hard gate | **PF** (Tools / Phase 5) | ⏳ PLANNED | ADR-010, `16 R?` |
| F15 | Contract tests assume staging that may not exist | Confirm/provision staging; else mock-server from `04` + read-only prod smoke | **PF** (testing infra) | ⏳ DECISION | ADR-010 |
| F12b | (covered by F12) | — | — | — | — |
| F11 | `Features/Tools` grab-bag | Optional split into Tools/Local · Tools/Remote · Tools/Game | **RA** | ⏳ OPTIONAL | `09 §3` note |
| F13 | Custom i18n vs String Catalogs | Use native **String Catalogs** + `@AppStorage` locale override (runtime vi/en switch), keep per-message AI language rule | **PF** (i18n / Phase 0–1) | ⏳ PLANNED | `06`, `15 §9` |

Minor (P3, no action): fortune-telling framing (low review risk); Sign in with Apple 4.8 likely satisfied by Email-OTP (verify at submission); brief stale social-state from cache (acceptable).

## F6 — Compliance Investigation Required (do NOT add speculatively)
App Store Guideline 1.2 asks UGC apps to provide content filtering, a **report** mechanism (already exists), the ability to **block abusive users / hide content**, and action on reports within 24h. TappyAI has report + takedown but no user-block/hide.

**Action = investigation first, not implementation:** before any implementation, **verify whether the current TappyAI feature set actually requires** block/hide/report-user under the **latest** App Store Review Guidelines (guidelines evolve; the requirement depends on the exact UGC surface).

**If — and only if — it is confirmed mandatory:**
1. **Backend first** (a minimal `blocks`/`hidden` relation + query filters).
2. **Web.**
3. **Android.**
4. **iOS.**

Maintain **100% feature parity**; **never** introduce it as iOS-only functionality; keep scope to the compliance minimum (no moderation console, no new social graph). Add EULA zero-tolerance terms if implemented. Tracked as **R19**. Owner: Backend + all clients. Status: **Open — investigation before any implementation.**

## Net effect on Phase 0 readiness
The P0 architectural items (F1, F4, F12) are now encoded in the docs/ADRs. The **minimum-iOS version is intentionally left open and decided *during* Phase 0** (documented process, no version pre-locked) — it does **not** block starting foundation work. **Phase 0 may begin.** All other items are correctly deferred to the phase that needs them, or to post-MVP/long-term — no premature work, no scope creep.

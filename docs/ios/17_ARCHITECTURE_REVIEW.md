# TappyAI — Independent Architecture Review

> Part of the `docs/ios/` design dossier. An adversarial, author-independent review by a "Principal iOS Architect" persona. Goal: find what's wrong before any Swift is written. Reviewed 2026-07-10 against all dossier docs + ADRs. Lens: a product that must live 5–10 years, with **no over-engineering and no premature abstraction**.

## Executive stance

The package is **unusually thorough for a pre-code stage** — governance, boundary, migration, and risk docs are better than most shipping teams have. The bones are right (Clean-ish layering, shared backend, StoreKit abstraction, thin client, native-HIG principle). The problems are **not foundational** — they are (a) one internal contradiction that will breed ceremony, (b) several under-specified high-risk mechanics (streaming, token lifecycle, feed media), and (c) one genuine **App Store compliance gap** (UGC block/hide). None require re-architecting; all are fixable in docs/decisions before or during Phase 0.

---

## Findings

Each: **Explain · Why it's a problem · Impact · Recommended solution · Fix complexity · Priority.**

### F1 — Thin client vs full Clean Architecture is contradictory (over-engineering)
- **Explain:** `14_BACKEND_CLIENT_BOUNDARY` mandates an "extremely thin" client (all real logic server-side). `09 §3` + `ADR-001` mandate full Clean Architecture with a **UseCase layer per feature**. For a thin client, most UseCases will be one-line pass-throughs to a Repository.
- **Why a problem:** A layer that only forwards calls is pure ceremony — it violates the dossier's own "every layer must justify its existence" rule. Over 54 features it multiplies files, indirection, and onboarding cost for zero behavior.
- **Impact:** Slower development, noisier diffs, harder navigation, worse DX — for years.
- **Recommended solution:** Adopt **pragmatic Clean Architecture**: `View → ViewModel → Repository → data source`. Introduce a UseCase **only** where real client logic exists (feed player orchestration, chat stream assembly, optimistic revert, fortune/split-bill engines, entitlement resolution). Update `ADR-001` to make UseCase optional-by-justification.
- **Fix complexity:** Low (doc/ADR edit). **Priority:** **P1 (before Phase 0).**

### F2 — `Core/Payments` + StoreKitProvider built while Pro is OFF (premature abstraction)
- **Explain:** MVP ships no purchase surface (`SHOW_PRO_UPGRADE=false`), yet the blueprint lists a `Core/Payments` module and a StoreKit provider.
- **Why a problem:** Building an unused provider + module now is premature; StoreKit APIs and receipt flows will likely change by the time Pro turns on.
- **Impact:** Dead code to maintain; false sense of completeness; wasted effort.
- **Recommended solution:** Keep **only the seam** — an `EntitlementService` protocol that reads the server entitlement (needed anyway to gate features). **Do not** implement `StoreKitProvider` or the purchase UI until Pro is enabled product-wide. `ADR-006` already says "build seams" — make it explicit that the *provider* is deferred.
- **Fix complexity:** Low. **Priority:** P2.

### F3 — Streaming parser is under-specified for its risk level (under-engineering)
- **Explain:** `/api/chat` is the flagship, and its data-stream + in-text markers (`[TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`) are brittle: markers/JSON can split across network chunks; the model can emit malformed JSON; the server injects extra text frames.
- **Why a problem:** The plan treats parsing as a single line item. Chunk-boundary splits and malformed markers are the exact failures that ship as "chat sometimes breaks."
- **Impact:** Intermittent, hard-to-repro chat corruption — the worst kind of bug in the highest-value feature.
- **Recommended solution:** Specify a two-stage parser: (1) newline-framed data-stream decoder tolerant of partial lines; (2) a **stateful marker extractor that buffers until a marker closes** and **falls back to rendering raw text on JSON parse failure** (never crash, never drop the message). Add golden-file + fuzz tests (`ADR-010` already wants golden files — add the resilience requirement). Also define **stream cancellation** when the user leaves the screen (avoid leaked tasks / wasted tokens).
- **Fix complexity:** Medium. **Priority:** **P1 (spec before Phase 2; parser design is architectural).**

### F4 — Dual auth surface with no single token authority (networking risk)
- **Explain:** Two data paths (supabase-swift session **and** Bearer to Next.js) each need a valid, refreshed JWT. The docs don't name a single source of truth for the token or a refresh policy.
- **Why a problem:** Classic race: token expires, N concurrent requests each trigger a refresh; or supabase-swift refreshes but the API client caches a stale JWT → sporadic 401s.
- **Impact:** Random logouts / 401s under load — echoes the web "periodic logout" bug class.
- **Recommended solution:** One `SessionStore` owns the JWT; `TappyAPIClient` reads the token from it (not a copy). Centralize **single-flight refresh** (coalesce concurrent refreshes) and a **401 → refresh-once → retry** interceptor. Document in `ADR-004`/`ADR-005`.
- **Fix complexity:** Medium. **Priority:** **P1 (before Phase 1 auth core).**

### F5 — Native anon-chat quota is an unresolved hole in a flagship flow (under-engineering)
- **Explain:** Anon 5/day is cookie-based and unusable natively (R1). The architecture defers this to "a backend decision."
- **Why a problem:** Chat (Phase 2) is a pillar; its logged-out path is undefined. Deferring risks either shipping an abuse hole or a last-minute scramble.
- **Impact:** Abuse/cost exposure or a rushed auth change late in Phase 2.
- **Recommended solution:** Decide now: **server-authoritative anon/device token** (preferred) or **login-required chat**. This is a small backend change; lock it before Phase 2. Does **not** block Phase 0.
- **Fix complexity:** Medium (backend). **Priority:** **P1 decision, P2 build.**

### F6 — UGC block/hide capability likely missing → App Store 1.2 rejection (compliance gap)
- **Explain:** Reviews + music are user-generated. Apple Guideline 1.2 requires apps with UGC to provide: content **filtering**, **report** (✅ exists), **block abusive users**, and **act on reports within 24h**. A **block-user / hide-content** feature is not evident in the Web product.
- **Why a problem:** Missing block-user is a common, near-automatic App Store rejection for UGC apps.
- **Impact:** Launch blocker at review time.
- **Recommended solution:** **Compliance Investigation Required** — do **not** add speculatively. First verify whether the current TappyAI feature set actually requires block/hide/report-user under the **latest** App Store Review Guidelines. If confirmed mandatory, implement **backend → Web → Android → iOS** at 100% parity (never iOS-only), minimal scope, + EULA terms. Report already exists.
- **Fix complexity:** Medium. **Priority:** **P1 investigation (resolve before submission).**

### F7 — Feed uses progressive MP4 (from Vercel Blob), not HLS (performance/bandwidth risk)
- **Explain:** Web plays MP4 `media_url` from Blob via `<video>`. Parity means iOS AVPlayer streams the same progressive MP4 in a TikTok-style feed.
- **Why a problem:** Progressive MP4 has no adaptive bitrate and weaker seek/prefetch than HLS; a fast-scrolling feed re-downloads whole files and wastes bandwidth/battery.
- **Impact:** Jank, buffering, data/battery burn on cellular — at scale, real cost and churn.
- **Recommended solution:** For MVP, implement **range-request prefetch of the next ±1 item + a small buffer window** and cap concurrent loads. Longer-term, recommend a **backend HLS transcode** (product/backend change, not iOS-only) — log it as a future optimization, don't build iOS-side hacks.
- **Fix complexity:** Low (prefetch) / High (HLS, backend). **Priority:** P2.

### F8 — AVPlayers inside `TabView` can keep playing/holding memory across tabs (memory/perf)
- **Explain:** `TabView` retains all tab view hierarchies. The feed's AVPlayers may keep buffering/audio when the user switches tabs.
- **Why a problem:** Memory pressure + phantom audio + battery.
- **Impact:** Crashes on low-memory devices (R13), audio bleeding into other tabs.
- **Recommended solution:** Tie player teardown/pause to **`scenePhase`** and **tab-selection changes**, not just cell visibility; release players when the feed tab is not selected. Add to `ADR-009`.
- **Fix complexity:** Low–Medium. **Priority:** P2.

### F9 — Dual `@Observable`/`ObservableObject` path from the undecided min-iOS target (DX/complexity)
- **Explain:** `ADR-003` supports both because min iOS (16 vs 17) is unresolved.
- **Why a problem:** Carrying two state idioms across 54 features is avoidable complexity if the target can be 17.
- **Impact:** Inconsistent patterns, more review overhead for years.
- **Recommended solution:** Do **not** pre-lock the target and do **not** recommend a specific version as final. Decide the minimum iOS version **during Phase 0** via a documented process (VN/target-market iPhone usage data, feature needs, dev complexity, maintenance cost, long-term support). Keep the architecture modern-SwiftUI-compatible; choose the state idiom (`@Observable` alone, or with an `ObservableObject` fallback) once the target is set. SuperTux needs a WKWebView floor ≥15.2 regardless.
- **Fix complexity:** Low. **Priority:** Decided **during Phase 0** (process, not a pre-lock — does not block starting).

### F10 — Hand-written typed API client for ~70 endpoints will drift over 5–10 years (scalability/maintenance)
- **Explain:** `ADR-004` chooses a hand-written client; `04` still lacks field-level bodies for non-core endpoints.
- **Why a problem:** Manual sync with a 70-endpoint backend guarantees drift over years (R10).
- **Impact:** Silent breakages as the backend evolves.
- **Recommended solution:** Short-term, finish `04` to field level for the endpoints Phase 0–3 touch. Long-term, publish an **OpenAPI/contract from the backend** and generate the client (or at least contract-test every endpoint in CI). Keep hand-written for MVP; commit to generation as the endpoint count grows.
- **Fix complexity:** Low now / Medium later. **Priority:** P2.

### F11 — `Features/Tools` is a low-cohesion grab-bag (module boundary)
- **Explain:** 7 unrelated tools (currency, translate, scan, viet-content, split-bill, deals, fortune, game, QR) live in one module.
- **Why a problem:** Low cohesion; a change to one tool rebuilds/couples all.
- **Impact:** Minor build/coupling friction; unclear ownership.
- **Recommended solution:** Acceptable for MVP, but group by nature: `Tools/Local` (fortune/split-bill/QR — offline, deterministic) vs `Tools/Remote` (currency/translate/scan/viet-content — API) vs `Tools/Game` (WebView). Split later if it grows.
- **Fix complexity:** Low. **Priority:** P3.

### F12 — Startup sequence (session → onboarding → language → entitlement) undefined (startup risk)
- **Explain:** Several gates run at launch; no defined decision tree or fast-path.
- **Why a problem:** A synchronous network call (token refresh/entitlement) at launch causes cold-start delay or a UI flash between gates.
- **Impact:** Slow/janky first paint; poor first impression.
- **Recommended solution:** Define launch as: **read Keychain session synchronously → route immediately** (anonymous/authenticated/onboarding) → refresh token + fetch entitlement **async** without blocking first paint. Language: apply stored locale instantly; show first-visit modal only when unset. Document as a short "App Launch" section (add to `09` or `ADR-002`).
- **Fix complexity:** Low. **Priority:** P2.

### F13 — Custom i18n reactive store vs native String Catalogs (SwiftUI best-practice)
- **Explain:** Plan mirrors Web's runtime language store instead of iOS-native String Catalogs + locale override.
- **Why a problem:** Reinventing localization loses `.stringsdict` pluralization, tooling, and OS integration.
- **Impact:** More custom code, weaker tooling — minor but long-lived.
- **Recommended solution:** Use **String Catalogs** + an `@AppStorage`-driven locale override (supports runtime vi/en switch without restart). Keep the "AI reply language is per-message, independent of UI locale" rule. Update `06`/`15 §9`.
- **Fix complexity:** Low. **Priority:** P3.

### F14 — Fortune/split-bill "byte-identical to Web" is asserted but untested-by-design (testing complexity)
- **Explain:** These are ported deterministic engines; parity depends on exact reproduction (djb2 seeding, rounding).
- **Why a problem:** Subtle integer/hash/locale-rounding differences between JS and Swift produce different fortunes/splits → silent parity breakage.
- **Impact:** Low user impact but a parity violation that erodes "same product."
- **Recommended solution:** Generate **fixtures from Web** (inputs→outputs) and assert Swift matches them in CI (`ADR-010` mentions fixtures — make it a hard gate for these engines).
- **Fix complexity:** Low. **Priority:** P2.

### F15 — Contract tests assume a staging backend that may not exist (dependency/testing risk)
- **Explain:** `ADR-010` relies on contract tests against staging Next.js/Supabase.
- **Why a problem:** If there's no isolated staging env, tests either hit prod (risky) or don't run.
- **Impact:** The main defense against backend drift (R10) is unenforceable.
- **Recommended solution:** Confirm/provision a **staging environment**; if none, gate contract tests behind a mock server generated from `04` and run smoke contract checks against prod read-only endpoints.
- **Fix complexity:** Medium (env). **Priority:** P2.

### Minor notes (P3, no action needed to start)
- Fortune-telling content: App Store generally allows entertainment-framed; keep framing, low risk.
- Sign in with Apple (4.8): Email-OTP likely satisfies the "privacy alternative to Google" requirement — verify at submission.
- Offline caching of `liked_by_me`/`saved_by_me` can show briefly stale social state — acceptable.

---

## Scores (0–100)

| Dimension | Score | Rationale |
|-----------|:----:|-----------|
| **Architecture** | **82** | Sound structure; docked for the thin-client vs UseCase contradiction (F1) and premature Payments module (F2). |
| **Maintainability** | **85** | Governance/boundary/migration docs are excellent; hand-written client drift (F10) and dual state idiom (F9) are the drags. |
| **Scalability** | **80** | Shared backend scales; iOS-side risks are API-client sync (F10) and module grab-bag (F11). |
| **Performance** | **74** | Feed is the weak point: progressive MP4 (F7), AVPlayer-in-TabView (F8), streaming parse (F3) are under-specified for their risk. |
| **Developer Experience** | **78** | UseCase ceremony (F1), dual `@Observable` path (F9), dual-auth token handling (F4) add friction. |
| **MVP Readiness** | **88** | Very close; blockers are mostly decisions/spec, not code. UGC block (F6) is the one true launch-gating gap. |
| **Long-term Readiness** | **84** | Governance gives it real 5–10-year legs; codify contract-generation and pragmatic layering to keep it. |

**Composite:** ~**81/100** — a strong, ship-worthy foundation with a focused set of pre-code refinements.

---

## Verdict

# ✅ YES — WITH MINOR CHANGES

The architecture is fundamentally correct and can begin **Phase 0 (project scaffold + DesignSystem + Network/Auth core) immediately** — none of the findings require re-architecting the foundation. However, the following must be resolved **before the phase that depends on them** (and the two marked *pre-Phase-0* before writing scaffold code).

### Required changes before Swift implementation

**Before Phase 0 (decisions + doc edits — hours, not days):**
1. **F1** — Update `ADR-001`/`09`: adopt pragmatic layering (drop mandatory UseCase layer; UseCase only where justified). Resolve the thin-client contradiction.
2. **F9** — Keep min-iOS **open**; document the decision process (decided *during* Phase 0, no pre-lock, no recommended-final version). Keep architecture modern-SwiftUI-compatible; standardize the state idiom once the target is set.
3. **F4** — Add to `ADR-004`/`ADR-005`: single token authority in `SessionStore`, single-flight refresh, 401-retry-once. (Architectural — lock before building the network/auth core.)

**Before Phase 2 (Chat):**
4. **F3** — Specify the resilient streaming/marker parser + JSON-failure fallback + stream cancellation; make golden/fuzz tests a gate.
5. **F5** — **Decide native anon-chat quota** (server token vs login-required) and have backend implement it.

**Before Phase 3–4 (Feed/UGC):**
6. **F7/F8** — Specify feed media buffering/prefetch + player teardown on tab-switch/`scenePhase`.
7. **F6** — **Compliance investigation**: verify whether block/hide/report-user is mandatory under current guidelines. If so, implement backend→Web→Android→iOS before submission (parity, never iOS-only). Do not add speculatively.

**Before store submission:**
8. **F6** UGC compliance resolved (investigated; if mandatory, implemented cross-platform) · **F14** fortune/split-bill fixtures pass · reconcile Web copy ("SuperTux"; 15/day copy ✅ RESOLVED 2026-07-11 — `/subscription` copy + remaining counter updated to 15/day on web) · confirm SuperTux WebView acceptability (R17) · privacy manifest + purpose strings.

**Defer (do NOT build early):**
9. **F2** — StoreKit provider/purchase UI until Pro is enabled (keep only the entitlement seam).
10. **F10** — API client codegen/OpenAPI until endpoint churn justifies it (finish `04` field-level for Phase 0–3 endpoints now).

None of items 1–3 take more than a short doc/decision pass. **Phase 0 may start as soon as items 1–3 are settled.**

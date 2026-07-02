# TappyAI — Final Architecture Review

> **Phase:** Architecture Week — Phase 3 of 3 (final)
> **Status:** Review/analysis only — no code changes, no migrations, no refactors in this document
> **Method:** Synthesizes `docs/FINAL_ARCHITECTURE.md`, `docs/UI_GUIDELINES.md`, `docs/AI_Personalization_Architecture.md`, `docs/Explore_AI_Platform_Architecture.md` (all produced this session, each individually verified against source) plus targeted fresh reads for topics not previously covered: `src/lib` folder structure, in-memory caching (`common.ts`), the admin dashboard (`/admin/analytics`), and — critically — `src/lib/explore/recommendation.ts`, a previously-undocumented dormant module discovered during this review.
> **Convention:** 🟢 Live/healthy · 🟡 Partial · 🔴 Dead/dormant · 🟠 Confirmed debt

---

## 1. Executive Summary

TappyAI's architecture is **more built than wired**. Across every subsystem reviewed — personalization, Explore, recommendation — the pattern repeats: correct, isolated, individually well-written modules exist, but the connective tissue between them is frequently missing. This is not a design flaw; it's the natural residue of building capability-first (Sprints 0.1–1.0b activated what already existed rather than building new) and feature-first (Explore's AI processing, upload pipeline) without a final integration pass. That pass is what Architecture Week has been mapping.

**The single most important new finding of this review:** there are **three independent, mutually-unaware "recommendation" modules** in the codebase (`recommendationEngine.rankCandidates`, `contextBuilder.buildAIContext`, `explore/recommendation.getRecommendationContext`), none of which are called from anywhere. Neither prior Architecture Week document identified the third one — it was discovered during this review's folder-structure pass. This is exactly the class of problem Final Review exists to catch.

Overall: the codebase is **not over-engineered** (no premature abstraction found), **not under-secured** (Security phase already closed every confirmed finding), and **Android-ready at the data layer** but **not yet contract-ready** (no stable API surface designed for a non-Next.js client). The prioritized action list (§16) reflects a genuine "finish, don't redesign" posture.

---

## 2. Current Architecture

Reference: `docs/FINAL_ARCHITECTURE.md` (comprehensive, produced and verified this session) remains accurate for system-wide structure — not restated in full here. Summary of the layers this review adds context to:

- **Chat/AI:** Next.js API routes, Vercel AI SDK, Anthropic Claude (tiered), tool-calling for places/hotels/flights/products/news/weather/gold/transport. 🟢
- **Personalization:** Memory Engine (🟢 live), Preference Engine (🟢 live), Learning Engine (🟢 live producer, 🔴 unused consumer), Context Engine (🟡 split), Recommendation Engine (🔴 dormant) — full detail in `AI_Personalization_Architecture.md`.
- **Explore:** Upload pipeline (🟢), AI metadata (🟡 narrower than built capability, output partially discarded), Smart Info Card (🔴 doesn't exist), Ask Tappy (🔴 link only, no context) — full detail in `Explore_AI_Platform_Architecture.md`.
- **Folder structure** (fresh finding, `src/lib/*`): mostly well-organized by subsystem (`ai/`, `memory/`, `preferences/`, `recommendation/`, `platformLinks/`, `notifications/`, `explore/`, `integrations/`, `supabase/`, `tracking/`, `boi/`), but **5 loose files sit at `src/lib/` root** (`suggestedPrompts.ts`, `utils.ts`, `shopee-deals.ts`, `userMemory.ts`, `admin.ts`) alongside the subsystem folders. `userMemory.ts` sitting at root, one level above the `memory/` folder it conceptually competes with, is a small but real discoverability tax — already flagged from a different angle in the Personalization doc (§2.6, event-vocabulary drift), confirmed here from a structural angle too.
- **Caching:** two layers verified. (1) Anthropic prompt caching (`ephemeral`, system prompt) — 🟢 confirmed working via production token telemetry in an earlier phase. (2) An in-memory `Map`-based cache (`getCache`/`setCache` in `src/lib/ai/tools/common.ts`) — 300-entry cap with oldest-first eviction, TTL-based expiry, used for search-tool results (e.g., 15-minute product search cache). 🟠 **Per-instance, not shared** — on Vercel's serverless model this cache is cold on every new instance and provides no cross-request guarantee, only intra-instance/intra-warm-lambda benefit. Explicitly documented in the code as **never applying to Google Places photos** (Google's ToS forbids caching photo content beyond the request) — a real, correctly-honored legal constraint, not an oversight.
- **Dashboard:** `/admin/analytics` **already exists** — 🟢 a real, if basic, internal dashboard (uploads count, video views, average watch time, top 10 hashtags, 24h DAU from `review_interactions`, 7-day upload growth, top-200 creator leaderboard by engagement). Gated by `isAdmin(userId)`, which checks membership in an `ADMIN_IDS` env-var comma-list (`src/lib/admin.ts`). This materially changes the "Dashboard Readiness" question (§12) from "build from zero" to "extend what exists."
- **Dead documentation artifacts:** `PHASE3_REVIEW.md` and `PHASE3_FINAL_REVIEW.md` at repo root are untracked, never-committed self-review notes from a prior work session (dated 2026-06-30, referencing commit `b880de4`, predating this conversation). They are the only source that documents `explore/recommendation.ts`'s original intent — genuinely useful as an artifact, but sitting as loose root-level files rather than under `docs/`. Low-priority cleanup, not urgent.

---

## 3. Strengths

Carried forward from prior documents, restated because Final Review should be honest about what's *already right*, not only what's wrong:

- **Single-gateway pattern, proven twice.** `memoryService.ts` (all `user_memory` access) and `profileCache.ts` (all `preference_profile` writes) both correctly centralize ownership. This pattern should be the template for AI Metadata ownership (§7) — not reinvented.
- **Deterministic-first AI design.** Learning Engine and Recommendation Engine are both LLM-free by explicit, consistent choice — cheaper, faster, explainable (`matchedSignals`/`explanation` fields). This discipline has held across every phase of this project so far.
- **Fire-and-forget correctly used.** Every background-scoring trigger (`rebuildProfile`) is verified non-blocking — a slow/failing background job cannot break a user-facing response. No exceptions found anywhere in this review.
- **Security phase fully closed.** Every finding from the dedicated Security Audit (XSS, SSRF, filter-injection, enumeration, logging, CHECK constraint) was fixed and production-verified. Nothing new surfaced in this review's security pass (§8) beyond what was already tracked.
- **Direct-link philosophy consistently honored.** `platformLinks/*` and every CTA-button code path enforce "no in-app booking" as a hard rule, not a convention — confirmed still true in every file read across all three Architecture Week documents.
- **Cost discipline already real, not aspirational.** Prompt caching is verified working in production (not just configured), and every deterministic engine (Learning, Recommendation) was designed from the start to add zero marginal AI cost.

---

## 4. Weaknesses

1. **Three unwired recommendation surfaces (see §1, §5, §16.1)** — the review's central finding.
2. **Learning Engine computes for nothing.** Every like/save/follow triggers real work (`rebuildProfile`) whose output (`preference_profile`) has no reader. Confirmed unchanged since `AI_Personalization_Architecture.md` §1.5/§2.1.
3. **AI-generated content metadata is 50% discarded** (`category`/`location` from `contentProcessor`) — confirmed unchanged since `Explore_AI_Platform_Architecture.md` §1.2/§2.1.
4. **No API contract designed for a non-Next.js client.** Every personalization/Explore read assumes a same-origin session cookie. This is the most material gap for Android (§11).
5. **Folder-root utility file placement** creates minor discoverability debt (§2) — cosmetic, not functional.
6. **In-memory cache has no cross-instance guarantee** on serverless — currently harmless (tool-result caching is a nice-to-have, not correctness-critical) but would silently stop "working" (in the sense of hit rate) at higher instance-count scale without any error or symptom other than slightly higher API-call volume.

---

## 5. Coupling Analysis

- **Low coupling, by design, in the personalization/recommendation stack.** `signalCollector` → `learningEngine` → `affinityGraph` → `profileBuilder` → `profileCache` is a clean, one-directional pipeline with no circular imports, no shared mutable state. `recommendationEngine.ts` has **zero** imports from any Supabase client — genuinely pure, confirmed by direct read (`recommendationEngine.ts:1-2`'s own header comment: "No database access. No side effects. No LLM calls" — verified true).
- **The coupling problem is the opposite of tight coupling — it's missing coupling.** `buildAIContext` should be called by `chat/route.ts` and isn't. `rankCandidates` should be called by something and isn't. `getRecommendationContext` should be called by `reviews/feed/route.ts` and isn't (confirmed via grep — zero non-documentation references).
- **`userMemory.ts` is coupled to two concerns it shouldn't own simultaneously:** it's the canonical writer for `preferred_style` (correct, per Personalization doc §Sprint history) but also defines its own narrower `UserEventType` vocabulary (`logUserEvent`) that diverges from `/api/track`'s enforced allow-list — a coupling between "the one thing this file must do" and "a vestigial thing it also does," already flagged in the Personalization document, reconfirmed here.
- **Explore's trending-feed formula and the Recommendation Engine are decoupled from each other** — this is **correct**, not a defect (Explore doc §3.5 explicitly chose not to replace a tuned, shipped formula). Noted here so it isn't mistaken for a missed-coupling opportunity during implementation.

---

## 6. Reuse Opportunities

Consolidated from all three prior documents plus this review's new finding:

| Existing, working code | Currently reused by | Should also be reused by |
|---|---|---|
| `platformLinks/*` builders | Chat CTA buttons only | Explore Smart Info Card (Explore doc §3.3) |
| `recommendationEngine.rankCandidates` | Nobody | Chat's `search_places` results, Explore "Related" section (Personalization §3.2, Explore §3.5) |
| `contextBuilder.buildAIContext` | Nobody | Chat prompt (Personalization §3.1), the proposed `GET /api/context` (Personalization §3.5) |
| `memoryService` single-gateway pattern | `user_memory` only | Should be the **template**, not reused verbatim, for AI Metadata ownership (§7) |
| **`explore/recommendation.getRecommendationContext`** 🆕 | Nobody (confirmed dormant, never wired despite being purpose-built for exactly this) | Either wire into `reviews/feed/route.ts` as a lightweight *pre-filter* (city/following boost) ahead of the heavier `rankCandidates`, **or** deprecate in favor of `buildAIContext` once that's wired — these two functions now have meaningfully overlapping purpose (both infer a user's city; `buildAIContext`'s is Learning-Engine-derived and more robust, `getRecommendationContext`'s is a simpler last-5-posts heuristic) |
| `/admin/analytics` (🆕 discovered this phase) | Internal admin only | Structurally ready to extend with any new Explore/Personalization metric (§12) — no new dashboard framework needed |

---

## 7. AI Metadata Ownership

Two genuinely distinct "AI metadata" concepts exist in this codebase; both need an explicit ownership model, and both should follow the **same already-proven pattern** (`memoryService`/`profileCache`'s single-gateway rule) rather than inventing a new one.

### 7.1 Content-level metadata (`reviews.ai_metadata`, proposed in Explore doc §3.1)

- **Source of Truth:** the `ai_metadata` jsonb column on the `reviews` row itself. One row per video/post — metadata has no independent lifecycle from its content, so it does not need its own table.
- **Who may WRITE:** exactly one call site — `/api/explore/process` (wrapping `contentProcessor.ts`), invoked only from the upload flow (`reviews/new/page.tsx`), persisted via the **same** `/api/reviews` POST that creates the row. Write happens **exactly once, at creation** — no separate "update metadata later" endpoint should exist for MVP.
- **Who may READ:** every consumer identified across both prior documents — Smart Info Card, Recommendation candidate hydration, Ask Tappy context-seeding, Search Index facets, `/admin/analytics` (future metric). All read-only; none should ever write back to `ai_metadata`.
- **Update flow:** **none, for MVP.** Since no content-editing feature exists today (confirmed: the only `PATCH /api/reviews/[id]` capability is `is_hidden` toggle, not caption/place editing), metadata cannot go stale against user-edited content — there is nothing to reconcile.
- **Avoiding re-analysis of the same video:** the single-write-at-creation rule is itself the avoidance mechanism — since nothing ever triggers a second analysis, no dedup/idempotency logic is needed for MVP. **Future-only** (not proposed now): if content editing ships, the correct pattern is a `content_hash` (hash of caption+thumbnail_url) stored alongside `ai_metadata`, checked before spending a new LLM call — analysis only re-runs if the hash changed. This mirrors how `profile_updated_at` already gates staleness checks for `preference_profile` (`user_preferences_profile_updated_idx`) — same idea, different trigger condition, not a new architectural concept.

### 7.2 User-level metadata (`user_preferences.preference_profile`, already live)

- **Source of Truth:** already correctly single-gated via `profileCache.setProfile()` (verified, Personalization doc §1.5). No change proposed — cited here only so this review's ownership model is complete and consistent, and so a future contributor doesn't ask "why does content metadata get a hash-based staleness check but profile metadata doesn't" — the answer is `preference_profile` is fully recomputed from source signals on every trigger (no partial-update problem to solve), while `ai_metadata` would need incremental staleness detection specifically because re-running the LLM call has a real cost per invocation that recomputing `preference_profile` (deterministic, free) does not share.

---

## 8. Security Review

No new findings — this review's scope (folder structure, caching, recommendation wiring, dashboard) did not surface anything beyond what the dedicated Security Audit already found and fixed. Confirmed still true:

- `memoryService`/`profileCache` gateway patterns prevent cross-user access at the application layer (session-derived `userId` only, everywhere checked).
- `/admin/analytics` gate (`isAdmin`) is env-var-based, single-layer (no RLS-level admin check found) — acceptable for an internal tool at current scale, but if Dashboard usage expands (§12) this should graduate to a proper role check rather than a hardcoded ID list, flagged as a **before-Android-optional, before-scale-mandatory** item.
- Every proposed-but-unbuilt endpoint in the Personalization/Explore documents (`GET /api/context`, `POST /api/trip-places`, etc.) was already designed with session-derived auth as a hard requirement in its own document — reconfirmed here, not repeated in full.

---

## 9. Performance Review

- Learning Engine's `collectSignals` (6 parallel, `.limit()`-bounded queries) remains the heaviest read pattern in the personalization stack — already flagged as fire-and-forget/non-blocking, no new concern.
- `/admin/analytics` runs **6 parallel Supabase queries** on every page load (uploads count, video stats up to unbounded rows via `content_type='video'` filter with no `.limit()`, hashtags `.limit(500)`, DAU, 7-day growth, top-200 creators). 🟠 **New finding:** the video-stats query (`viewsRes`) has **no row limit** — at current content volume this is fine, but it's the one unbounded query in an otherwise consistently `.limit()`-disciplined codebase. Worth a cap before Dashboard usage grows (§12), not urgent now.
- No other new performance concern identified in this review's scope.

---

## 10. Cost Optimization

Restated from both prior documents, no new findings: prompt caching (🟢 working), memory-extraction cost (🟠 uncosted, flagged in Personalization §11), zero marginal cost from all deterministic engines (🟢 by design). One addition from this review:

- The in-memory `getCache`/`setCache` layer (§2) reduces redundant search-tool API calls **within a warm serverless instance**, which is real but modest cost savings given Vercel's instance churn — should not be assumed to provide the same hit rate a shared cache (Redis/Upstash) would. Not recommending a shared cache for MVP (no evidence current API-call volume justifies the added infrastructure and cost), but flagging that the *current* cache's savings are smaller than they might appear from the code alone.

---

## 11. Android Readiness

**Data layer: ready. Contract layer: not ready.** This is the most important finding for the stated "Android next week" constraint.

- Every table and access pattern reviewed across all three documents is technology-agnostic (Postgres via Supabase, no server-side-rendering-specific coupling in the data model itself).
- **The gap is entirely in the API surface.** Today, "the API" for personalization/Explore is a set of Next.js route handlers that happen to also work for any authenticated JSON client — but none were *designed* as a versioned, stable, mobile-facing contract. `GET /api/memory`, `GET /api/preferences/profile`, `POST /api/track` already work as-is for Android (plain JSON, session-cookie or bearer-compatible auth pattern already proven for cron jobs). The proposed-but-unbuilt `GET /api/context` (Personalization §3.5) is the one genuinely missing piece Android would benefit from having *before* building its own client-side context-stitching logic.
- **Open decision, still unresolved (flagged in Personalization doc §3.5, repeated here because it's an Android-blocking decision, not just an Android-nice-to-have):** will Android use the Supabase native SDK directly for simple reads, or exclusively the Next.js API layer? Direct SDK access bypasses `memoryService`'s gateway guarantee and `buildAIContext`'s confidence-gating — recommend **API-only for personalization reads**, consistent with the earlier documents' recommendation, restated here as the review's formal position.
- **No Android-specific risk found in the data model, security posture, or deployment.** The risk is entirely "if Android is built against today's ad-hoc routes, a later `GET /api/context` introduction becomes a breaking migration for an already-shipped client" — sequencing risk, not architecture risk.

---

## 12. Dashboard Readiness

**More ready than expected — a real internal dashboard already exists** (`/admin/analytics`, §2). This changes the framing from "build a dashboard" to "decide dashboard scope and harden access control."

- Structurally, adding a new metric (e.g., Learning Engine profile-confidence distribution, once wired per Personalization §3.1) is a matter of adding one more parallel query — no new framework or page needed.
- Before any dashboard expansion: fix the one unbounded query (§9) and consider graduating `isAdmin` (§8) beyond a flat env-var ID list if more than a handful of people will need access.
- **Not recommended before Android:** building this out further is explicitly lower priority than closing the Android contract gap (§11) — Dashboard has no external deadline pressure comparable to "Android next week."

---

## 13. iOS Readiness

No iOS-specific code, consideration, or blocker exists anywhere in the reviewed codebase — this is expected and not a finding of concern at this stage (iOS is not the current target platform). Every conclusion in §11 (Android Readiness) applies identically to a future iOS client, since the gap identified there (API contract, not data model) is platform-agnostic. **No iOS-specific work is recommended before or alongside the Android effort** — the same `GET /api/context` contract (if built) would serve both platforms equally; there is no reason to design it Android-specifically.

---

## 14. Technical Debt

Consolidated list, cross-referenced to source document (nothing here is newly invented — this section exists to give one place a reader can scan):

| Item | Source | Severity |
|---|---|---|
| Three unwired recommendation modules | This review (§1, new) | High — architectural clarity |
| Learning Engine output unused | Personalization §2.1 | High — wasted compute, missed product value |
| `ai_metadata` fields discarded | Explore §2.1 | Medium — wasted LLM spend |
| `buildAIContext` bypasses memory gateway | Personalization §2.4 | Low (dormant) / Medium (if activated as-is) |
| `userMemory.ts` vocabulary drift | Personalization §2.6, this review §5 | Low — contained by DB CHECK constraint already |
| Dead `user_preferences` columns | Personalization §2.7 | Low — no functional impact |
| `behavior_summary` write-only | Personalization §2.7 | Low — wasted cron cost only |
| No memory-extraction cost telemetry | Personalization §2.10 | Low — visibility gap, not a cost problem yet |
| Folder-root utility file placement | This review §2 | Cosmetic |
| Untracked root-level `.md` review notes | This review §2 | Cosmetic |
| Unbounded `/admin/analytics` video-stats query | This review §9 | Low — no current symptom |
| `isAdmin` flat env-var gate | This review §8 | Low — fine at current scale |

---

## 15. MVP Risks

1. **Building Android against today's ad-hoc routes before `GET /api/context` exists** locks in a client-side context-stitching pattern that becomes technical debt the moment the unified endpoint ships (§11). Highest-severity risk in this document specifically because of the stated timeline.
2. **Continuing to trigger Learning Engine rebuilds with zero consumer** is not a correctness risk, but is an ongoing, silent cost (DB query volume on every like/save/follow) with zero return until §3.1 (Personalization doc) ships — worth fixing soon, not urgent-blocking.
3. **Three-way recommendation confusion** (§1) risks a future contributor building a *fourth* variant, not realizing two dormant ones already exist — the highest-leverage fix here is documentation + a decision (§16), not code.

No risk in this review rises to "must fix before Android ships" except item 1, and even that is a sequencing risk (design the contract first), not a blocking defect.

---

## 16. Prioritized Action List

Every item states benefit, cost, trade-off, and Android sequencing, per the instructions.

### 16.1 Reconcile the three recommendation modules
- **Benefit:** removes the exact confusion this review's central finding describes; clarifies which module is canonical before any of them is wired.
- **Cost:** near-zero — this is a decision + a comment/doc update, not new code. (Deprecating `getRecommendationContext` is a deletion, not a build.)
- **Trade-off:** none identified — no functionality is lost either way, since nothing calls any of the three today.
- **Timing: before Android** — cheap, and prevents the confusion from being baked into whatever Android's first personalization integration ends up copying.

### 16.2 Wire Learning Engine → Chat (Personalization §3.1)
- **Benefit:** the single highest product-value item across all three documents — makes months of already-shipped behavioral scoring actually influence what users see.
- **Cost:** one gateway fix + one new call site + one new render function, per Personalization doc's own estimate — small, bounded.
- **Trade-off:** adds 2 DB reads to the hot chat path (flagged, Personalization §10) — must be measured, not assumed free.
- **Timing: before Android is fine either way** — this is a chat-quality improvement, not an Android blocker, but should not be deprioritized indefinitely given its value/cost ratio.

### 16.3 Design and ship `GET /api/context`
- **Benefit:** directly closes the Android contract gap (§11) — the one concrete blocker-adjacent item in this review.
- **Cost:** small (thin wrapper over already-fixed `buildAIContext`), but design care matters more than code volume here — the null/low-confidence contract must be right the first time a client depends on it.
- **Trade-off:** shipping this *before* §16.2 means Android's first personalization data may be less rich (no behavior-block-enriched prompt yet on the chat side — though `/api/context`'s own payload already includes Learning Engine data regardless of whether chat also renders it). Shipping *after* §16.2 delays Android's access to this contract.
- **Timing: before Android — this is the one item in the entire three-document Architecture Week series that most directly serves the stated deadline.**

### 16.4 Persist full `ai_metadata`, extend Content Generator (Explore §3.1–§3.2)
- **Benefit:** stops discarding already-paid-for AI output; unblocks Smart Info Card accuracy and Recommendation candidate quality.
- **Cost:** low — schema addition + response-shape extension, no new LLM call.
- **Trade-off:** none identified.
- **Timing: after Android** — improves Explore, not Android's data contract; no urgency relative to §16.3.

### 16.5 Smart Info Card (Explore §3.3)
- **Benefit:** highest-leverage, lowest-risk item in the Explore document — pure reuse of proven code.
- **Cost:** low.
- **Trade-off:** none identified.
- **Timing: after Android** — user-facing Explore polish, not a data-contract concern.

### 16.6 Fix `/admin/analytics`'s one unbounded query; consider `isAdmin` hardening
- **Benefit:** removes the one performance/access-control soft spot found in this review.
- **Cost:** trivial (add a `.limit()`) for the query; small for the admin-check upgrade if pursued.
- **Trade-off:** none for the query fix; the admin-check upgrade has no downside but also no urgency.
- **Timing: after Android, low priority** — no current symptom, no deadline pressure.

### 16.7 Cosmetic cleanup (folder-root files, untracked review notes)
- **Benefit:** minor discoverability improvement.
- **Cost:** trivial.
- **Trade-off:** none.
- **Timing: whenever convenient — never urgent, never blocking.**

---

## 17. Final Recommendation

**The architecture does not need redesign. It needs three specific wiring decisions and one new contract.** Every weakness found across all three Architecture Week documents — including this review's own new finding — is a *missing connection between correct, already-built pieces*, not a structural flaw requiring rework. This is a genuinely good position to be in one week before an Android push: the risk is sequencing (build the contract before the client, §16.3), not soundness.

**Recommended sequence, respecting the stated "not before Android" constraint:**
1. §16.1 (reconcile recommendation modules) — trivial, do first, prevents future confusion.
2. §16.3 (`GET /api/context`) — the one item that directly serves Android's timeline; prioritize over everything else in this list.
3. §16.2 (wire Learning Engine → Chat) — high value, not Android-blocking, can proceed in parallel with or shortly after §16.3.
4. Everything else (§16.4–16.7) — genuinely fine to defer past Android without risk to this week's goal.

No proposal in any of the three Architecture Week documents introduces new infrastructure, new external dependencies, or a new storage paradigm. That restraint — repeatedly choosing "wire what exists" over "build something new" — is itself the strongest signal that this codebase is ready to support Android without an architecture rewrite first.

---

# Architecture Week — Final Completion Addendum

> Appended after review of §16.1/§16.3. Resolves the open recommendation-module question and completes the Unified Context API and System Dependency Map requested for full Android-readiness closure. No prior section above this line was edited.

## 18. Recommendation Architecture — Resolved

Three modules, verified via direct read of each (Personalization doc §1.3–1.4, this document §1/§5/§6):

| Module | Role | Reasoning |
|---|---|---|
| **`recommendationEngine.rankCandidates()`** | **Core — scoring engine** | Pure, stateless, no DB/LLM access (verified via the file's own header comment and a full read). The only module in the set that actually *ranks* anything. There is no reason to duplicate this logic; every consumer (chat, Explore) should call this one function. |
| **`contextBuilder.buildAIContext()`** | **Core — input adapter for the scoring engine** | Produces the exact `AIContextResult` shape `rankCandidates` requires. Paired with `rankCandidates` as one unit, not a separate concern — a caller needing recommendations always needs both, in sequence. |
| **`explore/recommendation.getRecommendationContext()`** | **Deprecated — recommend removal** | See reasoning below. Not a Consumer of the other two (never called anything, never was called) — it is a **parallel, competing** context-gatherer built for the same purpose as `buildAIContext`, independently, in an earlier session. |

**Why deprecate `getRecommendationContext` rather than keep it as a lightweight alternative:**
- Its `topHashtags` field (from the last 20 `review_interactions`, unweighted frequency count) draws from **one of the same six sources** `signalCollector` already aggregates, but without time-decay, without taxonomy propagation, and without affinity enrichment. For the exact purpose both were built for (personalizing what a user sees), `AIContext.favoriteFoods`/`favoriteCategories` (Learning Engine-derived) is strictly more complete over the same underlying data.
- Its `city` field is **not strictly redundant** — it measures something subtly different: `inferCity()` reads the current user's **own last 5 posts'** addresses (i.e., "where does this person post *from*"), while `AIContext.city` (via `profileBuilder`) is a 90-day weighted aggregate across all six behavioral signal sources (i.e., "where does this person's *activity* suggest their interest lies"). These are legitimately different questions — but for feed personalization specifically, the consumer-interest signal is the more broadly applicable one (most Explore users are watching, not posting), and a signal that only produces a value for users who have posted ≥1 review is too narrow to be the primary city signal for a general feed.
- Its one genuinely unique, non-redundant field — `followingIds` — is a two-line query (`user_follows` filtered by `follower_id`) trivial enough that any future caller needing a "following" filter for the feed should inline it directly, rather than pull in an entire module for one field.

**Recommendation:** mark `src/lib/explore/recommendation.ts` `@deprecated` in a comment (documentation-only change, not proposed as code in this document) and do not wire it into anything. If/when Explore's Recommendation Layer (Explore doc §3.5) is implemented, it should call `buildAIContext()` + `rankCandidates()` directly — the Core pair — not this module.

### Data flow (as it should be, once wired — not yet true)
```
Chat / Explore
      ↓
buildAIContext(userId, supabase)     [Core — adapter]
      ↓
AIContextResult (or null if confidence < 0.1)
      ↓
rankCandidates(context, candidates)  [Core — scoring]
      ↓
RecommendationResult (recommendations + explanation + debug)
```
No other module sits in this path. `getRecommendationContext` is not part of this diagram — it has no role once the Core pair is wired, per the reasoning above.

---

## 19. Unified Context API — `GET /api/context`

**REST is appropriate here — briefly justified, not assumed:** single resource, no query flexibility requirement beyond "give me this user's context," cacheable, no mutation. GraphQL/gRPC would add operational complexity (schema registry, new client tooling) for a one-endpoint need with a fixed, small response shape. Plain REST GET is the correct choice, not a default reached without consideration.

- **Purpose:** the one stable, versioned contract exposing a user's merged personalization context (Learning Engine's `preference_profile` + Memory Engine's `user_memory`, merged exactly as `buildAIContext()` already does) to any client that isn't the Next.js server process itself. Primarily for **Android** — not for Chat or Explore's own server-side logic (see below).
- **Input:** none beyond authentication for MVP. No query parameters. (A future `?fields=` partial-response filter is a plausible later optimization if payload size ever becomes a concern — not proposed now; today's payload is a handful of short string arrays, not large enough to justify the added client/server complexity.)
- **Output:**
  ```json
  200 OK
  {
    "version": 1,
    "generatedAt": "2026-07-02T10:00:00.000Z",
    "confidence": 0.42,
    "profile": {
      "city": "Hồ Chí Minh", "budget": "mid",
      "favoriteFoods": ["phở", "cà phê"], "favoriteCategories": ["cafe"],
      "recentInterests": ["spa Bình Thạnh"], "travelStyle": [],
      "hiddenTopics": [], "companions": null, "timing": null, "personality": null
    }
  }
  ```
  When `buildAIContext()` returns `null` (confidence < `MIN_CONFIDENCE=0.1`, or no data yet): **still 200 OK**, `{ "version": 1, "generatedAt": "...", "confidence": 0, "profile": null }` — never an error. This mirrors `/api/memory`'s already-proven "no data is not an error" contract, applied consistently.
- **Authentication:** session-derived `userId` only — identical hard requirement stated in both prior documents, restated here as the final, settled position. For a TWA (see §Navigation/Auth documents — the codebase's `assetlinks.json` is already configured for one), the existing cookie session works unmodified, no new auth mode needed. For a genuinely separate native Android client (if ever built), Supabase's standard JWT bearer-token support (already used identically for cron jobs' `Authorization: Bearer` pattern, just a different secret) covers this without inventing a new mechanism.
- **Caching:** no server-side cache for MVP — traffic volume doesn't justify it, and the underlying data (`preference_profile`, `user_memory`) is already only eventually-consistent (updated via fire-and-forget background jobs), so a server cache would add complexity without a correctness or latency win at current scale. **Client-side caching is recommended and sufficient:** fetch once per app-foreground/session-start, not per-screen or per-interaction. A future `ETag` derived from `profile_updated_at`/`user_memory.updated_at` (both already exist as columns) could enable cheap conditional `304` responses — flagged as a future enhancement, not required now.
- **Error handling:** `401` if no session (only error case that should ever occur in normal operation). `500` only on genuine DB failure — logged server-side with concise detail (matching the Security phase's "never leak DB error text to the client" pattern), generic body to the client. **No-data-yet is explicitly not an error** (see Output above) — this is the one design principle in this endpoint that most needs to be honored consistently, since getting it wrong pushes error-handling complexity onto every client.
- **Performance:** two parallel Supabase queries (unchanged from `buildAIContext()`'s existing implementation), no LLM call — sub-100ms server time expected, not measured/benchmarked in this document (flagged, not claimed).
- **Security:** no new surface — `userId` is always session-derived, never accepted as a parameter (repeated because it is the one rule every route in this API family must not violate). No PII exposed beyond what `/api/memory` and `/api/preferences/profile` already individually expose — this endpoint is a merge of two already-exposed sources, not a new data-exposure surface.
- **Android usage:** call once per app session/resume, cache client-side, use for any client-rendered personalization surface (e.g., a native "gợi ý cho bạn" section, if Android builds one). **Not used to construct chat prompts** — that stays server-side (see below).
- **Chat usage:** **does not call this HTTP endpoint.** `chat/route.ts` calls `buildAIContext()` **directly, in-process** (Personalization doc §3.1) — same server, no HTTP round-trip needed or wanted. The endpoint exists for clients outside the Next.js process; chat already is inside it.
- **Explore usage:** same principle — Explore's server-side Recommendation candidate hydration (Explore doc §3.5) calls `buildAIContext()` directly, not via this endpoint. If a future **client-side** Explore feature needs context (e.g., a JS-rendered "why we recommend this" UI hint), it would call this endpoint like any other external consumer — but no such feature is proposed in this document.

---

## 20. System Dependency Map

Text diagram, edges marked with current wiring status (🟢 live · 🔴 not wired, per every prior document's verified findings — no new speculation introduced here, this is a synthesis view of already-established facts):

```
User
│
├── Chat  (🟢 live end-to-end)
│     │
│     ├── Context     🔴 buildAIContext not called (§Personalization 1.3) — buildChatPromptContext (🟢) used instead
│     ├── Memory       🟢 memoryService, every turn
│     ├── Learning      🔴 preference_profile computed, never read by Chat (§Personalization 1.5)
│     ├── Recommendation 🔴 rankCandidates not called (§18)
│     ├── Platform Links  🟢 CTA buttons, every response with a place/product
│     └── LLM            🟢 tiered Claude via getModel()
│
├── Explore  (🟡 upload+feed live, AI layer partial)
│     │
│     ├── Upload         🟢 photo/video/URL-import, all three modes live
│     ├── AI Metadata     🟡 computed, half discarded (§Explore 1.2)
│     ├── Recommendation   🔴 none of the 3 modules wired (§18)
│     ├── Info Card         🔴 does not exist (§Explore 1.4) — platformLinks/* ready to reuse
│     ├── Ask Tappy          🔴 link exists, zero context passed (§Explore 1.6)
│     └── Trip Planner        🔴 no persistence layer exists at all (§Explore 1.7)
│
├── Search  (🟢 live, keyword-only — §Explore 1.8)
│
├── Trips  (🔴 does not exist as a feature — TripPlanCard renders a plan, nothing saves one)
│
└── Profile  (🟢 live — explicit prefs, memory view, settings)
```

**Reading this map:** every 🔴 in the Chat and Explore branches resolves to the same two root causes documented across this Architecture Week series — (1) Learning Engine output has no reader, (2) Recommendation Engine has no caller. Fixing §16.1–16.3 (already prioritized in this document) closes the majority of 🔴 edges above without touching Upload, Memory, Platform Links, or Search, none of which need any change.

---

*This document is Phase 3 (final) of Architecture Week, extended with the Final Completion Addendum (§18–20). Stopping here per instructions — awaiting review.*

# TappyAI — Explore AI Platform Architecture

> **Phase:** Architecture Week — Phase 2 of 3
> **Scope:** Video Upload Pipeline, AI Metadata Engine, AI Content Generator, Smart Info Card, Recommendation Layer, Ask Tappy, Trip Planner Integration, Search Index
> **Status:** Design/analysis only — no code changes in this document
> **Grounding:** Verified against `src/app/reviews/new/page.tsx`, `src/app/api/reviews/upload/route.ts`, `src/app/api/upload/video/route.ts`, `src/lib/explore/contentProcessor.ts`, `src/app/api/explore/{process,oembed}/route.ts`, `src/components/explore/VideoPlayer.tsx`, `src/app/reviews/{page,[id]/page,creator/[id]/page}.tsx`, `src/app/api/reviews/feed/route.ts`, `src/lib/platformLinks/{food,travel}.ts`, `src/components/TripPlanCard.tsx`, `src/lib/recommendation/*`, and the `reviews` table migration history. No claim is speculative.
> **Convention:** 🟢 Live in production · 🔵 Proposed (not built) · 🟠 Confirmed gap/waste

---

## 1. Current State

### 1.1 Video Upload Pipeline — 🟢 Live, three parallel modes
`reviews/new/page.tsx` supports three mutually-exclusive `mediaMode`s, all posting to the same `/api/reviews` (unchanged, not touched by this document):

- **Photo** (`mediaMode: 'photo'`): client uploads each file to `/api/reviews/upload` (Vercel Blob `put()`, 5MB cap, 20/day/IP rate limit) — up to `MAX_PHOTOS = 6`.
- **Video** (`mediaMode: 'video'`): client-side validation (mp4/mov/webm, 50MB, **15-second max duration**, checked via `<video>` element metadata before upload) → client generates a JPEG thumbnail in-browser (`<canvas>` capture at 0.5s, max 1280px dimension) → both thumbnail and video upload via `@vercel/blob/client`'s `upload()`, token-issued by `/api/upload/video` (`handleUpload`, per-type size caps, `tokenPayload: user.id`) → **AI processing fires automatically** after video upload completes (see 1.2).
- **URL import** (`mediaMode: 'url'`): YouTube (thumbnail derived client-side from video ID, no network call), TikTok/Facebook (thumbnail+title fetched via `/api/explore/oembed`, the SSRF-hardened proxy from the Security phase) → AI processing also fires automatically on successful metadata fetch.

**Final publish:** `POST /api/reviews` (unchanged — rate-limited 20/day/IP, retries once without `photos` if that column errors, retries once without `rating` on constraint failure, fire-and-forget `rebuildProfile()` on success).

### 1.2 AI Analysis — 🟢 Live, narrower than needed
**File:** `src/lib/explore/contentProcessor.ts`, called via `POST /api/explore/process`. One Claude Haiku call, priority order: **caption text (if user typed one) > title text > thumbnail image** — never combines more than one input, and only calls vision (image input) when there's no caption and no title.

**Output contract (`ContentMeta`):** `{ caption, hashtags (≤5), category (food|cafe|spa|entertainment|travel|shopping|other), location (free string) }`.

**🟠 Confirmed gap:** `reviews/new/page.tsx` only consumes `ai.hashtags` and `ai.caption` from the response — **`ai.category` and `ai.location` are computed by the LLM call (cost already paid) and silently discarded**, never sent to `/api/reviews`, never persisted. This is not a design choice, it's dead code path — verified by reading the exact response-handling block.

### 1.3 AI Content Generator — 🟢 Partial (2 of 5 requested outputs exist)
Same `contentProcessor.ts` call produces **caption** and **hashtags**. It does **not** produce: a distinct **title** (separate from caption), a **summary** (distinct from caption), or an **SEO description**. There is exactly one LLM call per upload, producing one JSON object with 4 fields, 2 of which are used.

### 1.4 Smart Info Card — 🔴 Does not exist for Explore
Verified via full read of the video feed (`Post` component in `reviews/page.tsx`) and the detail page (`reviews/[id]/page.tsx`): the "bottom info" overlay shows only `place_name`, `body` (truncated), and star rating. **No platform links (Maps/Website/Booking/Agoda/ShopeeFood/GrabFood) are rendered anywhere in Explore.**

This is notable because the infrastructure to build these links **already exists and is already used elsewhere**: `src/lib/platformLinks/{food,travel,spa,entertainment,shopping}.ts` are pure, deterministic, zero-dependency URL builders (`buildFoodOrderLinks(placeName, address?, city?) → [ShopeeFood, GrabFood, BeFood]`, `buildTravelLinks(hotelName, city?) → [Booking.com, Agoda, Grab, Xanh SM]`, etc.) — chat's CTA-button system already calls these. Explore's detail/feed views call none of them.

### 1.5 Recommendation Layer — 🔴 Dormant (same engine as Phase 1)
`src/lib/recommendation/recommendationEngine.ts` — identical to the Personalization Architecture document's §1.4 finding: complete, correct, zero callers. Explore's own feed ranking (`reviews/feed/route.ts`'s trending formula: `0.35×normalizedWatch + 0.25×completionRate + 0.25×engagementRate + 0.15×recencyScore, ×locationBoost`) is a **separate, already-shipped, already-tuned** scoring system — unrelated to `rankCandidates`. No "Nearby Places / Related Food / Related Attractions / Hotels / Cafes" surface exists anywhere in Explore today; the detail page shows zero related-content recommendations.

### 1.6 Ask Tappy — 🔴 Link exists, context does not
Verified in `reviews/[id]/page.tsx`'s CTA block: `<Link href="/chat">🤖 Hỏi Tappy</Link>` — a **plain, parameterless link**. Clicking it opens a blank chat session; Tappy has zero information about which video/place the user came from. Contrast with Home's search bar, which passes `?q=` to seed chat with a query — the detail page's CTA does not use this same pattern even though it's one line away.

### 1.7 Trip Planner Integration — 🔴 Does not exist
`TripPlanCard.tsx` (chat-side component) renders a **complete, already-LLM-generated** `TappyPlan` object (parsed from a `[TAPPY_PLAN]...[/TAPPY_PLAN]` JSON block the model emits under prompt instruction — confirmed in `promptBuilder.ts`'s `buildPlanningBlock`, not modified in this document). It has exactly one persistence-adjacent action: a **"Chia sẻ" (share) button** using the Web Share API or clipboard copy. **There is no "Save Trip" feature, no trips database table, no `/api/trips` route, and no mechanism to feed Explore-extracted places into a plan.** The user's target flow (`Video → Extracted Places → Create Trip → Save`) has zero existing infrastructure beyond the rendering component itself, which expects a fully-formed plan as input, not a list of places to assemble one from.

### 1.8 Search Index — 🟢 Live, keyword-only
`reviews/page.tsx`'s `doSearch()` → `GET /api/reviews/feed?search=<query>` → PostgREST `.ilike('place_name'/'body', '%query%')` (the exact injection-hardened form from the Security phase — confirmed still in place: value is quoted and `\`/`"` escaped before interpolation). **No semantic search, no vector embeddings, no location-aware ranking of search results** (unlike the main feed's `trending` sort, which does have a `locationBoost`). User search (`doUserSearch`) is separate, exact-match-hardened (also from Security phase).

### 1.9 Place identity — 🟠 Two disconnected namespaces
Explore's `placeId` (set at upload time in `reviews/new/page.tsx`) is either `community_<slugified-place-name>` (freeform, user-typed) or `${mediaMode}_${timestamp}` (opaque, not even name-derived, for video/URL posts with no place name entered). Chat's `search_places` tool operates on Google Places/OSM place IDs — a **completely different identity space**. There is no code path anywhere that links an Explore review to a real, geocoded place record. This matters for every downstream design below (Recommendation candidates, Trip Planner extraction, Smart Info Card accuracy) — flagged once here, referenced throughout.

---

## 2. Current Problems

1. **🟠 Paid-for AI output discarded.** `category` and `location` from every `contentProcessor` call are computed, then thrown away. Immediate, zero-new-cost win: persist them.
2. **🟠 Smart Info Card infrastructure exists, unused.** `platformLinks/*` builders are production-proven (chat uses them today) and directly applicable to Explore with no new code beyond wiring — the highest-leverage, lowest-risk item in this document.
3. **🟠 "Ask Tappy" carries no context**, defeating its own purpose — a user who watches a video about a specific place and taps "Hỏi Tappy" gets a blank chat, not continuity.
4. **🟠 No place-identity linkage** between Explore content and any geocoded place data source (Google Places/OSM). This blocks accurate Smart Info Card links (falls back to name-only search URLs, which already works via `platformLinks/*` but loses precision), accurate Recommendation candidates (no `priceLevel`/verified `city` beyond a free-text guess), and Trip Planner place extraction (nothing to extract *to*).
5. **🔵 No structured metadata schema.** `category` is a 7-value enum, `location` is a free string — neither supports the requested extensibility (city/district/province/travel-style/budget/affiliate-targets/confidence).
6. **🔵 Content Generator produces 2 of 5 requested output types** (caption, hashtags — no separate title, summary, or SEO description).
7. **🔵 Recommendation Engine has the same zero-integration problem as Phase 1** — restated here because Explore is one of its two natural first consumers (§3.5 of this document, §3.2 of the Personalization document).
8. **🔵 No Trip Planner persistence layer exists at all** — this is new-feature territory, not a wiring fix, and should be scoped/sequenced accordingly (§17).
9. **🔵 Search has no semantic/location intelligence** — acceptable for MVP scale, flagged for §16 (Future Enhancements), not §15 (MVP Scope).

---

## 3. Proposed Architecture

**Design principle, consistent with the Personalization document: complete and connect what already exists before building new subsystems.** Six of eight requested capabilities (Metadata, Content Generator, Smart Info Card, Recommendation Layer, Ask Tappy, Search Index) are **wiring problems** — the hard part (AI call, scoring engine, link builders) is already built. Two (Trip Planner Integration, semantic Search) are genuinely new and are scoped as such, not disguised as wiring.

### 3.1 AI Metadata Engine — extensible schema, minimal-cost change
Replace the narrow 4-field `ContentMeta` with an extensible shape. Proposed (not implemented):

```ts
interface AIMetadata {
  category: string              // existing 7-value enum, kept for backward compat
  location: {
    raw: string                 // existing free-text output, kept as-is
    city?: string                // 🔵 new — best-effort, not guaranteed geocoded
    district?: string             // 🔵 new — best-effort
    province?: string             // 🔵 new — best-effort
  }
  hashtags: string[]             // existing
  travelStyle?: string[]         // 🔵 new — reuses the same vocabulary as preferredTravelStyle (Personalization doc §1.2), not a new taxonomy
  budgetLevel?: 'cheap' | 'mid' | 'high'  // 🔵 new — reuses the SAME enum as user_preferences.budget_level (Personalization doc), not a new one
  confidence: number             // 🔵 new — 0–1, model self-reported or heuristic (e.g. 1.0 if from explicit caption, 0.6 if from thumbnail-only vision)
  affiliateTargets: string[]     // 🔵 new — which platformLinks builders apply (e.g. ['food','maps']) — computed from `category`, not LLM-generated
}
```
**Deliberately NOT proposed:** hard-coding `city`/`district`/`province` as required fields the LLM must always fill — Vietnamese address parsing from a single free-text caption is unreliable, and forcing structure onto uncertain output produces false precision. `confidence` exists specifically so downstream consumers (Recommendation Layer, Smart Info Card) can degrade gracefully instead of trusting bad geocoding.

**Storage:** one new `jsonb` column (`reviews.ai_metadata`) rather than N new typed columns — mirrors the `preference_profile` pattern already proven in the Personalization Engine (cache-like, schema can evolve without a migration per field).

### 3.2 AI Content Generator — extend the existing single call, don't add calls
Extend `contentProcessor.ts`'s existing prompt to also return `title` (distinct, ≤60 chars, for share/SEO use) and `seoDescription` (≤160 chars). **Do not add a `summary` as a 3rd distinct text field** — for TappyAI's short-form video format, `caption` already functions as the summary; a separate field would be redundant output with no identified consumer. This keeps the cost at exactly one Haiku call per upload (unchanged), just a larger JSON response.

### 3.3 Smart Info Card — pure wiring, zero new logic
```
review.category + review.place_name + review.place_address
      ↓
platformLinks/{food,travel,spa,entertainment,shopping}.ts   [🟢 already exists, already correct]
      ↓
Rendered card below video: same visual language as chat's CTA buttons
      ↓
Direct-link only — no in-app booking, no transaction (unchanged philosophy, explicitly preserved per constraint)
```
This requires: (a) a small `category → builder` dispatch (mirrors the dispatch already living in `promptBuilder.ts`'s CTA rules, just moved to a shared location both chat and Explore can call — 🔵 proposed extraction, not a rewrite of either), (b) a new render block in the Explore detail/feed views. No new link-generation logic — the exact functions chat already ships with.

### 3.4 Ask Tappy — pass context, reuse the existing chat entry point
```
Video (review row: place_name, category, ai_metadata)
      ↓
AI Metadata (§3.1 — already computed at upload time, no new LLM call needed here)
      ↓
Prompt Context: seed chat via /chat?q=<generated question>&placeContext=<place_name>
      (mirrors the EXISTING Home search bar pattern of seeding via ?q=, §1.6)
      ↓
chat/route.ts: existing buildChatPromptContext() flow, UNCHANGED
      ↓
LLM answers with the place already in context, no new backend logic
      ↓
Answer (existing chat UI, unchanged)
```
**Zero new AI calls, zero new backend routes.** The entire fix is: change the CTA link from `/chat` to `/chat?q=...` with a place-aware pre-filled question, exactly matching a pattern that already ships elsewhere in the app.

### 3.5 Recommendation Layer for Explore
Two candidate sources for `CandidatePlace[]` hydration, presented as a trade-off (not resolved here, matches Personalization doc's Option A/B framing):

- **From `reviews` table directly** (Explore's own content) — `tags: hashtags`, `city: ai_metadata.location.city` (§3.1, confidence-gated), no real `priceLevel`/`reviewCount` beyond Explore's own like/save counts repurposed. Cheap, no external API calls, but "Nearby Places/Hotels/Cafes" would only surface *other Explore posts*, not the full place universe chat's tools can reach.
- **From the same search tools chat uses** (`search_places`/`get_hotel_prices`) — richer, real `priceLevel`/`rating`/`reviewCount`, but requires a live external API call per detail-page view (cost + latency, unlike the Personalization Engine's fully-internal data).

**Recommendation: start with the `reviews`-table source** for a "Related on TappyAI" section — zero new external API cost, reuses `rankCandidates` exactly as designed, and is honest about being Explore-content-only rather than implying live place-search freshness it doesn't have. Escalate to the external-tool source only if user engagement data justifies the added cost.

### 3.6 Trip Planner Integration — genuinely new, scoped minimally for MVP
```
Video → place_name + ai_metadata (already exists)
      ↓
🔵 NEW: "Add to Trip" action on the detail page
      ↓
🔵 NEW: minimal `trip_places` table (user_id, place_name, place_address, source_review_id, added_at)
      — NOT a full trip-planning system; just a save-list, matching MVP scope
      ↓
🔵 NEW: `/profile` surface listing saved places (re-enters chat's EXISTING planning flow —
      "Lên kế hoạch trip" chip already in ChatInterface, §ChatInterface.tsx — by pre-filling
      the chat input with the saved place names, NOT by building a second plan-generation system)
```
**Explicitly not proposed for MVP:** a second, Explore-specific plan-generation/editing UI. `TripPlanCard` + the existing `[TAPPY_PLAN]` LLM flow already do this well for chat; Trip Planner Integration's job is only to get Explore-discovered places *into* that existing flow, not to duplicate it.

### 3.7 Search Index — describe the architecture, do not implement vector search
Current `ilike` keyword search is adequate for MVP content volume. Proposed **structure** (not implementation) so a future semantic layer doesn't require a schema rewrite:
- Keep `reviews.hashtags`/`place_name`/`body` as the keyword-search source (unchanged).
- When `ai_metadata` (§3.1) ships, its `category`/`location`/`travelStyle` fields become additional **filterable** (not yet searchable) facets — a natural, low-cost precursor to faceted search before investing in embeddings.
- 🔵 Future: a `reviews.embedding vector` column (pgvector) populated from `caption + hashtags + ai_metadata` at publish time, only if/when keyword search demonstrably under-serves real queries. Not proposed for MVP — no current evidence keyword search is insufficient (no query-failure telemetry exists to justify it).

---

## 4. Module Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ reviews/new/page.tsx  (upload UI — unchanged)                    │
└───────────────┬─────────────────────────────┬────────────────────┘
                │ photo                        │ video/url
                ▼                              ▼
      /api/reviews/upload            /api/upload/video (Blob token)
      (🟢 unchanged)                  /api/explore/oembed (🟢 unchanged, hardened)
                │                              │
                └──────────────┬───────────────┘
                               ▼
                    /api/explore/process
                    → contentProcessor.ts
                    🔵 EXTENDED: +title, +seoDescription, +structured location/style/budget/confidence
                               ▼
                        POST /api/reviews
                    🔵 EXTENDED: accepts + persists ai_metadata jsonb (currently dropped)
                               ▼
                          reviews table
                               │
          ┌────────────────────┼─────────────────────┬───────────────────┐
          ▼                    ▼                      ▼                   ▼
  Explore Feed           Detail Page            Recommendation      Ask Tappy
  (🟢 unchanged           🔵 + Smart Info Card    Layer (§3.5)        (§3.4 — CTA
   ranking formula)        (§3.3, platformLinks)  🔵 candidate         becomes context-
                                                    hydration from      aware /chat?q=)
                                                    reviews table
```

---

## 5. Database Impact

All proposed, none applied. Ordered by risk:

1. **`reviews.ai_metadata jsonb DEFAULT NULL`** — additive, nullable, zero risk to existing rows/queries. Backing store for §3.1.
2. **`trip_places` table (new)** — `id, user_id, place_name, place_address, source_review_id (nullable FK → reviews), added_at`. New table, zero impact on existing schema. Needed only for §3.6.
3. **No changes to `reviews`' existing typed columns** (`category`/`hashtags`/`location` stay as they are — `ai_metadata` supplements, does not replace, avoiding a breaking migration of already-populated rows).
4. **No vector/pgvector extension** — explicitly deferred (§3.7), not proposed now.

---

## 6. API Design

| Endpoint | Change | Notes |
|---|---|---|
| `POST /api/explore/process` | 🔵 response gains `title`, `seoDescription`, `location.{city,district,province}`, `travelStyle`, `budgetLevel`, `confidence`, `affiliateTargets` | Same call, same cost, larger response |
| `POST /api/reviews` | 🔵 accepts optional `ai_metadata` in payload, persists as-is (no new validation logic beyond existing JSON parsing) | Backward-compatible — omitted field = `NULL`, unchanged behavior for old clients |
| `GET /api/reviews/[id]/related` 🔵 new | Wraps `rankCandidates()` (§3.5) over a `reviews`-sourced candidate set | Read-only, no mutation, cacheable |
| `POST /api/trip-places` 🔵 new | Insert into `trip_places` | Session-derived `user_id` only, mirrors every other write route's auth pattern |
| `GET /api/trip-places` 🔵 new | List current user's saved places | — |
| `/chat?q=...&placeContext=...` | 🔵 URL contract extension | No backend change — chat already accepts `?q=`; `placeContext` (if adopted) would just be folded into the seeded question text client-side, not a new server parameter |

---

## 7. Data Flow

```
Upload → Blob storage → contentProcessor (1 LLM call) → ai_metadata (full, now persisted)
                                                                │
                                                    ┌───────────┴───────────┐
                                                    ▼                       ▼
                                            Smart Info Card         Recommendation candidate
                                            (platformLinks          (rankCandidates input,
                                             dispatch by category)   tags = hashtags, city =
                                                                      ai_metadata.location.city)
```

---

## 8. AI Flow

Exactly **one** LLM call in the entire pipeline (unchanged from today — §3.2 extends its output, does not add a second call): `contentProcessor.ts`'s Haiku call at upload time. Every downstream consumer (Smart Info Card, Recommendation Layer, Ask Tappy's context-seeding) is **deterministic** — reads already-computed `ai_metadata`, no additional inference. This mirrors the Personalization Engine's core design principle (Learning/Recommendation Engines are LLM-free) and should be treated as a hard constraint here too, not just current behavior.

---

## 9. Sequence Diagram (text)

**Proposed — publish with full metadata (extends §1.1–1.2, not a rewrite):**
```
User → reviews/new: selects video, adds caption
reviews/new → Blob: upload video + thumbnail        [unchanged]
reviews/new → /api/explore/process: {thumbnail_url, caption}
/api/explore/process → Anthropic: 1 Haiku call        [unchanged cost]
Anthropic → /api/explore/process: {caption, hashtags, category, location, title, seoDescription, ...}  [🔵 extended]
/api/explore/process → reviews/new: full ai_metadata   [🔵 was: only hashtags+caption returned to caller]
reviews/new → /api/reviews: POST {..., ai_metadata}    [🔵 was: ai_metadata dropped before this call]
/api/reviews → reviews table: insert row with ai_metadata
```

**Proposed — Ask Tappy (§3.4):**
```
User → reviews/[id]: taps "Hỏi Tappy"
reviews/[id] → browser: navigate to /chat?q=<generated question about place_name>
chat/route.ts → [existing flow, completely unchanged] → LLM → Answer
```

**Proposed — Related places (§3.5):**
```
User → reviews/[id]: page load
reviews/[id] → /api/reviews/[id]/related
/api/reviews/[id]/related → contextBuilder.buildAIContext(userId)   [reuses Personalization Engine fix]
/api/reviews/[id]/related → reviews table: fetch candidate pool (same category/city)
/api/reviews/[id]/related → recommendationEngine.rankCandidates()
/api/reviews/[id]/related → reviews/[id]: ranked list
```

---

## 10. Security

- `ai_metadata` is LLM-generated, **never** used to construct SQL/filter strings directly — any future filtering must go through the same parameterized/escaped pattern already established for `search` in the Security phase (§ current problems item in that phase's audit), not string-interpolated.
- `POST /api/trip-places` (§3.6) must derive `user_id` from session exactly like every other write route audited in the Security phase — flagged explicitly here so it isn't built as an exception.
- Smart Info Card links (§3.3) reuse `platformLinks/*`, which are pure string builders with no user-controlled URL construction beyond `encodeURIComponent`-wrapped place names — same safety property already relied on in chat, no new surface.
- `GET /chat?q=...` context-seeding (§3.4) must continue treating the query param as **display/prompt text only**, never as executable instruction — this is already how Home's search bar seeding works today; no new trust boundary introduced.

---

## 11. Performance

- §3.1–3.3 (metadata persistence, Smart Info Card) add **zero new LLM calls and zero new external API calls** — purely additive storage + deterministic rendering. No performance risk.
- §3.5 (Recommendation candidates from `reviews` table) adds one DB query + one in-memory `rankCandidates()` call per detail-page view if implemented as a synchronous fetch — should be measured, and is a reasonable candidate for the same `Promise.all`-parallel pattern already used throughout the codebase (e.g., `buildChatPromptContext`) rather than a sequential await.
- §3.4 (Ask Tappy context-seeding) adds no backend cost at all — it's a client-side link-construction change.

---

## 12. Cost Optimization

- The single highest-value cost insight in this document: **§3.1–3.2 do not add any new AI cost** — they extend the JSON schema of an *already-paid-for* Haiku call whose output is currently 50% discarded (`category`, `location`). This is pure waste-elimination, not new spend.
- §3.5's Recommendation Layer, sourced from the `reviews` table (not live external search), has **zero external API cost** — the explicit reason that source was recommended over the external-tool alternative (§3.5).
- No proposal in this document adds a recurring AI cost. The only new spend risk would be if the external-tool candidate source (§3.5's rejected-for-now alternative) is chosen later — flagged so that decision is made consciously, not by default.

---

## 13. Scalability

- `reviews.ai_metadata jsonb` scales the same way `preference_profile` already does (proven pattern, no new operational risk).
- `trip_places` (§3.6) is a simple, indexable-by-`user_id` table — no scaling concern at MVP volume, and its minimal shape (no plan-editing state machine) avoids the complexity that would come with a full itinerary-builder table design.
- Recommendation candidate pool size (§3.5) should be bounded (e.g., same-category/city filter before `rankCandidates`, not a full-table scan) — flagged as an implementation requirement, not deferred.

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Extending `contentProcessor`'s JSON schema (§3.2) increases the chance of malformed/partial LLM output (more fields = more can go missing) | Low-Medium | Existing code already tolerates partial JSON (`typeof p.category === 'string' ? ... : 'other'` fallback pattern) — extend the same defensive parsing to new fields, don't assume completeness |
| `ai_metadata.location.city/district/province` will often be wrong or empty for thumbnail-only (no caption) uploads | Medium | `confidence` field (§3.1) exists specifically so consumers can ignore low-confidence location data — must actually be respected by any future UI, not just computed and ignored (the same failure mode as today's discarded `category`/`location`) |
| Recommendation candidates sourced only from `reviews` table (§3.5) may return few/no results for niche categories or new cities | Low | Acceptable for MVP — a sparse or empty "Related" section degrades gracefully (simply don't render the section), no error state needed |
| `trip_places` (§3.6) could be scope-crept into a full trip-planning system during implementation | Medium | This document explicitly bounds it to a save-list; any expansion should be a new, separately-reviewed proposal |

---

## 15. MVP Scope

**In scope (wiring existing capability):**
- §3.1 metadata schema extension + persistence
- §3.2 title/SEO description addition (no new LLM call)
- §3.3 Smart Info Card (platformLinks reuse)
- §3.4 Ask Tappy context-seeding

**In scope, smaller/new but minimal:**
- §3.5 Recommendation Layer, `reviews`-table candidate source only (not external-tool source)
- §3.6 Trip Planner Integration, save-list only (not a second plan-generation system)

**Explicitly out of scope for MVP:**
- §3.7 semantic/vector search — no implementation, structure-only awareness
- External-tool-sourced Recommendation candidates (§3.5's rejected alternative)
- Any Explore-specific plan-editing UI (§3.6)

---

## 16. Future Enhancements

- Vector search (§3.7) once query-failure telemetry justifies it.
- External-tool-sourced Recommendation candidates once `reviews`-table-only results prove insufficient (measurable via empty-related-section rate).
- Place-identity convergence (§1.9) — a real fix (linking Explore `place_id` to Google Places/OSM `place_id`) would upgrade Smart Info Card accuracy, Recommendation candidate quality, and Trip Planner extraction all at once, but requires either an upload-time place-search-and-confirm UI step (new UX, not proposed here) or a retroactive geocoding pass (cost + accuracy risk) — deliberately left as a named future decision, not designed here.
- Full Trip Planner (multi-day itinerary editing from Explore-saved places, not just a save-list feeding chat) — natural v2 once §3.6's save-list usage data exists.

---

## 17. Implementation Order

1. Persist `ai_metadata` end-to-end (§3.1 schema + §6 API changes) — zero new cost, immediate value, prerequisite for everything else in this document.
2. Extend `contentProcessor`'s prompt for title/SEO description (§3.2) — same call, ship alongside step 1.
3. Smart Info Card (§3.3) — pure wiring of existing `platformLinks/*`, no dependency on steps 1–2 (uses `place_name`/`category`, both already persisted today).
4. Ask Tappy context-seeding (§3.4) — independent of all other steps, smallest possible change (one CTA link).
5. Recommendation Layer, `reviews`-table source (§3.5) — depends on step 1 (`ai_metadata.location.city` improves candidate `city` accuracy, though the feature works without it using existing `place_address`).
6. Trip Planner save-list (§3.6) — new table + 2 endpoints, independent of steps 1–5, can proceed in parallel.
7. Search Index structure-awareness (§3.7) — no implementation; revisit only per §16's trigger condition.

---

*This document is Phase 2 of Architecture Week. Stopping here per instructions — awaiting confirmation before Phase 3 (Final Architecture Review).*

# TappyAI — AI Personalization Engine Architecture

> **Phase:** Architecture Week — Phase 1 of 3
> **Scope:** User Memory Engine, Preference Engine, Context Engine, Recommendation Engine, Learning Engine
> **Status:** Design/analysis only — no code changes in this document
> **Grounding:** Every claim below was verified against the live repository (`src/lib/memory/memoryService.ts`, `src/lib/ai/contextBuilder.ts`, `src/lib/preferences/*.ts`, `src/lib/recommendation/*.ts`, `src/types/*.ts`) and against production Supabase (`fwznnobrdctuskgrvuik`) via a live REST probe of `user_preferences`, which returned exactly 14 columns matching the migration history. No claim here is speculative.
> **Convention:** 🟢 Live in production · 🔵 Proposed (not built) · 🟠 Confirmed technical debt

---

## 1. Current State

TappyAI's personalization is not one engine — it is **five components at different maturity levels**, some live, one fully dormant.

### 1.1 User Memory Engine — 🟢 Live
**File:** `src/lib/memory/memoryService.ts` — the single gateway to the `user_memory` table (enforced convention, verified: `.from('user_memory')` appears only inside this file, with one documented exception below).

- **Shape:** `location_base`, `preferences` (jsonb: `food/spa/entertainment/shopping/avoid` string arrays), `budget` (jsonb: per-category `{min,max}`), `history` (string[], last 10 topics), `companions`, `timing`, `personality` (free-text strings), `behavior_summary` (cron-written, see 1.5), `updated_at`.
- **Write path:** `extractMemoryFromConversation()` — one Claude Haiku call per chat turn (`claude-haiku-4-5`, `maxTokens:500`), given the last-5-turns memory context + the user's messages, returns a JSON diff. Result is merged (existing values kept when the LLM returns nothing new) and upserted via `updateMemory()` in `chat/route.ts`'s `onFinish`.
- **Read path:** `getMemory(userId, client?)` / `getMemoryBatch(userIds, client)` — dependency-injected Supabase client; omitted → cookie-scoped server client (request-scoped callers), provided → admin client (cron jobs). This is the **only** cross-cutting architectural pattern already proven to scale across both request and background contexts.
- **Rendering:** `buildMemoryBlock(memory, forcedTool?)` — pure function, turns the row into a Vietnamese text block injected into the system prompt. Suppresses preference/budget/history detail when `forcedTool` is `get_weather`/`get_gold_price` (info-only tools) or `get_news` (location+history only).
- **Consumers:** `chat/route.ts` (read+write), `onboarding`, `suggested-prompts`, `/api/memory` (GET/POST/DELETE — user-facing "what does Tappy know about me" surface), `app/page.tsx` (home hero), 3 cron jobs.

### 1.2 Preference Engine (explicit) — 🟢 Live
Explicit, user-declared signals living in `user_preferences` (**verified live via production REST probe — exact column list**):

```
user_id, budget_level, cuisine_likes, dietary_restrictions, inferred_preferences,
updated_at, budget_min, budget_max, preferred_style, dietary_tags, disliked_tags,
usual_party_size, preference_profile, profile_updated_at
```

| Column | Writer | Status |
|---|---|---|
| `budget_level`, `cuisine_likes`, `dietary_restrictions`, `preferences` (freeform, jsonb) | `/api/preferences` PUT/POST (settings UI) | 🟢 Live |
| `inferred_preferences` (jsonb weight map) | `/api/bookings`'s `inferFromBooking()` | 🟢 Live, derived from booking history |
| `preferred_style` (text[]) | `userMemory.ts::inferPreferencesFromEvents()` (canonical single writer, Sprint 0.3) | 🟢 Live |
| `budget_min`, `budget_max`, `dietary_tags`, `disliked_tags`, `usual_party_size` | — none — | 🟠 Dead columns, never written |
| `preference_profile`, `profile_updated_at` | `profileCache.setProfile()` (Learning Engine output) | 🟢 Live — see 1.5 |

### 1.3 Context Engine — 🟢/🔵 Split
**File:** `src/lib/ai/contextBuilder.ts` — two functions with genuinely different lifecycles, confirmed by fresh read + grep:

- **`buildChatPromptContext(userId, supabase)` — 🟢 Live.** The chat route's sole context source. Fetches `getMemory()` + explicit `user_preferences` columns (`budget_level, cuisine_likes, dietary_restrictions, inferred_preferences`) in parallel, returns `{memory, prefs}` for `buildMemoryBlock`/`buildPrefBlock` (in `promptBuilder.ts`) to render as text.
- **`buildAIContext(userId, supabase)` — 🔵 Built, zero callers (confirmed via repo-wide grep: only its own definition and documentation reference it).** Produces the richer `AIContextResult`: merges `preference_profile` (Learning Engine output) with `user_memory` into a normalized `AIContext` (`city, budget, favoriteFoods, favoriteCategories, recentInterests, travelStyle, hiddenTopics, companions, timing, personality`) plus a `confidence` score. Gated by `MIN_CONFIDENCE = 0.1` — returns `null` below that. **🟠 Debt: reads `user_memory` directly, bypassing `memoryService` — the one documented exception to the gateway rule, acceptable only because it's dormant.**

### 1.4 Recommendation Engine — 🔵 Built, fully dormant
**Files:** `src/lib/recommendation/recommendationEngine.ts`, `config.ts`, `src/types/recommendation.ts`. Confirmed via grep: `rankCandidates` has **zero callers** anywhere in the app.

- Pure, stateless, no DB access, no LLM calls: `rankCandidates(context: AIContextResult, candidates: CandidatePlace[]): RecommendationResult`.
- Six weighted signals summing to 1.0: `affinity 0.35` (tag overlap with favoriteFoods/Categories), `location 0.20` (city match), `budget 0.15` (price-level match), `recentInterests 0.15` (tag overlap with recent searches), `popularity 0.10` (normalized review count + rating), `freshness 0.05` (recency decay over 90 days).
- `HIDDEN_TOPIC_PENALTY = 0.30` flat subtraction (not multiplicative) when a candidate's tags overlap `hiddenTopics`. `MIN_SCORE_THRESHOLD = 0.05` filters, `MAX_RECOMMENDATIONS = 10` caps.
- **Nothing produces `CandidatePlace[]`.** There is no query, no adapter, from search results (Google Places/OSM/Serper) or from the Explore `reviews` table into this shape. This is the entire reason it's dormant — not a bug, an unfinished integration.

### 1.5 Learning Engine — 🟢 Live (producer), 🔵 consumer half dormant
**Files:** `src/lib/preferences/{signalCollector,learningEngine,affinityGraph,taxonomy,profileBuilder,profileCache,config}.ts`. Deterministic, no LLM, pure functions except the two Supabase-touching edges.

**Pipeline** (confirmed via fresh read of every file):
```
collectSignals(userId)          — 6 parallel reads, 90-day window (SIGNAL_WINDOW_DAYS)
   → review_likes, review_saves, review_interactions (completion_rate ≥0.8 → watch_complete else view),
     user_events (chat_search/review_share/hide/not_interested/report only),
     reviews (own posts), user_follows
computeWeightedSignals(raw)     — event weight × time-decay, aggregated into food/category/city score maps
   → weights: view1 watch_complete2 like3 save6 share8 follow10 write_review12 search2
   → decay: ≤30d×1.0 ≤60d×0.7 ≤90d×0.4 older×0.2
   → confidence = min(totalWeightedPoints / 200, 1.0)
enrichWithAffinity(weighted, negativeSignals) — taxonomy propagation + negative learning
   → DIRECT 1.0 / PARENT 0.8 / GRANDPARENT 0.5 / ROOT 0.3 (walks TAXONOMY_TREE ancestors)
   → negative weights hide2 not_interested3 report5, same propagation, scores clamp ≥0
buildProfile(affinity, explicitPrefs)  — pure assembly → UserPreferenceProfile
setProfile(userId, profile)     — writes user_preferences.preference_profile + profile_updated_at
```
- **Trigger:** fire-and-forget `rebuildProfile()` from 6 event routes (like/save/interact/reviews-post/follow, `/api/track` on search-or-negative events). Fire-and-forget means a slow/failing rebuild **cannot** break the triggering API response — verified architectural property, not just intent.
- **Only synchronous consumer:** `/api/preferences/profile` (GET rebuilds if cache miss; POST force-rebuilds).
- **No other consumer exists.** `preference_profile` is computed and stored but nothing reads it for ranking (that's `buildAIContext` → `rankCandidates`, both dormant).

### 1.6 AI / Prompt Flow (how personalization actually reaches the model today)
```
chat/route.ts
  → buildChatPromptContext(userId)     [memory + explicit prefs, NOT preference_profile, NOT Learning Engine output]
  → buildMemoryBlock(memory) + buildPrefBlock(prefs)  [promptBuilder.ts, pure text rendering]
  → streamText({ messages: [{role:'system', content: systemPrompt, providerOptions:{anthropic:{cacheControl:'ephemeral'}}}, ...history] })
  → getModel(tier)  [simple→claude-haiku-4-5, standard/planning/vision→claude-haiku-4-5-20251001]
```
**Critical fact:** the Learning Engine's output (`preference_profile` — favoriteFoods, favoriteCategories, confidence-scored city/budget) **never reaches the LLM prompt today.** Only raw `user_memory` + explicit `user_preferences` columns do. The entire behavioral-learning half of personalization is invisible to the chat experience — it only feeds the (currently unused) Recommendation Engine.

---

## Personalization Data Flow

### Current Flow (as implemented — verified)

There are **two parallel, disconnected loops** today, not one unified flow.

**Loop A — Chat / Memory Engine (reaches the LLM):**
```
User sends chat message
      ↓
chat/route.ts
      ↓
buildChatPromptContext() → memoryService.getMemory() + user_preferences (explicit cols)
      ↓
promptBuilder.buildMemoryBlock() + buildPrefBlock()
      ↓
LLM (streamText)
      ↓
Response (streamed to user)
      ↓
Feedback: onFinish → extractMemoryFromConversation() (Haiku call)
      ↓
memoryService.updateMemory() → loops back into user_memory for the NEXT chat turn
```
Complete and live. Never touches Learning Engine, Preference Profile, or Recommendation Engine.

**Loop B — Behavioral / Learning Engine (dead end — never reaches the LLM):**
```
User Action (like / save / follow / post / search / negative feedback)
      ↓
Event (review_likes / review_saves / review_interactions / reviews / user_follows / user_events)
      ↓
rebuildProfile() → signalCollector → learningEngine → affinityGraph → profileBuilder
      ↓
Preference Profile (user_preferences.preference_profile)
      ↓
❌ DEAD END — nothing reads preference_profile back into Context Builder / Prompt Builder / LLM
```
`buildAIContext()` (Context Builder) is coded to merge `preference_profile` + `user_memory`, but has **zero callers** (verified via grep, §1.3/§2.4). `rankCandidates()` (Recommendation Engine) is coded to consume `buildAIContext()`'s output, but also has zero callers.

**Net result:** the "ideal" loop (`User Action → Event → Learning Engine → Preference Profile → Memory Engine → Context Builder → Prompt Builder → LLM → Response → Feedback → Learning Engine`) does not exist in the current codebase. `Memory Engine` and `Context Builder → Prompt Builder → LLM` are fully live but never receive input from `Event → Learning Engine → Preference Profile`.

### Target Flow (MVP — proposed in §3.1, not yet implemented)

```
User Action
      ↓
Event  (behavioral: review_likes/saves/interactions/follows/reviews/user_events
        OR conversational: chat message)
      ↓
   ┌────────────────────────┬──────────────────────────┐
   ▼ (behavioral path)                                  ▼ (conversational path)
Learning Engine                                  Memory Engine
(signalCollector → learningEngine →              (extractMemoryFromConversation,
 affinityGraph → profileBuilder)                  fire-and-forget in onFinish)
      ↓                                                  ↓
Preference Profile                                user_memory
(user_preferences.preference_profile)                    │
      ↓                                                  │
      └───────────────► Context Builder ◄─────────────────┘
                     (buildAIContext — FIXED to use
                      memoryService.getMemory(), §2.4)
                              ↓
                         Prompt Builder
                 (buildMemoryBlock + buildPrefBlock +
                  NEW buildBehaviorBlock from AIContext)
                              ↓
                             LLM
                              ↓
                          Response
                              ↓
                          Feedback  (user keeps acting: like/save/next message)
                              ↓
                      back to Event (loop closes)
```

**Deliberate deviation from the "ideal" single-chain diagram:** the target flow keeps **two parallel inputs** (behavioral → Learning Engine, conversational → Memory Engine) converging at Context Builder, instead of one linear chain. This matches how the two source signals genuinely differ — one is fire-and-forget background scoring, the other is a synchronous per-turn LLM extraction — and avoids forcing them into an artificial single pipeline that neither naturally fits. This is the single most important architectural decision in this document.

---

## Engine Status Matrix

| Engine | Current Status | Production Usage | Priority | Notes |
|---|---|---|---|---|
| **Memory Engine** | 🟢 Live | High — every chat turn (read + write) | Maintain | Single gateway (`memoryService.ts`), Haiku-based extraction, no known defects |
| **Preference Engine** (explicit) | 🟢 Live | Medium — settings UI + booking-inference | Maintain | 3 independent writers (`/api/preferences`, `/api/bookings`, `userMemory.ts`), each scoped to disjoint columns — no write conflict found |
| **Context Engine** | 🟡 Split | `buildChatPromptContext`: High (every chat turn) · `buildAIContext`: **Zero** (dormant, verified via grep) | High | Highest-leverage fix in this document — one gateway-bypass bug (§2.4) away from being wireable |
| **Learning Engine** | 🟢 Live (producer) / 🔴 unused (consumer) | High trigger volume (6 event routes fire it) · **zero read consumption** of its output | High | Fully computed on every like/save/follow; output currently pure waste until wired to §3.1 |
| **Recommendation Engine** | 🔴 Dormant | None — zero callers (verified via grep) | Medium | Complete, correct, cleanly isolated; blocked only by a missing candidate-hydration adapter, not by any defect |

Legend: 🟢 live in production · 🟡 partially live · 🔴 built, zero production callers.

---

## 2. Problems

Ranked by architectural significance, all confirmed (not speculative):

1. **🟠 Critical gap — Learning Engine output is invisible to chat.** The system that scores affinity, decays old signals, and propagates taxonomy produces a `preference_profile` that literally nothing shows the user or the LLM. All that computation runs on every like/save/follow for zero current benefit.
2. **🟠 Recommendation Engine has no integration surface.** Complete scoring logic, zero candidate producers. This isn't "almost done" — it's a correctly-scoped, cleanly-isolated module waiting for its other half.
3. **🟠 Search-signal wiring gap.** `signalCollector` filters `user_events` for `chat_search`, but grep confirms **no code path emits `chat_search`** — only `review_search` is tracked (from `reviews/page.tsx`), and `review_search` is **not** in the collector's filter list. Net effect: `recentInterests` in the Learning Engine profile is almost always empty in practice, even though the code path is fully wired.
4. **🟠 `buildAIContext` bypasses the memory gateway** — direct `user_memory` read instead of `memoryService.getMemory()`. Harmless while dormant; must be fixed before this function is ever called from a live path.
5. **🟠 Two independent "style" concepts.** `user_preferences.preferred_style` (simple ≥3-occurrence threshold counter, written by `userMemory.ts`) and `preference_profile.preferredTravelStyle` (decay+taxonomy Learning Engine output, but actually just a pass-through of `preferred_style` per `profileBuilder.ts:42` — it doesn't compute its own value, it *reads* `preferred_style` as an input). This means they're not actually competing implementations of the same concept — `preferredTravelStyle` is just `preferred_style` copied into the profile blob. The real issue is naming/discoverability, not conflicting computation.
6. **🟠 `userMemory.ts` is a legacy module with its own event vocabulary.** `logUserEvent`'s `UserEventType` (`like|skip_suggestion|checkin|view_review|open_app`) diverges from `/api/track`'s `ALLOWED_TYPES` (16 values) and from the DB `CHECK` constraint added during the Security phase (21-value union of both vocabularies, `NOT VALID` so it doesn't retroactively enforce). `userMemory.ts` remains the **canonical single writer** for `preferred_style` (Sprint 0.3) — it is not redundant, but its event-logging side (`logUserEvent`) is a parallel, narrower vocabulary that nothing else uses.
7. **🟠 Dead schema.** `budget_min`, `budget_max`, `dietary_tags`, `disliked_tags`, `usual_party_size` — columns exist, nothing ever writes them. `behavior_summary` in `user_memory` — cron writes it weekly, nothing reads it back.
8. **🔵 No LLM-provider abstraction for memory extraction.** `extractMemoryFromConversation` hardcodes `createAnthropic(...)`. The chat pipeline already uses the Vercel AI SDK's `streamText`/model abstraction (provider-agnostic by design), but memory extraction calls `generateText` with a raw `createAnthropic()` instance instead of going through `getModel(tier)`. Multi-LLM readiness (explicitly asked about in Phase 3) is blocked here specifically, not in the main chat path.
9. **🔵 No API surface designed for a non-web client.** Every personalization read/write today assumes a Next.js server component or a same-origin fetch with a cookie session. Android will need the same capabilities (read profile, read memory, trigger onboarding) through a contract that doesn't assume Next.js internals.
10. **🔵 Cost exposure not fully mapped.** Anthropic prompt caching is confirmed working for the *system prompt* (verified in an earlier phase via live `cacheReadInputTokens`). The **memory-extraction call** (`extractMemoryFromConversation`, one Haiku call per substantive turn) is a separate, uncached cost that scales linearly with message volume — never load-tested or budgeted.

---

## 3. Proposed Architecture

**Design principle for this phase: complete the wiring between engines that already exist; do not introduce a new storage paradigm for MVP.** The blob-based `user_memory` + the deterministic `preference_profile` cache are both working, cheap, and simple. The atomic "fact store" (`user_facts`, one row per discrete extracted fact with its own confidence/decay) considered early in this project remains the right *next-generation* design — but only once the current two-engine setup is fully wired and shows real usage data justifying the migration cost. It is documented as a v2 direction in §12, not proposed for MVP.

### 3.1 Close the loop: Learning Engine → Context Engine → Chat
```
user action (like/save/follow/search/negative feedback)
   → rebuildProfile() [unchanged, already fire-and-forget]
   → preference_profile written [unchanged]

buildAIContext(userId, supabase)          🔵 → 🟢 (fix gateway bypass: use memoryService.getMemory())
   → merges preference_profile + user_memory → AIContext + confidence

buildChatPromptContext()  🟢 (existing, chat route's current source)
   + NEW: optionally enrich with AIContext.favoriteFoods/favoriteCategories when confidence ≥ MIN_CONFIDENCE
   → promptBuilder renders an additional, clearly-labeled "hành vi gần đây" block
     (kept separate from the existing memory/pref blocks — additive, not a rewrite of buildSystem)
```
This is the single highest-leverage change: it makes the Learning Engine's computation actually influence what the user sees, using **only** already-built code (`buildAIContext` exists; it only needs the gateway fix + one new call site in `chat/route.ts` + one new render function in `promptBuilder.ts`).

### 3.2 Wire the Recommendation Engine to one real consumer
The Explore feed is the natural first consumer — it already computes its own trending score in `reviews/feed/route.ts` (recency/watch/engagement weighted formula, unrelated to `rankCandidates`). Two integration options, presented as a genuine trade-off (not implemented here):

- **Option A — replace the feed's inline scoring with `rankCandidates`.** Requires a `CandidatePlace[]` adapter mapping `reviews` rows (hashtags→tags, place_address→city, no priceLevel today) to the contract. Risk: `rankCandidates` needs `AIContext.city`/`budget` which most anonymous/new users won't have (confidence gate) — would need a documented fallback to the existing trending formula when `buildAIContext` returns `null`.
- **Option B — keep Explore's own trending formula, use `rankCandidates` for a *new* surface** (e.g., a "Gợi ý cho bạn" section on Home, or a ranked candidate list for chat's `search_places` tool results). Lower risk (doesn't touch a shipped, tuned ranking formula), smaller blast radius, but doesn't retire the parallel scoring logic.

**Recommendation: Option B first.** It proves the pipeline end-to-end (candidate hydration → `rankCandidates` → rendered output) without risking Explore's already-tuned feed. Migrating Explore itself (Option A) becomes a follow-up decision once Option B has real usage data.

### 3.3 Close the search-signal gap
Two independent, small fixes (not a redesign):
- Emit `chat_search` from the chat client (or server-side in `chat/route.ts` when a place-search tool fires) with `{query}` metadata — matching the shape `signalCollector` already expects.
- Add `review_search` to `signalCollector`'s `user_events` filter (currently only `chat_search`), since it's already being tracked and already allow-listed at `/api/track` — purely a one-line filter addition.

### 3.4 Provider-agnostic memory extraction
Route `extractMemoryFromConversation` through `getModel(tier)` (provider.ts) instead of a raw `createAnthropic()` instance, using a new `'extraction'` tier mapped to the cheapest available model per provider. This is the one place multi-LLM readiness has a concrete, scoped fix — everything else (chat, Learning Engine, Recommendation Engine) is already provider-agnostic (Learning Engine has no LLM calls at all; chat already goes through `getModel`).

### 3.5 Personalization API surface for Android
Propose a stable, versioned, non-Next.js-coupled contract. All of these can be thin wrappers over **already-existing functions** — no new business logic:

| Endpoint | Wraps | Purpose |
|---|---|---|
| `GET /api/memory` | `getMemory()` (🟢 exists) | "What does Tappy know about me" |
| `DELETE /api/memory` | `clearMemory()` (🟢 exists) | Privacy control |
| `GET /api/preferences/profile` | `getProfile()`/`rebuildProfile()` (🟢 exists) | Behavioral profile for client-side use |
| `GET /api/context` 🔵 new, thin | `buildAIContext()` (🔵 exists, needs gateway fix) | Single normalized personalization payload — the contract Android should actually consume, instead of stitching memory+prefs client-side |
| `POST /api/track` | (🟢 exists) | Signal ingestion — already stateless/JSON, Android-ready as-is |

**Open decision, not resolved here:** will Android read Supabase directly via the native SDK for simple table reads (profile, preferences), or exclusively through these Next.js API routes? Direct SDK access would bypass `memoryService`'s gateway guarantee and RLS becomes the only enforcement layer. Recommend **API-only for personalization reads** (not direct SDK) specifically so the single-gateway property (memoryService) and the confidence-gating logic in `buildAIContext` aren't silently reimplemented or bypassed on a second client. This should be a Phase 3 (Final Review) decision, flagged here for visibility.

---

## 4. Database Changes (proposed — not applied)

No new tables required for §3.1–3.3. Proposed, ordered by risk:

1. **Deprecate 5 dead `user_preferences` columns** (`budget_min`, `budget_max`, `dietary_tags`, `disliked_tags`, `usual_party_size`) — either build the missing writer (if the product still wants per-user budget ranges/dietary tags/party size as explicit onboarding fields) or drop them in a follow-up migration. Zero risk either way since nothing reads or writes them today.
2. **`behavior_summary` (user_memory):** either wire it into `buildMemoryBlock()` (cheap — the cron already computes a readable Vietnamese summary string) or stop writing it. Currently pure waste (weekly cron cost, zero benefit).
3. **Consolidate `user_events` write path:** migrate `userMemory.ts::logUserEvent` callers (if any remain in the client) onto `/api/track`, retiring the narrower `UserEventType` vocabulary. The `CHECK` constraint already added during the Security phase is the enforcement backstop; this closes the last vocabulary-drift source feeding into it.
4. **🔵 v2 direction, not MVP:** `user_facts` atomic table (one row per discrete fact: `{user_id, fact_type, value, confidence, source, extracted_at, expires_at}`) as a successor to the `user_memory` blob — enables per-fact confidence/decay/multi-LLM-extraction provenance that a single JSON blob cannot express cleanly. Explicitly deferred; the current blob design has not yet hit a scaling or correctness ceiling that justifies the migration.

---

## 5. API Design

Covered in §3.5. Summary of the only genuinely new endpoint:

```
GET /api/context
Auth: session (mirrors /api/memory)
Response 200: AIContextResult | { profile: null, confidence: 0 }   (never errors on missing data — mirrors buildAIContext's null-on-low-confidence contract)
Response 401: no session
```
No request body, no mutation — pure read, cacheable client-side with a short TTL (profile changes are fire-and-forget and eventually-consistent already).

---

## 6. Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│ Explicit UI  │     │ Chat LLM     │     │ Behavioral events  │
│ (/preferences)│    │ extraction   │     │ (like/save/follow/ │
│              │     │ (Haiku)      │     │  search/negative)  │
└──────┬───────┘     └──────┬───────┘     └─────────┬──────────┘
       │                    │                        │
       ▼                    ▼                        ▼
user_preferences      user_memory              user_events +
(explicit cols)       (memoryService)          review_likes/saves/
       │                    │                  interactions/follows/
       │                    │                  reviews
       │                    │                        │
       │                    │                        ▼
       │                    │              signalCollector → learningEngine
       │                    │              → affinityGraph → profileBuilder
       │                    │                        │
       │                    │                        ▼
       │                    │              preference_profile (cache)
       │                    │                        │
       └──────────┬─────────┴────────────┬───────────┘
                   ▼                      ▼
         buildChatPromptContext()   buildAIContext()  🔵 (needs gateway fix)
                   │                      │
                   ▼                      ▼
         Chat system prompt      AIContext + confidence
         (🟢 live today)                  │
                                           ▼
                                  rankCandidates()  🔵 (needs a candidate producer)
                                           │
                                           ▼
                                  Ranked recommendations (🔵 no consumer yet)
```

---

## 7. AI Flow

Two distinct AI touchpoints, both already provider-tiered via `getModel()` except one:

1. **Chat response generation** — `streamText`, tiered model (`simple`/`standard`/`planning`/`vision`), system prompt includes memory+prefs blocks, cached via `providerOptions.anthropic.cacheControl:'ephemeral'` on the `messages[0]` system entry. 🟢 Provider-agnostic via AI SDK's model abstraction.
2. **Memory extraction** — `generateText`, hardcoded `createAnthropic()`, no tiering, no caching (each call is a fresh ~500-1000 token prompt with no cache-eligible static prefix, since the "existing memory" JSON changes per-user per-call). 🟠 Not provider-agnostic (§2.8), 🔵 proposed fix in §3.4.

No AI call is currently made for Learning Engine or Recommendation Engine — both are deterministic. This is a deliberate, already-correct design choice worth preserving: behavioral scoring should stay LLM-free (cheaper, faster, explainable via `matchedSignals`/`explanation` in `RecommendationResult`).

---

## 8. Sequence Diagram (text)

**Today — chat turn:**
```
User → chat/route.ts: POST message
chat/route.ts → memoryService: getMemory(userId)         [via buildChatPromptContext]
chat/route.ts → user_preferences: select explicit cols     [via buildChatPromptContext]
chat/route.ts → promptBuilder: buildMemoryBlock + buildPrefBlock
chat/route.ts → Anthropic: streamText(systemPrompt + history)
Anthropic → User: streamed response
chat/route.ts → Anthropic: generateText(extract memory)   [onFinish, async]
chat/route.ts → memoryService: updateMemory(userId, diff)
```

**Proposed — after §3.1 wiring:**
```
User → chat/route.ts: POST message
chat/route.ts → contextBuilder: buildAIContext(userId)     [NEW call site]
contextBuilder → memoryService: getMemory(userId)           [fixed: was direct table read]
contextBuilder → user_preferences: select preference_profile
contextBuilder → chat/route.ts: AIContext | null
chat/route.ts → promptBuilder: buildBehaviorBlock(AIContext)  [NEW, additive render fn]
  [... existing memory/pref block rendering unchanged ...]
chat/route.ts → Anthropic: streamText(systemPrompt including behavior block + history)
```

**Proposed — background rebuild (unchanged, already correct):**
```
User action (like) → /api/reviews/[id]/like: insert review_likes row
/api/reviews/[id]/like → profileCache: rebuildProfile(userId)   [fire-and-forget, not awaited]
profileCache → signalCollector → learningEngine → affinityGraph → profileBuilder
profileCache → user_preferences: upsert preference_profile
/api/reviews/[id]/like → User: 200 OK   [response never waits on the rebuild above]
```

---

## 9. Security

Verified against the Security-phase audit (already completed and deployed):
- `memoryService` gateway pattern already prevents cross-user reads/writes at the application layer (every function requires `userId`, callers derive it from an authenticated session — no user-supplied `userId` bypass found in any route).
- `buildAIContext`'s direct-table-read debt (§2.4) is a **code-hygiene** issue, not a security hole — it still filters `.eq('user_id', userId)` correctly. It should still be fixed before activation, to keep the single-gateway invariant auditable (today one can `grep .from('user_memory')` and get a complete, trustworthy list of access points; the exception weakens that guarantee).
- `preference_profile` and `user_memory` are both readable only by the owning user in every current API route (session-derived `userId`, never client-supplied). No RLS gap identified in this phase's scope — a full RLS audit belongs in Phase 3 (Final Review), not repeated here.
- Proposed `GET /api/context` (§3.5) must follow the identical pattern: derive `userId` from session, never accept it as a parameter — this is a hard requirement for the endpoint design, not a suggestion.

---

## 10. Performance

- **Learning Engine cost per rebuild:** 6 parallel Supabase queries (`collectSignals`), each `.limit(100)` or `.limit(50)`, 90-day window. Bounded, no pagination risk. Confirmed fire-and-forget — never blocks the triggering request's latency.
- **Memory extraction cost per chat turn:** one Haiku call, ~500 token budget, runs in `onFinish` (after the user-visible stream completes) — does not add latency to the user-facing response, only to background completion.
- **Proposed `buildAIContext` call in the hot chat path (§3.1)** does add 2 sequential-ish DB reads (currently run in `Promise.all`, non-blocking relative to each other) to the request critical path. Given `buildChatPromptContext` already does 2 similar reads today, this roughly doubles the pre-LLM DB round-trip count. Should be measured (not assumed) before shipping — flagged as a risk in §13, not dismissed.
- **`rankCandidates`** is pure/synchronous/in-memory — negligible cost regardless of which consumer adopts it (§3.2).

---

## 11. Cost Optimization

- Chat's system-prompt caching (Anthropic `ephemeral` cache) is confirmed working and is the largest existing cost lever — already shipped, not re-litigated here.
- Memory extraction (§2.10) is the **one uncosted AI expense** in this whole engine set. Recommendation: track `usage.promptTokens`/`completionTokens` from `extractMemoryFromConversation`'s `generateText` call (the same way `chat/route.ts`'s `onFinish` already logs chat usage) so this cost becomes visible before optimizing it further.
- Learning Engine and Recommendation Engine are **zero marginal AI cost** by design (deterministic) — this should remain a hard constraint for any future enhancement to either, not just current behavior.
- `worthExtract` gate (`lastText.trim().length > 20`) already skips memory extraction for short/trivial messages — confirmed existing cost control, worth keeping as-is.

---

## 12. Future Scalability

- **`user_facts` atomic table (v2)** — see §4.4. The trigger condition to revisit this: either (a) the blob merge logic in `extractMemoryFromConversation` becomes a correctness bottleneck (conflicting facts silently overwritten), or (b) multi-LLM extraction (different providers extracting different fact types) needs per-fact provenance that a single JSON blob can't express.
- **Recommendation Engine horizontal scale** — pure/stateless function, trivially cacheable or moved to an edge function if candidate volume grows; no architectural change needed until then.
- **Learning Engine window growth** — `SIGNAL_WINDOW_DAYS=90` with `.limit(100)` per source bounds cost today; if per-user event volume grows materially (e.g., power users), revisit the limit or move to incremental/streaming aggregation instead of full-window recompute on every trigger.
- **Android-specific:** once `GET /api/context` (§3.5) exists, it becomes the one integration point mobile needs for personalization — insulates the client from any future internal re-architecture (e.g., adopting `user_facts`) as long as the `AIContextResult` contract stays stable.

---

## 13. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| §3.1's new `buildAIContext` call adds latency to the hot chat path | Medium | Measure before shipping; consider caching `AIContextResult` client-side per session rather than recomputing every turn |
| Wiring Recommendation Engine into Explore (§3.2 Option A) could regress a tuned, shipped ranking formula | Medium-High | Recommendation explicitly avoids this — Option B (new surface) chosen instead |
| `MIN_CONFIDENCE=0.1` gate means most new/low-activity users get `null` from `buildAIContext` — any new UI built on top of it needs a defined empty/fallback state, not just "works for power users" | Medium | Must be part of any implementation PR review, not assumed away here |
| Deprecating dead `user_preferences` columns could surprise a not-yet-discovered reader | Low | Repo-wide grep before any migration; already partially done in this document (§1.2) |
| Provider-agnostic extraction (§3.4) changes model behavior subtly if the fallback model has different JSON-following reliability than Haiku | Low-Medium | Requires eval before switching default provider, not just a config change |

---

## 14. Recommendations

1. Implement §3.1 (close the Learning Engine → Chat loop) first — highest leverage, smallest surface area, reuses 100% existing code.
2. Implement §3.3 (search-signal wiring fix) alongside §3.1 — it directly improves the data that §3.1 surfaces (`recentInterests` is currently empty).
3. Fix §2.4 (`buildAIContext` gateway bypass) as a prerequisite to §3.1, not a separate future task — it's a one-line change gating the reactivation.
4. Defer §3.2 (Recommendation Engine wiring) and §3.4 (provider-agnostic extraction) to **after** §3.1/§3.3 ship and produce real usage data — both are larger-surface, lower-certainty changes that benefit from seeing real `preference_profile` data first.
5. Do **not** build `user_facts` (§4.4/§12) for MVP. Revisit only if its trigger conditions (§12) are actually met.
6. Resolve the Android data-access question (§3.5, direct SDK vs. API-only) explicitly in Phase 3 — it affects every other recommendation in this document.

---

## 15. Implementation Order

*(Sequencing only — no code in this phase, per Architecture Week constraints.)*

1. Fix `buildAIContext` to use `memoryService.getMemory()` (§2.4) — prerequisite, near-zero risk.
2. Emit `chat_search` + add `review_search` to `signalCollector` filter (§3.3) — two small, independent fixes.
3. Add `buildAIContext` call + `buildBehaviorBlock` render function to chat route (§3.1) — measure latency impact before merging.
4. Instrument memory-extraction token usage (§11) — visibility before further cost work.
5. Design + build one `CandidatePlace[]` adapter for a new (not Explore-replacing) surface (§3.2 Option B).
6. Route memory extraction through `getModel()` with a new `'extraction'` tier (§3.4).
7. Design `GET /api/context` (§3.5) once §1 has real confidence-score data to validate the null/fallback contract against.
8. Revisit dead-column deprecation (§4.1–4.3) as a low-risk cleanup pass, any time after step 1.

---

*This document is Phase 1 of Architecture Week. Stopping here per instructions — awaiting confirmation before Phase 2 (Explore AI Platform Architecture).*

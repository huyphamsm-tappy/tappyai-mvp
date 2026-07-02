# TappyAI — Final Architecture

> **Status:** Single Source of Truth for the TappyAI codebase.
> **Scope:** Describes the architecture exactly as it exists in the repository today.
> **Convention:** Every section separates **🟢 Current Production**, **🔵 Future Architecture (intentionally inactive)**, and **🟠 Technical Debt**. These are never mixed.
> **Baseline commits:** Foundation Refactor completed at `a52ea0f` (Sprint 0.1) → `64c307f` (Sprint 0.2) → `44a0cdf` (Sprint 1.0b). Learning Engine schema live in production Supabase project `fwznnobrdctuskgrvuik`.

---

## 1. Executive Summary

### Project Vision
TappyAI is a Vietnamese-first AI assistant ("trợ lý AI thuần Việt") that helps users discover and act on local services across five domains: **food & drink, shopping, entertainment, travel, and spa/beauty**, plus utility answers (weather, gold price, news, currency). It talks like a friend, always returns real places with real links, and never claims to transact on the user's behalf — it routes users to official platforms to book/buy themselves.

### MVP Scope
- Conversational AI chat with tool-calling (places, hotels, flights, products, news, weather, gold, transport, price-watch).
- A social "Explore" feed of user-generated reviews (photo/video) with likes, saves, comments, follows, watch-time ranking.
- A background **Learning Engine** that builds a per-user preference profile from behavioral signals.
- Freemium gating (10 free messages/day, Stripe Pro subscription for unlimited).
- Web Push notifications and utility mini-tools (currency, split-bill, translate, document scan, 20 canvas mini-games).

### Technology Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.5 (App Router), React 18.3, TypeScript 5.5 |
| Hosting | Vercel (serverless + edge runtimes) |
| Database / Auth | Supabase (Postgres + Row-Level Security, `@supabase/ssr` 0.5, `supabase-js` 2.45) |
| LLM | Anthropic Claude via Vercel AI SDK v4.3 (`ai`) + `@ai-sdk/anthropic` v1 + `@anthropic-ai/sdk` 0.32 |
| Place data | Google Places API (New), OpenStreetMap/Overpass + Nominatim, Serper (Google Search/Images proxy) |
| Payments | Stripe 16 (webhook-driven subscription sync) |
| Notifications | `web-push` 3.6 (VAPID) |
| Media storage | Vercel Blob (`@vercel/blob` 2.4) |
| Analytics | PostHog (client) + custom `user_events` server-side taxonomy |
| Misc | Zod (tool schemas), Tailwind, `matter-js` (games), `docx` (scan export) |

### Current Production Status
The app is live and serving traffic at **tappyai.com** (Vercel production, Supabase project `fwznnobrdctuskgrvuik`). The Foundation Refactor (context ownership, memory gateway, single-writer preferences) is fully deployed. The Learning Engine's Signal→Profile pipeline is **active in production** (verified: writing `user_preferences.preference_profile` with live confidence scoring). The recommendation/ranking half of personalization remains intentionally dormant.

### Overall Architecture Health
Healthy and disciplined. The codebase enforces clear ownership boundaries: a single memory gateway, a single writer for derived preferences, a single context builder for chat. Personalization is split into a **live producer** (profiles) and a **dormant consumer** (ranking) that is fully coded but deliberately un-wired. Known technical debt is small, catalogued, and non-blocking (see §15).

---

## 2. High-Level System Architecture

TappyAI is a **mobile-first web/PWA** served by a single Next.js application on Vercel. There is no native Android app yet (Android is roadmap item #4). All business logic lives in Next.js route handlers; external providers are called server-side.

```
                    ┌──────────────────────────────┐
                    │   Web / PWA client (mobile)   │
                    │   React 18 + Tailwind          │
                    │   PostHog (client analytics)   │
                    └───────────────┬───────────────┘
                                    │ HTTPS
                                    ▼
                    ┌──────────────────────────────┐
                    │   Next.js Backend (Vercel)    │
                    │   App Router route handlers    │
                    │   middleware (session refresh) │
                    └───────────────┬───────────────┘
                                    │
      ┌──────────────┬─────────────┼───────────────┬──────────────┐
      ▼              ▼             ▼                ▼              ▼
┌───────────┐ ┌───────────┐ ┌───────────┐  ┌────────────┐ ┌───────────┐
│ Supabase  │ │  Google   │ │OpenStreet │  │  Serper    │ │ Anthropic │
│ Postgres  │ │  Places   │ │Map/Overpass│ │ (Search +  │ │  Claude   │
│ + RLS     │ │  (New)    │ │+ Nominatim │ │  Images)   │ │  (LLM)    │
│ + Auth    │ └───────────┘ └───────────┘  └────────────┘ └───────────┘
└───────────┘
      │
      ├── Stripe (payments/webhooks)      ├── Vercel Blob (media)
      ├── web-push (VAPID notifications)   └── wttr.in / vang.today / Travelpayouts
                                              (weather / gold / flights)
```

### Major Components
- **Client (Web/PWA):** Chat UI, Explore feed, profile/preferences screens, utility tools, mini-games. Sends behavioral events to `/api/track` and PostHog.
- **Middleware** (`middleware.ts`): refreshes the Supabase session cookie on every request (no auth redirects — the app is open to anonymous users); sets COOP/COEP headers for the SuperTux WASM game route.
- **Next.js route handlers:** ~55 API routes covering chat, reviews/social, memory, preferences, tracking, cron, integrations, payments, uploads.
- **Supabase:** primary datastore + auth + RLS. Accessed via three client flavors: cookie-scoped server client, browser client, and service-role admin client.
- **External providers:** Google Places / OSM / Serper for places; Anthropic for LLM; Stripe for payments; wttr.in / vang.today / Travelpayouts for realtime data.

---

## 3. End-to-End Request Flow (Chat)

```
User message
   ↓
POST /api/chat
   ↓
Parse body (messages, userLocation, userPreferences)
   ↓
Signal derivation:
   classifyIntent · extractBudget · detectLocationIntent
   detectPlanningIntent · detectLang · detectForcedTool
   ↓
Auth + context load (if signed in):
   buildChatPromptContext(userId) ──► memoryService.getMemory + user_preferences
        → buildMemoryBlock + buildPrefBlock
   (+ Google Calendar events if integrated)
   ↓
Freemium gate: count today's user messages in `conversations`
   → 429 if ≥ 10 and not Pro
   ↓
Model tier selection:
   planning|image → 'planning' · simple query → 'simple' · else 'standard'
   ↓
Prompt assembly (promptBuilder):
   buildSystem(...) or buildSystemSimple(...)  [system prompt as messages[0]
      with Anthropic cacheControl: ephemeral]
   ↓
streamText() with tool set + experimental_prepareStep (tool-choice policy)
   ↓
LLM ⇄ Tools (max 1–8 steps by intent):
   search_places / get_hotel_prices / get_flight_prices / search_products /
   get_news / get_weather / get_gold_price / get_transport_options /
   web_search / save_price_watch
   ↓
result.toDataStreamResponse()
   ↓
applyPlaceEnrichmentStreamFilter()  ← deterministic image/TikTok/CTA injection
   ↓
Streamed response to client
   ↓
onFinish (async): extractMemoryFromConversation → memoryService.updateMemory
```

### Key modules
- **`src/lib/ai/intent.ts`** — deterministic classifiers: `classifyIntent`, `detectLang`, `detectForcedTool`, `detectLocationIntent`, `detectPlanningIntent`, `isSimpleQuery`, `isShoppingQuery`, plus `normalizeVN` (Vietnamese diacritic stripping used throughout).
- **`src/lib/ai/budget.ts`** — `extractBudget`, `applyBudgetFilter`, `applyLuxuryStreamFilter` (strips over-budget luxury hotels).
- **`src/lib/ai/promptBuilder.ts`** — `buildSystem` (full system prompt with format rules, review/rating rules, CTA-button rules, budget filter, GPS block, planning mode) and `buildSystemSimple` (chitchat), plus `buildPrefBlock`.
- **`src/lib/ai/provider.ts`** — `getModel(tier)` maps tiers to Claude model IDs (`simple` → `claude-haiku-4-5`; `standard`/`planning`/`vision` → dated Haiku).
- **`src/lib/ai/streamEnrichment.ts`** — `applyPlaceEnrichmentStreamFilter`, a `TransformStream` that parses the AI SDK data-stream protocol and deterministically appends images/TikTok-review/order-links for any place the tools returned that the LLM failed to render.
- **`src/app/api/chat/route.ts`** — orchestrator (`maxDuration = 60`). Truncates history to last 10 messages; sets `maxTokens`/`maxSteps` by intent; caches the system prompt via `providerOptions.anthropic.cacheControl`.

### Cost controls (production behavior)
- History trimmed to last 10 messages.
- System prompt sent as `messages[0]` with `cacheControl: ephemeral` — repeat requests within Anthropic's ~5-minute cache window read the large static prompt at cached rate. (This was previously non-functional and fixed; the top-level `experimental_providerMetadata` path is silently ignored when `system` is a plain string.)
- Tiered model selection routes cheap queries to the smallest model.

---

## 4. Learning Engine (🟢 Current Production — producer side)

The Learning Engine converts behavioral signals into a compact per-user preference profile. It is **deterministic (no LLM)**, pure-functional in its core, and runs as fire-and-forget background work triggered by user actions.

```
User action (like / save / follow / watch / post / search / negative feedback)
   ↓
rebuildProfile(userId, supabase)          [profileCache.ts]
   ↓
collectSignals()                          [signalCollector.ts]
   ↓
computeWeightedSignals()                  [learningEngine.ts]
   ↓
enrichWithAffinity() + TAXONOMY_TREE      [affinityGraph.ts + taxonomy.ts]
   ↓
buildProfile()                            [profileBuilder.ts]
   ↓
setProfile() → user_preferences.preference_profile (jsonb) + profile_updated_at
```

### Stage-by-stage

| Stage | Purpose | Inputs | Outputs | Runtime | Ownership |
|---|---|---|---|---|---|
| **signalCollector** | Gather raw behavioral signals over a 90-day window | `review_likes`, `review_saves`, `review_interactions` (with `completion_rate`), `reviews` (own posts), `user_follows`, `user_events` (`chat_search`, `review_share`, `hide`, `not_interested`, `report`) | `RawSignals` (timestamped events + tags + city, recent searches, negative signals) | 6 parallel Supabase reads per rebuild | `signalCollector.ts` |
| **learningEngine** | Apply per-type weights × time-decay and aggregate | `RawSignals` | `WeightedSignals` (food/category/city score maps, `activeInterests`, `confidenceScore`) | Pure function | `learningEngine.ts` + `config.ts` |
| **affinityGraph** | Propagate a tag's score to ancestors; apply negative learning | `WeightedSignals` + negative signals | Enriched `WeightedSignals` (food/category maps, clamped ≥ 0) | Pure; ancestor map built once at module load | `affinityGraph.ts` + `taxonomy.ts` |
| **profileBuilder** | Assemble the final profile shape | Enriched signals + explicit `user_preferences` columns | `UserPreferenceProfile` (city, budget, favoriteFoods, favoriteCategories, recentInterests, preferredTravelStyle, hiddenTopics, confidenceScore) | Pure function | `profileBuilder.ts` |
| **profileCache** | Read/write the cached profile; orchestrate a full rebuild | `userId`, Supabase client | `preference_profile` jsonb + `profile_updated_at` timestamp | DB read + write | `profileCache.ts` |

### Scoring model (`config.ts`)
- **Event weights:** view 1, watch_complete 2, like 3, save 6, share 8, follow 10, write_review 12, search 2.
- **Time decay buckets:** ≤30d ×1.0, ≤60d ×0.7, ≤90d ×0.4, older ×0.2.
- **Confidence:** `min(totalWeightedPoints / 200, 1.0)`.
- **Affinity propagation:** DIRECT 1.0, PARENT 0.8, GRANDPARENT 0.5, ROOT 0.3.
- **Negative weights:** hide 2, not_interested 3, report 5 (propagated up the taxonomy, scores clamp at 0).

### Background rebuilding & fire-and-forget
`rebuildProfile()` is invoked from event routes **without `await`**, wrapped in `.catch(() => {})`:
- `/api/reviews/[id]/like` (both like and unlike)
- `/api/reviews/[id]/save` (save and unsave)
- `/api/reviews/[id]/interact`
- `/api/reviews` (new review post)
- `/api/users/[id]/follow` (follow and unfollow)
- `/api/track` (only when `chat_search`, `review_search`, `hide`, `not_interested`, or `report` events arrive)

Because these are fire-and-forget, a slow or failing rebuild **cannot delay or break the API response**. The **only** endpoint that `await`s `rebuildProfile()` is `/api/preferences/profile` (GET rebuilds if the cache is missing; POST force-rebuilds) — this endpoint is a synchronous read model where the caller wants the fresh profile in the response.

### Verified production behavior
A real production flow (like → save → follow → `chat_search`) produced a written `preference_profile` with `confidenceScore` rising 0.055 → 0.115 and `recentInterests: ["phở Hà Nội"]`, with `profile_updated_at` advancing. `favoriteCategories`/`favoriteFoods` populate only when reviewed content carries hashtags (see §15/§18).

---

## 5. Memory Architecture (🟢 Current Production)

`user_memory` stores conversational facts extracted by the LLM from chat (location_base, companions, timing, personality, per-domain preferences, per-domain budget, topic history, and a cron-written `behavior_summary`). **`memoryService.ts` is the single gateway** — no other module accesses the `user_memory` table directly (the one documented exception is `buildAIContext`, see §6/§15).

### Public API (`src/lib/memory/memoryService.ts`)
| Function | Purpose |
|---|---|
| `getMemory(userId, client?)` | Read one user's memory row (single-user) |
| `getMemoryBatch(userIds, client)` | Read many users' memory rows in one `.in()` query → `Map<userId, UserMemory>` |
| `updateMemory(userId, data, client?)` | Upsert memory; always stamps `updated_at` |
| `clearMemory(userId, client?)` | Delete a user's memory row |
| `buildMemoryBlock(memory, forcedTool?)` | Render memory into a prompt block (pure) |
| `extractMemoryFromConversation(messages, existing)` | LLM (Haiku) extraction of new facts, merged with existing |
| `countMemoryFacts(memory)` | Count non-empty facts (for UI badges) |

### Dependency injection & the two client contexts
Every read/write function takes an **optional `client?: SupabaseClient`**:
- **Omitted →** defaults to the cookie-scoped **server client** (`@/lib/supabase/server`), used by request-scoped routes carrying the user's session.
- **Provided →** used verbatim. **Cron jobs inject the service-role admin client** (`createAdminClient()`), which bypasses RLS because crons run without a user session.

This DI pattern is what allowed the three cron jobs to be routed through the gateway without duplicating table access. All existing callers that omit the parameter keep byte-for-byte identical behavior.

### Sequence diagram — memory read/write

```
Request-scoped (signed-in user)                Cron (no session)
──────────────────────────────                 ─────────────────
chat/route.ts                                   behavior-rollup/route.ts
   │                                               │  createAdminClient()
   │ buildChatPromptContext(userId)                │
   ▼                                               ▼
memoryService.getMemory(userId)                 memoryService.updateMemory(
   │  (default: server client)                     userId, {behavior_summary}, adminClient)
   ▼                                               │
Supabase user_memory ◄────────────────────────────┘  (service role, bypass RLS)
   │
   ▼
buildMemoryBlock() → system prompt

morning-brief / weekly-recap:
   getMemoryBatch(userIds, adminClient) → one .in() read → Map
```

### Gateway callers (verified)
Reads/writes via the gateway: `chat/route.ts` (read + `updateMemory` in `onFinish`), `onboarding`, `suggested-prompts`, `/api/memory` (GET/POST/DELETE), `page.tsx`, and the three crons (`behavior-rollup` writes; `morning-brief` and `weekly-recap` batch-read). Repository search confirms `.from('user_memory')` appears only inside `memoryService.ts` and the documented `buildAIContext` exception.

---

## 6. Context Builder

`src/lib/ai/contextBuilder.ts` contains two functions with deliberately different lifecycles.

### 🟢 `buildChatPromptContext(userId, supabase)` — Production
The chat route's single source for prompt context. Fetches memory (via `memoryService.getMemory`) and the explicit `user_preferences` columns in parallel, returning `{ memory, prefs }` for `buildMemoryBlock`/`buildPrefBlock`. Introduced in Sprint 0.1 to remove the chat route's hand-rolled context assembly. This is the only context path used at runtime.

### 🔵 `buildAIContext(userId, supabase)` — Future Architecture
Produces the richer, normalized `AIContextResult` (merging `preference_profile` + `user_memory` into an `AIContext` with confidence) that the dormant Recommendation Engine consumes. It has **zero runtime callers** today. It is retained intentionally as the input adapter for the future ranking layer.

### Why both exist
`buildChatPromptContext` serves the **live text-prompt** need (raw memory + prefs blocks). `buildAIContext` serves the **future structured-ranking** need (a typed, confidence-scored context for `rankCandidates`). They are separate because merging them now would either change live prompt behavior or ship an unused code path into the hot chat request. See §15 for the one debt item attached to `buildAIContext`.

---

## 7. AI Prompt Pipeline

```
promptBuilder.buildSystem() / buildSystemSimple()
   ↓
System Prompt (as messages[0], cacheControl: ephemeral)
   ├── Current VN date/time block
   ├── Memory block          (buildMemoryBlock — from user_memory)
   ├── Preferences block     (buildPrefBlock — from user_preferences + client freeform prefs)
   ├── SYSTEM_BASE           (persona, tools list, format rules R1–R5, tool-usage rules 1–18)
   ├── Planning mode block   (if trip/evening planning intent)
   ├── Camera mode block     (if image attached)
   ├── Word-limit block      (150 words first reply / 250 follow-up; images & CTA exempt)
   ├── Budget filter block   (hard luxury-hotel ban under budget)
   ├── Location / GPS blocks
   ├── Review/rating/image rules (≤3 gallery images per place, TikTok links)
   ├── CTA action-buttons rules (platform search links only; never "book via TappyAI")
   └── Scope block           (refuse out-of-5-domain questions)
   ↓
+ last ≤10 conversation messages
   ↓
LLM (streamText, tiered model) ⇄ Tools
   ↓
Response (data stream) → applyPlaceEnrichmentStreamFilter → client
```

The system prompt is large and mostly static, which is why prompt caching materially reduces cost. `buildSystemSimple` is used for chitchat intent (short, tool-free). Language is mirrored to the user's detected language; for non-Vietnamese input a high-priority language-override block is prepended.

---

## 8. Explore Architecture (🟢 Current Production)

The Explore feed is a TikTok-style feed of user reviews (photos or video). Feed served by `/api/reviews/feed` (**edge runtime**).

### Feed & ranking
- **Sorts:** `latest` (default; created_at desc, paginated) and `trending` (score-based; only for the non-filtered, non-search, non-following case).
- **Trending score** (computed in JS over a 200-row batch):
  `score = (normalizedWatch × 0.35) + (completionRate × 0.25) + (engagementRate × 0.25) + (recencyScore × 0.15)) × locationBoost`
  where `normalizedWatch = min(watch_time_avg/60, 1)`, `engagementRate = min((likes+comments+saves)/max(views,1), 1)`, `recencyScore = 1/(1+daysOld)`, `locationBoost = 1.3` if the place address matches the requested city else 1.0.
- **Cold-start injection:** up to 2 zero-engagement posts from the last 24h are appended so brand-new content gets exposure.
- **Personalization overlay:** for signed-in users the feed annotates `liked_by_me`/`saved_by_me`. Public (non-personalized) feeds are cached `s-maxage=30, stale-while-revalidate=60`.

### Engagement signals
| Signal | Endpoint | Storage |
|---|---|---|
| Watch time / completion rate | `POST /api/reviews/[id]/interact` | `review_interactions` (`watch_seconds`, `completion_rate`); syncs `reviews.watch_time_avg`/`completion_rate` via `get_interaction_avgs` RPC; increments `view_count` via RPC |
| Like | `POST /api/reviews/[id]/like` | `review_likes` (unique per user+review; toggle via 23505) |
| Save | `POST /api/reviews/[id]/save` | `review_saves` |
| Comment | `POST /api/reviews/[id]/comments` | `review_comments` |
| Follow | `POST /api/users/[id]/follow` | `user_follows` (unique; toggle via 23505; trigger maintains follower counts) |
| Milestone notifications | (inside like route) | `review_milestones` (5/10/25/50/100 likes) |

All of like/save/interact/follow/post also fire `rebuildProfile()` (fire-and-forget) into the Learning Engine.

### Upload & video pipeline
- **Media upload:** `/api/reviews/upload` and `/api/upload/video` store media in Vercel Blob.
- **External content import:** `/api/explore/process` and `/api/explore/oembed` support ingesting/oEmbed-resolving source URLs (`source_type`, `source_url` columns on `reviews`).
- **Review fields:** `content_type`, `media_url`, `thumbnail`, `hashtags`, `photos`, `place_id`, `place_name`, `place_address`, `rating`, `body`, `is_verified`, `is_hidden`.

---

## 9. Food & Travel Pipeline (🟢 Current Production)

Place discovery uses a layered fallback because Google Places is unreliable in Vietnam and its key has **no photo billing**.

```
search_places(query, location, type, lang, userLocation)
   ↓
Google Places API (New)   ── Vietnam is a Prohibited Territory; quota 100/day
   ↓ (blocked / empty / quota)
OpenStreetMap / Overpass   ── with Nominatim geocoding; adaptive radius
   ↓
Serper (Google Images)     ── image enrichment (gstatic thumbnails)
   ↓
Image enrichment           ── pickEmbeddableImageUrls (≤3 per place), og:image, gstatic
   ↓
Affiliate / platform links ── ShopeeFood/GrabFood/BeFood (food), Booking/Agoda (hotels),
                              Shopee/Tiki/Lazada/TikTok Shop (products)
   ↓
LLM renders + applyPlaceEnrichmentStreamFilter guarantees images/TikTok/links appear
```

### Fallback order & behavior
1. **Google Places (New)** — primary when it responds within quota. Vietnam is a Prohibited Territory and the key has no photo billing, so results are inconsistent and photos never come from `places.photos`.
2. **OpenStreetMap/Overpass** — fallback source. Uses `normalizeVN` for city/radius matching, adaptive search radius (1500 m for dense metros like Saigon, 5000 m otherwise), and an 11 s Overpass timeout. Adds static TikTok-review URLs and platform links to match the Google branch.
3. **Serper** — resolves photos by place name (`fetchPlacePhotosByName`, up to 3) for every result across food/hotel/product tools. Images are gstatic thumbnails selected by `pickEmbeddableImageUrls`.

### Image pipeline specifics
- Photos come from Serper gstatic thumbnails and og:image extraction, **never** Google `places.photos` (no billing).
- `applyPlaceEnrichmentStreamFilter` is a deterministic safety net: it tracks tool results and injects any missing image/TikTok/order-link markdown before the stream ends, so output is correct even when the LLM omits these fields. It matches places by diacritic-normalized name, tolerates the gstatic `&s=NN` suffix truncation, and bounds each place's dedup window structurally (next place name or the `[CTA_BUTTONS]` marker).

### Quota handling & production behavior
Google's 100/day quota is expected to be exhausted; the pipeline degrades to OSM+Serper automatically. Hotels and products additionally receive Serper photos so previously image-less tools now render galleries. CTAs are always **platform search links** built from the real place/product name — the app has no in-app booking and never emits "Đặt qua TappyAI".

### Related tools
`get_hotel_prices` (Booking/Agoda web search + OSM list), `get_flight_prices` (Travelpayouts/Aviasales), `get_transport_options` (intercity bus/train search or taxi estimate), `search_products` (Shopee/Tiki/Lazada via Serper), `get_news`, `get_weather` (wttr.in), `get_gold_price` (vang.today), `web_search`, `save_price_watch`.

---

## 10. Database Architecture

Postgres on Supabase with RLS. Tables below are grouped by domain. "Owner" = the module/route conceptually responsible; "Writers/Readers" list the primary code paths.

### Personalization & memory
| Table | Purpose | Primary Writer(s) | Primary Reader(s) | Notes |
|---|---|---|---|---|
| `user_memory` | LLM-extracted conversational facts + cron `behavior_summary` | `memoryService` only (chat `onFinish`, onboarding, `/api/memory`, behavior-rollup cron) | `memoryService.getMemory`/`getMemoryBatch`; `buildAIContext` (debt) | Single gateway; `updated_at` stamped on every write |
| `user_preferences` | Explicit prefs (budget_level, cuisine_likes, dietary_restrictions, freeform `preferences[]`), derived `inferred_preferences`, `preferred_style`, and the `preference_profile` jsonb cache + `profile_updated_at` | `/api/preferences` (explicit), `/api/bookings` (`inferred_preferences`), `userMemory.inferPreferencesFromEvents` (`preferred_style`), `profileCache.setProfile` (`preference_profile`) | chat route, promptBuilder, contextBuilder, `/api/preferences/profile` | `preference_profile`/`profile_updated_at` added by `add_user_preference_profile.sql` (live) |
| `user_events` | Raw behavioral event log (search, page_view, hide, not_interested, report, etc.) | `/api/track` (gated by `ALLOWED_TYPES`); like route; `userMemory.logUserEvent` | `signalCollector`, `behavior-rollup` cron | `event_type` is free-text (no DB CHECK) |
| `conversations` | Persisted chat transcripts + free-tier message counting | client via `/api/conversations` | chat route (daily count), UI, weekly-recap cron | Source of truth for chat history |

### Social / Explore
| Table | Purpose | Primary Writer(s) | Primary Reader(s) |
|---|---|---|---|
| `reviews` | User reviews (photo/video), place metadata, engagement counters | `/api/reviews`, upload routes | feed, profile pages, signalCollector |
| `review_likes` | Likes (unique user+review) | `/api/reviews/[id]/like` | feed, signalCollector |
| `review_saves` | Saves | `/api/reviews/[id]/save` | feed, signalCollector |
| `review_interactions` | Watch time + completion rate | `/api/reviews/[id]/interact` | signalCollector; `get_interaction_avgs` RPC |
| `review_comments` | Comments (1–300 chars) | `/api/reviews/[id]/comments` | feed/detail |
| `review_milestones` | Like-milestone dedup | like route | notification logic |
| `user_follows` | Follow graph (unique; self-follow blocked) | `/api/users/[id]/follow` | feed (following), signalCollector; trigger maintains counts |
| `profiles` | Public user profile (full_name, avatar_url, bio, counters) | profile edit routes | everywhere users are shown |

### Commerce / utility / integrations
| Table | Purpose | Primary Writer(s) | Primary Reader(s) |
|---|---|---|---|
| `subscriptions` | Stripe subscription state | Stripe webhook (admin client) | chat route Pro check |
| `services` | Bookable service catalog (backs bookings) | seed/admin | `/api/bookings`, service pages |
| `bookings` | Service booking records | `/api/bookings` | profile bookings |
| `message_feedback` | Chat message feedback (like/dislike/report) | `/api/message-feedback` | analytics |
| `price_watches` | Product price-watch targets | `save_price_watch` tool, `/api/price-watch` | price-check cron |
| `groups`, `group_members` | "Tappy Together" group planning | `/api/group*` | group pages |
| `user_integrations` | OAuth integration tokens (Google Calendar, Zalo) | integration routes | chat route (calendar events) |
| `notification_subscriptions` | Web Push endpoints (VAPID subscription data) | `/api/notifications/subscribe` | notification send / broadcast / crons |

### Indexes (verified examples)
- `user_preferences_profile_updated_idx (user_id, profile_updated_at DESC)`
- `user_follows_follower_idx`, `user_follows_following_idx`
- Additional per-table indexes exist in the migration files.

### Production status
All tables above exist in production. The Learning Engine columns (`preference_profile`, `profile_updated_at`) were the last schema addition and are verified live. Several `user_preferences` columns are **currently dead** (`budget_min`, `budget_max`, `dietary_tags`, `disliked_tags`, `usual_party_size` — no writer) — see §15.

---

## 11. API Ownership

Authentication legend: **Session** = Supabase cookie session (`auth.getUser`); **Open** = works anonymously; **CRON_SECRET** = Bearer secret; **Stripe sig** = webhook signature; **Service role** = admin client internally.

| API | Purpose | Auth | Dependencies | Status |
|---|---|---|---|---|
| `POST /api/chat` | Main conversational endpoint (tools, streaming) | Open (Pro/free gating if signed in) | Anthropic, tools, memoryService, promptBuilder, streamEnrichment | 🟢 Production |
| `GET/POST/DELETE /api/memory` | Read/extract/clear user memory | Session | memoryService | 🟢 |
| `GET/POST /api/preferences/profile` | Read/force-rebuild Learning Engine profile | Session | profileCache | 🟢 |
| `GET/POST/PUT /api/preferences` | Explicit prefs + freeform preferences | Session | user_preferences | 🟢 |
| `POST /api/track` | Behavioral event ingestion (batched, allow-listed) | Session | user_events, rebuildProfile | 🟢 |
| `GET /api/reviews/feed` | Explore feed (latest/trending) | Open (+ personalization if signed in) | reviews, likes, saves | 🟢 (edge) |
| `POST /api/reviews` | Create review | Session (+ in-memory rate limit) | reviews, rebuildProfile | 🟢 |
| `POST /api/reviews/[id]/like` \| `/save` \| `/interact` \| `/comments` | Engagement | Session | respective tables, rebuildProfile | 🟢 |
| `GET/POST /api/reviews/[id]` | Review detail / mutations | Mixed | reviews | 🟢 |
| `POST /api/users/[id]/follow` | Follow/unfollow | Session | user_follows, rebuildProfile | 🟢 |
| `GET /api/users/[id]`, `/api/users/search` | Public profiles / search | Open | profiles | 🟢 |
| `POST /api/reviews/upload`, `/api/upload/video` | Media upload | Session | Vercel Blob | 🟢 |
| `/api/explore/process`, `/api/explore/oembed` | External content import | Session | Blob / oEmbed | 🟢 |
| `POST /api/conversations` | Persist chat transcripts | Session | conversations | 🟢 |
| `POST /api/bookings`, `GET` | Service bookings + inferred prefs | Session | bookings, user_preferences | 🟢 |
| `/api/price-watch`, `save_price_watch` tool | Price watches | Session | price_watches | 🟢 |
| `/api/group`, `/api/group/[id]/join`, `/suggest` | Group planning | Session | groups | 🟢 |
| `/api/notifications`, `/subscribe`, `/broadcast` | Web Push | Session / Service role | push subscriptions, web-push | 🟢 |
| `/api/integrations`, `/integrations/google-calendar*`, `/integrations/zalo*`, `/auth/zalo*` | OAuth integrations | Session / OAuth | user_integrations | 🟢 |
| `POST /api/webhooks/stripe` | Subscription sync | Stripe sig | subscriptions (service role) | 🟢 |
| `POST /api/stripe/checkout` | Create checkout session | Session | Stripe | 🟢 |
| `/api/scan`, `/api/translate`, `/api/viet-content`, `/api/rates`, `/api/suggested-prompts`, `/api/onboarding`, `/api/favorites`, `/api/message-feedback` | Utility features | Mixed | various | 🟢 |
| `/api/cron/*` | Scheduled jobs (see §12) | CRON_SECRET | see §12 | Mixed |
| `/api/debug-places`, `/api/test-photos` | Diagnostics | Open | places pipeline | 🟠 Debug endpoints (see §15) |

---

## 12. Background Jobs (Cron)

Cron **routes** exist for seven jobs, but only two are **scheduled** in `vercel.json`. All cron routes authenticate with `Authorization: Bearer ${CRON_SECRET}`; Vercel injects the secret automatically for scheduled invocations.

| Job | Purpose | Schedule (`vercel.json`) | Dependencies | Status |
|---|---|---|---|---|
| `deal-notifications` | Push deal notifications | `30 0 * * *` (00:30 UTC) | notifications, user prefs | 🟢 Scheduled & live |
| `morning-brief` | Personalized morning push (weather + prefs + memory) | `0 1 * * *` (01:00 UTC) | Anthropic Haiku, `getMemoryBatch`, wttr.in, web-push | 🟢 Scheduled & live |
| `behavior-rollup` | Weekly `user_events` → `user_memory.behavior_summary` | **Not scheduled** | `updateMemory` (admin client) | 🟠 Route deployed, dormant |
| `weekly-recap` | Weekly personalized recap push | **Not scheduled** | Anthropic Haiku, `getMemoryBatch`, web-push | 🟠 Route deployed, dormant |
| `price-check` | Check price-watch targets | **Not scheduled** | price_watches, Serper | 🟠 Route present |
| `lunch-reminder` | Lunch-time nudge | **Not scheduled** | notifications | 🟠 Route present |
| `travel-reminder` | Travel nudge | **Not scheduled** | notifications | 🟠 Route present |

**Important operational note:** `morning-brief` was scheduled in `vercel.json` before its route existed (it returned 404 daily until Sprint 0.2 shipped the route). It is now live and will send morning notifications to subscribed users on the next 01:00 UTC tick. `behavior_summary` written by `behavior-rollup` is currently read by no code path (see §15).

---

## 13. Deployment Architecture

```
GitHub (main branch)
   ↓  push
Vercel (auto-deploy on push to main)
   ↓  next build → serverless + edge functions + static assets
Production (tappyai.com)
   ↓
Supabase (Postgres + Auth + RLS) — schema changes applied manually via SQL Editor
```

### Workflow
- **Source of truth:** GitHub `main`. Every push to `main` triggers a Vercel production build.
- **Build:** `next build`. TypeScript type-validation is skipped during the Vercel build (project config), so build success does not imply a clean `tsc` (see §15). Type safety is enforced separately via `tsc --noEmit` during development.
- **Environments:** Vercel holds production env vars (Supabase URL/keys, Anthropic key, Serper, Stripe, VAPID, CRON_SECRET, Blob token, etc.). Local dev uses `.env.local`; a production snapshot can be pulled to `.env.production.local`.
- **Database migrations:** Supabase has no automated migration runner wired to CI. DDL is applied manually in the Supabase SQL Editor (migration `.sql` files in `supabase/migrations/` are the record). The REST/service-role path can run DML but not DDL.
- **Verified deploy discipline:** Foundation Refactor commits were each built in isolation (`git stash --keep-index` + clean `next build`) before commit, then confirmed Ready on Vercel and QA'd against production.

---

## 14. Security Boundary (current, verified facts only)

- **Authentication:** Supabase Auth (email + OAuth incl. Zalo/Google). `middleware.ts` refreshes the session cookie on every non-static request but performs **no auth redirects** — the app is intentionally open to anonymous users (chat, feed browsing work without login). Login redirect-away is handled client-side.
- **Authorization:** Each route calls `supabase.auth.getUser()`/`getSession()` and returns 401 where a session is required (e.g., memory, preferences, engagement, uploads). The chat route works anonymously but applies Pro/free gating only when signed in.
- **Row-Level Security:** RLS is enabled on the social/personalization tables with per-user policies. Verified examples: `review_interactions` — "Users manage own interactions" (`auth.uid() = user_id` for ALL); `user_follows` — public read, insert/delete restricted to `auth.uid() = follower_id`; `review_milestones` — permissive INSERT policy removed (service role writes instead) in Phase 4 hardening.
- **Service role:** Used only server-side where RLS must be bypassed: Stripe webhook (subscription writes), cron jobs (`createAdminClient`), and notification broadcast. The service-role key is never exposed to the client.
- **Secrets:** All provider keys and `CRON_SECRET`/VAPID keys live in Vercel encrypted env vars. `CRON_SECRET` and other sensitive vars are not retrievable via `vercel env pull` (returned empty), confirming they are server-only.
- **Webhook validation:** Stripe webhook verifies the signature with `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` and rejects invalid signatures with 400 before any DB write.
- **Rate limiting:** `/api/reviews` enforces a best-effort in-memory limit — the enforced threshold is **20 reviews/day/IP** (the source code comment says "5", but the runtime check is `count >= 20`; the comment is stale). `/api/chat` enforces a freemium limit (10 user messages/day, counted from `conversations`) for non-Pro users. `/api/track` caps 20 events/batch and allow-lists `event_type`. Tool `save_price_watch` caps 10 active watches/user. These are the verified limits; there is no global gateway rate limiter.
- **Permission boundaries:** Client requests never receive the service-role key. Cron endpoints require `CRON_SECRET`. Media uploads go through authenticated routes to Vercel Blob.

---

## 15. Technical Debt (confirmed only)

**Critical:** none identified.

**High**
- **`tsconfig`/`tsc` errors are latent.** `next build` skips type validation, so ~30 pre-existing type errors (in `middleware.ts`, `ChatInterface.tsx`, `budget.ts`, `memoryService.ts` iteration targets, speech types, etc.) do not block deploys. `tsconfig.json` also has an uncommitted local modification. Type safety is currently guarded only by developer discipline.
- **Diagnostic endpoints in production.** `/api/debug-places` and `/api/test-photos` are open diagnostic routes shipped to production.

**Medium**
- **`buildAIContext()` bypasses the memory gateway.** It reads `user_memory` directly instead of via `memoryService.getMemory`. It is the single documented exception to the single-gateway rule; acceptable only because it has zero runtime callers. Must be routed through the gateway before activation.
- **Search-signal wiring gap.** `signalCollector` consumes `chat_search` events for `recentInterests`, but no client path emits `chat_search` (only `review_search` is emitted, and `review_search` is *not* in the collector's filter). Result: `recentInterests` stays empty unless events are posted manually.
- **`behavior-rollup` output is unread.** The cron writes `user_memory.behavior_summary`, but no code reads it back.
- **Dead `user_preferences` columns.** `budget_min`, `budget_max`, `dietary_tags`, `disliked_tags`, `usual_party_size` have no writer.

**Low**
- **`userMemory.ts` vocabulary drift.** `logUserEvent` writes `user_events` using a `UserEventType` union that differs from `/api/track`'s `ALLOWED_TYPES`; `event_type` has no DB CHECK, so off-taxonomy values can enter.
- **Uncommitted working-tree files.** Several feature dirs/files remain untracked/modified locally (integrations UI, profile sub-pages, `price-check` cron, recommendation module, docs artifacts) — outside the deployed set.
- **Two parallel "style" concepts.** `user_preferences.preferred_style` (threshold counter) and `preference_profile.preferredTravelStyle` (decay/taxonomy) model overlapping ideas; only the *writer* of `preferred_style` was unified (Sprint 0.3), not the concept.

---

## 16. Future Architecture (intentionally inactive)

These modules are complete or scaffolded but deliberately not wired into runtime. They are kept for planned activation, not deleted.

| Module | State | Why inactive |
|---|---|---|
| **Recommendation Engine** (`src/lib/recommendation/recommendationEngine.ts`, `config.ts`, `types/recommendation.ts`) | Complete, pure `rankCandidates(AIContextResult, CandidatePlace[])` | Zero callers and no candidate-hydration/consumption layer. Activating it requires **new integration code** (building `CandidatePlace[]` from search results, calling the engine, consuming rankings) — out of scope for "activate existing." |
| **`buildAIContext()`** | Complete | The input adapter for the Recommendation Engine; dormant until ranking is wired. Also carries the direct-`user_memory` debt (§15). |
| **`behavior-rollup` / `weekly-recap` / `price-check` / `lunch-reminder` / `travel-reminder` crons** | Deployed routes | Not scheduled in `vercel.json`; awaiting product decision on cadence. |
| **Dashboard** | Not in this codebase's active surface | Roadmap item #5. |
| **Multi-language** | Prompt supports language mirroring, but no full i18n | Roadmap item #6. |
| **Future ranking / Recommendation V2** | — | Explicitly deferred; not designed here. |

---

## 17. Architecture Strengths

- **Single Gateway (memory).** `memoryService` is the sole path to `user_memory`, with dependency injection that cleanly serves both request-scoped (server client) and cron (admin client) contexts without duplicating table access.
- **Single Writer (derived preferences).** Exactly one implementation (`inferPreferencesFromEvents`) computes `preferred_style`; the duplicated inline algorithm was removed and both callers delegate to it.
- **Context Builder ownership.** The chat route delegates context assembly to `buildChatPromptContext`, eliminating hand-rolled context and giving one place to reason about what the LLM sees.
- **Learning Engine as pure, deterministic core.** Weighting, decay, taxonomy propagation, and profile building are pure functions — trivially testable, no LLM cost, no side effects until the cache write.
- **Fire-and-forget resilience.** Background profile rebuilds never block or break API responses; the only synchronous rebuild is the explicit read endpoint.
- **Deterministic output safety net.** `applyPlaceEnrichmentStreamFilter` guarantees images/TikTok/CTA links regardless of LLM reliability — a robustness pattern that decouples correctness from model behavior.
- **Modular tool system.** Each capability is an isolated, Zod-typed tool with its own executor and fallback logic; tool availability is context-gated (e.g., no `search_products` for offline-intent queries).
- **Clear producer/consumer split in personalization.** The live profile producer and the dormant ranking consumer are cleanly separated, so the system delivers value now while keeping the ranking layer ready.

---

## 18. Known Limitations (current, no proposed fixes)

- Google Places is unreliable in Vietnam and its key has no photo billing; place quality depends on the OSM+Serper fallback.
- `recentInterests` and negative-learning inputs are largely empty in practice due to the search-signal wiring gap and sparse `hide`/`not_interested` emission (§15).
- `favoriteFoods`/`favoriteCategories`/`city` in the profile populate only when reviewed content carries hashtags and place addresses; sparse content ⇒ sparse profiles.
- The Recommendation Engine does not influence any user-facing surface yet; personalization is currently "profile built, not consumed for ranking."
- Rate limiting is per-route and best-effort (in-memory for reviews); there is no global limiter.
- `next build` does not type-check; a clean build can still hide type errors.
- Migrations are applied manually; there is no CI-driven schema migration.

---

## 19. Roadmap (agreed sequence)

1. **Security Audit**
2. **Security Hardening**
3. **Full System QA**
4. **Android**
5. **Dashboard**
6. **Multi-language**
7. **Recommendation Engine** (activate the dormant ranking layer)
8. **Launch**

---

## 20. Final Architecture Assessment

- **Maturity:** High for an MVP. Ownership boundaries (gateway, single writer, context builder) are enforced, not aspirational, and were landed through small, independently-verified, independently-deployed sprints.
- **Production readiness:** Production-ready for its current scope. Core flows (chat + tools, Explore social, memory, Learning Engine profile production, payments, notifications) are live and verified against production.
- **Maintainability:** Strong. Pure-functional Learning Engine, modular tools, and a single memory gateway make the system easy to reason about and change locally. The main maintainability risk is the latent `tsc` gap (build doesn't type-check).
- **Scalability:** Good for MVP volume. Watch points as usage grows: every engagement action triggers a background `rebuildProfile` (6 DB reads each); the trending feed scores a 200-row batch in JS; rate limiting is per-instance in-memory. None are problems at current scale but each is a known scaling lever.
- **Risks:** Latent type errors masked by the build; open diagnostic endpoints; a couple of dormant crons and unread outputs. All catalogued in §15 and none are release-blocking.
- **Already excellent:** the memory single-gateway with DI, the single-writer preference refactor, the deterministic stream-enrichment safety net, and the clean producer/consumer split of personalization.
- **Intentionally deferred:** the Recommendation/ranking layer (`buildAIContext` + `recommendationEngine`), several crons, Dashboard, full multi-language, and native Android — each documented as Future Architecture (§16) and sequenced in the roadmap (§19).

---

*This document reflects the repository state at the completion of the Foundation Refactor (Sprints 0.1–0.4) and Learning Engine activation (Sprint 1.0a/1.0b). Current Production, Future Architecture, and Technical Debt are kept strictly separate throughout.*

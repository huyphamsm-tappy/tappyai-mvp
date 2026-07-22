# TappyAI — API Contract

> Part of the `docs/ios/` design dossier. The backend surface iOS implements against. Source of truth = production Next.js route handlers (`src/app/api/**/route.ts`) audited 2026-07-10.
>
> **Note on depth:** the full per-endpoint request/response bodies are also captured, with `file:line`, in the domain audit sections (auth, chat, reviews, music, discovery, personalization, profile, data model). This document consolidates the contract, gives full specs for the core endpoints, and flags every auth/limit nuance that affects a native client. Where a body is summarized here, the cited domain section holds the exhaustive field list.

## 0. Conventions

- **Base:** same origin as Web (Vercel). All paths below are under `/api`.
- **Auth reading:** `getRequestUser(req)` accepts **both** an SSR cookie session (web) **and** `Authorization: Bearer <supabase-jwt>` (native). So most authed routes work for iOS with a Bearer token.
- **Content types:** JSON unless marked `multipart/form-data` (uploads).
- **Errors:** routes return `NextResponse.json({ error: "<code/message>" }, { status })`. Common: `400` bad input, `401` unauthenticated / limit-reached, `403` forbidden, `404`, `409` conflict (duplicate), `429` rate-limited, `500`.
- **Runtimes:** most are node; the reviews feed is edge; `/api/chat` sets `maxDuration=60`.

## 1. ⚠️ Auth mechanism map (critical for iOS)

| Auth style | Works for native Bearer? | Routes |
|------------|--------------------------|--------|
| **Bearer or cookie** (`getRequestUser`) | ✅ Yes | The large majority of authed routes (reviews, music, profile, preferences, memory, conversations, favorites, price-watch, notifications subscribe, group, bookings, integrations init, message-feedback, recommendations) |
| **Anonymous Bearer session** (`POST /api/auth/anonymous`) | ✅ Yes — same Bearer pipeline as logged-in users | Anonymous 5/day gate in `/api/chat`, keyed server-side by `anonymous_id` (SECURITY DEFINER counter). The httpOnly `tappy_anon` cookie remains only as the legacy web fallback for tokenless requests. |
| **Cookie session for redirect flows** | ⚠️ OAuth callbacks are browser redirects | `/api/auth/zalo/*`, `/api/integrations/*/callback`, `/api/stripe/*` (web checkout), `/api/webhooks/stripe` |
| **CRON_SECRET header** | n/a (server-to-server) | all `/api/cron/*` |
| **ADMIN_IDS allowlist** | ✅ (but operator-only) | admin analytics (page-level), broadcast |

**iOS takeaways:** (1) ✅ RESOLVED 2026-07-11 — chat's anon cap IS server-authoritative for native: mint a session via `POST /api/auth/anonymous` (§2.0), send it as Bearer; the backend counts per `anonymous_id`. (2) The free 15/day cap is derived from client-persisted conversation history on web; native must sync or the backend must count server-side. (3) OAuth uses browser redirects → use `ASWebAuthenticationSession` + deep-link return; **Zalo supports `platform=ios`** end-to-end (init `GET /api/auth/zalo?returnTo=&platform=ios` → flow finishes at `tappyai://auth/callback#access_token=…&refresh_token=…&expires_at=…`, fragment-delivered, no web cookies).

### 2.0 `POST /api/auth/anonymous` — mint an anonymous session
- **Auth:** none. Rate-limited (5/min + 30/day per IP — identity minting guard).
- **Request:** empty body.
- **Response (STABLE — iOS decode tests lock this):** `{ access_token, refresh_token, anonymous_id, expires_at }` (`expires_at` = epoch **seconds**).
- **Errors:** `429 rate_limit`, `503 anonymous_unavailable` (anonymous sign-ins disabled server-side), `500 server_error`.
- The implementation (currently Supabase Anonymous Auth) is backend-internal and swappable; clients depend only on this shape. Refresh via the normal Supabase token refresh with `refresh_token`.

---

## 2. Core endpoints (full specs)

### 2.1 `POST /api/chat` — AI assistant (streaming)
- **Auth:** optional. Anon allowed (5/day via `tappy_anon` cookie → `401 anon_limit_reached`). Logged-in free 15/day → `429 free_limit_reached`. Pro unlimited. IP flood 30/min.
- **Runtime:** node, `maxDuration=60`.
- **Request (JSON):** `{ messages: [{role, content}], conversationId?, location?/locationBias?, ...context }` (exact context fields in 02-chat).
- **Response:** **Vercel AI SDK data-stream line protocol** (NOT SSE, NOT JSON). Newline-delimited `<prefix>:<JSON>`:
  - `0:` text delta · `9:` tool-call · `a:` tool-result · `e:` step-end · `d:` done.
- **In-text structured markers to parse out:** `[TAPPY_PLAN]{json}[/TAPPY_PLAN]`, `[CTA_BUTTONS]{json}[/CTA_BUTTONS]`, `[FOLLOWUPS]a|b|c[/FOLLOWUPS]`, inline `![Ảnh địa điểm](url)`, `🎵 [Xem review TikTok](url)`.
- **Server post-processing:** two TransformStreams — appends a final `0:` "📸 Hình ảnh & link review" block; rewrites luxury hotel brands when budget <1.5M.
- **Model:** provider-abstracted (backend AI capability layer — see `docs/architecture/AI_PLATFORM.md`); never exposed to clients. **Tools:** search_places, get_news, search_products, web_search, get_weather, get_gold_price, get_flight_prices, get_hotel_prices, get_transport_options, save_price_watch.
- **Side effect:** async 2nd backend AI call extracts user memory → `user_memory`.

### 2.2 `GET/POST/PUT/DELETE /api/conversations` — chat history
- **Auth:** required (Bearer ok). CRUD for conversation records. GET list, POST create, PUT rename, DELETE remove. (Fields in 02-chat.)

### 2.3 `GET/POST /api/memory` — "Tappy knows"
- **Auth:** required. GET returns stored memory items; POST writes/updates. Backs the tappy-knows profile page. Note `user_memory.user_id` is `text`.

### 2.4 `GET /api/reviews/feed` — video feed
- **Auth:** optional (enriches `liked_by_me`/`saved_by_me` if authed). **Runtime: edge.**
- **Query:** pagination — page size **12**, cap **20**; sort params for trending.
- **Ranking:** `watch·0.35 + completion·0.25 + engagement·0.25 + recency·0.15 × cityBoost(1.3)` over a 200-row pool + 2 cold-start slots; client does hashtag re-rank.
- **Response:** array of review objects (media_url, author, counts, music pointer, liked/saved flags, hashtags…).

### 2.5 `GET/POST /api/reviews` — list / create
- **POST auth:** required. **Rules:** verified badge required; **1 review/place → 409**; body ≤1000; **20/day/IP**; native clips auto-register an original sound.
- **Request:** review fields + optional music pointer + media (uploaded separately via Blob). Optional `duration` (number, seconds — measured clip length; used for the auto-registered original-sound track's `duration_sec`).
- **Side effect (original sound):** a native video upload with **no attached music** auto-registers an `original_sound` track (`audio_url` = pointer to the clip's `media_url`; Phase 1, no ffmpeg) and links it via the review's `music` JSON with `origin:'original'`.

### 2.6 `GET/PUT/DELETE /api/reviews/[id]` + subroutes
- `POST /api/reviews/[id]/like` — **Auth**. Insert-then-catch-`23505` toggle → `{ liked }`.
- `POST /api/reviews/[id]/save` — **Auth**. Toggle → `{ saved }`.
- `GET/POST /api/reviews/[id]/comments` — **Auth** to post; counts **always server-recomputed**; delete-own supported.
- `POST /api/reviews/[id]/interact` — records `watch_seconds` / `completion_rate` (feeds learning engine).
- `GET /api/reviews/saved` — **Auth**. Saved list.

### 2.7 `POST /api/users/[id]/follow` — follow toggle
- **Auth.** Insert-then-catch-`23505` → `{ following, follower_count }`. Client uses **optimistic same-sign-delta revert** on failure.
- `GET /api/users/[id]` profile; `GET /api/users/search` — **Auth**.

### 2.8 Uploads (multipart, Vercel Blob)
- `POST /api/upload/video` — **Auth**. mp4/mov/webm, **≤50MB**. Returns Blob token/URL for client-direct upload.
- `POST /api/upload/audio` — **Auth**. 8 audio types, **≤20MB**, 1–600s.
- Review photos (via review create path): ≤6, ≤5MB each, **magic-byte sniffed**, 10/day.

### 2.9 Music & Sound
- `GET /api/music/tracks` · `/tracks/search` (diacritic-sensitive) · `/categories` · `/providers` — **public/anon**. (Web also reads catalog **directly via anon-key Supabase**, bypassing these.)
- `GET /api/music/tracks/[id]` — track detail. `POST /api/music/tracks/[id]/report` — **Auth**, private report → admin push.
- `POST /api/music/tracks` (create/upload) — **Auth**, requires `rightsConfirmed===true` else **400**; `audioUrl` must be a Vercel Blob URL.
- `GET /api/sound/[trackId]` — sound detail (+ derived "N video" count from `reviews`).
- `POST /api/sound/[trackId]/play` — increment play counter (RPC `music_increment_play`). **Anon allowed.**
- `POST /api/sound/[trackId]/save` — **Auth** toggle. `POST /api/sound/[trackId]/follow` — **Auth** toggle.

### 2.10 Personalization & notifications
- `POST /api/track` — event ingest. **16 allowed event types, ≤20/batch.** Triggers async learning-engine rebuild on search/negative/watch.
- `GET /api/recommendations` — **Auth**. Top-10 scored recommendations (≥0.05).
- `GET/POST /api/preferences` + `/api/preferences/profile` — **Auth**. Read/write preference profile (budget/cuisine/dietary/gender/freeform).
- `GET /api/notifications` — **Auth**. Pull-based inbox (follow/like/milestone).
- `POST /api/notifications/subscribe` — **Auth**. Register push subscription `(user_id, provider)`; single master `enabled`. **iOS: add `provider='apns'` + device token (backend delta).**
- `POST /api/notifications/broadcast` — **admin**.
- `GET/POST /api/price-watch` — **Auth**. Create/list watches; `price-check` cron notifies.

### 2.11 Discovery / Groups / Bookings
- `POST /api/bookings` — **Auth**. Lead capture; status always `pending` ("venue will call to confirm"). Backs `/service/[id]` + `/profile/bookings`.
- `GET/POST /api/group` — **Auth**. Create/list groups.
- `POST /api/group/[id]/join` — **Auth**. Join (≤10 members, self-attributed).
- `POST /api/group/[id]/suggest` — **Auth**, creator-only. Backend-AI-generated suggestion.
- `GET /api/debug-places`, `/api/test-photos`, `/api/explore/oembed`, `/api/explore/process` — place/image/link processing (oEmbed SSRF-guarded).

### 2.12 Account / Integrations / Billing
- `GET/POST /api/profile` — **Auth**. Read/update avatar/name/bio (email immutable).
- `POST /api/onboarding` — **Auth**. Persist onboarding fields; sets `profiles.onboarded`.
- `GET/POST /api/favorites` — **Auth**.
- `POST /api/message-feedback` — **Auth**. 👍/👎 on messages.
- Auth (Zalo): `GET /api/auth/zalo` (start PKCE), `/api/auth/zalo/callback`, `/api/auth/zalo/complete` — **browser redirect flow**; sets `zalo_at` cookie.
- Integrations: `GET/POST /api/integrations`, `/api/integrations/zalo` (+`/callback`), `/api/integrations/google-calendar` (+`/callback`, CSRF `state===user.id`, readonly). **Auth** to init; callbacks are redirects.
- Billing (**Web-only, iOS uses StoreKit** — see 09 §6): `POST /api/stripe/checkout`, `POST /api/stripe/portal`, `POST /api/webhooks/stripe` (signed). Writes `billing_customers` (service-role) + `subscriptions`.

### 2.13 Utility tool APIs
- `GET /api/rates` — currency FX (`open.er-api.com`, 1h cache). **Anon.**
- `POST /api/translate` — backend AI. **Anon**, per-IP **30/day** (VN-day, shared `dailyRateLimit`).
- `POST /api/scan` — backend vision capability (`AI.vision`) OCR. **Anon**, per-IP **20/day** (VN-day, shared `dailyRateLimit`).
- `POST /api/viet-content` — backend AI VN writer. **Anon**, per-IP **10/min**.
- `GET /api/suggested-prompts` — dynamic prompt chips.
- `GET /api/version` — `{ v: "<commit sha>" }` (dynamic, no-store). Powers Web's `VersionWatcher` auto-reload of stale PWA tabs. **Web PWA concern; iOS updates via App Store — N/A to native clients.**
- `GET /api/config` — **backend-owned product configuration (REQUIRED for native)**: `{ freemium: { freeDailyLimit, anonDailyLimit }, flags: { showProUpgrade }, upload: { maxPhotosPerReview, maxVideoSizeMb, maxVideoDurationSec }, auth: { providers: [{id:'google'|'zalo'|'email', enabled}] }, onboarding: { interests: [{id, emoji, key}], cities: [string] } }`. Public, cacheable (`max-age=300, swr=3600`). Native clients read quotas/flags/upload limits/providers/onboarding catalog from here instead of hardcoding — display values only, enforcement stays server-side. Contract is additive-only. (Backend Contract Audit + Auth Contract Completion 2026-07-11; see `docs/architecture/BACKEND_OWNERSHIP.md`.)

### 2.14 Cron (server-to-server, `CRON_SECRET`)
- **Scheduled (vercel.json):** `deal-notifications`, `morning-brief`, `price-check` (daily `0 6 * * *` — note code comment says every 6h).
- **Unscheduled (exist, callable, don't auto-fire):** `lunch-reminder`, `travel-reminder`, `behavior-rollup`, `weekly-recap`.
- iOS never calls these.

---

## 3. Complete endpoint index (all routes)

| Path | Methods | Auth | Notes |
|------|---------|------|-------|
| `/api/chat` | POST | anon+free+pro tiers | streaming; anon cookie cap |
| `/api/conversations` | GET/POST/PUT/DELETE | Bearer | chat history |
| `/api/memory` | GET/POST | Bearer | tappy-knows |
| `/api/suggested-prompts` | GET | anon | prompt chips |
| `/api/version` | GET | anon | `{v: sha}`, no-store; Web PWA auto-reload — N/A native |
| `/api/config` | GET | anon | product config (quotas/flags/upload/auth providers/onboarding) — native reads, never hardcodes |
| `/api/auth/anonymous` | POST | anon | mint anonymous session `{access_token, refresh_token, anonymous_id, expires_at}` |
| `/api/message-feedback` | POST | Bearer | 👍/👎 |
| `/api/reviews` | GET/POST | POST=Bearer | create rules 409/20-day |
| `/api/reviews/feed` | GET | optional | **edge**, page 12/cap 20 |
| `/api/reviews/upload` | POST | Bearer | media/link, SSRF-guarded |
| `/api/reviews/saved` | GET | Bearer | |
| `/api/reviews/[id]` | GET/PUT/DELETE | mixed | |
| `/api/reviews/[id]/like` | POST | Bearer | toggle `{liked}` |
| `/api/reviews/[id]/save` | POST | Bearer | toggle `{saved}` |
| `/api/reviews/[id]/comments` | GET/POST | POST=Bearer | server-recomputed counts |
| `/api/reviews/[id]/interact` | POST | optional | watch/completion |
| `/api/users/[id]` | GET | optional | profile |
| `/api/users/[id]/follow` | POST | Bearer | `{following,follower_count}` |
| `/api/users/search` | GET | Bearer | |
| `/api/upload/video` | POST | Bearer | ≤50MB Blob |
| `/api/upload/audio` | POST | Bearer | ≤20MB Blob |
| `/api/favorites` | GET/POST | Bearer | |
| `/api/music/tracks` | GET/POST | GET anon / POST Bearer+consent | |
| `/api/music/tracks/search` | GET | anon | diacritic search |
| `/api/music/tracks/[id]` | GET | anon | |
| `/api/music/tracks/[id]/report` | POST | Bearer | admin push |
| `/api/music/categories` | GET | anon | |
| `/api/music/providers` | GET | anon | |
| `/api/sound/[trackId]` | GET | anon | derived video count |
| `/api/sound/[trackId]/play` | POST | anon | RPC increment |
| `/api/sound/[trackId]/save` | POST | Bearer | toggle |
| `/api/sound/[trackId]/follow` | POST | Bearer | toggle |
| `/api/track` | POST | optional | 16 types, ≤20/batch |
| `/api/recommendations` | GET | Bearer | top-10 |
| `/api/preferences` | GET/POST | Bearer | |
| `/api/preferences/profile` | GET/POST | Bearer | |
| `/api/notifications` | GET | Bearer | inbox |
| `/api/notifications/subscribe` | POST | Bearer | push reg (add APNs) |
| `/api/notifications/broadcast` | POST | admin | |
| `/api/price-watch` | GET/POST | Bearer | |
| `/api/bookings` | POST | Bearer | lead capture, pending |
| `/api/group` | GET/POST | Bearer | |
| `/api/group/[id]/join` | POST | Bearer | ≤10 |
| `/api/group/[id]/suggest` | POST | Bearer creator | backend AI |
| `/api/profile` | GET/POST | Bearer | email immutable |
| `/api/onboarding` | POST | Bearer | sets onboarded |
| `/api/integrations` | GET/POST | Bearer | |
| `/api/integrations/zalo` (+`/callback`) | GET | redirect | |
| `/api/integrations/google-calendar` (+`/callback`) | GET | Bearer/redirect | CSRF state=uid |
| `/api/auth/zalo` (+`/callback`,`/complete`) | GET | redirect | PKCE bridge |
| `/api/stripe/checkout` | POST | Bearer | **web only** |
| `/api/stripe/portal` | POST | Bearer | **web only** |
| `/api/webhooks/stripe` | POST | signed | server |
| `/api/rates` | GET | anon | 1h cache |
| `/api/translate` | POST | anon | 20/day IP |
| `/api/scan` | POST | anon | 30/day IP, vision |
| `/api/viet-content` | POST | anon | 10/min IP |
| `/api/explore/oembed` | GET | anon | SSRF-guarded |
| `/api/explore/process` | POST | mixed | |
| `/api/debug-places` | GET | anon | places debug |
| `/api/test-photos` | GET | anon | image debug |
| `/api/cron/*` (7) | GET/POST | CRON_SECRET | 3 scheduled, 4 dormant |

## 4. iOS implementation checklist for the API layer

- [ ] `TappyAPIClient` attaches `Authorization: Bearer <supabase-jwt>`; refresh via supabase-swift.
- [ ] Streaming line-parser for `/api/chat` (`0/9/a/e/d` prefixes) + marker extractor.
- [ ] Multipart uploader → request Blob token from `/api/upload/*`, enforce size/type/duration client-side.
- [ ] Direct-Supabase path (anon key) for feed reads, catalog, public profiles, self-scoped rows, junction toggles, RPCs — **do not** duplicate these via API where Web reads Supabase directly.
- [ ] Typed error mapping (`401 anon_limit_reached`, `429 free_limit_reached`, `409` duplicate review/place, `400` consent/validation).
- [ ] OAuth via `ASWebAuthenticationSession` + deep-link return for Zalo/Google/Calendar.
- [ ] Server-authoritative anon/free quota strategy (do not rely on cookies).
- [ ] Payment: StoreKit → backend verify endpoint (to be added) → shared entitlement; never Stripe in-app.
- [ ] APNs: `provider='apns'` subscription + device token (backend delta) + `data.url` deep-link routing.

> **Gap to close later:** exhaustive request/response JSON field lists for every non-core endpoint were captured per-domain in the audit sections (retained in the working set). If a fully-expanded, field-by-field OpenAPI-style contract is wanted, it can be generated by a direct pass over the route files — recommended before the iOS networking layer is frozen.

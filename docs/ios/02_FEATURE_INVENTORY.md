# TappyAI — Feature Inventory

> Part of the `docs/ios/` design dossier. Exhaustive checklist of every production feature iOS must ship for 100% Web parity. Each item = a parity target. Source of truth = production Web + Backend (2026-07-10 audit).

Legend: **Anon** = usable logged-out · **Auth** = requires login · **Server** = privileged (Next.js API) · **Direct** = client→Supabase under RLS.

---

## A. Authentication & Account

- [ ] Google OAuth sign-in (enabled) — **Anon→Auth**, deep-link callback
- [ ] Zalo OAuth sign-in (custom 5-hop PKCE → magic-link bridge; VN-IP-only profile API) — **Server**
- [ ] Email OTP passwordless sign-in — **Server**
- [ ] Email + password **register** (note: `/login` has no password field — register-only path)
- [ ] Anonymous session (browse everywhere; 5 AI questions/day) — **Anon**
- [ ] Facebook sign-in — code present but `enabled:false` (do **not** surface)
- [ ] Session via Supabase JWT; native = `Authorization: Bearer`
- [ ] Logout; periodic-logout avoidance (use `getUser()` not `getSession()` semantics)
- [ ] Onboarding flow (gated on `profiles.onboarded`): fields collected → persisted
- [ ] Return-to redirect after login (sanitized to relative paths)

## B. AI Chat (Tappy assistant)

- [ ] Chat screen with streaming replies (Vercel AI SDK data-stream line protocol)
- [ ] Backend AI capability layer (provider-abstracted; keys server-side in the provider layer only)
- [ ] Intent detection → tool routing (state machine via `experimental_prepareStep`)
- [ ] **10 tools:** search_places, get_news, search_products, web_search, get_weather, get_gold_price, get_flight_prices, get_hotel_prices, get_transport_options, save_price_watch
- [ ] Structured in-stream markers parsed out of text: `[TAPPY_PLAN]{json}`, `[CTA_BUTTONS]{json}`, `[FOLLOWUPS]a|b|c`, inline `![Ảnh địa điểm](url)`, `🎵 [Xem review TikTok](url)`
- [ ] Trip plan card rendering (from `[TAPPY_PLAN]`)
- [ ] CTA buttons (platform search links per category; never "book via TappyAI")
- [ ] Follow-up suggestion chips
- [ ] Place cards with Serper/OSM images
- [ ] Server-appended final image/link text block; budget-based luxury-brand rewriting (<1.5M)
- [ ] Typewriter smooth reveal (`useSmoothText`)
- [ ] Tappy mascot 18-pose state machine (per-tab, tool-swap animations, progress hints)
- [ ] Suggested prompts (dynamic)
- [ ] Conversation persistence: create / list / rename / delete (`/api/conversations`)
- [ ] Per-conversation page `/chat/[id]`
- [ ] Server-side memory auto-extraction (2nd backend AI call) → "Tappy knows"
- [ ] Message action bar: feedback (👍/👎) + **TTS** (text-to-speech)
- [ ] Emote reactions (`components/chat/emotes`)
- [ ] Location bias injected into chat (from LocationProvider)
- [ ] Google Calendar events injected into prompt (if integrated)
- [ ] Anon 5/day + free 15/day enforcement (VN-midnight rollover)

## C. Reviews (short-video social feed)

- [ ] Vertical full-screen feed `/reviews` — **permanently dark**, own bottom nav (global nav hidden)
- [ ] Feed ranking: trending score `watch·0.35 + completion·0.25 + engagement·0.25 + recency·0.15 × cityBoost(1.3)`; 200-row pool + 2 cold-start; client hashtag re-rank
- [ ] Pagination: page size 12, cap 20; `liked_by_me`/`saved_by_me` enrichment
- [ ] Video playback state machine: parent-driven `active`, muted-start, global gesture-unlocked sound (`feedAudioUnlocked`), 300ms self-healing watchdog, only active ±1 mount real `<video>`, **no mute button**
- [ ] Double-tap heart-burst like (+ single haptic `vibrate(20)`)
- [ ] Like / Save / Comment / Share / Follow — all **Auth** (401 + redirect to `/login?returnTo=/reviews`)
- [ ] Comments: create, list, delete-own (Trash2 button), server-recomputed counts
- [ ] Share via `navigator.share`; `'Chia sẻ'` sentinel hides place UI
- [ ] Open place from clip; open sound from clip
- [ ] Review detail page `/reviews/[id]`
- [ ] Creator profile `/reviews/creator/[id]`; user profile `/users/[id]`
- [ ] Follow/unfollow with optimistic same-sign-delta revert
- [ ] Inbox tab (follow/like/milestone notifications) — pull-based
- [ ] User search — **Auth**

## D. Review creation & upload

- [ ] Create review `/reviews/new`
- [ ] Video: mp4/mov/webm, ≤50MB, ~15–17s, client thumbnail, direct Vercel Blob upload
- [ ] Link mode: YouTube/TikTok/Facebook (SSRF-hardened oEmbed)
- [ ] Photos: ≤6, ≤5MB each, magic-byte sniff, 10/day
- [ ] Attach existing sound OR borrow a sound (pointer)
- [ ] Native clips auto-register an **original sound** (Phase-1 pointer, audioUrl = clip media_url)
- [ ] Business rules: verified-badge required, 1 review/place (409), body ≤1000, 20/day/IP
- [ ] Post-publish lands on profile tab (not the feed)

## E. Music ecosystem

- [ ] Sound library `/music`: browse, search (diacritic-sensitive), categories, trending, providers
- [ ] Client reads catalog directly via anon-key (`musicService.*`), APIs exist in parallel
- [ ] Sound detail `/sound/[trackId]`: spinning disc, play, play-counter increment (RPC), "N video" count derived from `reviews`
- [ ] Save sound / Follow sound (counts via RPC) — **Auth**
- [ ] "Use this sound" → composer with sound preloaded
- [ ] Upload sound `/music/upload`: 8 audio types, ≤20MB, 1–600s, title ≤120
- [ ] Mandatory rights consent (UI checkbox → API 400 → RLS WITH CHECK → DB CHECK)
- [ ] Report track (private) → push to admins; `/copyright` policy page; `is_active` kill-switch (takedown)
- [ ] Original-sound UGC model + music_usage + attribution

## F. Utility tools

- [ ] **Currency** `/currency`: 12-currency set, free `open.er-api.com`, 1h cache, fallback
- [ ] **Translate** `/translate`: backend AI, per-IP 20/day
- [ ] **Scan/OCR** `/scan`: backend vision capability (AI.vision), per-IP 30/day
- [ ] **Viết Content** `/viet-content`: backend AI VN content writer, per-IP 10/min
- [ ] **Split bill** `/split-bill`: fully local/offline computation
- [ ] **Deals** `/deals`: 25 curated links, daily deterministic shuffle, `getShopeeDeals()`→7
- [ ] **Fortune (bói)** suite — **deterministic local** (djb2 over static banks), offline:
  - [ ] `/boi` hub
  - [ ] `/boi/tarot` (78-card, `Math.random()` draw)
  - [ ] `/boi/tu-vi` (12 Can Chi + 12 lifetime)
  - [ ] `/boi/cung-hoang-dao` (12 zodiac)
- [ ] **Game** `/game` → `/game/supertux`: **SuperTux WASM only** (iframe, SharedArrayBuffer + COOP/COEP). Only WebView-bound feature.
- [ ] **QR profile**: dependency-free QR generator

## G. Discovery / Places / Groups / Bookings

- [ ] Place search substrate: Google Places Text Search when key set, else OSM/Overpass (`tourism=hotel`, cuisine/opening_hours/wifi/stars/distance); no `places.photos`
- [ ] Images: Serper `/images` → prefer `encrypted-tbn0.gstatic.com` thumbnails
- [ ] Platform CTA links per category (food/shopping/spa/entertainment/travel) — search links only
- [ ] Location: HTML5 geolocation, 30-min cache, Nominatim reverse-geocode, → chat locationBias
- [ ] Trip plan card structure
- [ ] Service detail `/service/[id]` + booking **lead capture** (`/api/bookings`, status `pending`, "venue will call")
- [ ] `/profile/bookings` list
- [ ] Groups: create `/group/new`, join (≤10, auth), creator-only backend-AI "suggest", `/group/[id]`
- [ ] No embedded map — outbound Google Maps links

## H. Personalization / Notifications

- [ ] Learning engine (server): 6-signal collect (90d) → time-decay → taxonomy affinity propagation → cached to `user_preferences.preference_profile`; rebuilt on search/negative/watch events
- [ ] Recommendation engine: 6-signal weighted scorer, hidden-topic penalty, top-10 ≥0.05; surfaced on `/recommendations`
- [ ] Behavior tracking `/api/track` (16 event types, ≤20/batch) + `/interact` (watch_seconds, completion_rate)
- [ ] PostHog analytics (separate from learning engine)
- [ ] Web Push (VAPID): subscribe, single master `enabled` toggle, payload `{title,body,icon,badge,image?,data.url}`
- [ ] Foreground chime (WebAudio + vi-VN TTS) + service-worker deep-link on click
- [ ] In-app notification inbox (follow/like/milestone) — pull-based
- [ ] Price-watch: set watch, `price-check` cron fires notifications
- [ ] Crons (backend, operator): deal-notifications, morning-brief, price-check scheduled; lunch/travel-reminder, behavior-rollup, weekly-recap exist but unscheduled

## I. Profile / Settings / Subscription / Integrations

- [ ] Profile hub `/profile` + subpages: edit, account, settings, preferences, history, posts, favorites, bookings, notifications, price-watches, integrations, tappy-knows
- [ ] Editors: Edit (avatar/name/bio via `/api/profile`), Preferences (budget/cuisine/dietary/freeform/gender), Tappy-Knows memory, Response-Style (localStorage)
- [ ] Email immutable (from auth session)
- [ ] Favorites (`/api/favorites`)
- [ ] Subscription `/subscription`: Free vs Pro (99K/mo); Pro currently OFF; Stripe checkout/portal/webhook (Web only)
- [ ] Integrations: Google Calendar (readonly, CSRF `state===user.id`), Zalo (name/avatar for feed)
- [ ] i18n: vi + en; reactive store; first-visit language picker (Tappy otter mascot)
- [ ] Dark mode toggle (Header, `localStorage['theme']`, system fallback)
- [ ] Legal: `/terms`, `/privacy`, `/profile/terms`, `/profile/privacy`, `/copyright`

## J. Global navigation shell

- [ ] 5-tab bottom nav: **Home `/`**, **Chat `/chat`**, **Explore `/reviews`**, **Deals `/deals`**, **Profile `/profile`**
- [ ] Bottom nav suppressed on all `/reviews*` (feed has own nav)
- [ ] Header (logo, search entry, dark-mode toggle, language)
- [ ] Search bar + 5 category pills (hard-coded) + category grid
- [ ] Home App-Shell (adaptive light/dark)

## K. Operator-only (NOT ported to iOS)

- [ ] `/admin/analytics` — gated by `ADMIN_IDS`. Excluded from iOS.
- [ ] `GET /api/version` + `VersionWatcher` auto-reload of stale PWA tabs — Web PWA concern; iOS updates via App Store, N/A to native clients.

---

### iOS parity acceptance = every non-operator box above behaves identically to Web, honoring the contracts in docs 03 (rules), 04 (API), 05 (data), 06 (UI/UX).

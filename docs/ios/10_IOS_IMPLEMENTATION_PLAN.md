# TappyAI — iOS Implementation Plan

> Part of the `docs/ios/` design dossier. A phased build plan mapped to `02_FEATURE_INVENTORY.md`, following the owner's proven workflow (build full UI → runtime verify → polish in the same cycle → next). No scope beyond Web parity.

## Workflow rule (from Android, applies to iOS)

Per feature: **build the full UI → runtime-verify against the live backend → polish immediately → close → next.** No deferred "polish phases." Fold refinements into each feature's own cycle.

## Phase 0 — Foundation (no product features yet)

- [ ] Xcode project, module/target structure (Core + Features per 09 §3)
- [ ] **DesignSystem**: tokens (colors #007AFF/#FF9500, type, spacing, elevation, motion), light/dark, `Tappy*` primitives (Button, TextField, AppBar, BottomNav, NavRail, EmptyState, ErrorState, Skeleton, LoadingIndicator, BottomSheet, Dialog, ChatBubble, MediaCard, SearchBar, Image, Markdown) — mirror Android's ~22
- [ ] **Network core**: `TappyAPIClient` (Bearer), streaming line-parser, multipart uploader, typed error model (map the status/error strings in 04)
- [ ] **Supabase** wrapper (anon key), **Auth/SessionStore** (Keychain), Clock (VN UTC+7), i18n reactive store (vi/en)
- [ ] Root nav shell (session-driven) + 5-tab bar + deep-link router
- **Exit:** DesignSystem showcase screen renders in light/dark; a Bearer call to a real endpoint round-trips.

## Phase 1 — Account & shell

> Auth decisions finalized 2026-07-10 (see `PHASE1_AUTH_SURVEY.md §0`, ADR-005 amendment). Build order: Supabase wiring → Email-OTP → Google → register → onboarding → **Zalo last** → anonymous → cross-cutting.

- [ ] Supabase auth wiring: replace `UnavailableTokenRefreshing` with the SDK-backed refresher; launch restore; `SessionStore.didAuthenticate`
- [ ] Email-OTP (universal fallback), Google (`ASWebAuthenticationSession` + `tappyai://` callback), register (email+password)
- [ ] **Zalo — DECIDED (D2):** entire 5-hop flow inside **one `ASWebAuthenticationSession`**, existing routes, **no new backend endpoints**
- [ ] OAuth deep-link callbacks; token storage (Keychain)/single-flight refresh; logout
- [ ] **Anonymous session — DECIDED (D1):** consume the stable `POST /api/auth/anonymous` contract (`access_token`/`refresh_token`/`anonymous_id`/`expires_at`) → Keychain → Bearer → server quota on `anonymous_id`; no login required. Backend implementation hidden/swappable — client is implementation-agnostic
- [ ] **Anon → account carry-over:** sign in via the standard flow; rely on backend guarantees (history preservation, stable identity, no duplicate user, seamless upgrade); mechanism (convert/merge/link) is backend-owned. Verify history carried over
- [ ] Onboarding (gated on `profiles.onboarded`) → `POST /api/onboarding`
- [ ] Home App-Shell (search, category pills/grid), Profile hub skeleton
- **Backend dependencies (Backend + Web first, ADR-011):** expose the stable `POST /api/auth/anonymous` (+ refresh); enforce anon quota on `anonymous_id`; guarantee history-preserving seamless upgrade (mechanism backend-owned); retire `tappy_anon`. iOS consumes the contract.
- **Exit:** all sign-in paths work on device; anon session + carry-over verified; onboarding persists; session drives root nav.

## Phase 2 — AI Chat (highest product value)

- [ ] Chat screen + streaming (data-stream parser → text + tool events)
- [ ] Structured markers: TAPPY_PLAN card, CTA_BUTTONS, FOLLOWUPS, inline images/links
- [ ] All 10 tools rendered (place cards, weather, gold, prices, price-watch confirm)
- [ ] Tappy mascot 18-pose state machine + typewriter + tool hints
- [ ] Conversations (create/list/rename/delete), `/chat/[id]`
- [ ] Memory ("Tappy knows") read/write; message feedback + TTS; emotes
- [ ] Location bias (CoreLocation) injected; anon/free quota handling (server-authoritative — see 03/09)
- **Exit:** a Vietnamese food/travel query streams a grounded answer with cards, CTAs, follow-ups identical to Web.

## Phase 3 — Reviews (highest technical risk)

- [ ] Dark feed + **AVPlayer state machine** (parent-driven active, muted-start, global unlock, watchdog, ±1 window, no mute button) — verify on device
- [ ] Double-tap heart-burst + haptic; like/save/comment/share/follow (Auth-gated) via direct Supabase + APIs
- [ ] Comments (create/list/delete-own); server-recomputed counts
- [ ] Review detail; creator/user profiles; follow with optimistic revert; user search
- [ ] Feed ranking parity (server feed API already ranks; client hashtag re-rank)
- [ ] Inbox tab (notifications)
- **Exit:** feed autoplay/sound/watchdog behave exactly like Web across scroll, backgrounding, and first-gesture unlock.

## Phase 4 — Review creation + Music

- [ ] Capture/upload video (limits, thumbnail, Vercel Blob token flow) + link mode (oEmbed)
- [ ] Photo upload (≤6, magic-byte, 10/day); review-create rules (verified badge, 1/place, 20/day)
- [ ] Native clip → auto original-sound registration
- [ ] Music library (browse/search/categories/trending), sound detail (disc, play counter, save/follow, use-this-sound)
- [ ] Sound upload with **mandatory rights consent**; report/takedown; `/copyright`
- **Exit:** post a review with an original sound; reuse a sound; consent gating enforced.

## Phase 5 — Utility tools

- [ ] Currency, Translate, Scan/OCR, Viết Content (native UI → existing APIs, honor per-IP limits)
- [ ] Split-bill (local), Fortune suite (deterministic, offline, ported data banks), QR profile
- [ ] Deals (curated + daily shuffle)
- [ ] SuperTux via WKWebView (COOP/COEP/SAB) — confirm acceptability first
- **Exit:** each tool matches Web output; fortune is reproducible offline.

## Phase 6 — Discovery, Groups, Personalization, Notifications

- [ ] Service detail + booking lead capture; `/profile/bookings`
- [ ] Groups: create/join(≤10)/creator-suggest
- [ ] Recommendations page; behavior tracking (`/api/track`, `/interact`) feeding the learning engine
- [ ] **APNs** registration + device-token row + master toggle + deep-link routing (backend adds APNs case)
- [ ] Price-watch UI (cron fires server-side)
- **Exit:** tracked behavior changes recommendations; a test push deep-links correctly.

## Phase 7 — Profile, Settings, Subscription, Integrations, polish

- [ ] All profile subpages + editors (edit/preferences/tappy-knows/response-style), favorites, history
- [ ] Settings, dark-mode toggle, language picker (first-visit otter modal)
- [ ] Integrations: Google Calendar, Zalo
- [ ] Subscription screen (Pro **OFF** for MVP → no purchase surface); build Payment Abstraction seams + StoreKit provider stub for when Pro turns on
- [ ] Legal pages
- **Exit:** full parity pass against the feature inventory; App Store review prep.

## Cross-phase: verification & App Store readiness

- Unit tests: streaming parser, VN-rollover quota math, fortune engine, split-bill.
- Device UAT each phase (owner's workflow).
- Pre-submission reconcile: 15/day copy, "7 games" copy, SuperTux WebView, IAP (only if Pro on), privacy manifest + permission strings (camera/mic/photos/location/notifications).

## Dependency order

`Phase 0 → 1` are prerequisites for everything. `2` (Chat) and `3` (Reviews) are the two flagship pillars and can proceed in parallel after Phase 1 if staffed. `4` depends on `3` (composer/feed) and Music. `5` is largely independent. `6`–`7` layer on top.

## Sequencing note vs Android

Android currently has only Auth live. iOS should **not** wait for Android — it builds directly to the Web contract. Where Android has already solved a native problem (DS tokens, nav bus, encrypted token storage, Google nonce flow, swap-seams), reuse the *approach*; where Android is still a placeholder (Chat, Reviews, Music, etc.), the **Web implementation + backend API is the spec**.

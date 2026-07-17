# TappyAI — Web → iOS Migration Strategy

> Part of the `docs/ios/` design dossier. A **migration guide, not a redesign.** For each module: what Web does today, the backend it uses, the iOS equivalent, the native adaptations, what stays identical, and what changes because of iOS. Behavior and rules are preserved 100%; only the presentation layer becomes native.

**How to read each entry:** *Identical* = product behavior/rules/API that must not change. *Native adaptation* = the iOS-idiomatic way to present the same behavior (per HIG). *Changes because of iOS* = platform-forced differences (payments, push, cookies, WebView).

---

## 1. Authentication & Onboarding
- **Web:** Supabase Auth (Google enabled), Zalo 5-hop PKCE bridge, Email-OTP, register; anon session; onboarding gated on `profiles.onboarded`.
- **Backend:** Supabase Auth; `/api/auth/zalo/*`; `/api/onboarding`; `getRequestUser` (cookie or Bearer).
- **iOS equivalent:** supabase-swift auth; `ASWebAuthenticationSession` for Google/Zalo; native OTP entry; onboarding screens.
- **Native adaptations:** Sign-in with system web-auth sheet; Keychain JWT; deep-link (`tappyai://auth/...`) callback.
- **Identical:** the auth methods, the Zalo bridge contract, onboarding fields, redirect sanitization, session semantics.
- **Changes because of iOS:** OAuth returns via ASWebAuthenticationSession + deep link (not a browser redirect page); **anon quota can't use the httpOnly cookie** → server-authoritative anon token or require login for chat.

## 2. AI Chat (Tappy)
- **Web:** streaming chat, 10 tools, structured markers, mascot, conversations, memory, feedback+TTS.
- **Backend:** `POST /api/chat` (Vercel AI-SDK data-stream), `/api/conversations`, `/api/memory`, `/api/message-feedback`, `/api/suggested-prompts`.
- **iOS equivalent:** SwiftUI chat; `URLSession.bytes` streaming line-parser; card/marker renderers; AVSpeech for TTS.
- **Native adaptations:** native message list + `ContextMenu` for message actions; `Toolbar`; native share sheet for links; system TTS.
- **Identical:** the `/api/chat` endpoint contract, streaming protocol + prefixes, all markers (`[TAPPY_PLAN]/[CTA_BUTTONS]/[FOLLOWUPS]`), tool set, mascot state machine, memory auto-extraction, quotas.
- **Changes because of iOS:** none to behavior; only the stream is consumed by a Swift parser. Quota enforcement must not rely on cookies.

## 3. Reviews feed (short video)
- **Web:** dark full-screen feed, parent-driven player, muted-start + global gesture-unlock, watchdog, double-tap like, social actions, own nav.
- **Backend:** `GET /api/reviews/feed` (edge, page 12/cap 20, trending score), like/save/comment/follow routes, `/interact`.
- **iOS equivalent:** `TabView`/paged `ScrollView` (or UIKit `UIPageViewController`) of `AVQueuePlayer` cells; the same active-index state machine.
- **Native adaptations:** native paging, `UIImpactFeedbackGenerator` for the like haptic, native share sheet, swipe/scroll physics.
- **Identical:** the **entire playback state machine** (active-driven, muted-start, global unlock flag, 300ms watchdog, ±1 window, **no mute button**), ranking, pagination, gating (login walls), double-tap heart-burst.
- **Changes because of iOS:** AVPlayer instead of `<video>`; audio-session category management (ambient→playback on unlock); background/foreground handling of players.

## 4. Review create & upload
- **Web:** capture/upload video + photos, link mode (oEmbed), attach/borrow sound, native-clip auto-original-sound.
- **Backend:** `/api/upload/video|audio` (Blob tokens), `POST /api/reviews`, `/api/reviews/upload`, oEmbed.
- **iOS equivalent:** `PhotosPicker`/`AVCaptureSession` capture; direct Blob upload; native composer.
- **Native adaptations:** native photo/video pickers, native progress; client thumbnail via AVFoundation.
- **Identical:** all limits (video ≤50MB mp4/mov/webm; photo ≤6/≤5MB/magic-byte/10-day; audio ≤20MB), review rules (verified badge, 1/place→409, ≤1000, 20/day), original-sound registration, SSRF-guarded links.
- **Changes because of iOS:** capture stack is AVFoundation/PhotosUI; enforce magic-byte + size client-side before requesting a Blob token.

## 5. Music ecosystem
- **Web:** library/search/categories/trending, sound detail (disc, play counter, save/follow, use-this-sound), upload with consent, report/takedown.
- **Backend:** `/api/music/*`, `/api/sound/*` + direct anon-key catalog reads; RPC counters.
- **iOS equivalent:** SwiftUI browse + `AVAudioPlayer`; spinning-disc animation; composer hand-off.
- **Native adaptations:** native audio playback + `Now Playing`-free simple player; consent as a required toggle in a native form.
- **Identical:** upload constraints (8 types, ≤20MB, 1–600s, title ≤120), **mandatory rights consent** (4-layer), takedown, derived "N video" count, diacritic search, play-count RPC.
- **Changes because of iOS:** pointer-sounds whose `audioUrl` is a *video* file must be played by extracting audio via AVPlayer; audio-session coordination with the feed.

## 6. Utility tools
- **Web:** currency, translate, scan/OCR, viết-content, split-bill, deals, fortune suite, SuperTux, QR.
- **Backend:** `/api/rates|translate|scan|viet-content`; deals curated; fortune/split-bill/QR local.
- **iOS equivalent:** native forms → same APIs; ported local engines; WKWebView for SuperTux.
- **Native adaptations:** native pickers, `Camera`/`VisionKit` capture feeding `/api/scan`, native share.
- **Identical:** API contracts + per-IP limits; deals curation + daily shuffle; **deterministic fortune engine** (ported data banks, byte-identical); split-bill math; QR generation.
- **Changes because of iOS:** SuperTux stays a **WKWebView** (COOP/COEP/SharedArrayBuffer, iOS ≥15.2) — confirm App Store acceptability; OCR image capture via native camera.

## 7. Discovery / Places / Groups / Bookings
- **Web:** in-chat place search (OSM substrate, Serper images), platform CTA links, service detail + booking lead, groups.
- **Backend:** chat tools, `/api/bookings`, `/api/group/*`, image pipeline.
- **iOS equivalent:** render place cards from chat; native booking-lead form; native group screens.
- **Native adaptations:** CoreLocation for location bias; outbound Google Maps via `UIApplication.open`; native share.
- **Identical:** OSM-based data, Serper gstatic image sourcing, **no embedded map** (outbound links only), CTA-links-not-in-app-booking, booking status `pending`/"venue will call", group ≤10 + creator-only suggest.
- **Changes because of iOS:** location via CoreLocation (30-min cache parity); maps are outbound links (do **not** add MapKit place UI — that would exceed parity).

## 8. Personalization & Notifications
- **Web:** behavior tracking → learning engine → recommendations; Web Push (VAPID) + in-app inbox; price-watch.
- **Backend:** `/api/track` (16 types, ≤20/batch), `/api/recommendations`, `/api/notifications*`, `/api/price-watch`; crons.
- **iOS equivalent:** send the same track events; render recommendations; APNs; native inbox list.
- **Native adaptations:** `UNUserNotificationCenter` registration; in-app banner instead of WebAudio chime; native settings toggle.
- **Identical:** event taxonomy, learning/recommendation logic (server), single master notify toggle, `data.url` deep-link map, price-watch flow.
- **Changes because of iOS:** **Web Push → APNs** (backend adds `provider='apns'` case + device tokens); background delivery handled by APNs.

## 9. Profile / Settings / Subscription / Integrations / i18n
- **Web:** profile hub + subpages, editors, favorites, subscription (Pro OFF), Stripe, integrations, vi/en, dark mode.
- **Backend:** `/api/profile`, `/api/preferences*`, `/api/memory`, `/api/favorites`, Stripe routes, integrations routes.
- **iOS equivalent:** native `Form`/`List` settings; native editors; StoreKit (when Pro on); language + appearance.
- **Native adaptations:** `Form`, native `DatePicker`/`Toggle`, `Menu`; settings-style navigation; system appearance + manual override.
- **Identical:** editable fields (avatar/name/bio/preferences/memory/response-style), email immutable, vi/en set, first-visit language modal (otter), dark-mode semantics, integration flows.
- **Changes because of iOS:** **subscription via StoreKit** through the Payment Abstraction Layer (`09 §6`), never Stripe in-app; **MVP ships no purchase surface** (Pro OFF).

## 10. Global navigation shell
- **Web:** 5-tab bottom nav (Home/Chat/Explore/Deals/Profile), nav hidden on `/reviews*`, header with search/dark/lang.
- **iOS equivalent:** `TabView` with 5 tabs; the Explore/feed tab presents its own full-screen dark experience; native large-title/search where appropriate.
- **Native adaptations:** `TabView` + `NavigationStack` per tab; `.searchable`; `Toolbar`; size-class → tab bar (compact) vs sidebar (regular).
- **Identical:** the 5 destinations and routes, the reviews-feed-owns-its-nav rule, category pills/grid, two-shells-never-merge.
- **Changes because of iOS:** native tab bar + navigation stacks replace the web nav components (behavior identical).

---

## Migration invariants (apply to every module)

1. **Never change a business rule during migration** — port it from Web/Backend as-is (`03`, `14`).
2. **Never call a different endpoint** than Web for the same operation (`04`).
3. **Never render fabricated data** — only what the server returns.
4. **Prefer native components** (HIG) for presentation; keep behavior identical (Native Design Principle, `09`/`06`).
5. **When a native constraint forces a difference** (payments, push, cookies, WebView), it is listed above and nowhere else invents divergence.

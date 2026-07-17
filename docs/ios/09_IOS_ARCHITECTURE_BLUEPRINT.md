# TappyAI — iOS Architecture Blueprint

> Part of the `docs/ios/` design dossier. Proposed iOS architecture to deliver 100% Web parity on the shared backend. Prioritizes stability, maintainability, consistency, and long-term scalability. No scope expansion.

## 1. Guardrails (from the product rule)

- Same product as Web/Android. No new features, no redesigns, no iOS-exclusive capabilities in MVP.
- iOS talks to the **same Supabase project + same Next.js API surface**. It never invents endpoints or tables.
- Native platform code only where the OS requires it (media, permissions, lifecycle, notifications, storage, payments, WebView-for-SuperTux).

## 1b. Native Design Principle (MANDATORY)

Preserve **100%** of: feature parity, business-rule parity, workflow parity, API parity, permission parity, subscription parity, and AI-behavior parity.

Do **NOT** attempt pixel-perfect visual parity with Web. The iOS app must follow **Apple's Human Interface Guidelines** and use idiomatic SwiftUI components wherever appropriate:

`NavigationStack` · `Sheet` / `FullScreenCover` · `ContextMenu` · swipe actions · `Toolbar` · native `DatePicker` · `.searchable` · native share sheet (`ShareLink`) · `PhotosPicker` · native video player (AVPlayer) · native haptics (`UIImpactFeedbackGenerator`) · native accessibility (Dynamic Type, VoiceOver).

> **The product must feel like an iPhone application while behaving exactly like the Web product.** Behavior, rules, flows, and contracts are identical; presentation is native. When a native pattern and a web layout conflict, choose the native pattern **without** changing what the feature does. See `06_UI_UX_SPEC.md` for the per-pattern web→iOS-native mapping.

## 2. Tech stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language / UI | **Swift 5.9+, SwiftUI** (UIKit where SwiftUI falls short: AVPlayer feed, some sheets) | Native feel, matches Compose parity on Android |
| Min iOS | **TBD — decided during Phase 0** (see §10 decision process; SuperTux imposes a WKWebView floor ≥15.2 regardless) | Stay compatible with modern SwiftUI; keep the decision open |
| Concurrency | **async/await + Combine** | Streaming, reactive state |
| DI | Lightweight (protocol + init injection, or a small container) | Mirror Android's Hilt boundaries without over-engineering |
| Networking | **URLSession** + a thin typed client | Bearer auth, streaming, multipart uploads |
| Supabase | **supabase-swift** (anon key) | Direct RLS reads/writes, Auth |
| Persistence | Keychain (JWT), UserDefaults (lang/theme/response-style), lightweight cache (Core Data/SQLite optional) | Match web localStorage semantics |
| Media | **AVPlayer/AVQueuePlayer** (feed + audio), **PhotosUI/AVFoundation** (capture/upload) | Replicate feed state machine |
| Maps | **Outbound Google Maps links** (parity: Web has no embedded map) | Do NOT add MapKit places — matches product |
| Push | **APNs** (via backend provider case) | See §7 |
| Payments | **StoreKit 2** behind Payment Abstraction Layer | See §6 |
| WebView | **WKWebView** for SuperTux only | Only WebView-bound feature |
| Analytics | PostHog iOS SDK (parity with Web analytics) | Separate from learning engine |

## 3. Module / layer structure (Clean Architecture, mirrors Android)

```
TappyAI (app target)
├── Core/
│   ├── DesignSystem/     Tappy* components + tokens (colors #007AFF/#FF9500, type, spacing, light/dark)
│   ├── Network/          TappyAPIClient (Bearer), streaming parser, multipart uploader, error model
│   ├── Auth/             SessionStore, TokenStorage (Keychain), OAuth deep-link handlers
│   ├── Supabase/         SupabaseClient wrapper (anon key, RLS reads)
│   ├── Persistence/      prefs, cache
│   ├── Location/         CoreLocation wrapper (30-min cache, reverse geocode)
│   ├── Push/             APNs registration, deep-link routing
│   ├── Payments/         EntitlementService + StoreKit provider (§6)
│   └── Common/           models, utils, i18n (vi/en reactive), Clock (VN UTC+7)
├── Features/
│   ├── Auth/             login, register, OTP, onboarding
│   ├── Home/             app-shell home, search, category pills/grid
│   ├── Chat/             streaming chat, tools rendering, mascot, conversations, memory
│   ├── Reviews/          dark feed + player state machine, detail, comments, create/upload
│   ├── Music/            library, sound detail, upload, use-this-sound
│   ├── Tools/            currency, translate, scan, viet-content, split-bill, deals, fortune, game(WebView), qr
│   ├── Discovery/        service detail + booking lead, groups
│   ├── Personalization/  recommendations, notifications inbox, price-watch
│   └── Profile/          profile hub + subpages, settings, subscription, integrations
└── AppShell/            root nav (session-driven), tab bar, deep links
```

`Core/*` never depends on `Features/*` (same rule as Android).

## 4. Networking & auth

- **Session-driven root nav:** `SessionStore` publishes `authenticated | anonymous | onboarding`. Root switches shell accordingly.
- **Token flow:** Supabase JWT in **Keychain**; `TappyAPIClient` attaches `Authorization: Bearer <jwt>` to every Next.js call; refresh via supabase-swift.
- **Two data paths (unchanged from Web):**
  - Direct Supabase (anon key, RLS): feed reads, catalog, public profiles, self-scoped rows, junction inserts/deletes, RPC calls.
  - Next.js API (Bearer): `/api/chat`, uploads, review-create, billing, integrations OAuth exchange, memory, recommendations, notifications subscribe, group suggest.
- **Streaming parser:** newline-buffered reader for the Vercel AI SDK data-stream (`0:`,`9:`,`a:`,`e:`,`d:`); then a second pass extracts `[TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`, inline images/links from the assembled text. (Spec in 04 §chat.)

## 4b. App launch sequence (F12) — Required before Phase 1

To avoid cold-start delay or gate-flashing, launch is defined as a fast local decision + async refresh:

1. **Synchronously** read the session from Keychain → route the root immediately: `anonymous` | `authenticated` | `onboarding` (from `profiles.onboarded`). No network call blocks first paint.
2. Apply the **stored locale** (`tappy_lang`) and theme instantly. Show the first-visit language modal **only** when no locale is stored.
3. **Asynchronously** (non-blocking): refresh the JWT (single-flight, ADR-004) and fetch the server entitlement into `EntitlementService`. UI updates reactively when they resolve.
4. Never gate the first frame on token refresh, entitlement, or network.

## 4c. Client layering (Thin Client, no pass-through layers)

Per ADR-001 amendment: default layering is **View → ViewModel → Repository → data source**. A **UseCase exists only where genuine client-side business logic exists** (feed player orchestration, chat stream assembly, optimistic revert, fortune/split-bill engines, entitlement resolution). Forwarding-only UseCases are forbidden. This keeps the client thin (`14`) and every layer justified.

## 5. Critical native replications (parity-sensitive)

1. **Reviews video feed** (see 06 + 03): `AVQueuePlayer`, parent-driven `active` index (not per-cell visibility), muted autoplay start, a **global gesture-unlocked sound flag**, a ~300ms self-healing watchdog re-issuing `play()` on the active item, only active ±1 items hold a live player, **no mute button**, double-tap heart-burst + haptic. This is the highest-risk screen — build it against the state machine in 06.
2. **Anon quota** (03 §2) — **DECIDED (2026-07-10):** server-authoritative **anonymous session** behind a stable client contract `POST /api/auth/anonymous → {access_token, refresh_token, anonymous_id, expires_at}` → Keychain → Bearer → server quota on `anonymous_id`; no login required. The backend implementation is hidden/swappable (Supabase anon auth, custom JWT, internal identity service, future provider). Persistent `anonymous_id` powers history/recs/analytics; on sign-in the backend **guarantees** history preservation, stable identity, no duplicate user, seamless upgrade — the mechanism is a backend detail and clients stay implementation-agnostic. See `PHASE1_AUTH_SURVEY.md §0`, ADR-005 amendment.
3. **SuperTux**: WKWebView with COOP/COEP + SharedArrayBuffer; confirm iOS ≥15.2 and App Store acceptability with owner.
4. **Uploads**: request Vercel Blob token from `/api/upload/{video,audio}`, enforce the same size/type/duration/magic-byte limits client-side (03 §Uploads).
5. **Fortune suite**: port the **deterministic** djb2 engine + static data banks natively (offline, no AI).

## 6. Payment Abstraction Layer (mandatory)

**Problem:** Web sells Pro (99K/mo) via Stripe card checkout. Apple Guideline 3.1.1 forbids shipping that in the iOS binary for a digital subscription. But entitlements must be identical across platforms.

**Design — backend owns entitlements; each platform plugs its own provider:**

```
                 ┌───────────────────────────────────────────────┐
                 │  Backend Entitlement Service (source of truth) │
                 │  table: subscriptions / entitlements           │
                 │  { user_id, tier, status, expires_at, source } │
                 └───────────────▲───────────────▲───────────────┘
   Stripe webhook │              │ Play RTDN     │ App Store Server
   (Web)          │              │ (Android)     │ Notifications v2 (iOS)
                 ┌┴─────┐   ┌────┴─────┐   ┌─────┴───────┐
                 │Stripe│   │Play      │   │StoreKit 2   │
                 │(web) │   │Billing   │   │(iOS)        │
                 └──────┘   └──────────┘   └─────────────┘
```

- **Client side (iOS):** `EntitlementService` protocol with a `StoreKitProvider`. Purchase/restore via StoreKit 2; on success, send the **signed transaction / JWS** to a backend endpoint (`POST /api/iap/apple/verify` — *to be added by backend*) which verifies with Apple, then writes the **same `subscriptions`/entitlement row** used by Stripe. `source` distinguishes provider.
- **Reads:** all platforms read entitlement via the existing live DB read of `subscriptions` (what the web already does). No product logic branches on provider — only the purchase surface differs.
- **Server verification is mandatory** (App Store Server API / Server Notifications v2) — never trust the client. Mirrors how Stripe uses signed webhooks today.
- **MVP note:** Pro is currently **OFF** (`SHOW_PRO_UPGRADE=false`). iOS MVP ships **no purchase surface** and matches Web. Build the abstraction seams now; wire StoreKit when Pro is enabled product-wide.
- **Restore purchases** and **family sharing / receipt refresh** handled by StoreKit provider; entitlement stays server-authoritative.

**Backend deltas required (flag to team):** an Apple verification endpoint + App Store Server Notifications handler that upsert into the shared entitlement table; a `source`/provider column if not present. These are additive — Web/Android unaffected.

## 7. Notifications (APNs)

- Web push is **already provider-agnostic**: `send.ts dispatch()` has a commented `case 'fcm'` stub. Backend adds an **APNs case** + device-token rows; then all cron/notification logic works unchanged.
- iOS: register for APNs → store device token (new `notification_subscriptions` provider row, keyed `(user_id, provider='apns')`) → honor the single master `enabled` toggle → route taps via `data.url` deep-link map (documented in 04/07 personalization).
- Foreground behavior: replicate the chime/toast affordance natively (no need for WebAudio TTS; use a subtle in-app banner).

## 8. Localization & theme

- vi + en, reactive; persist to UserDefaults (mirror `tappy_lang`), best-effort sync `profiles.language`. AI reply language stays **auto-detected per message** — do not force it from UI language.
- Theme: adaptive light/dark for the App-Shell (respect system + manual toggle persisted like `theme`); **Reviews feed is always dark**. Two shells never merge.

## 9. Testing & release

- Unit-test the deterministic pieces (fortune engine, split-bill, quota rollover math at VN UTC+7, streaming parser).
- Snapshot-test DesignSystem in light/dark.
- Integration-test the Bearer contract against a staging Next.js.
- Manual UAT the feed player state machine on device (autoplay, unlock, watchdog) — this is where Web/Android bugs historically lived.

## 10. Open items to confirm with owner / backend

1. **Minimum iOS version — decided *during* Phase 0, not pre-locked.** Evaluate: (a) current iPhone usage distribution in Vietnam and target markets, (b) feature requirements, (c) development complexity, (d) maintenance cost, (e) long-term support strategy. Keep the architecture compatible with modern SwiftUI while the decision stays open. (SuperTux needs a WKWebView floor ≥15.2 regardless.)
2. Anon-chat strategy on native (server token vs login-required).
3. Apple IAP endpoint + entitlement `source` column (only when Pro is turned on).
4. App Store acceptability of the SuperTux WebView game.
5. Reconcile the "7 games" copy before store review. (10-vs-15/day copy: ✅ RESOLVED 2026-07-11 — `/subscription` copy + remaining counter updated to 15/day on web.)

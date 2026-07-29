# 07 — Feature Inventory

**Frozen commit:** `79d05f3`. Every implemented feature by module, with production status.
Status legend: **LIVE** · **FLAG-GATED** (built, switched off) · **ADMIN-ONLY** ·
**OPERATOR-ONLY** (cron/secret) · **DEGRADED-WITHOUT-KEY** · **DEAD/LEFTOVER**.

---

## 1. Config-driven product surface (the spine)

`src/lib/config/product.ts` is the single source of truth (header: *"NOTHING in this file may be
redefined elsewhere"*). Served to native clients by `GET /api/config`.

| Export | Value | Gates |
|---|---|---|
| `FREE_DAILY_LIMIT` | 15 | Logged-in free chat/VN-day; enforced in `/api/chat`, shown in `/subscription` |
| `ANON_DAILY_LIMIT` | 5 | Anonymous chat/VN-day; enforced twice (token RPC + legacy cookie) |
| `SHOW_PRO_UPGRADE` | **false** | Hides the Pro upsell entry point (mirrored by Android) |
| `SHOW_APP_CONNECTIONS` | **false** | Hides App Connections entry point (mirrored by Android) |
| `MAX_PHOTOS_PER_REVIEW` | 6 | Composer cap |
| `MAX_VIDEO_SIZE_MB` | 50 | Composer + Blob token |
| `MAX_VIDEO_DURATION_SEC` | 60 | **Advertised** limit (UI copy) |
| `MAX_VIDEO_DURATION_ACCEPT_SEC` | 62 | **Backend tolerance — deliberately absent from `/api/config`; never surfaced in UI** |
| `AUTH_PROVIDERS` | google, zalo, email (all enabled) | Native button rendering |
| `ONBOARDING_INTERESTS` / `_CITIES` | 6 interests / 8 cities | Onboarding + native |

> **⚠ Config-pattern defect:** a **second** `AUTH_PROVIDERS` exists in `src/lib/auth/providers.ts`
> (which additionally lists `facebook: false`) and it is what the web login page actually renders
> from — violating the file's own "nothing may be redefined elsewhere" rule. Two divergent
> sources of truth; `facebook` is invisible to any native client reading `/api/config`.
> → `12_Open_Items.md`.

---

## 2. AI Chat — LIVE (core)
Text-first assistant. Voice input (Web Speech, 2s cancellable auto-send), image attach, TTS
read-aloud (language-matched), mood chips, category quick-prompts, tone/length response-style,
save-place, favorites, CTA buttons, trip-plan brochure, follow-up chips, per-message
copy/share/feedback/regenerate/report. Anonymous 5/day (two enforcement paths), free 15/day,
transcript survives the login redirect. Full detail in `05_AI.md` and `06_UI_UX.md` §4.
Deps: Anthropic, Serper, Google Places, Supabase. **Dead:** a `POST /api/cta-click` call with no
route (silent 404 per CTA click).

## 3. Reviews / short-video feed — LIVE (largest surface)
Create (photo/video/URL-import), like, save, comment (**now threaded, one level**), **6 reactions**,
follow, share, hide/unhide own, delete own, search posts + users, attach & reuse sounds. Feed tabs
For You / Following / Latest; TikTok-style vertical snap feed; ±1 video window (iOS media cap);
double-tap like; watch-time telemetry; **Realtime unread badge (no polling)**; **feed back-restore
by clip ID**. Detail pages, creator pages, in-feed profile. Detail in `06_UI_UX.md` §5.

## 4. Music library + Original Sound UGC — LIVE
Browse by category, search, preview (single shared `<audio>`), full sound page (type label, CC-BY
attribution, trending rank, play/save/follow counts, videos-using-this-sound grid, copyright
report modal), original-sound upload (≤20MB, mandatory rights checkbox). Reusable-by-SoundID
contract `{version,trackId,startSec,volume}`. Self-contained module `src/modules/music`.
**Dead code:** `musicPlaybackController.ts` + `useMusicPlayback.ts` (orphaned by the
`ReviewMusicCard` rewrite).

## 5. Deals / partner catalog — LIVE (rearchitected)
**DB-backed, admin-managed** `partner_deals` (replaced the old hardcoded `shopee-deals.ts`, which
is deleted). Public `GET /api/deals` (`?country=VN`, whitelisted fields), click counter, promo
countdown, copyable voucher chip, discount badge. Admin CRUD with scheduling
(`start_at`/`end_at` enforced in RLS), reorder, show/hide, logo/banner upload. Serves web +
Android + iOS from one source. Detail: `04_Database.md` §1.6, `06_UI_UX.md` §7.

## 6. Explore / Discovery — LIVE (merged into Reviews)
No standalone `/explore` route — "Explore" is the nav label for `/reviews`. Machinery:
`lib/explore/{behaviorTracker,contentProcessor}` + `VideoPlayer` + `/api/explore/{process,oembed}`.
Separate personalized surface `/recommendations` → `lib/recommendation/recommendationEngine`
(ranked cards with matched-signal chips + explanation; 401 for anonymous).
`lib/explore/recommendation.ts` appears **dead** (no consumer).

## 7. Maps / places / service detail — LIVE
`/service/[id]` is **login-gated**; place data arrives via query params (a render target for chat
results, not a places DB), with a UUID → `services` table override, community reviews + a computed
Tappy average, and a `BookingForm` → `/api/bookings`. Place search is the chat `search_places` tool
(Google Places + Serper + OSM substrate). Debug: `/api/debug-places`, `/api/test-photos`
(CRON_SECRET + NODE_ENV gated, burn paid quota — recommend removal).

## 8. Utility tools — LIVE
| Tool | Backend | Notes |
|---|---|---|
| Currency | `/api/rates` (open.er-api.com + fallback table) | 12 currencies; missing-currency now throws (Bug #15) |
| Translate | `/api/translate` (LLM) | 30 languages; 30/day/IP; read-aloud in target language |
| Scan | `/api/scan` (vision LLM) | **OCR, not QR**; client-resize before upload; export TXT/DOCX |
| Split bill | none (pure client) | Equal/custom, tip presets |
| Group dining | `/api/group[/id]/{join,suggest}` | AI venue suggestion; `/group/[id]` has no auth gate |
QR is a separate on-device generate-only feature (`lib/qr/qrcode.ts` + `QRProfileButton`).

## 9. Fortune telling (`boi`) — LIVE, fully offline **[COST]**
`/boi` + tarot / tu-vi / cung-hoang-dao. `lib/boi/fortuneEngine.ts` is **deterministic** (djb2
hash of subject+period over VN-time buckets) → same person, same period, same reading, **zero AI
and zero API cost**. Data banks: 78-card tarot, 12 zodiac, can-chi, lifetime. No key required.

## 10. Games — LIVE (env-dependent)
`/game` hub (SuperTux only; the old 6-game grid was removed) → WASM build requiring COOP/COEP
isolation (set in both `middleware.ts` and `vercel.json`). **Degraded without**
`NEXT_PUBLIC_SUPERTUX_DATA_URL` / `_WASM_URL`. Accepted cost: COEP can block PostHog/Supabase on
that page.

## 11. Notifications — LIVE (in-app) + DEGRADED-WITHOUT-KEY (push)
In-app inbox synthesised from follows + likes + milestones + **comments** (4th type, new), grouped
by time, with a Realtime unread badge. Web Push needs VAPID keys. 8 cron routes exist; **4 are
scheduled, 4 are dormant** (`03_Backend.md`). `behavior-rollup` being unscheduled means
`behavior_summary` is never refreshed.

## 12. Subscription / Stripe / Apple IAP — FLAG-GATED
Fully implemented (checkout, portal, signed webhook, `billing_customers` isolation, StoreKit 2
JWS verification). `SHOW_PRO_UPGRADE = false` removes the only entry point; `/subscription`
remains URL-reachable and renders Free/Pro + today's quota. Requires Stripe / Apple env in prod.

## 13. Profile & personalization — LIVE
`/profile` hub + Account, Chat history (delete), Bookings (+ review-from-booking), Preferences,
Saved, Price watches, **Tappy Knows** (memory transparency: view/edit/delete every remembered
fact), App Connections (hidden), My reviews, Group dining. Public `/users/[id]` and
`/reviews/creator/[id]`. Three personalization stores (debt — `02_Architecture.md` §3.3).

## 14. Back office / admin — ADMIN-ONLY (partly stubbed)
12 nav items, **7 live** (Analytics, Auth analytics, Activation analytics, Audit, **Deals** (new),
Roles, Settings-read-only), **1 stub** (Dashboard KPI cards show `—`), **4 not-built**
(Users/Moderation/Engagement/Monitoring, rendered as "coming soon"). RBAC: analyst < moderator <
admin < super_admin. `admin/settings` is read-only (needs a `platform_settings` table not in the
schema). Detail: `06_UI_UX.md` §11.

---

## 15. Domain library map (`src/lib/**`)

| Lib | Purpose | Status |
|---|---|---|
| `ai/**` | LLM facade, prompt/context builders, intent, budget, enrichment, placeMatch, tools | LIVE (`05_AI.md`) |
| `admin/**` | RBAC (`resolveAdminRole`, `requireAdminRole`), audit, analytics (10 test files) | LIVE |
| `admin.ts` | Legacy `ADMIN_IDS`/`isAdmin` — `@deprecated` | LEGACY (still gates music reports) |
| `auth/**` | `getRequestUser`, provider catalog | LIVE (dup — §1) |
| `background/**` | Home background resolver | LIVE (V1 = single asset) |
| `boi/**` | Deterministic fortune engine + data | LIVE, offline |
| `deals/**` | `partnerDeals`, `schema`, `countdown` | LIVE (new) |
| `explore/**` | behaviorTracker, contentProcessor; `recommendation.ts` dead | LIVE / partial dead |
| `finance/**` | `exchange` (crossRate/MissingCurrencyError), `format` | LIVE (new) |
| `i18n/**` | vi/en dictionaries, ~709 keys/locale | LIVE (explicitly partial) |
| `integrations/googleCalendar` | Read-only calendar context for chat | DEGRADED-WITHOUT-KEY, flag-hidden |
| `memory/**`, `userMemory.ts` | Long-term + legacy memory | LIVE (overlap debt) |
| `notifications/**` | chime, web-push send | DEGRADED-WITHOUT-KEY |
| `platformLinks/**` | Deep-link builders incl. `buildFlightLinks` | LIVE (new flight links) |
| `preferences/**` | Implicit signal learning (90-day window) | LIVE |
| `qr/qrcode.ts` | Zero-dep QR encoder | LIVE, on-device |
| `recommendation/**` | Deterministic place ranker | LIVE |
| `security/**` | `imageType` sniff, `rateLimit`, `urlGuard` | LIVE (rate-limit per-instance) |
| `tracking/**` | Analytics envelope → `/api/track` | LIVE |
| `tts/voiceSelection.ts` | Language-matched voice picker | LIVE (new) |
| `ui/gridFill.ts` | Profile grid filler | LIVE (new) |
| `TappyMascotState.ts` | 18-pose mascot mapping | LIVE (emoji fallback) |
| `shopee-deals.ts` | **DELETED** in production | — |

---

## 16. Environment variables

**45 distinct variables. 5 hard-required to boot:** `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.
Full table with locations and required/optional status: `14_Appendix.md`.

---

## 17. Cross-cutting feature findings

1. Dead endpoint: `POST /api/cta-click` (no route) — every chat CTA click 404s silently.
2. Duplicate `AUTH_PROVIDERS` (§1).
3. 4 of 8 crons unscheduled; `price-check` comment/schedule drift.
4. Three parallel personalization stores + one dead recommendation lib.
5. In-memory rate limiting doesn't survive serverless scale-out.
6. Chat quota fails open on error (unmetered-cost path).
7. Deprecated `ADMIN_IDS` still gates music reports.
8. Admin dashboard is a stub; 4 of 12 nav destinations have no page.
9. Dead code: `musicPlaybackController.ts`, `useMusicPlayback.ts`, `lib/explore/recommendation.ts`,
   `CategoryGrid.tsx`, `login.stat*` i18n keys.

All carried into `12_Open_Items.md`.

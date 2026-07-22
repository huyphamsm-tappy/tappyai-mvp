# TappyAI — Product Specification

> Part of the `docs/ios/` design dossier. Source of truth = production **Web + Backend**. Generated 2026-07-10 from a direct code audit.

## 1. What TappyAI is

TappyAI is a **Vietnamese-first AI super-app**. Its core loop is an AI assistant ("Tappy", an otter mascot) that answers everyday Vietnamese life questions across **five locked domains** — Food, Travel, Weather, Shopping, and Gold/Finance — grounded in real place data, and surrounds that assistant with a **TikTok-style short-video review community**, a **music/original-sound ecosystem**, and a suite of **standalone utility mini-tools** (currency, translate, OCR scan, content writer, split-bill, deals, fortune-telling, a game).

The product is delivered on **Web** (Next.js 14, production), **Android** (native Kotlin/Compose, in progress), and **iOS** (to be built). All three must be the **same product**.

## 2. Platform strategy & parity

- **Web** — the complete, authoritative implementation (~50 screens, ~70 API routes).
- **Android** — native, Clean Architecture; today only **Auth** is wired to a live backend, the rest is UI shell (see `08_ANDROID_PARITY_REPORT.md`). Android is *catching up* to Web.
- **iOS** — must reach **100% parity with Web**. It targets the full Web feature set, not Android's current subset.

Backend is shared across all platforms: **one Supabase project + one Next.js API surface**. iOS talks to the same endpoints and the same database (under the same RLS), so behavior is identical by construction where the client honors the contracts in docs 03–05.

## 3. Module map (the whole product)

| Domain | Module | Primary surfaces | Detail doc |
|--------|--------|------------------|-----------|
| **AI** | Chat assistant | `/chat`, `/chat/[id]` | 02 §Chat, 04 §chat |
| **AI** | 10 agentic tools | places/news/products/web/weather/gold/flights/hotels/transport/price-watch | 02, 04 |
| **Social** | Reviews video feed | `/reviews` (locked-dark, own nav) | 02 §Reviews |
| **Social** | Review create/upload | `/reviews/new` | 02, 03 §Upload |
| **Social** | Review detail + comments | `/reviews/[id]` | 02, 04 |
| **Social** | Creator/user profiles | `/reviews/creator/[id]`, `/users/[id]` | 02 |
| **Music** | Sound library | `/music`, `/music/upload` | 02 §Music |
| **Music** | Sound detail + use-this-sound | `/sound/[trackId]` | 02, 04 |
| **Music** | Copyright/takedown | `/copyright` | 03 |
| **Tools** | Currency | `/currency` | 02 §Tools |
| **Tools** | Translate | `/translate` | 02 |
| **Tools** | OCR scan | `/scan` | 02 |
| **Tools** | Viết Content (VN writer) | `/viet-content` | 02 |
| **Tools** | Split bill | `/split-bill` | 02 |
| **Tools** | Deals | `/deals` | 02 |
| **Tools** | Fortune suite (bói) | `/boi`, `/boi/tarot`, `/boi/tu-vi`, `/boi/cung-hoang-dao` | 02 |
| **Tools** | Game (SuperTux WASM) | `/game`, `/game/supertux` | 02 |
| **Tools** | QR profile | component | 02 |
| **Discovery** | Places (in-chat) | via chat tools | 02, 06 |
| **Discovery** | Service detail + booking lead | `/service/[id]`, `/profile/bookings` | 02, 04 |
| **Discovery** | Group planning | `/group/new`, `/group/[id]` | 02, 04 |
| **Personalization** | Learning/preference engine | server-side | 02, 07 |
| **Personalization** | Recommendations | `/recommendations` | 02 |
| **Personalization** | Notifications (push + inbox) | `/profile/notifications`, reviews inbox tab | 02, 04 |
| **Personalization** | Price-watch | `/profile/price-watches` | 02, 04 |
| **Account** | Auth (email/Google/Zalo/anon) | `/login`, `/register`, `/onboarding` | 02 §Auth, 04 §auth |
| **Account** | Profile + subpages | `/profile/*` | 02 |
| **Account** | Subscription/billing | `/subscription` | 02, 03, 09 |
| **Account** | Integrations | `/profile/integrations` (Zalo, Google Calendar) | 02, 04 |
| **Account** | Settings, i18n, dark mode | header + `/profile/settings` | 06 |
| **Ops** | Admin analytics | `/admin/analytics` (operator only — NOT ported to iOS) | 03 |

## 4. Primary user flows (canonical)

1. **Ask Tappy** → type a Vietnamese question → intent detection routes to a tool → streamed answer with place cards, images, CTA buttons, follow-ups, and (optionally) a trip plan card. Anon users get 5/day; free logged-in 15/day.
2. **Browse Reviews** → vertical full-screen video feed, autoplay muted, tap-to-unlock global sound, double-tap to like, save/comment/share/follow (all login-gated), open place/sound from a clip.
3. **Post a Review** → record/upload video (or attach YouTube/TikTok/FB link) + photos → attach/borrow a sound → publish (verified-badge + 1-per-place rules) → native clips auto-register an "original sound".
4. **Use a Sound** → open sound detail → "use this sound" → composer pre-loaded with that sound → new review carries the sound pointer.
5. **Utility tool** → open a mini-tool (currency/translate/scan/etc.) → single-purpose interaction → result.
6. **Personalize** → behavior is tracked → learning engine builds an affinity profile → `/recommendations` and feed ranking adapt; push notifications and morning-brief re-engage.
7. **Account** → sign in (Google/Zalo/email/OTP) → onboarding → profile, preferences ("Tappy knows"), language, dark mode, (future) Pro upgrade.

## 5. Cross-cutting concerns

- **Auth model:** Supabase JWT; native uses `Authorization: Bearer`. Anon chat via httpOnly cookie (needs native re-implementation). Onboarding gate on `profiles.onboarded`. See 03/04.
- **AI substrate:** backend AI capability layer (provider-abstracted — `docs/architecture/AI_PLATFORM.md`), keys server-side in the provider layer only, streamed data-stream protocol, VN-domain scope-lock, no fabrication, budget-aware brand rewriting. See 02 §Chat, 03 §AI Safety.
- **Data & media:** Supabase (RLS-bound, anon key on client) + Next.js APIs for privileged writes + Vercel Blob for media. iOS reads/writes self-scoped tables directly but routes billing/upload/review-create/AI/cron through Next.js. See 05.
- **Localization:** vi + en UI via a reactive store persisted to `localStorage['tappy_lang']` (+ best-effort `profiles.language`). AI reply language auto-detected per message. See 06.
- **Theme:** adaptive light/dark App-Shell vs a permanently-dark Reviews feed; two shells that never merge. See 06.
- **Money:** Pro subscription currently OFF; when on, per-platform payment providers unify on a backend entitlement. See 09.
- **Time:** headline quotas roll at **VN midnight (UTC+7)**; some flood guards use UTC. See 03 §Time.

## 6. Explicitly out of scope for MVP (Future Enhancements)

Live Activities, Dynamic Island, Apple Intelligence, Siri Shortcuts, App Intents, Home/Lock-screen Widgets, Apple Watch, visionOS, iMessage apps, StandBy, CarPlay, SharePlay — and any other iOS-exclusive capability. None are part of the product; do not design them into the MVP.

## 7. Known discrepancies surfaced by the audit (carry into iOS decisions)

These are places where code, copy, or docs disagree — iOS should follow the **enforced code** and the team should reconcile:

1. **Free daily limit:** enforced **15/day** (`chat/route.ts`); the subscription page copy said **10/day** — ✅ **RESOLVED 2026-07-11**: `/subscription` copy + remaining counter updated to 15/day (web fix). iOS enforces 15.
2. **Pro is gated OFF** (`SHOW_PRO_UPGRADE=false`) — MVP iOS ships with no purchase surface.
3. **Games:** the 6 canvas mini-games were removed; only **SuperTux (WASM)** remains despite hub copy "7 game".
4. **Fortune engine** is **deterministic local computation** (djb2 hash over static banks), not AI.
5. **`/service/[id]` booking flow is LIVE** (lead-capture), not dead code as an old memo claimed. iOS must implement it.
6. **Only 3 of 7 crons are scheduled** (`deal-notifications`, `morning-brief`, `price-check`); price-check runs daily though copy says every 6h.
7. **Google Places key** present in prod (returns ratings) but **photo billing disabled** → images come from Serper/OSM.
8. Three canonical tables (`reviews`, `review_saves`, `favorites`) have **no base DDL in the repo** (prod-only) — trust introspection in 05.

See each detail doc for the authoritative resolution.

# TappyAI Android Architecture v3

> **Status: FROZEN.** This is the canonical Android architecture for TappyAI until a future ADR explicitly supersedes it. See §7 (Architecture Freeze Rules) for what a freeze means and what requires an ADR to change.
> **Supersedes:** v2 of this document (below), which itself superseded the in-chat "Architecture Summary" from the end of Phase 0.5.
> **v3 changes, per your review:** `core:payment` and `core:ads` approved as proposed · `loyalty` stays merged into `feature:rewards` (not a separate module), with an explicit future-evolution note · moderation is now a formal `core:moderation` capability (not a "maybe promote later" note) · `splitbill`/`feedback`/`support` explicitly marked **Reserved for future product roadmap** · Feature Readiness Matrix (§6) extended with Owner and Dependencies columns, Backend Ready and Android Implemented converted to explicit state vocabularies · new §7 Architecture Freeze Rules · document frozen.
> **Grounding:** cross-checked against `docs/MASTER_FEATURE_SPECIFICATION.md` (MFS — the Feature Constitution, confirmed to contain exactly **54** numbered capabilities across 6 ecosystems), `docs/MASTER_PRODUCT_SPECIFICATION.md` (MPS — vision/business model, §10.5–10.6 covers Subscription/Advertising), and the actual backend route tree (`src/app/api/**`, grepped directly, not assumed) for the Feature Readiness Matrix's Backend Ready column.

---

## 1. Grounding check against the 54-feature spec

MFS organizes the 54 features into 6 ecosystems: **AI (11), Discovery (13), Social (11), Entertainment (4), User (11), Commerce (4)**. Your requested module list (`reviews, social, video, upload, music, playlist, favorite, nearby, recommendation, history, saved, splitbill, loyalty, rewards, subscription, payment, feedback, support, moderation, ads`) mostly maps cleanly onto MFS — a few don't, and I'm flagging that plainly rather than pretending otherwise:

| Your requested module | MFS/MPS grounding | Note |
|---|---|---|
| `reviews`, `favorite`, `saved`, `nearby`, `recommendation`, `history`, `social`, `music` | MFS 4.2, 4.10, 4.11/4.9, 3.7, 2.5, 6.5, Social Ecosystem, 5.2 | Direct match |
| `rewards` | MFS 7.3 Rewards | Direct match. **v3 decision:** stays the only rewards/loyalty module — see the evolution note in §3. |
| `subscription`, `ads` | MPS §10.5 Subscription Platform, §10.6 Advertising Platform | In MPS (business model), not in MFS (feature behavior) — legitimate, just a different governing document. |
| `payment` | MFS 6.3 Membership mentions "payment context" as sensitive data; no dedicated payment feature exists in either doc | **v3: approved as `core:payment`**, cross-cutting infrastructure, not a user-facing feature — see §2.1. |
| `video`, `upload`, `playlist` | Sub-capabilities of MFS 5.2 Music / Social Ecosystem's Explore, not named as their own top-level MFS features | Legitimate as **technical** Android modules even though MFS doesn't name them at the product layer — MFS deliberately excludes implementation detail (its own scope statement, line 12). |
| `splitbill` | **Not present in MFS or MPS at all.** | **Reserved for future product roadmap** — flagged as a product-doc gap, not an architecture problem — worth reconciling with product docs before it's built. |
| `feedback`, `support` | **Not present in MFS or MPS as named features.** | **Reserved for future product roadmap.** |
| `moderation` | **Not present in MFS or MPS as a named feature.** | **v3: approved as `core:moderation`** — a shared capability (reporting, blocking, safety policy, future admin tooling), not a standalone feature screen. See §2.1/§3. |

Nothing here blocks the architecture — it only affects which modules get a clean one-line MFS citation vs. a "reserved, pending product-doc formalization" note.

---

## 2. Updated module map

### 2.1 Core modules

**Built (Phase 0 + 0.5 — unchanged):**
`core:designsystem`, `core:common`, `core:logging`, `core:analytics`, `core:featureflags`, `core:network-monitor`, `core:navigation`, `core:deeplink`

**New in this revision — as you requested, all approved in v3:**

| Module | Owns | Depends on | MFS/MPS grounding |
|---|---|---|---|
| `core:ai` | AI Context client (`GET /api/context` once it ships), streaming response state machine (SSE/WS for Chat), AI Recommendation contract consumed by `features:recommendation` and `features:discovery` | `core:network` (1A), `core:common`, `core:network-monitor` | MFS 2.1–2.11 (whole AI Ecosystem) at the infrastructure layer. **Does not own the Chat UI** — that's `features:chat` (1D), same separation already established for `core:designsystem` vs. `app`. |
| `core:media` | Video playback + thumbnailing and audio/music playback controller (Media3/ExoPlayer), media caching policy | `core:sync` (caching), `core:common` | Technical foundation shared by `features:video`, `features:music`, `features:upload`, `features:playlist` — **one implementation**, same DRY principle already applied to `TappyImage` in `core:designsystem`. |
| `core:location` | `FusedLocationProviderClient` wrapper, Just-in-Time permission request (mirrors the *already-documented* web fix in `docs/Authentication_Architecture.md` §2.5 — request only on user action, never on app load), reverse geocoding | `core:common` | MFS 2.3 AI Context (location as a situational signal), 3.7 Nearby, 3.8 Maps |
| `core:sync` | Generalizes the offline-first principle already agreed in the Phase 0 roadmap: `WorkManager` background sync orchestration, a reusable "stale-while-revalidate" repository base, conflict resolution policy | `core:database` (1A), `core:network-monitor`, `core:common` | Backbone for every feature with local-first reads: `reviews`, `favorite`, `saved`, `history`, `discovery` |
| `core:search` | Unified search contract — debounced query dispatch across multiple domains (Discovery, Music, Reviews) behind one interface, not tied to one feature's UI | `core:common` | Cross-cutting; no single MFS feature owns "search," several depend on it |
| `core:payment` | Payment processing seam (the web backend already uses Stripe — `src/app/api/stripe/checkout` + `/portal`): a `PaymentProvider` contract (same shape as `AnalyticsProvider`) other modules call into | `core:security`, `core:network` | Shared by `features:membership`, `features:subscription`, `features:splitbill`, and any future premium service — **approved v3, not a standalone screen module.** A payment-*methods-management* screen still belongs in `features:profile`/`features:membership`, calling into this. |
| `core:ads` | `AdsProvider` contract (same shape as `AnalyticsProvider`) for ad units embedded inside other features' surfaces | `core:featureflags`, `core:analytics` | MPS §10.6 Advertising Platform — **approved v3, not a standalone screen module**, since ads must never read as a neutral recommendation (MPS's own explicit rule), meaning they live *inside* `features:discovery`/`features:social`, not on their own screen. |
| `core:moderation` | **v3 addition.** The shared foundation for reporting content, blocking users, and safety policy — `ReportContentUseCase`, `BlockUserUseCase`, a policy contract for what's reportable/blockable. Also the eventual foundation for an admin moderation tool, if one is ever built. | `core:common`, `core:network` | Not in MFS as a named feature; modeled as infrastructure because a consumer app's moderation surface is "report/block" embedded in the content, not a screen a user navigates to. `features:reviews`, `features:social`, and `features:discovery` (Explore) **consume this instead of owning their own report/block logic** — one implementation, not three. |

### 2.2 Additional core modules — not literally requested, still recommended

These weren't in your original list and weren't part of the v3 review; keeping them flagged as "my addition" rather than folding them in as if you'd approved them:

| Module | Why | 
|---|---|
| `core:database` | You listed it under Phase 1A ("Foundation... Database") but it wasn't named as a module in your core-additions list. Formalizing it here: Room-based local persistence, the thing `core:sync` and every offline-first feature repository builds on. |
| `core:datastore` | Same — named in your Phase 1A list, formalized as its own module (Preferences DataStore: tokens, simple key-value settings), kept separate from `core:database` (structured/relational cache) same as the original system-prompt module list distinguished them. |
| `core:notification` | Was in the original system-prompt's suggested module list; not re-stated in your latest message. Formalizing it: FCM wrapper + push-token registration, separate from `features:notifications` (the in-app notification feed/settings screen) — same split as `core:media` (engine) vs. `features:video` (screen). The web app already has a live push-notification system (`project_push_notifications.md`); this is its Android counterpart. |

---

## 3. Feature modules (`:features:*`)

Not 1:1 with all 54 MFS entries — that would be 54 Gradle modules, which contradicts your own Rule 10 ("do not introduce unnecessary abstraction," "keep the project lightweight"). Grouped by cohesion, same way the web app already unifies Discovery categories behind one Explore/Chat surface.

| Feature module | MFS coverage | Notes |
|---|---|---|
| `features:auth` | 6.1 Identity | Phase 1B |
| `features:home` | — (composition surface) | Phase 1D |
| `features:chat` | 2.1 AI Chat (primary surface for all AI Ecosystem capabilities) | Phase 1D, built on `core:ai` |
| `features:profile` | 6.2 Profile, 6.6 Trust, 6.7 Reputation | Phase 1D |
| `features:settings` | 6.4 Preferences, 6.10 Accessibility, 6.11 Multi-language | Phase 1D |
| `features:discovery` | 3.1–3.6, 3.9–3.13 (Restaurant, Cafe, Food, Hotel, Attraction, Travel, Shopping, Deals, Price Tracking, Weather, Finance) | One module — these are already unified as one browsing/chat surface on web, not 10 separate Android screens |
| `features:nearby` | 3.7 Nearby, 3.8 Maps | Kept standalone per your request — Filters\|Map\|Place Detail three-pane pattern from the original brief |
| `features:social` | 4.1 Explore, 4.3 Groups, 4.4–4.8 (Sharing, Native Share, Rich Link Preview, QR Profile, Invite) | |
| `features:reviews` | 4.2 Reviews | Standalone — content-heavy (photo/video upload, rating), warrants its own module |
| `features:favorite` | 4.10 Favorites | |
| `features:saved` | 4.11 Saved, 4.9 Bookmarks | Bookmarks folded in — same "save for later" capability, two names on web |
| `features:recommendation` | 2.5 AI Recommendation (UI layer — the "gợi ý cho bạn" rail/section) | Consumes `core:ai`'s recommendation contract |
| `features:history` | 6.5 History | |
| `features:notifications` | 6.8/6.9 Notifications, Push Notifications | In-app feed/settings UI; built on `core:notification` |
| `features:music` | 5.2 Music | |
| `features:playlist` | (Music sub-capability) | Standalone per your request; built on `core:media` |
| `features:upload` | (Music/Social sub-capability — the web app's existing Original Sound UGC upload flow) | Shared by Music, Reviews, Explore; built on `core:media` |
| `features:video` | (Explore's video feed/player screen) | Built on `core:media`; distinct from the engine itself |
| `features:membership` | 6.3 Membership | Owns membership tier + payment-method UI (calls `core:payment`) |
| `features:rewards` | 7.3 Rewards | Only rewards/loyalty module for now, matching current MFS. **Future-evolution note (v3):** if the product roadmap formally expands Rewards into a broader Loyalty capability (tiers, points-earning across more surfaces, partner benefits), that's still this same module evolving in place — not a reason to fork off a second `feature:loyalty` module later. Revisit this note if/when MFS itself gains a Loyalty entry. |
| `features:subscription` | MPS §10.5 | |
| `features:splitbill` | Not in MFS/MPS | **Reserved for future product roadmap.** Likely couples `features:social` (Groups) + `core:payment` once built. |
| `features:feedback` | Not in MFS/MPS | **Reserved for future product roadmap.** |
| `features:support` | Not in MFS/MPS | **Reserved for future product roadmap.** |
| `features:games` | 5.1 Games | Existing web capability (SuperTux etc., see memory); Android wrapper not yet scoped, listed for completeness |
| *(deferred, no module yet)* | 5.3 Movies, 5.4 Events | Small enough to fold into `features:discovery` or `features:social` later; not worth a dedicated module at current scope |

**Moderation (v3): `core:moderation`, not a feature module — approved.** `features:reviews`, `features:social`, and `features:discovery` (Explore) consume `core:moderation`'s `ReportContentUseCase`/`BlockUserUseCase` instead of each owning their own report/block logic — one implementation shared by all three, same DRY principle as `core:media`/`core:payment`/`core:ads`. See §2.1 for what the module owns.

---

## 4. Dependency graph (updated)

```
app ──► every :features:* module it composes into navigation (Phase 1D+)
         + every :core:* module transitively required by those features

:features:*  ──►  core:designsystem, core:common, core:navigation
             ──►  core:ai        (chat, recommendation, discovery)
             ──►  core:media     (video, music, playlist, upload)
             ──►  core:location  (nearby, discovery's "near me")
             ──►  core:sync      (reviews, favorite, saved, history, discovery)
             ──►  core:search    (discovery, music, reviews — global search)
             ──►  core:payment   (membership, subscription, splitbill)
             ──►  core:ads       (discovery, social)
             ──►  core:moderation (reviews, social, discovery)
             ──►  core:notification (notifications)

core:ai          ──► core:network, core:network-monitor, core:common
core:media       ──► core:sync, core:common
core:sync        ──► core:database, core:network-monitor, core:common
core:search      ──► core:common
core:location    ──► core:common
core:payment     ──► core:security, core:network
core:ads         ──► core:featureflags, core:analytics
core:moderation  ──► core:network, core:common
core:deeplink    ──► core:navigation   (unchanged from Phase 0.5)
core:analytics   ──► core:logging      (unchanged from Phase 0.5)

designsystem, common, logging, analytics, featureflags,
network-monitor, navigation, deeplink   — unchanged, no new dependents added
```

Rule preserved from Phase 0/0.5: no `core:*` module depends on `core:designsystem` (UI stays a one-way dependency from `app`/`features:*`), and nothing depends on `app`.

---

## 5. Implementation roadmap (Phase 1, split as requested)

**Phase 1A — Foundation**
`core:network` (Retrofit/OkHttp/kotlinx.serialization) · `core:security` (JWT token storage) · `core:database` (Room) · `core:datastore` (Preferences DataStore) · Hilt `@Module`/`@Binds` wiring for every Phase 0.5 provider interface (`LoggerProvider`, `AnalyticsProvider`, `FeatureFlagProvider`, `NetworkMonitor`), replacing the showcase's manual construction.

**Phase 1B — Authentication, Navigation, Deep Link**
`features:auth` (Google, Facebook, TikTok, Email OTP via Supabase Kotlin SDK — Apple deferred to iOS per your earlier direction) · first real `NavHost` implementing `TappyNavigator` and the first concrete `TappyRoute` types · first concrete `DeepLinkParser` implementation.

**Phase 1C — AI Foundation**
`core:ai` built for real: Context client against `GET /api/context` (real endpoint or local stub matching its contract, per your earlier decision), streaming response handling, Recommendation contract. No feature UI yet — this phase is infrastructure only.

**Phase 1D — Core User Experience**
`features:home`, `features:chat` (consumes `core:ai` streaming), `features:profile`, `features:settings`.

**Phase 2+ (not detailed further here — a separate plan when reached)**
`core:media`/`core:location`/`core:sync`/`core:search` built for real, then the feature modules from §3 layered on top in roughly this order: `discovery` → `nearby` → `social`/`reviews`/`favorite`/`saved` → `music`/`video`/`upload`/`playlist` → `recommendation`/`history`/`notifications` → `membership`/`rewards`/`subscription` → `splitbill`/`feedback`/`support`. Sequencing here is a first pass, not a commitment — revisit once 1A–1D land and real usage data exists.

**Still explicitly deferred:** `:benchmark`/`:baselineprofile` (Phase 0.5 decision unchanged — pin versions only, build when there's a real screen to benchmark).

---

## 6. Feature Readiness Matrix

The master tracking document for the full 54-feature roadmap. **Android Implemented is `NOT_STARTED` for every row except Accessibility (6.10) right now** — Phase 0/0.5 built only the design system and cross-cutting infrastructure, zero feature modules exist yet. That column exists so this table can be updated in place as Phase 1B+ lands, not because anything is hidden today.

**Backend Ready** is grepped directly against `src/app/api/**` in this session, not assumed — where no matching route was found, it says so plainly. **Architecture Ready** means "mapped to a named module in §2/§3 of this document," not "built." **Owner** is who drives delivery of the feature: `Android` (pure client concern, no backend needed), `Backend` (server-computed, Android only renders it), `Shared` (both sides needed — the majority), `Future` (unscheduled/reserved). **Dependencies** lists the major `core:*`/`features:*` modules the feature will build on, per §2/§4's dependency graph.

**State vocabularies (exact values used below — nothing outside these unless marked N/A):**
- **Backend Ready:** `READY` (endpoint confirmed live) · `PARTIAL` (implicit/incomplete support exists) · `PLANNED` (fully designed in a doc, not yet implemented — distinct from `NOT_STARTED`) · `NOT_STARTED` (no route, no design found) · `N/A` (feature is client-only, no backend applicable — outside the four-state vocabulary by necessity, not a loophole)
- **Android Implemented:** `NOT_STARTED` · `SCAFFOLDED` (foundational support exists but not a feature-specific screen) · `IN_PROGRESS` · `READY` (feature-complete, not yet released) · `RELEASED` (shipped to users)

### AI Ecosystem

| # | Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| 2.1 | AI Chat | ✅ `features:chat` | Shared | READY (`/api/chat`) | NOT_STARTED | `core:ai`, `core:network`, `core:navigation` | 1D | Streaming via `core:ai` |
| 2.2 | AI Memory | ✅ `core:ai` | Shared | READY (`/api/memory`) | NOT_STARTED | `core:ai`, `core:network` | 1C (infra) / 1D (surfaced in chat) | |
| 2.3 | AI Context | ✅ `core:ai` | Shared | PLANNED (`GET /api/context` designed, not built) | NOT_STARTED | `core:ai`, `core:network`, `core:network-monitor` | 1C | Confirmed gap from `docs/Android_Sprint_Go_NoGo.md`; Android proceeds against a local stub matching the designed contract until it ships |
| 2.4 | AI Planning | 🟡 no dedicated module — composition of chat + discovery | Shared | PARTIAL (implicit in chat tool-use, no dedicated endpoint) | NOT_STARTED | `core:ai`, `features:chat`, `features:discovery` | 2+ | Not yet modularized explicitly |
| 2.5 | AI Recommendation | ✅ `core:ai` + `features:recommendation` | Shared | READY (`/api/recommendations`, Learning Engine live) | NOT_STARTED | `core:ai`, `core:network` | 1C (infra) / 2+ (surface) | |
| 2.6 | AI Personalization | 🟡 part of `core:ai` context, no dedicated module | Shared | READY (`/api/preferences/profile`) | NOT_STARTED | `core:ai`, `core:network` | 1C | |
| 2.7 | AI Follow-up | 🟡 chat behavior | Shared | PARTIAL (implicit in chat) | NOT_STARTED | `core:ai`, `features:chat` | 1D | |
| 2.8 | AI Reasoning | 🟡 chat behavior | Shared | PARTIAL (implicit in chat/tool-use) | NOT_STARTED | `core:ai`, `features:chat` | 1D | |
| 2.9 | AI Transparency | 🟡 chat UI concern | Shared | PARTIAL | NOT_STARTED | `core:ai`, `features:chat` | 1D / 2+ | |
| 2.10 | AI Clarification | 🟡 chat behavior | Shared | PARTIAL | NOT_STARTED | `core:ai`, `features:chat` | 1D | |
| 2.11 | AI Safety | 🟡 ties into `core:moderation`'s safety policy | Shared | NOT_STARTED (not verified) | NOT_STARTED | `core:ai`, `core:moderation` | 1D / 2+ | Overlaps with `core:moderation` |

### Discovery Ecosystem

| # | Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| 3.1 | Restaurant | ✅ `features:discovery` | Shared | READY (chat tool + OSM) | NOT_STARTED | `core:ai`, `core:network`, `core:sync` | 2+ | |
| 3.2 | Cafe | ✅ `features:discovery` | Shared | READY | NOT_STARTED | `core:ai`, `core:network`, `core:sync` | 2+ | |
| 3.3 | Food | ✅ `features:discovery` | Shared | READY | NOT_STARTED | `core:ai`, `core:network`, `core:sync` | 2+ | |
| 3.4 | Hotel | ✅ `features:discovery` | Shared | READY (`/api/bookings`) | NOT_STARTED | `core:ai`, `core:network`, `core:sync` | 2+ | |
| 3.5 | Attraction | ✅ `features:discovery` | Shared | READY | NOT_STARTED | `core:ai`, `core:network`, `core:sync` | 2+ | |
| 3.6 | Travel | ✅ `features:discovery` | Shared | READY (`travel-reminder` cron) | NOT_STARTED | `core:ai`, `core:network`, `core:sync`, `core:notification` | 2+ | |
| 3.7 | Nearby | ✅ `features:nearby` | Shared | READY (OSM/Overpass substrate) | NOT_STARTED | `core:location`, `core:network`, `core:sync` | 2+ | |
| 3.8 | Maps | ✅ `features:nearby` | Shared | PARTIAL (Google Places key empty; OSM fallback) | NOT_STARTED | `core:location`, `core:network` | 2+ | |
| 3.9 | Shopping | ✅ `features:discovery` | Shared | NOT_STARTED | NOT_STARTED | `core:network`, `core:sync` | 2+ | |
| 3.10 | Deals | ✅ `features:discovery` | Shared | READY (`deal-notifications` cron) | NOT_STARTED | `core:network`, `core:notification` | 2+ | |
| 3.11 | Price Tracking | ✅ `features:discovery` | Shared | READY (`/api/price-watch`, `price-check` cron) | NOT_STARTED | `core:network`, `core:sync`, `core:notification` | 2+ | |
| 3.12 | Weather | ✅ `features:discovery` | Shared | READY (chat tool) | NOT_STARTED | `core:ai`, `core:location` | 2+ | |
| 3.13 | Finance | ✅ `features:discovery` | Shared | READY (`/api/rates`, gold/currency chat tool) | NOT_STARTED | `core:ai`, `core:network` | 2+ | |

### Social Ecosystem

| # | Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| 4.1 | Explore | ✅ `features:social` | Shared | READY (`/api/explore`) | NOT_STARTED | `core:network`, `core:sync`, `core:media` | 2+ | |
| 4.2 | Reviews | ✅ `features:reviews` | Shared | READY (`/api/reviews/**`) | NOT_STARTED | `core:network`, `core:sync`, `core:moderation`, `core:media` | 2+ | Consumes `core:moderation` for report/block |
| 4.3 | Groups | ✅ `features:social` | Shared | READY (`/api/group`) | NOT_STARTED | `core:network`, `core:sync` | 2+ | |
| 4.4 | Sharing | ✅ `features:social` | Shared | PARTIAL (implicit via oEmbed) | NOT_STARTED | `core:deeplink`, `core:network` | 2+ | |
| 4.5 | Native Share | ✅ `features:social` | Android | N/A (client-only, Android Share Sheet) | NOT_STARTED | `core:deeplink` | 2+ | |
| 4.6 | Rich Link Preview | ✅ `features:social` | Shared | READY (`/api/explore/oembed`) | NOT_STARTED | `core:deeplink`, `core:network` | 2+ | |
| 4.7 | QR Profile | ✅ `features:social`/`features:profile` | Android | NOT_STARTED | NOT_STARTED | `core:deeplink` | 2+ | QR generation is typically client-side; no backend found |
| 4.8 | Invite | ✅ `features:social` | Shared | NOT_STARTED | NOT_STARTED | `core:deeplink`, `core:network` | 2+ | |
| 4.9 | Bookmarks | ✅ `features:saved` | Shared | READY (`/api/reviews/saved`) | NOT_STARTED | `core:sync`, `core:database`, `core:network` | 2+ | Folded into Saved |
| 4.10 | Favorites | ✅ `features:favorite` | Shared | READY (`/api/favorites`) | NOT_STARTED | `core:sync`, `core:database`, `core:network` | 2+ | |
| 4.11 | Saved | ✅ `features:saved` | Shared | READY (`/api/reviews/saved`) | NOT_STARTED | `core:sync`, `core:database`, `core:network` | 2+ | |

### Entertainment Ecosystem

| # | Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| 5.1 | Games | 🟡 `features:games` named, not yet scoped | Future | READY (web SuperTux + mini-games live) | NOT_STARTED | TBD | 2+ (unscoped) | |
| 5.2 | Music | ✅ `features:music`, `core:media` | Shared | READY (`/api/music/**`, `/api/sound`) | NOT_STARTED | `core:media`, `core:network`, `core:sync` | 2+ | Real report endpoint already exists (`/api/music/tracks/[id]/report` — copyright notice-and-takedown), a useful precedent for `core:moderation`'s design |
| 5.3 | Movies | 🟡 deferred, no dedicated module | Future | NOT_STARTED | NOT_STARTED | TBD | 2+ (unscoped) | |
| 5.4 | Events | 🟡 deferred, no dedicated module | Future | NOT_STARTED | NOT_STARTED | TBD | 2+ (unscoped) | |

### User Ecosystem

| # | Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| 6.1 | Identity | ✅ `features:auth` | Shared | READY (`/api/auth`, Zalo, Google/Supabase) | NOT_STARTED | `core:security`, `core:network`, `core:navigation` | 1B | Facebook, TikTok, Email OTP are new providers — Supabase-native where possible |
| 6.2 | Profile | ✅ `features:profile` | Shared | READY (`/api/profile`) | NOT_STARTED | `core:network`, `core:payment` | 1D | |
| 6.3 | Membership | ✅ `features:membership` | Shared | PARTIAL (Stripe checkout/portal exist; membership-tier logic not confirmed) | NOT_STARTED | `core:payment`, `core:network` | 2+ | |
| 6.4 | Preferences | ✅ `features:settings` | Shared | READY (`/api/preferences`) | NOT_STARTED | `core:datastore`, `core:network` | 1D | |
| 6.5 | History | ✅ `features:history` | Shared | PARTIAL (`conversations`/`track` exist; no dedicated history-aggregation endpoint confirmed) | NOT_STARTED | `core:database`, `core:sync`, `core:network` | 2+ | |
| 6.6 | Trust | ✅ `features:profile` | Backend | NOT_STARTED | NOT_STARTED | `core:network` | 2+ | Trust score computed server-side; Android is a thin display |
| 6.7 | Reputation | ✅ `features:profile` | Backend | NOT_STARTED | NOT_STARTED | `core:network` | 2+ | Same as Trust |
| 6.8 | Notifications | ✅ `features:notifications` | Shared | READY (`/api/notifications`) | NOT_STARTED | `core:notification`, `core:network` | 2+ | |
| 6.9 | Push Notifications | ✅ `core:notification` | Shared | READY (`/api/notifications/subscribe`, `/broadcast` — live per project memory) | NOT_STARTED | `core:notification`, `core:network` | 2+ | Android needs its own FCM registration flow |
| 6.10 | Accessibility | ✅ `features:settings` | Android | N/A (client-only) | SCAFFOLDED | `core:designsystem` | 1D (surfaced) / ongoing | `core:designsystem`'s 48dp/TalkBack/contrast contract (Phase 0) already covers this at the component level — the one row that isn't `NOT_STARTED` |
| 6.11 | Multi-language | ✅ `features:settings` | Android | NOT_STARTED (deliberate: `docs/Localization_Architecture.md` explicitly recommends **not** translating UI for MVP) | NOT_STARTED | `core:designsystem`, `core:datastore` | 1D | AI response language is auto-detected, not a setting; Android should default to the same call unless product direction changes — flagging, not deciding |

### Commerce Ecosystem

| # | Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| 7.1 | Affiliate | ✅ `features:discovery` | Shared | READY (response CTA links — platform search links, no in-app booking, by design per `project_response_links.md`) | NOT_STARTED | `core:deeplink`, `core:network` | 2+ | |
| 7.2 | Coupon | ✅ `features:discovery` | Shared | NOT_STARTED | NOT_STARTED | `core:payment`, `core:network` | 2+ | |
| 7.3 | Rewards | ✅ `features:rewards` | Shared | NOT_STARTED | NOT_STARTED | `core:payment`, `core:network` | 2+ | See §3's Loyalty evolution note |
| 7.4 | Commerce Cross-References | 🟡 cross-cutting, no dedicated code | N/A | N/A | N/A | N/A | N/A | This MFS entry is a relationships chapter, not an independent capability — no module needed |

### Reserved for future product roadmap (not in MFS/MPS)

| Feature | Architecture Ready | Owner | Backend Ready | Android Implemented | Dependencies | Planned Phase | Notes |
|---|---|---|---|---|---|---|---|
| Split Bill | ✅ `features:splitbill` reserved | Future | NOT_STARTED | NOT_STARTED | `core:payment`, `core:network` (once built) | Reserved — unscheduled | Needs product-doc formalization before Phase 2 scheduling |
| Feedback | ✅ `features:feedback` reserved | Future | PARTIAL (`/api/message-feedback` exists but is chat-message-specific, not general app feedback) | NOT_STARTED | `core:network` | Reserved — unscheduled | |
| Support | ✅ `features:support` reserved | Future | NOT_STARTED | NOT_STARTED | `core:network`, `core:deeplink` | Reserved — unscheduled | |

---

## 7. Architecture Freeze Rules

Governance for this document once frozen. The point of freezing isn't to stop the architecture from evolving — the roadmap in §5/§6 assumes it will — it's to make sure evolution happens **through a recorded decision**, not silent drift across sessions where each change makes local sense but the whole stops being coherent.

### 7.1 What "frozen" covers

The following require an **ADR** (Architecture Decision Record) before changing, once work starts building against them:

1. **No package/module restructuring without an ADR.** Renaming, merging, or splitting any `core:*`/`features:*` module listed in §2/§3 requires an ADR — including seemingly-cosmetic renames, since every downstream dependency and this document's own tables reference the current names.
2. **No dependency-direction changes without an ADR.** The rules already established (no `core:*` depends on `core:designsystem`; nothing depends on `app`; the specific arrows in §4) are load-bearing. A change that makes `core:ai` depend on a feature module, for example, needs an ADR — not a quiet import.
3. **No new core modules without an ADR.** Any `core:*` module beyond the set in §2.1/§2.2 needs an ADR that (a) states which feature(s) need it, (b) explains why an existing core module can't absorb the responsibility, and (c) updates §2 and §4 in the same change. This is the same bar Phase 0/0.5 already applied informally ("don't create empty placeholder modules") — the ADR just makes it a recorded decision instead of an in-session judgment call.
4. **No new feature modules that fragment or duplicate an existing MFS-mapped capability without an ADR.** E.g., a second music-related module, or splitting `features:discovery` back into per-category modules, needs an ADR justifying why §3's grouping no longer fits — not an ad-hoc module added because a single PR felt cleaner that way.
5. **Feature Matrix (§6) changes must remain aligned with the Master Feature Specification.** Adding or removing a *row* (a tracked capability) requires that change to trace to an actual update in `docs/MASTER_FEATURE_SPECIFICATION.md` or `docs/MASTER_PRODUCT_SPECIFICATION.md` — this document does not get to invent a 55th feature on its own. If MFS/MPS changes, §6 is updated to match and that update should reference the MFS/MPS revision, not stand alone.

### 7.2 What does NOT require an ADR

Routine, expected maintenance — gating this would make the matrix stale instead of useful:

- Updating a row's `Backend Ready` / `Android Implemented` / `Planned Phase` state as work actually progresses.
- Adding `Notes` detail, fixing a factual error, or correcting a stale citation (e.g., a route that gets renamed on the backend).
- Adding a new row when MFS/MPS itself formally gains a feature (per 7.1.5, still must cite the source revision).
- Populating a module's internal contents (real classes/files inside an already-approved module boundary) — that's normal implementation work, not an architecture change.

### 7.3 ADR process

Lightweight, matching a single-owner project — not a heavyweight enterprise process:

- **Location:** `android/docs/adr/NNNN-short-title.md`, numbered sequentially.
- **Minimum content:** Context (what's forcing the change) → Decision (what changes, stated precisely) → Consequences (what this document's sections need updating as a result).
- **Effect:** once an ADR is accepted, the relevant section(s) of *this* document are updated in the same change — an accepted ADR that isn't reflected back into `Android_Architecture.md` is an incomplete change, not a completed one.
- **Authority:** you (the product/architecture owner) accept or reject; an ADR proposed by any future contributor (including a future Claude session) is a proposal until you say otherwise.

---

*No code was written for this revision. `android/docs/Android_Architecture.md` is the canonical architecture reference for TappyAI Android — status FROZEN as of this revision, superseded only by a future accepted ADR per §7.*

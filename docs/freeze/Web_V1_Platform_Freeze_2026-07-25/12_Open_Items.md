# 12 — Open Items

**Frozen commit:** `79d05f3`. Genuine remaining work only. The three categories are kept
**strictly separate**, as required: a known limitation is not debt, and debt is not a future
feature.

- **A. Known limitations** — deliberate V1 boundaries. Working as intended; documented so nobody
  mistakes them for bugs.
- **B. Technical debt** — things that are wrong or fragile and should be fixed, but were shipped.
- **C. Future enhancements** — net-new work, not yet started.

Nothing here blocks the freeze; the freeze is an accurate snapshot of production *including* these
items. Release-gate blockers (which concern rebuild/verification, not production behaviour) are in
`13_Release_Gate.md` and `04_Database.md` §9.

---

## A. Known limitations (deliberate V1 boundaries)

| # | Item | Where |
|---|---|---|
| A1 | **Pro / Membership gated off** — fully built, `SHOW_PRO_UPGRADE = false`; no legal entity for payments yet | `07_Features.md` §12 |
| A2 | **App Connections gated off** — `SHOW_APP_CONNECTIONS = false`; Google Calendar + Zalo integration built, entry point hidden | `07_Features.md` |
| A3 | **Facebook login hidden** — code preserved, `AUTH_PROVIDERS.facebook.enabled = false` (owner decision 2026-07-18) | `06_UI_UX.md` §3 |
| A4 | **Music upload** live on web, gated on Android | `11_Android_Migration.md` §4.4 |
| A5 | **Cross-device language sync out of scope** — language is per-browser `localStorage['tappy_lang']` by design | `09_ADRs.md` ADR-04 |
| A6 | **Anonymous quota resets on cookie clear** (legacy cookie path) — accepted as a top-of-funnel teaser | `05_AI.md` §11 |
| A7 | **i18n is a partial sweep** — the dictionary header says so; whole surfaces are hardcoded Vietnamese (see B-list for the debt framing) | `06_UI_UX.md` §13 |
| A8 | **Rate limiting is per-serverless-instance** — daily IP caps are advisory; only chat has a real DB-backed quota | `03_Backend.md` §3.6 |
| A9 | **Home background is a single static asset**; time/weather/season/city dimensions are a declared seam, not built | `06_UI_UX.md` §2 |
| A10 | **Fluid type scale, most container classes, and safe-area utilities are additive and unused** | `06_UI_UX.md` §14 |
| A11 | **No commerce transactions in-app** — everything is external deep links; `affiliate_code` is a placeholder | `09_ADRs.md` ADR-05 |
| A12 | **Only Haiku 4.5 configured** — the four-role model tiering is a no-op at the model level | `05_AI.md` §1.2 |
| A13 | **Games unplayable without SuperTux env URLs**; COEP can block PostHog/Supabase on that page | `07_Features.md` §10 |
| A14 | **Admin dashboard is a stub**; Users/Moderation/Engagement/Monitoring not built (rendered "coming soon") | `06_UI_UX.md` §11 |
| A15 | **`admin/settings` is read-only** — persistence needs a `platform_settings` table not in the schema | `06_UI_UX.md` §11 |
| A16 | **TTS progress is estimated (`CPS = 13`), not real** — no boundary-event tracking | `06_UI_UX.md` §4 |
| A17 | **Pinch-zoom disabled** (`maximumScale: 1`) — an accessibility trade-off | `06_UI_UX.md` §14 |

---

## B. Technical debt (shipped, but should be fixed)

Ordered roughly by risk.

| # | Item | Impact | Where |
|---|---|---|---|
| B1 | **The repo cannot rebuild the database** — `reviews`/`favorites` have no `CREATE TABLE`; `reviews`' public SELECT policy is prod-only | Disaster-recovery / new-env blocker | `04_Database.md` §0 |
| B2 | **Three 2026-07-14 migrations self-declare "NOT APPLIED — file only" yet shipped code calls their functions** | Runtime failure if run against an unmigrated DB | `04_Database.md` §9 |
| B3 | **No column-level `REVOKE` on `partner_deals`** — anon key can read `affiliate_code`/`click_count` via PostgREST once codes are loaded | Latent data exposure | `04_Database.md` §1.6 |
| B4 | **`admin/deals/upload` accepts `image/svg+xml`** — the only upload path that does; others sniff magic bytes to block SVG stored-XSS | Stored-XSS vector | `03_Backend.md` §4 |
| B5 | **`profiles` is world-readable in production** via two prod-only `qual=true` policies — any sensitive column added is exposed by default | Ongoing footgun | `04_Database.md` §3.1 |
| B6 | **`increment_deal_click` is anon-callable with no rate limit or dedupe** — trivially inflatable | Data integrity if it ever drives ranking | `04_Database.md` §4 |
| B7 | **No automated CSP/upload coverage** — CSP host omissions caused **three** outages incl. a 2-week 100% upload failure, all found by manual probing | Regression risk | `08_Bug_History.md` §Patterns |
| B8 | **Unit tests are not CI-gated** — only the architecture guard runs on CI | Regressions can merge | `10_Testing.md` §1 |
| B9 | **Chat quota fails open** on any auth/DB error — unmetered-cost path | Cost exposure under failure | `05_AI.md` §12 |
| B10 | **`/api/translate`, `/api/scan`, `/api/viet-content` invoke a paid model with no auth** — only per-instance IP limiting | Cost exposure | `03_Backend.md` §4 |
| B11 | **Rate limit + tool cache are per-instance `Map`s** — no shared store | Weaker limits, lower cache hit rate at scale | `05_AI.md` §10 |
| B12 | **Duplicate `AUTH_PROVIDERS`** — `product.ts` vs `lib/auth/providers.ts`, different contents, different consumers | Drift risk; `facebook` invisible to native | `07_Features.md` §1 |
| B13 | **Dead `POST /api/cta-click`** call — every chat CTA click 404s silently | Cosmetic + lost analytics | `03_Backend.md` §4 |
| B14 | **4 of 8 cron routes unscheduled** (`lunch/travel-reminder`, `weekly-recap`, `behavior-rollup`) — `behavior_summary` never refreshes | Dormant features | `03_Backend.md` |
| B15 | **`price-check` schedule drift** — comment says 6-hourly, `vercel.json` says daily | Confusion | `03_Backend.md` |
| B16 | **Three parallel personalization stores + one dead recommendation lib** | Maintenance burden | `02_Architecture.md` §3.3 |
| B17 | **Dead code:** `musicPlaybackController.ts`, `useMusicPlayback.ts`, `lib/explore/recommendation.ts`, `CategoryGrid.tsx`, `CachedContextEntity` (caches a non-existent `/api/context`), `login.stat*` i18n keys | Clutter | `06_UI_UX.md` §6, `07_Features.md` §17 |
| B18 | **Known-identical latent defects deliberately left** — video-poster bug still in `/profile/posts` and review search results (fixed only in the two surfaces reported) | Same bug can resurface | `08_Bug_History.md` `8070fd9` |
| B19 | **Unmemoized `t` from `useTranslation`** — root cause of the admin fetch-storm was patched at call sites, not fixed; any new `useCallback` capturing `t` reintroduces it | Latent infinite-loop | `08_Bug_History.md` `2a341fd` |
| B20 | **i18n hardcoded-Vietnamese debt** — all legal pages, `/subscription`, `/sound/*`, `/music/upload`, `/service/*`, `/group/*`, `/recommendations`, `DealsManager`, MessageActionBar tooltips, all voice/alert strings | Blocks English users on those surfaces | `06_UI_UX.md` §13 |
| B21 | **`/terms` §2 stale copy** — says login requires Google, contradicting Zalo + Guest | Legal/UX inconsistency | `06_UI_UX.md` §10 |
| B22 | **Dark-mode FOUC + toggle absent for guests/sub-pages** — no blocking theme script; dark users flash light and can't toggle on `showBack` screens | UX | `06_UI_UX.md` §14 |
| B23 | **OAuth tokens stored plaintext** in `user_integrations` — migration concedes Vault "ideally" | Secret-at-rest | `04_Database.md` §1.1 |
| B24 | **`reviews.comment_count` unreliable and now counts replies** — trigger RLS-blocked for users; meaning changed silently at `20260720` | Data-meaning drift | `04_Database.md` §1.4 |
| B25 | **Deprecated `ADMIN_IDS`** still gates `/api/music/tracks/[id]/report` | Inconsistent authz | `03_Backend.md` §4 |
| B26 | **Realtime firehose** — 3 of 4 published tables are unfiltered `USING(true)`, so every client gets every like/comment/milestone insert app-wide | Scales with total activity × clients | `04_Database.md` §5 |
| B27 | **`inferFromBooking()` no-ops for Bearer callers** in `POST /api/bookings` | Android booking inference lost | `03_Backend.md` §3.1 |
| B28 | **`_debug_budget` shipped to the model** in hotel-price results | Prompt bloat / leakage | `05_AI.md` §12 |
| B29 | **Luxury stream filter is per-delta** — a brand split across deltas escapes | Weak filter | `05_AI.md` §5.2 |
| B30 | **`/api/suggested-prompts` honours unguarded `?hour=`/`?day=`** overrides | Minor tamperability | `05_AI.md` §12 |
| B31 | **Leftover debug routes** `/api/debug-places`, `/api/test-photos` burn paid quota | Cost / surface | `03_Backend.md` §4 |
| B32 | **Duplicate/dead indexes** — subscriptions ×2, user_events ×2, comment_reactions redundant, `services_type_idx` dead; `favorites` missing its required unique index | DB hygiene | `04_Database.md` §6 |
| B33 | **Android committed tree does not build** — Gradle foundation untracked; no POSIX `gradlew`; release kit untracked | Blocks Android CI/clean-checkout | `11_Android_Migration.md` §1.1 |

---

## C. Future enhancements (net-new, not started)

| # | Item | Where noted |
|---|---|---|
| C1 | **Google Cloud Neural TTS** (`/api/tts`) — the approved Phase 2 after the Web Speech V1 | `08_Bug_History.md` `22094a7` |
| C2 | **Video → Cloudflare R2 + CDN** — a `TODO(cost)` to cut Blob egress, keeping avatars/thumbnails on Blob | `04_Database.md` §7 |
| C3 | **Home background dimensions** — time-of-day / weather / seasonal / city (the resolver seam exists) | `06_UI_UX.md` §2 |
| C4 | **`/api/config`-driven feature flags & upload limits on native** (ADR-0004, Proposed/Deferred) | `11_Android_Migration.md` §3.3 |
| C5 | **Redis/Upstash-backed rate limiting** — the file itself proposes it | `05_AI.md` §10 |
| C6 | **Shared-store tool cache** for cross-instance hit rate | `05_AI.md` §10 |
| C7 | **Personalization consolidation** — merge the three memory/preference stores | `02_Architecture.md` §3.3 |
| C8 | **Push notifications backend** — VAPID config + subscription persistence (web), FCM (native) | `07_Features.md` §11 |
| C9 | **Full i18n sweep** — the explicitly-deferred remainder | `06_UI_UX.md` §13 |
| C10 | **Delete-account backend** — currently email-request "Path B" only; a real endpoint is a Play Store requirement | `11_Android_Migration.md` §6 |
| C11 | **Affiliate feed (V2)** — `partner_deals.affiliate_code` + a `metadata` merge strategy (current code replaces `metadata` wholesale) | `04_Database.md` §1.6 |
| C12 | **`platform_settings` table** so `admin/settings` can persist | `06_UI_UX.md` §11 |
| C13 | **Schedule the dormant crons** (lunch/travel/weekly/behavior) or delete them | `03_Backend.md` |

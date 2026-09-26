# PASS 1 — Inventory (what actually exists at `d96d06b`)

Branch `uat/release-audit-2026-09` ← `merge/main-into-v3 @ d96d06b`. Production = `origin/main @ 842379b` (merge-base). Generated 2026-09-20 from HEAD, not from docs.

## 0. Ground truth

| item | value | evidence |
|---|---|---|
| repo root | `D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard` | `git worktree list` |
| HEAD | `d96d06b` feat(analytics): GA4 on the web | `git rev-parse` |
| status | clean except untracked `docs/uat/` | `git status` |
| worktrees | 97 (main checkout `tappyai-mvp` on `feat/consultative-d1-d2-r1-r2-d3`; production mirror `tappyai-v2-recon` on `main`) | `git worktree list` |
| package manager / runtime | npm 11.13.0 (package-lock.json), node v24.16.0, next 14.2.35, vitest | `node -v`, package.json |
| web run | `npx next dev -p 3101` (this pass, background; ready in 4.7 s) · build = `node scripts/check-env.mjs && next build` · deploy = Vercel (`vercel.json`) | package.json scripts |
| android | `android/` Gradle KTS, `applicationId com.tappyai.app`, minSdk 26, targetSdk 36, versionCode 7 / 0.1.2; 59 `*Screen.kt`; emulator-5554 per §0 | `android/app/build.gradle.kts:199-221` |
| ios | `ios/` XcodeGen `project.yml`, 61 `*View.swift`, `Resources/PrivacyInfo.xcprivacy` present; no macOS ⇒ static only | `ls ios` |
| env files | `.env.local` (copied from audit-nonprod, gitignored `.gitignore:44`), `.env.local.example` | names only |
| required env (build gate) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL` | `scripts/check-env.mjs:45-51` |
| DB target (running app) | `zdaprdfgpbpnxyofagmc` inlined in served `main-app.js`; == §0 non-prod; ≠ prod `fwznnobrdctuskgrvuik` | curl of `/_next/static/chunks/main-app.js` |
| services the server talks to | Supabase (auth/db/storage), Anthropic (`claude-haiku-4-5-20251001` family, `src/lib/ai/llm/providers/claude.ts`), Serper (`google.serper.dev`), Google Places, Overpass/OSM, VnExpress, Upstash/KV REST, Stripe, Apple IAP, Zalo OAuth, Google OAuth/Calendar, Google Web Risk, VAPID push, PostHog (`NEXT_PUBLIC_POSTHOG_*`), GA4 (`NEXT_PUBLIC_GA_MEASUREMENT_ID`), AccessTrade (`api.accesstrade.vn`, `go.isclix.com`), Travelpayouts, GCS (`storage.googleapis.com`), Vercel Blob | `grep process.env` + host grep over `src/` |

### Feature flags (`src/lib/config/product.ts` unless noted)

| flag | default | read by |
|---|---|---|
| `SHOW_PRO_UPGRADE` | false | `/api/config` → clients |
| `SHOW_APP_CONNECTIONS` | false | `/api/config` |
| `SHOW_SCAM_SHIELD` | true | `/api/config` |
| `SHOW_MARKETPLACE` | false | web nav |
| `SHOW_WALLET` | false | profile |
| `FREE_DAILY_LIMIT` / `ANON_LIFETIME_LIMIT` | 15 / 5 | `/api/config`, quota |
| `SCAM_SHIELD_DAILY_LIMIT_AUTH` / `_ANON` | 30 / 10 | scam-shield routes |
| `CCP_ENABLED` | true | commerce |
| `CCP_MERCHANT_PAGE_READ_ENABLED` | false | ccp |
| `CCP_FEED_DISPLAY_ENABLED` | false | ccp feeds |
| `CCP_FEED_INGEST_ENABLED` | true | `/api/cron/feed-ingest` |
| `CCP_AFFILIATE_WRAPPING_ENABLED` | true | ccp tracking |
| `EMIT_TAPPY_PLACES` | false | promptBuilder |
| `EMIT_PLACES_ANNOTATION` | true | promptBuilder |
| `SERVER_AUTHORED_CTA` | false | cta |
| env `PLACE_GUARD_ATTRIBUTION_V2` | unset ⇒ off (`'1'|'true'`) | `product.ts:333`, 21 sites |
| env `SNIPPET_PRICE_GUARD_V2` | unset ⇒ off | `product.ts:348` |
| env `BACKOFFICE_ENABLED`, `CONTROLLER_ORG_MEMBERSHIP_ENABLED`, `CONTROLLER_BROADCAST_ENABLED`, `MARKETING_SENDING_ENABLED`, `CONTENT_SAFETY_GATE_ENABLED`, `CONTENT_SAFETY_SCHEMA_MIGRATED`, `TAPPY_MEASURE`, `PLACES_PROVIDER`, `MEDIA_PROVIDER`, `LLM_*_MODEL`, `LLM_PROVIDER` | unset in audit env | see grep in evidence |

Current values in the audit env: none of the env flags are set (names checked, values never printed) ⇒ all env-gated capabilities are OFF, including content-safety gate and Upstash cache.

## 1. Web (Next 14 app router) — 78 pages, 3 layouts

`/` `/access-denied` `/admin{,/analytics{,/activation,/auth,/users},/audit,/deals,/marketing/{analytics,audience,campaigns,content,promotions},/moderation,/notifications,/org/memberships,/rbac,/settings,/users}` `/age-check` `/auth/zalo-finish` `/boi{,/cung-hoang-dao,/tarot,/tu-vi}` `/chat` `/chat/[id]` `/controller` `/copyright` `/currency` `/deals` `/delete-account` `/game{,/supertux}` `/group/[id]` `/group/new` `/how-to-use` `/login` `/marketplace` `/music{,/upload}` `/onboarding` `/plan/[shareId]` `/planner` `/privacy` `/profile{,/account,/bookings,/edit,/favorites,/history,/integrations,/notifications,/preferences,/price-watches,/qr,/settings,/tappy-knows}` `/recommendations` `/register` `/reviews{,/[id],/creator/[id],/new}` `/scam-shield` `/scan` `/service/[id]` `/social` `/sound/[trackId]` `/split-bill` `/startup` `/subscription` `/terms` `/tools` `/translate` `/users/[id]` `/viet-content`

Layouts: `/`, `/admin`, `/startup`. Middleware: `middleware.ts` (session refresh via `getUser()`, COOP/COEP for supertux, no auth redirects). Server actions (`'use server'`): none.

## 2. Backend — 138 API routes (`src/app/api/**/route.ts`)

Full list with methods in `docs/uat/evidence/api-routes.txt`. Groups:
- **auth**: `/api/auth/anonymous` POST, `/api/auth/claim-anonymous` POST, `/api/auth/zalo{,/callback,/complete}`
- **chat/AI**: `/api/chat` POST (streaming), `/api/conversations` GET/POST/PUT/DELETE, `/api/memory`, `/api/message-feedback`, `/api/suggested-prompts`, `/api/translate`, `/api/viet-content`, `/api/voice/{language,tts}`, `/api/scan` POST, `/api/explore/{oembed,process}`, `/api/recommendations`
- **age gate (delta)**: `/api/age-declaration` POST
- **commerce (delta)**: `/api/commerce/handoff` POST, `/api/cron/feed-ingest` GET, `/api/links/resolve` POST, `/api/deals`, `/api/deals/[id]/click`, `/api/price-watch`
- **messaging (delta)**: `/api/messaging/threads` GET/POST, `/api/messaging/threads/[id]/messages` GET/POST, `/api/messaging/threads/[id]/read` POST, `/api/social/connections` GET
- **shares (delta)**: `/api/plans/share` POST, `/api/reviews/[id]/share` POST, `/api/reviews/shared` GET, `/api/reviews/liked` GET
- **scam shield**: `/api/scam-shield/{analyze (delta),check,directory,qr}`
- **reviews/social**: `/api/reviews/*` (13 routes), `/api/comments/[id]/reactions`, `/api/users/{[id],[id]/follow,search}`, `/api/favorites`, `/api/group/*`, `/api/bookings`
- **music/sound**: `/api/music/*` (6), `/api/sound/[trackId]/*` (4), `/api/upload/{audio,video}`
- **notifications**: `/api/notifications/*` (7)
- **profile/prefs**: `/api/profile` GET/PATCH/POST, `/api/preferences{,/profile}`, `/api/onboarding`, `/api/integrations/*` (5)
- **billing**: `/api/stripe/{checkout,portal}`, `/api/webhooks/stripe`, `/api/iap/apple/{verify,notifications}`, `/api/subscription`
- **admin** (26 routes under `/api/admin/*`), **cron** (11 routes, 10 scheduled in `vercel.json`; `behavior-rollup` unscheduled), **misc**: `/api/config`, `/api/health`, `/api/version`, `/api/rates`, `/api/track`, `/api/debug-places` GET, `/api/test-photos` GET

Service-role (`createAdminClient`) usage: **80 non-test files** (list in evidence/service-role-sites.txt) — enumerated and justified in §3.2 of the report.

## 3. Data (audit project, probed 2026-09-20)

80 public tables, **all with RLS enabled**; 3 views (`analytics_ai_misses`, `analytics_funnel_daily`, `analytics_vertical_mix_daily`); 186 public functions; no `supabase_migrations.schema_migrations` (migrations are applied by hand / script, not tracked). Full table→rls→policy-count→row-count dump: `evidence/db-probe-summary.txt`.

Tables with RLS on and **0 policies** (service-role-only by construction): `activation_daily_rollup, admin_permissions, admin_roles, anon_chat_usage, audit_log, auth_daily_rollup, cohort_metrics, commerce_feed_items, commerce_feed_runs, commerce_providers, contact_identity_index, daily_snapshots, decision_evidence, department, department_membership, event_outbox, governed_events (FORCE), marketing_campaigns, marketing_consent, moderation_actions, moderation_queue, notification_deliveries, organization, platform_owner, platform_owner_recovery, platform_settings, query_texts, system_health_log, user_acquisition, user_notes`.

Migrations: 86 forward files (`supabase/migrations/`), 18 rollbacks, 2 deferred. No release tag ⇒ delta = since `842379b`: `20260905_chat_messaging_phase1`, `20260906_phase6_messenger_reachability`, `20260913_plan_shares` (**was missing on the audit project; applied this pass**), `20260915_review_shares`, `20260920100000_commerce_providers`, `20260920110000_commerce_feed_items` (+4 rollbacks). Object-existence scan of all 86 (`evidence/db-migration-state.txt`): everything else APPLIED, except historical drift `add_profile_edit.sql` (`profiles.bio`) and `add_music_attribution.sql` (`music_tracks.license`, `source_url` index) — never applied to the prod-exported schema, unreferenced by code.

## 4. AI

- Provider: **Anthropic only** (`src/lib/ai/llm/providers/claude.ts`; registry `llm/registry.ts`, `LLM_PROVIDER` env unused in audit env). Models: `claude-haiku-4-5-20251001` (+ variants in tests). Env overrides `LLM_FAST_MODEL`, `LLM_SMART_MODEL`, `LLM_PLANNING_MODEL`, `LLM_VISION_MODEL`.
- Prompt assembly: `src/lib/ai/promptBuilder.ts`, `contextBuilder.ts`, `consultative/consultativeV1Prompt.ts`, `memoryGate.ts`, `messages.ts`, `historyCompaction.ts`.
- Tools (`src/lib/ai/tools/`): food, shopping, travel, commerce, commerceDiscovery, eventSchedule, weather, vnexpressTravel, serperPlaces/serperClient, placesProvider (Google/OSM/Overpass), `cacheKeys.ts`.
- Security: `src/lib/ai/security/{clientInput,fence,toolResultFence}.ts`, `src/lib/security/{urlGuard,safeFetch,addressPolicy,chatCaps,rateLimit,publicRateLimit,distributedRateLimit,kvCounter}.ts`.
- Quota: `src/lib/ai/quota/aiQuestionQuota.ts`, `anon_chat_usage` table + RPCs, `distributedRateLimit.ts` (KV).
- Guards (delta-heavy): groundingGate, placeClaimGuard, moneyGuard, snippetPriceGuard, planPriceGuard, hoursGuard, travelGuard, budgetFitGuard, clarificationGuard, searchClaimGuard, specGuard, hedgeCap, decisionSurface.
- Actions: `src/lib/ai/actions/{registry,runAction,savePriceWatch}.ts` (uses admin client).
- Cache: Upstash REST (inactive in audit env), tool result cache keys `tools/cacheKeys.ts`.
- Scam Shield: `src/lib/scam-shield/{orchestrator,engine,message/*,qr,directory,providers,knowledge/bocongan2026,history}`.

## 5. Commerce (CCP)

`src/lib/ccp/` — registry (`registry/providers.ts`, runtime from `commerce_providers` table via `commerce/providerConfigSource.ts`), adapters (`cgv, dmx, klook, marketplace, tripcom, handoff, grammar, shared`), resolver, ranking, tracking (`accesstrade.ts`, `template.ts`, `accesstradeFeedAuth.ts`), validation (`url.ts`, `paramEcho.ts`), feeds (`accesstradeCsv.ts`), events sink. Legacy `src/lib/platformLinks/*` + `ccpShim.ts`, `src/lib/links/*`. Env: `ACCESSTRADE_PUBLISHER_ID` (21 sites), `TRAVELPAYOUTS_TOKEN`. Endpoints: `/api/commerce/handoff`, `/api/links/resolve`, `/api/cron/feed-ingest`, `/api/deals/[id]/click`.

## 6. Analytics

Sinks: PostHog (`NEXT_PUBLIC_POSTHOG_KEY`), GA4 (`src/lib/analytics/ga4.ts`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` — not configured, F-001), internal `/api/track` → `user_events`, `governed_events`, `event_outbox`. Event names found in code: `page_view, page_time, chat_message_sent, chat_response_received, message_action, auth_login_completed, auth_login_failed, auth_logout_completed, auth_signup_completed, review_like, review_share, review_search, place_save, search_result_saved, nearby_search_clicked, followup_clicked, mic_used, listening, mood_selected, emoji_panel_opened, viet_content_used, boi_feature_opened, boi_reading_generated, command`.

## 7. Policies / legal (repo)

`src/app/privacy/page.tsx` (2026-08-22), `src/app/terms/page.tsx` (2026-08-04), `src/app/copyright/page.tsx` (2026-08-22), `src/app/delete-account/page.tsx` (2026-08-06); `docs/policy/*` (8 files, 2026-08-15…22). Android `PrivacyPolicyScreen.kt`, `TermsOfServiceScreen.kt`, `CopyrightPolicyScreen.kt`, `LegalDocumentScreen.kt`. iOS `PrivacyInfo.xcprivacy`.

## 8. Android / iOS surface (static)

Android: 59 screens (list in evidence), deep links `tappyai://auth-callback`, `tappyai://group` (custom scheme, no autoVerify App Links — `AndroidManifest.xml:122-146`). API calls are built through a client abstraction (grep for `"/api/` finds only `/api/chat` literal).
iOS: 61 views; API client literals cover 52 endpoints (evidence/ios-api-surface.txt) incl. delta `/api/commerce/handoff`, `/api/plans/share`, `/api/reviews/shared`, `/api/reviews/liked`.

## 9. DELTA — `842379b..d96d06b` (378 commits: 109 fix, 100 feat, 39 docs, 16 chore, 11 perf, 9 test; 2 212 files)

Feature lines merged (merge commits): V3 Phase 4 design (997f55c), origin/main+age gate into V3+G1/G2/G3 (89e65f7), CCP affiliate cross-platform (28e1d7d/764effd), integration/v3-canonical Android V3 + collections API (2dba2e3), canonical uncommitted work (a6ca9f0), consultative decision core + VnExpress editorial + plan share (1e7b77e), home hero greeting + music genre + audit docs (d303a91), GA4 on web (d96d06b).

**New API routes (12):** `age-declaration`, `commerce/handoff`, `cron/feed-ingest`, `messaging/threads{,/[id]/messages,/[id]/read}`, `plans/share`, `reviews/[id]/share`, `reviews/liked`, `reviews/shared`, `scam-shield/analyze`, `social/connections`.
**Modified routes (10):** `chat`, `config`, `cron/price-check`, `profile`, `reviews/upload`, `scan`, `subscription`, `track`, `translate`, `viet-content`.
**New tables (delta migrations):** `chat_threads, chat_participants, chat_messages, chat_reads, chat_blocks, chat_reports, chat_settings, contact_matches, contact_sync_state, contact_identity_index, plan_shares, review_shares, commerce_providers, commerce_feed_items, commerce_feed_runs`.
**Libs:** `src/lib/ai` (229 files), `src/lib/ccp` (47), `src/lib/recommendation` (39), `src/lib/scam-shield` (27), `src/lib/share` (12), `src/lib/links` (10), `src/lib/platformLinks` (7), `src/lib/security` (6: chatCaps, distributedRateLimit, kvCounter, publicRateLimit), `src/lib/messaging` (6), `src/lib/plans/share` (2), `src/lib/account` (age gate), `src/lib/notifications` (6), `src/lib/commerce` (6), `src/lib/analytics/ga4.ts`.
**Android:** 278 files under `android/app` (V3 home/explore/tools/profile, chat cards, share). **iOS:** 40 files.

## 10. Derived audit checklist (what exists, prioritised per owner scope)

1. §3.1 secrets: history scan (all 378 delta commits + full), `NEXT_PUBLIC_*` review, bundle check for service-role, `npm audit`, postinstall scripts.
2. §3.2 (core): signup A/B via the app; seed ≥2 rows/user in every RLS table reachable by a user path; IDOR on every delta endpoint taking an id (`messaging/threads/[id]/*`, `reviews/[id]/share`, `plans/share`, `commerce/handoff`, `age-declaration`, `conversations`, `favorites`, `price-watch`, `notifications`, `memory`, `bookings`, `group/[id]`); admin routes with plain token; RLS matrix as A/B/anon for delta tables; justify 80 service-role sites (delta subset first); `plan_share_public` capability-URL model; anonymous-JWT (`is_anonymous`) gaps.
3. §3.3: `/api/chat` quota — daily/guest/pro, charge timing, failure refund, race (parallel), reset TZ, scan/QR bucket; cache keys user-scoped (`tools/cacheKeys.ts`); cross-user memory/context.
4. §3.10: contract drift for the 12 new + 10 modified routes vs web/Android/iOS callers.
5. §3.11: delta schema — FKs, indexes on `chat_messages(thread_id, created_at)`, `plan_shares`, `review_shares`, `commerce_feed_items`; constraints; nullable assumptions.
6. §3.17 safety subset: prompt injection via message / fetched page / QR; system-prompt extraction; tool-arg manipulation; SSRF via `safeFetch`/`urlGuard`, `links/resolve`, `scam-shield/check`, `explore/oembed`.
7. §3.5: CCP link generation per provider (17 rows in `commerce_providers`), destination correctness, fallback, approval state; `commerce/handoff` API.
8. §3.6 inventory-only: phone-number lookup traces; wording review.
9. §3.9 music reuse traces (inventory only). 10. §3.12/3.13 static. 11. §3.23 build/test baseline.
DEFERRED per owner: 3.4, 3.7, 3.8, 3.14, 3.15, 3.19, 3.21, 3.17 golden-set scoring.

Items mentioned in the UAT spec but not found in code: OpenAI/Gemini providers (Anthropic only), `EXPO_PUBLIC_*` vars (not an Expo app), Redis (only Upstash REST / KV), "pro user" tier via Stripe/IAP exists but `SHOW_PRO_UPGRADE=false`.

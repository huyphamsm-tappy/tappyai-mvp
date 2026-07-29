# TappyAI — Master Engineering Audit

**Final gate before Android, iOS & Admin Dashboard development**
Date: 2026-07-04 · Scope: entire repository · Method: read-only static analysis + build/typecheck/lint/test execution + 8 parallel specialist review agents · No source code modified.

---

## 1. Executive Summary

TappyAI is a feature-rich Vietnamese AI lifestyle assistant (Next.js 14.2.5 App Router, Supabase, Anthropic Haiku 4.5, Stripe, web-push) with a **surprisingly complete product surface** — AI chat with grounded recommendations, a TikTok-style reviews social network, fortune-telling, 7 mini-games, currency/translate/scan utilities, group planning, subscriptions, and push notifications. The application **builds cleanly, typechecks with zero errors, lints with only warnings, and passes its (thin) test suite**. Hallucination mitigation in the AI layer is genuinely strong, and the core auth model already supports Bearer tokens, which materially de-risks native mobile.

However, the codebase is **not ready to be the stable backend for three new client apps**. The risk is concentrated not in the product code — which is broadly sound — but in **process, security configuration, and data-layer discipline**:

- **A live GitHub Personal Access Token is embedded in the git remote URL** (plaintext, on-disk). This is the single most urgent item and is independent of everything else.
- **Two confirmed launch-blocking security holes**: OAuth *integration* callbacks (Google Calendar, Zalo) trust an attacker-supplied `state` as the user identity and write tokens with the service-role client (account/integration hijack); and the `profiles` table's SELECT policy is applied out-of-band (not in any migration) in a way that code comments admit exposes `email` and `stripe_customer_id` to any holder of the public anon key.
- **`/api/chat` runs the full expensive pipeline unauthenticated with no rate limit** — unbounded LLM + external-API cost / DoS-by-cost.
- **The database cannot be rebuilt from the repository** — the hottest tables (`reviews`, `review_saves`, `favorites`) have no `CREATE TABLE` DDL anywhere; migrations can't be applied deterministically; and `RUN_ALL_MIGRATIONS.sql` re-installs already-fixed broken triggers if re-run.
- **A chat data-loss bug** (`onFinish` stale closure) silently drops the final user message from every saved conversation.
- **No CI, type/lint checks disabled in the build, force-push scripts to `main`, no error tracking, ~0% test coverage on money/auth/chat paths**, and a real Stripe-webhook bug fix sitting uncommitted on this machine.

**Overall verdict: NO GO** for immediate expansion — but the blocking set is small and mostly low-effort. With the ~12 critical/high items in §21 resolved (most are S-complexity), this becomes a confident **GO WITH REQUIRED FIXES**. See §23.

---

## 2. Architecture Assessment

**Layering (clean in the main):** `src/app` (51 pages + 60 API routes) → `src/components`, `src/hooks` → `src/lib` (business logic: `ai/`, `boi/`, `memory/`, `preferences/`, `notifications/`, `platformLinks/`, `explore/`, `integrations/`, `supabase/{client,server,admin}`) → external SDKs. `src/modules/music` is the only fully-modular vertical slice (repository → service → api → hooks → components) and holds the repo's only unit tests. Dependency direction is mostly correct (app → lib → supabase).

**External services:** Supabase (auth/DB/RLS), Anthropic Claude Haiku 4.5, Serper.dev, Google Places (New) + Maps, OSM Nominatim/Overpass, wttr.in, open.er-api.com, Travelpayouts, Stripe, Zalo OAuth, Google Calendar OAuth, Vercel Blob, web-push/VAPID, PostHog, TikTok oEmbed/Facebook OG scrape.

**Smells:**
- **Business logic leaks into routes** (`inferFromBooking` in `src/app/api/bookings/route.ts:5-27`; analytics aggregation inline in `src/app/admin/analytics/page.tsx:13-45`).
- **God files:** `src/app/reviews/page.tsx` (**1,256 lines** — feed + comments + share + profile tab + inbox + nav) and `src/components/ChatInterface.tsx` (**992 lines**).
- **Three overlapping personalization systems**: `src/lib/memory/memoryService.ts` (user_memory), `src/lib/preferences/*` (user_preferences), `src/lib/userMemory.ts` (client-side, near-orphan). Plus a **fully-built but dead** `src/lib/recommendation/` engine (zero importers).
- **Config duplication:** COOP/COEP headers set in three places (`middleware.ts`, `next.config.mjs`, `vercel.json`). Two Next configs exist — **`next.config.mjs` is live; `next.config.ts` is dead** (Next 14 ignores TS config).
- **27 env vars consumed inline** with no central config module and no startup validation.

**Architecture score rationale:** solid instincts and mostly-clean layering, undercut by god files, dead/duplicated subsystems, and config drift. **72/100.**

---

## 3. Repository Health

- **Builds:** `next build` succeeds. **Typecheck:** `tsc --noEmit` → 0 errors. **Lint:** passes with warnings only (mostly `<img>` and `react-hooks/exhaustive-deps`). **Tests:** 3 files, 24 tests, all pass — but all 3 are music-utility tests; critical paths untested.
- **Build gates disabled:** `next.config.mjs` sets `typescript.ignoreBuildErrors: true` **and** `eslint.ignoreDuringBuilds: true` (verified) — nothing type/lint-checks before production. The clean `tsc` today is luck, not enforcement.
- **Repo clutter:** ~14 `.bat`/`.vbs`/`.ps1` push scripts, 4 `.log` files, `tsconfig.tsbuildinfo`, and 13 root-level report `.md` files. Two push scripts (`_fix_and_push.bat`, `push-fix.bat`) are git-tracked.
- **Uncommitted drift (25 dirty entries):** notably a **real Stripe-webhook bug fix** (`src/app/api/webhooks/stripe/route.ts`) and an admin `ADMIN_IDS`-parsing hardening (`src/lib/admin.ts`), plus entire untracked feature dirs: `android/` (a full native Kotlin/Compose scaffold), `src/app/profile/{edit,integrations,posts,tappy-knows}/`, `src/lib/recommendation/`, `src/app/api/cron/price-check/`, and OAuth callback routes — **existing only on this machine** (bus-factor 1). Note: `vercel.json` already schedules the `price-check` cron whose route dir is untracked → deployed builds may be invoking a 404.
- **Dead route call:** `ChatInterface.tsx:326` POSTs to `/api/cta-click`, which **does not exist** (verified) — every CTA click 404s and its tracking is lost.

**Repository health score: 55/100.**

---

## 4. Feature Inventory

| Feature | Entry | Status |
|---|---|---|
| AI chat + grounded recs | `chat/page.tsx` → `ChatInterface.tsx` → `/api/chat` | Complete (dead `/api/cta-click` call) |
| Home dashboard | `app/page.tsx` | Complete |
| Reviews social network | `reviews/page.tsx`, `reviews/new`, `[id]`, `creator/[id]` | Complete (recent counter-trigger stabilization) |
| Music module (review soundtracks) | `src/modules/music/*` | Complete (only tested module) |
| Users / social graph | `users/[id]`, `/api/users/*` | Complete |
| Bói (fortune) | `boi/*` (offline engines) | Complete |
| Mini-games (7) | `game/*` + SuperTux WASM | Complete; SuperTux blob hosting Partial |
| Scan (OCR) | `scan` → `/api/scan` | Complete (weak per-instance limiter) |
| Translate | `translate` → `/api/translate` | Complete |
| Viet-content generator | `viet-content` → `/api/viet-content` | Complete (no auth/limit) |
| Currency | `currency` → `/api/rates` | Complete |
| Split-bill | `split-bill` (client-only) | Complete |
| Deals | `deals` ← `lib/shopee-deals.ts` | Partial (hand-curated data) |
| Group planning | `group/*`, `/api/group/*` | Complete (join route unauthenticated) |
| Services & bookings | `service/[id]`, `/api/bookings` | Partial/Experimental (no fulfillment) |
| Favorites | `/api/favorites` | Complete (no DELETE from chat toggle) |
| Price watch | `profile/price-watches`, `/api/price-watch` | Complete |
| Memory ("Tappy knows you") | `/api/memory`, `profile/tappy-knows` | Complete (broken for Bearer/native — §7) |
| Preferences / learning engine | `/api/preferences`, `/api/track` | Complete; `behavior-rollup` cron dormant |
| Onboarding | `onboarding` → `/api/onboarding` | Complete |
| Auth (Google/Zalo/email; FB disabled) | `login`, `/api/auth/zalo/*` | Complete; Facebook Partial (flag off) |
| Subscription (Pro) | `subscription` → Stripe | Complete |
| Push notifications | `usePushNotifications` + crons | Partial (FCM stub; 4 crons dormant) |
| Integrations (Zalo, Google Cal) | `profile/integrations` | Complete UI; **callbacks insecure (§10)** |
| Admin analytics | `admin/analytics` | Partial (needs `ADMIN_IDS`; no API surface) |
| i18n | `lib/i18n/*` (36-line dict) | Partial (app is hardcoded Vietnamese) |
| Debug routes | `/api/debug-places`, `/api/test-photos` | Internal (CRON_SECRET-gated) |

**Dead/broken:** `/api/cta-click` (missing), `src/lib/recommendation/` (no importers), `/api/suggested-prompts` (no UI consumer), `next.config.ts` (dead), 4 unscheduled crons (`behavior-rollup`, `lunch-reminder`, `travel-reminder`, `weekly-recap`).

*Memory-index correction: the project memory claimed "20 mini-games"; the repo has 7. Noted for cleanup.*

---

## 5. End-to-End Validation Matrix

| Flow | Verdict | Note |
|---|---|---|
| Build / typecheck / lint / test | **PASS** | 0 type errors; 24/24 tests; gates disabled in build config |
| AI chat happy path | **PASS** | Streams, tools fire, grounding strong |
| Chat conversation persistence | **FAIL** | `onFinish` stale closure drops last user message (H1) |
| Chat failure / session expiry | **FAIL** | No error state; 401/429/500 fail silently |
| Chat authorization | **FAIL** | Endpoint fully usable unauthenticated, no rate limit |
| Reviews feed like/save | **FAIL** | No `res.ok` check; failed like decrements count |
| Reviews feed video | **WARNING** | YouTube embeds all autoplay; no virtualization |
| OAuth login (Zalo) | **PASS** | Callback validates state correctly |
| OAuth integrations (Google Cal/Zalo) | **FAIL** | No session check on callback → hijack |
| Profiles read (PII) | **FAIL** | Out-of-band policy likely exposes email/customer-id |
| Stripe checkout + webhook | **PASS (code)** | Signature verified; **fix uncommitted** |
| Memory for native (Bearer) users | **FAIL** | Silent RLS no-op; wasted extraction calls |
| Crons (scheduled) | **WARNING** | 3 scheduled; per-user LLM fan-out unbounded; not idempotent |
| Native mobile auth | **PASS** | Bearer support wired via `getRequestUser` |
| Admin dashboard backend | **FAIL** | No `/api/admin/*` surface exists |

---

## 6. Bug Report (highest-impact, consolidated)

1. **[High · data loss] Chat `onFinish` stale closure** — `ChatInterface.tsx:422-431`: `messages` captured before the user message is appended, so every `PUT/POST /api/conversations` saves history missing the last user turn; lost on reload; memory extraction gets the corrupted transcript. Fix: capture via ref. **S.**
2. **[High · stuck UI] No chat error state** — `ChatInterface.tsx:415`: `error` never destructured, no `onError`; 401/429/500 vanish silently. Session expiry is invisible app-wide. **S.**
3. **[High · integrity] Feed like/save no `res.ok` check** — `reviews/page.tsx:1045-1063`: failed like → `liked===undefined` → count decremented; `res.json()` on error page throws unhandled. `ReviewLikeButton.tsx` does it right — port that. **S.**
4. **[High · dead UI] `onSave` rejection bricks CTA clicks** — `ChatInterface.tsx:426-430`, `:754-759`: no try/finally; a rejected save leaves `savePendingRef` true forever and blocks navigation. **S.**
5. **[High · perf/UX] Parallel YouTube autoplay** — `VideoPlayer.tsx:73-90`: IntersectionObserver gates only `upload`, so all YouTube iframes stream at once (feed not virtualized). **M.**
6. **[Med] Feed pagination races** — `reviews/page.tsx`: `pageRef` not reset when city/hashtags resolve (pages skipped); no AbortController on tab switch (stale feed wins); "retry same page" actually skips it. **M.**
7. **[Med] Auto-scroll hijack during streaming** — `ChatInterface.tsx:543-545`: scrolls on every token; can't read up. **S.**
8. **[Med] Hydration mismatch** — `reviews/page.tsx:825-832` (tab from URL/sessionStorage), `VideoPlayer.tsx:18-21` (muted). **S.**
9. **[Med] SpeechRecognition not cleaned up on unmount** — `ChatInterface.tsx:441-465`: `onresult` fires `append` after navigation. **S.**
10. **[Med] Duplicate conversation creation** on fast second send in `/chat` — `chat/page.tsx:17-32`. **S.**
11. **[Med] `FavoriteToggle` can't un-favorite** and never fetches initial state — `ChatInterface.tsx:294-308`. **M.**
12. **[Med] Creator/integrations/tappy-knows pages** lack `.catch` → infinite spinner / silent "disconnected" on network error. **S.**
13. **[Low] Raw JSON flashes** mid-stream before `[CTA_BUTTONS]`/`[TAPPY_PLAN]` close — `ChatInterface.tsx:56-76`. **S.**
14. **[Low] Build warning:** `/api/suggested-prompts` dynamic-server error (uses `nextUrl.searchParams`); add `export const dynamic='force-dynamic'`. **S.**

(Full Low/Info list in the agent detail; games, locale/currency, and chat XSS escaping were audited clean.)

---

## 7. AI System Assessment

**Strengths:** models are current (`claude-haiku-4-5`, not deprecated); hallucination mitigation is quadruple-layered (tool-side filtering, tool-description injection, system LUAT blocks, post-hoc stream scrub); grounding rules forbid parametric answers; CTAs are deterministic template links with an explicit ban on invented booking flows; graceful fallback chain (Places → OSM → Maps link).

**Findings:**
- **[Critical] `/api/chat` unauthenticated + unthrottled** — `route.ts:59-123`: freemium gate lives inside `if (user)`; anonymous requests run the full pipeline (up to 3K output tokens + 10-30 upstream calls). Freemium counter is also bypassable for authed users (counts client-persisted messages). **S / M.**
- **[High] Client `userPreferences` injected into the *system* prompt** — `route.ts:126-132`: 50 items, no per-string length cap → direct system-prompt injection + token amplification. **S.**
- **[High] Memory broken for Bearer/native users** — `contextBuilder.ts:118-125` and `route.ts:316` call `getMemory`/`updateMemory` without the request-scoped client → cookie client → RLS returns/writes nothing; extraction LLM call still billed. The route fixed this exact pattern for price-watch but not memory. **S.**
- **[High] SSRF via `thumbnail_url`** — `explore/process/route.ts:16-28` → `contentProcessor.ts:76` `new URL(...)` fetched server-side by the AI SDK; no host/IP validation (the hardened oembed guard exists — reuse it). **S-M.**
- **[High] Web-scraped SERP content flows into prompts unescaped**, and the app itself uses tool-result fields as an instruction channel (`budget.ts:174` `_LENH_BAT_BUOC`), with mandatory link-echo rules — indirect prompt injection + phishing-grade link laundering. **M.**
- **[Med] Prompt caching configured but structurally defeated** — per-minute timestamp at prompt position 0, dynamic memory/pref blocks before the 20 KB static base, per-request tool-set variation. Likely paying the 1.25× write premium with near-zero reads. Measured system prompt ≈ 6-6.8 K tokens. **M — biggest recurring cost win.**
- **[Med] Memory extraction runs twice per message** (server `onFinish` + client `/api/memory` POST — verified) → 3 AI calls/message instead of 2, plus upsert races. **S — delete the client POST.**
- **[Med] Cron per-user LLM fan-out unbounded** (`Promise.allSettled` over all users inside 60 s). **M.**
- **[Med] `/api/chat` body never schema-validated**; forged `assistant`/`tool` history accepted. **S.**

**AI architecture score: 74/100** (excellent grounding, undercut by auth/injection/caching gaps).

---

## 8. Database Assessment

- **[Critical] Repo cannot rebuild the DB** — no base DDL for `reviews`, `review_saves`, `favorites` (all only ALTER-ed or referenced). Highest-leverage fix: `pg_dump --schema-only` from prod → commit as baseline. **S.**
- **[Critical] `profiles` SELECT policy is out-of-band** (not in any migration; code comment at `users/search/route.ts:57` says it's needed) → row-level `USING(true)` exposes `email` + `stripe_customer_id`. **M.**
- **[High] `RUN_ALL_MIGRATIONS.sql` + 3 files re-install pre-fix (non-SECURITY DEFINER) triggers** — re-running regresses the July-3 counter fixes. Migrations also can't be applied deterministically (dated + undated + RUN_ALL ordering conflicts). **S / M.**
- **[High] `update_follow_counts` never fixed** — no SECURITY DEFINER; `follower_count` silently under-counts under RLS; no backfill. **S.**
- **[High] `review_milestones` INSERT broken** — `add_phase4_hardening.sql:26` dropped the INSERT policy assuming service-role writes, but the writer (`like/route.ts:86`) uses the user client → milestone inserts now fail silently. **S.**
- **[High] `user_events` / `user_preferences` double-CREATE drift** — order-dependent `CREATE TABLE IF NOT EXISTS` with differing columns/PK; which shape "won" in prod is unknown. **S.**
- **[Med] `increment_review_view` RPC** anonymously spammable (no `REVOKE`/auth check) → trending manipulation. **S.**
- **[Med] `place_photos` anon-writable** (`WITH CHECK(true)`) and dead — drop or lock. **S.**
- **[Med] `conversations.messages` single JSONB array** — write amplification, no per-message pagination, unbounded row growth. **L.**
- Missing index on `reviews(user_id)` (queried everywhere); offset pagination throughout. Constraints and FKs are otherwise good.

**Database score: 58/100** (functionally works; source-of-truth and migration discipline are the liabilities).

---

## 9. Architecture Review (quality attributes)

- **Coupling/cohesion:** mostly good; god files and route-embedded logic are the exceptions.
- **DRY:** violated by three personalization subsystems + a dead recommendation engine + duplicate config headers.
- **SOLID/Clean:** `src/modules/music` and `src/lib/recommendation` are exemplary; the rest is pragmatic-MVP.
- **Technical debt hot spots:** `reviews/page.tsx`, `ChatInterface.tsx`, the migrations folder, the push-script pile.
- **Maintainability drag:** disabled build gates + ~0% critical-path tests mean regressions ship undetected.

---

## 10. Security Assessment

| Sev | Finding | Evidence |
|---|---|---|
| **Critical** | GitHub PAT in git remote URL (plaintext, on disk) — verified | `.git/config` |
| **Critical** | OAuth integration callbacks trust `state` as identity, write via service role — account/integration hijack | `integrations/google-calendar/callback/route.ts:10,49`; `integrations/zalo/callback/route.ts:10,46-61` |
| **Critical** | `profiles` RLS drift → email + stripe_customer_id exposure to anon key | `users/search/route.ts:57` (comment), `supabase-schema.sql:12,55` |
| **High** | `/api/chat` no auth / no rate limit → cost-DoS | `chat/route.ts:60-111` |
| **High** | `group` join/create unauthenticated → data pollution | `group/[id]/join/route.ts` |
| **Med** | SSRF via `thumbnail_url` | `explore/process/route.ts` → `contentProcessor.ts:76` |
| **Med** | Open redirect in Zalo login callback (`//evil.com` passes `startsWith('/')`) | `auth/zalo/callback/route.ts:92` |
| **Med** | Unauthed cost-amplification: translate/scan/viet-content | respective routes |
| **Med** | In-memory rate limiters (per-lambda, IP-spoofable) — cosmetic on Vercel | translate/scan/reviews/upload/users-search |
| **Low** | `update_follow_counts` no SECURITY DEFINER; non-constant-time CRON_SECRET compare; tokens in error logs | migrations + cron routes |

**Verified secure (no action):** Stripe webhook signature + server-side price id; oembed SSRF guard (allowlist + private-IP block); chat markdown XSS escaping; IDOR scoping on reviews/price-watch/follow/etc.; cron CRON_SECRET fail-closed; admin fail-closed; no hardcoded secrets in tree; `.env*` gitignored.

**OWASP mapping:** A01 (integration hijack, profiles RLS, group no-auth, open redirect), A02 (PII exposure), A04 (cost abuse, weak limiters), A07 (chat/integration auth), A09 (token logging), A10 (thumbnail SSRF). A03 injection: none confirmed.

**Security score: 42/100** (two anon-exploitable Criticals + a live token dominate; baseline hygiene is otherwise good).

---

## 11. Performance Assessment

- **Bundles reasonable:** shared JS 87 KB; heaviest first-load 217 KB (`/chat`), 205 KB (`/reviews/new`). No `dynamic()` imports but per-route splitting covers games.
- **[High] Chat pre-stream serial awaits** — up to 6 sequential round-trips (auth → context → calendar → subscription → count → messages) before first token; parallelize with `Promise.all`. **S.**
- **[Med] Free-limit check reads full `messages` JSONB of every conversation today** just to count. **M.**
- **[Med] Trending feed pulls 200 full rows + scores in JS** on edge, per request. **M.**
- **[Med] `staleTimes:{dynamic:0}` global** disables Router Cache app-wide to fix a chat-only issue → slow back-nav everywhere. **M.**
- **[Med] Reviews feed not virtualized** (unbounded DOM). **M.**
- **[High] SuperTux 245 MB `.data` in `public/`** served from Vercel + preloaded on the `/game` hub for all visitors. **S — finish Blob/R2 migration + gate preload.**
- Tracking pipeline (batched 10/10s, server-capped) is well-designed.

**Performance score: 68/100.**

---

## 12. Cost Optimization Assessment

Top unnecessary-spend items (relative magnitude):
1. **★★★★★ Prompt-cache misses** — reorder to static base first + hour-rounded timestamp → ~80-85% cut on system-prompt input cost, zero quality loss. **S/M.**
2. **★★★★ Duplicate memory extraction** — delete `ChatInterface.tsx:432-436`; halves extraction spend, removes a race. **S.**
3. **★★★★ Serper/Places fan-out** (~10 Serper + ~17 Places calls/query) with a per-lambda cache that rarely survives → persistent KV/Supabase cache for text results; cap image lookups to top 3. **M.**
4. **★★★ SuperTux egress** — Blob/R2 + interaction-gated preload. **S.**
5. **★★ Per-user daily cron LLM calls** — cluster by (location × pref bucket). **M.**

Codebase is otherwise cost-conscious: Haiku everywhere, tight max_tokens, hotlinked images (no egress), 10-message history trim, batched tracking. Also: `user_events` grows unbounded with the summarizing cron unscheduled — schedule `behavior-rollup` + add a 90-day purge.

**Cost efficiency score: 70/100.**

---

## 13. Android Readiness — **YELLOW** (pilot-viable; ~4 store-release blockers)

Enabler: Bearer auth already wired (`getRequestUser`). Blockers: (1) Zalo login web-only; (2) push is webpush-only, FCM dispatch unimplemented, one-sub-per-provider schema; (3) chat stream uses the AI-SDK data-stream protocol (nonstandard for native parsers) — add a `?protocol=text` variant; (4) no API versioning — post-launch DTO cleanup breaks pinned APKs; (5) toggle semantics on like/save/follow + no booking idempotency = retry hazards; (6) `inferFromBooking` cookie-client no-ops under Bearer; (7) unbounded `favorites`, heavy `conversations` payloads, no notification paging/unread. **Score: 60/100.**

## 14. iOS Readiness — **YELLOW-RED**

Everything Android needs, plus: APNs path (via FCM or direct); **Sign in with Apple is mandatory** (App Store 4.8) once other social logins exist — not implemented (Supabase `signInWithIdToken` makes it cheap but must be tested end-to-end); Zalo native login. **Score: 52/100.**

## 15. Dashboard Readiness — **RED**

**No `/api/admin/*` surface exists** — the dashboard would have nothing to call. Role model is an env-var ID allowlist (`ADMIN_IDS`), not a DB/JWT role, and the profiles-RLS drift means a supabase-js dashboard could read all emails. No moderation capability (owner-scoped PATCH only; no report queue despite `report` events being collected). Broadcast is gated by the shared `CRON_SECRET` (unusable from a browser SPA). Metrics only as a server-rendered page with 200/500-row caps. **Score: 38/100.**

---

## 16. Production Readiness — **NOT READY (as an operated service)**

Deployed and functioning, but: no CI; type/lint gates disabled in build; `push.bat` force-pushes `main`; lock-deleting push scripts; live PAT in remote; no error tracking (Sentry TODO only); no `/api/health`; ~0% test coverage on money/auth/chat; no cron idempotency (duplicate morning pushes possible); no feature flags; no documented backup/restore. Anthropic SDK calls set no explicit timeout/maxRetries. **Score: 45/100.**

---

## 17. Technical Debt Register

| Item | Location | Cost to carry |
|---|---|---|
| God files | `reviews/page.tsx`, `ChatInterface.tsx` | High (change-risk) |
| Migrations disorder + missing base DDL | `supabase/migrations/*` | High (can't rebuild) |
| Three personalization subsystems + dead rec engine | `lib/memory`, `lib/preferences`, `lib/userMemory`, `lib/recommendation` | Med |
| Push-script pile + no CI | repo root | High (deploy risk) |
| In-memory rate limiters | 5 routes | Med (ineffective) |
| `conversations.messages` JSONB | schema | Med→High at scale |
| Disabled build gates | `next.config.mjs` | High (silent regressions) |
| 13 root report .md + logs | repo root | Low (noise) |
| Dead code: `/api/cta-click` caller, `/api/suggested-prompts`, `next.config.ts`, 4 dormant crons | various | Low |

---

## 18. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Leaked PAT → arbitrary prod deploy | Med | Critical | Revoke now; SSH/credential-manager |
| Anon PII harvest via profiles RLS | High | Critical | Column-scoped policy / view |
| Integration/account hijack via OAuth callback | Med | Critical | Session-bound state + PKCE |
| Cost-DoS on `/api/chat` | High | High | Auth + durable rate limit |
| DB unrebuildable / migration re-run regresses fixes | Med | High | Baseline dump; renumber; delete RUN_ALL |
| Chat data loss (last user message) | High | High | Fix stale closure |
| Uncommitted Stripe fix lost / prod on buggy path | Med | High | Commit + verify |
| Single-machine bus factor (android/, features untracked) | Med | High | Commit/branch |
| Mobile clients break on API cleanup | High (post-launch) | Med | Version before first release |

---

## 19. Top 100 Prioritized Issues

Consolidated and de-duplicated across all eight audits, most-severe first. (Where agents overlapped — chat no-auth, profiles RLS, SSRF, follow-count trigger — findings are merged and cross-confirmed.)

**Critical (1-6):** 1 PAT in remote · 2 OAuth integration hijack · 3 profiles RLS PII exposure · 4 `/api/chat` no-auth/no-rate-limit · 5 no base DDL for reviews/review_saves/favorites · 6 Stripe webhook fix uncommitted.

**High (7-30):** 7 chat `onFinish` data loss · 8 client prefs → system-prompt injection · 9 memory broken for native users · 10 thumbnail SSRF · 11 SERP content → prompt (injection/link-laundering) · 12 no CI · 13 build gates disabled · 14 `push.bat --force` + lock-deleting scripts · 15 RUN_ALL re-installs broken triggers · 16 `update_follow_counts` no SECURITY DEFINER · 17 `review_milestones` INSERT broken · 18 user_events/user_preferences double-CREATE drift · 19 no chat error state · 20 feed like/save decrements on failure · 21 `onSave` bricks CTA · 22 no error tracking · 23 group join unauthenticated · 24 no `/api/admin/*` · 25 chat pre-stream serial awaits · 26 SuperTux 245 MB egress + hub preload · 27 YouTube parallel autoplay · 28 no API versioning · 29 FCM/APNs unimplemented · 30 Sign in with Apple missing.

**Medium (31-70):** prompt-cache defeated · duplicate memory extraction · cron per-user LLM fan-out · cron non-idempotency · free-limit reads full JSONB · trending feed 200-row JS scoring · `staleTimes:0` global · reviews feed no virtualization · feed pagination races · auto-scroll hijack · hydration mismatches (tab, muted) · SpeechRecognition no cleanup · duplicate conversation creation · FavoriteToggle no DELETE · creator/integrations pages no `.catch` · `increment_review_view` spammable · `place_photos` anon-writable · open redirect (Zalo) · unauthed translate/scan/viet-content · in-memory limiters ineffective · chat body unvalidated · error-shape/status inconsistency (5 shapes) · raw Supabase errors leaked · unbounded `favorites`/`conversations`/`notifications` payloads · notifications no read/unread · webpush-only subscribe · multi-device push overwrite · `conversations.messages` JSONB scaling · missing `reviews(user_id)` index · `user_events` unbounded + rollup dormant · luxury stream filter corruption · disconnect returns 307 HTML to API clients · `inferFromBooking` no-ops under Bearer · price-check "6h" vs daily mismatch · CTA JSON flash · suggested-prompts dynamic error · security headers (CSP/HSTS/frame) absent · no health endpoint · Anthropic SDK no timeout/retries · migration idempotency violations · env `.env.example` documents 4 of 27.

**Low/Info (71-100):** detectLang misclassifies Latin scripts · fabricated "TikTok review" links · flight-price staleness · price-check LLM-extracted price bounds · group-suggest member-text injection · dark-mode FOUC · object URL leak · useMusicPlayback re-subscribe · MessageActionBar local-only feedback state · forbidden User-Agent header · iOS input zoom (14px) · single error boundary · IME Enter-to-send · voice append mid-stream · unused `matter-js`/`docx` deps · `lucide-react`/`posthog-js` per-route · 13 root report .md files · `.env*.tmp` prod-secret copies on disk · tracked push scripts · `next.config.ts` dead · tsbuildinfo tracked · zalo_verifier typo dupes · non-constant-time CRON_SECRET compare · tokens in error logs · music_usage read-dead · services/pgvector unused · `bookings.service_id` no FK · trending pagination instability · comment-count recompute per request · memory-index "20 games" wrong.

---

## 20. Top 50 Quick Wins (all S-complexity, high value-to-effort)

1. Revoke + remove PAT from remote. 2. Commit the Stripe webhook fix + `admin.ts` hardening. 3. Commit/branch `android/` + untracked feature dirs. 4. Delete `push.bat` / remove `--force`. 5. Re-enable `typescript`/`eslint` build gates. 6. Delete `next.config.ts`. 7. Add auth or IP limit to `/api/chat`. 8. Length-cap client `userPreferences` strings. 9. Thread request-scoped client into `getMemory`/`updateMemory`. 10. Delete client `/api/memory` POST (dup extraction). 11. Reorder system prompt for caching (hour-round the timestamp). 12. SSRF allowlist on `thumbnail_url` (reuse oembed guard). 13. Fix chat `onFinish` stale closure. 14. Add chat `onError` + error UI. 15. Add `res.ok` guards to feed like/save. 16. try/finally around `onSave`. 17. Require auth on `group/*` routes. 18. `pg_dump --schema-only` → baseline migration. 19. Add `SECURITY DEFINER` to `update_follow_counts` + backfill. 20. Fix `review_milestones` INSERT (admin client). 21. Idempotent `ALTER` for user_events/user_preferences columns. 22. `REVOKE EXECUTE` on `increment_review_view` from anon. 23. Drop/lock `place_photos`. 24. Reject `//` in Zalo `returnTo`. 25. `Promise.all` the chat pre-stream awaits. 26. Gate SuperTux preload behind card interaction. 27. Schedule `behavior-rollup` + add `user_events` purge. 28. Add `reviews(user_id)` index. 29. `export const dynamic='force-dynamic'` on suggested-prompts. 30. Add `/api/health`. 31. Add security headers (CSP/HSTS/frame-ancestors). 32. Set Anthropic SDK `timeout`/`maxRetries`. 33. Remove `matter-js`/`docx` deps. 34. Delete `RUN_ALL_MIGRATIONS.sql` (or paste fixed triggers). 35. Fix price-check schedule/comment mismatch. 36. Auto-scroll only when near bottom. 37. Cleanup SpeechRecognition on unmount. 38. Standardize 401 message + status codes. 39. Return JSON (not 307) on integration disconnect. 40. Cap `music/tracks` `limit`. 41. Bound `favorites` with `.limit()`. 42. Strip CTA/plan JSON while streaming. 43. Complete `.env.example` (27 keys). 44. Add startup env validation (zod). 45. Delete `.env*.tmp` from disk. 46. Untrack `_fix_and_push.bat`/`push-fix.bat`. 47. Relabel "TikTok review" → "Tìm trên TikTok". 48. Fix `detectLang` for Latin scripts. 49. Remove root report .md clutter. 50. Debounce `rebuildProfile` per user.

---

## 21. Recommended Remediation Roadmap (dependency-ordered)

**Phase 0 — Contain (hours, do before anything else):**
Revoke PAT + fix remote → commit/branch the dirty tree (Stripe fix, admin.ts, android/, untracked routes) → confirm what production is actually running.

**Phase 1 — Security launch-blockers (days):**
Session-bind OAuth integration `state` + PKCE (C1) → confirm & lock `profiles` policy to non-sensitive columns/view (C2) → auth+rate-limit `/api/chat` (H1) → auth on `group/*` → SSRF guard → cap client prefs. (These gate any new client that widens the attack surface.)

**Phase 2 — Data-layer integrity (days):**
`pg_dump` baseline → renumber/clean migrations, delete RUN_ALL → fix `update_follow_counts` + `review_milestones` + user_events/user_preferences drift + `increment_review_view` + `place_photos`. (Blocks confident schema changes for mobile/dashboard.)

**Phase 3 — Correctness + delivery (1-2 weeks):**
Fix chat data-loss + error state + feed like/save + CTA brick → re-enable build gates → minimal CI (typecheck/lint/vitest/build) → retire force-push scripts → add Sentry + `/api/health` → prompt-cache reorder + delete duplicate extraction.

**Phase 4 — Client enablement (2-4 weeks, parallelizable):**
Freeze/version the API (`/api/v1`) → standardize error envelope + status codes → FCM/APNs + device-keyed subscriptions → native Zalo + Sign in with Apple → build the `/api/admin/*` surface (list/moderate/metrics/broadcast with DB/JWT admin role) → pagination on favorites/notifications/conversations.

---

## 22. Overall Scores (0-100)

| Dimension | Score |
|---|---|
| Architecture | 72 |
| Code Quality | 63 |
| Feature Completeness | 82 |
| AI Architecture | 74 |
| Security | 42 |
| Performance | 68 |
| Scalability | 60 |
| Maintainability | 58 |
| Cost Efficiency | 70 |
| Android Readiness | 60 |
| iOS Readiness | 52 |
| Dashboard Readiness | 38 |
| **Production Readiness** | **45** |

---

## 23. Final Recommendation

### NO GO — for immediate Android / iOS / Dashboard development.

The product is more complete and better-grounded than its maturity stage would suggest, and the blocking set is **small and mostly low-effort** — but expanding to three new clients right now would multiply the current attack surface (two anon-exploitable Criticals), build those clients against a backend that can't be rebuilt from source and whose migrations regress on re-run, and pin mobile binaries to an unversioned, inconsistent API. The uncommitted Stripe fix and the live PAT mean the deployed state is also not fully known.

**This converts to GO WITH REQUIRED FIXES after Phases 0-2** (the ~18 Critical/High items — the majority are S-complexity and completable in roughly one to two focused weeks). At that point: start the Android pilot and the Dashboard API surface in parallel with Phase 3-4 hardening; hold the iOS submission until Sign in with Apple + APNs land.

**Do first, today:** revoke the PAT, commit the Stripe webhook fix, and confirm the live `profiles` SELECT policy in the Supabase dashboard — that last check is the one "insufficient evidence" item gating the exact severity of the PII exposure.

*Items marked "insufficient evidence" (actual prod RLS policy text, which `user_events`/`user_preferences` shape won, real cache-hit rates, Serper quota consumption) require live-environment access and a `pg_dump` to close — all resolvable in an hour with dashboard access.*

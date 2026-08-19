# TappyAI Production Knowledge Base — Update 2026-08-06

> **Purpose:** authoritative reference for the next iOS synchronization sprint. Covers every change to production Web, Android, Backend, and Controller V2 from the last known iOS sync point (`d57f5ef`, 2026-07-17) to current `HEAD` (`6d67ea7`, on `main` — `feat/backoffice-phase0` and `main` are currently identical, 0 ahead/behind).
>
> **This document does NOT compare anything to iOS and does NOT audit iOS code.** It is pure production-system knowledge, built to be read before any parity analysis begins.
>
> **Scale correction:** an earlier audit pass this session scoped the range at 135 commits and found zero new migrations — both numbers were wrong, from an undercounted commit range. The real number is **213 commits** and **8 real new database migrations**. This document supersedes that earlier pass entirely; treat this as the current baseline.

---

## 1. New Features

| Feature | Current state | Detail |
|---|---|---|
| **Scam Shield** (URL/QR risk checker) | Live in production, **now has a Home nav entry** (`HomeView.tsx:191-195`, teal ShieldCheck card) | §4 (API), §8 (security fix) |
| **Notifications in-app inbox** (ADR-014) | Live; unified single-table pipeline, real-time badge | §4, §5, §6 |
| **Deals V1** (admin-managed partner commerce) | Live; DB-backed, admin CRUD, localized, click-tracked | §10 |
| **Comment replies + reactions** | Live; 1-level nesting, free-form reaction types | §4 |
| **Attached sound / "use this sound"** | Live; TikTok-style sound reuse across reviews | §1a below |
| **Currency converter fix** (Bug #15) | Live; precision + missing-currency guard | §10 |
| **`/startup` public landing page** | Live; bilingual marketing page, replaces `/about` | §7 |
| **`/delete-account` page** | Live; **policy/request page only, not self-service** — see §8 for the important accuracy caveat | §8 |
| **Controller V2 — Platform Owner + Identity** (Components 1-2) | **Live in production**, admin-only | §5, §8 |
| **Controller V2 — RBAC permission registry** (Component 3) | Built on a feature branch, 7 commits, **NOT merged to main** | §5 |
| **Android: Reviews full build-out** | Live — photo upload, link sharing, comments, follow, feed tabs, video+watch analytics | §11 |
| **Android: Membership/subscription status (read-only)** | Live — reads `/api/subscription` | §11 |
| **Android: App Connections status (read-only)** | Live — reads `/api/integrations` | §11 |
| **Android: Chat suggested prompts** | Live — reads `/api/suggested-prompts` | §11 |
| **Android: Zalo login** | Live — Custom Tab + deep-link fragment import | §11 |

### 1a. Attached sound playback ("use this sound")
A user reaches `/sound/[trackId]`, taps a CTA that navigates to `/reviews/new?sound=trackId`, preselecting that track in the composer; the resulting review's `music.origin = 'attached'` marks it as borrowed audio. Playback: `VideoPlayer.tsx` force-mutes the `<video>` element as a continuously-enforced invariant and plays a single companion `Audio` element mirrored to the video's play/pause/loop — exactly one audio source per active clip. `ReviewMusicCard.tsx` is label-only now; it links out to `/sound/[trackId]` rather than playing anything itself.

---

## 2. Removed / Deprecated Features

- **SuperTux / Games — cut from V1 entirely.** Web removed `src/app/game/**` and the SuperTux route; Android hides the Games tile from production (WebView lacked `SharedArrayBuffer`, WASM was ~246MB). V1 scope is now explicitly "AI Chat, Food, Travel, Explore, Reviews, Social."
- **TikTok as a creatable video source — removed** (`b68be0d`, "remove TikTok from V1 video pipeline"). Confirmed in current code: `src/lib/links/platforms.ts`'s `MATCHERS`/`LINK_VIDEO_PROVIDERS` now contain **only `youtube`**. TikTok's placeholder SVG, detector, resolver, player, and CSP `frame-src` entry were deleted. Legacy TikTok rows in the DB still render via a generic fallback, but no new review can attach one.
- **Facebook/Instagram as creatable video sources — removed** even earlier in the same pipeline unification (`547f418`). Same legacy-renders-but-not-creatable treatment.
- **Hardcoded Deals catalog (`src/lib/shopee-deals.ts`, the `DEAL_POOL` constant) — deleted.** Superseded entirely by the `partner_deals` DB table (§10). The 7-partner catalog survives only as a one-time seed insert; the DB is now the sole source of truth with no ceiling on partner count.
- **Old Explore restoration mechanism** (`isBackForwardMount()` / unmount-marker / `popstate`-based) — replaced by ExploreSession's explicit `leaveExplore()`/`enterExplore()` contract (§5). The last cross-component `sessionStorage` "tab side-channel" (`reviews_tab`) was removed (M3).
- **`/about` route** — replaced by `/startup` (same content, moved + modularized).
- **Legacy `/profile/privacy` and `/profile/terms` routes** — permanently 308-redirect to `/privacy`/`/terms` (`next.config.mjs:114-136`).

---

## 3. Production Bugs Fixed

Grouped by subsystem; each is the current, already-shipped fix (not a to-do).

**Explore / Feed:**
- Avatar follow "+" button was a bare unwired `<div>` — now a real follow action (WEB-EXPLORE-FOLLOW-002).
- Personalized feed responses (`liked_by_me`/`saved_by_me`) were being CDN-cached (`s-maxage=30`), leaking one user's like/save state into another user's cached response — now never cached (P0).
- Discovery feed could show the viewer their own posts on first load — now excluded server-side.
- Desktop wheel-scroll had a dead zone outside the narrow feed column — now forwards anywhere on the page.
- Programmatic slide-jumps (prev/next arrows, wheel-forwarding) updated the DOM without notifying ExploreSession in the same tick, causing a visible snap-back — now synchronous.
- Mobile Explore header was missing the "Đăng bài" (post) CTA — added per spec (WEB-EXPLORE-HEADER-001).
- Active feed clip didn't survive browser Back / cross-document Back (Bug #8, #17) — fixed originally via sessionStorage heuristics, since **superseded** by the ExploreSession migration's id-first restore contract.
- Notification badge only updated while mounted on `/reviews` — fixed by hoisting subscription into a root-level `NotificationProvider`.
- Reviews grid filler tiles used the wrong background color (didn't match page bg) — fixed.

**Astrology:** Nạp Âm ngũ hành used a buggy last-digit-of-year heuristic — replaced with a correct 30-entry Nạp Âm table, one canonical engine ported to Web/Android/iOS in the same commit.

**Chat / AI:**
- `finishReason: 'length'` truncation was cutting off replies — raised the token cap AND stopped asking the model to write image/link markdown inline (enrichment now injects it deterministically), which is what made the higher cap actually sufficient.
- Chat enrichment (photo/link injection) was corrupting `[TAPPY_PLAN]`/CTA/follow-up structured blocks — now hard-bounded to never write past those markers.
- Multi-place trip plans only got a photo matched to the last place searched, not each place — now accumulates across every search call in the stream.
- One Vietnamese proper noun (a place name) in an English message could flip the whole reply to Vietnamese — language detection now treats capitalized accented words as topic signal, not language signal (see ADR-016, §9).
- Flight links used Aviasales with a dateless search URL that errored — replaced with Traveloka + Google Flights, always populated (falls back to a ~7-day-out default date).
- TTS could read a Vietnamese reply with an English voice — voice selection now strictly matches the detected reply language or stays silent.
- Jamendo-hosted cover art 400'd because the CDN host wasn't in Next's image `remotePatterns` allowlist — added.

**Currency:** exchange-rate display rounded to the *target* currency's decimals, so weak→strong pairs (VND→USD etc.) rendered as `0,0000` — fixed to scale precision by magnitude. A missing currency silently defaulted to a 1:1 rate — now throws a typed error and shows a warning instead of a wrong converted amount.

**Auth / Security (see also §8):**
- CSP blocked `graph.zalo.me` — broke Zalo login for **every platform**, not just Android, since the profile fetch is deliberately client-side (Zalo IP-gates that endpoint to Vietnam, and the token exchange runs on Vercel/US).
- CSP blocked `vercel.com` (the Blob SDK's hardcoded upload API host, distinct from the storage hosts already allowed) — silently broke every photo/video/audio upload for two weeks (surfaced as a generic retried `fetch` failure, spinner hang, no error shown).
- Android's Zalo sign-in silently failed to create a session — `supabase-kt`'s `handleDeeplinks()` only consumes a PKCE `?code=`, not the token-fragment redirect the backend actually sends; fixed by adding fragment parsing.
- Scam Shield SSRF bypass (detailed in §8).
- Scam Shield had 31 missing i18n keys and hardcoded-Vietnamese API error messages, plus a null-safety bypass in evidence scoring (`typeof null === 'object'`) — all fixed in the same pass as the SSRF fix.
- Dev-only CSP blocked `'unsafe-eval'`, breaking Fast Refresh in local dev — fixed (dev-only, no prod exposure).
- `/delete-account` page originally over-claimed what the app does (implied a true in-app deletion flow) — corrected to accurately describe the actual email-request mechanism (`0af672c`).

---

## 4. API Contract Changes (reference)

New or changed request/response contracts since `d57f5ef`. Existing contracts not listed here are unchanged.

| Endpoint | Method | Auth | Contract |
|---|---|---|---|
| `/api/scam-shield/check` | POST | optional | body `{url: string ≤2048}`; rate-limited 10/min/IP + daily quota 30 (auth)/10 (anon); returns risk report `{score, confidence, level, evidence, officialMatch, actions[], cached}` |
| `/api/scam-shield/qr` | POST | optional | multipart or raw image, ≤5MB; same quota; decodes QR → same risk pipeline |
| `/api/scam-shield/directory` | GET | none | `{entities: OfficialEntity[]}`, cached 1h |
| `/api/config` | GET | none | now includes `flags.showScamShield`, `flags.showAppConnections`, `scamShield: {dailyLimitAuth, dailyLimitAnon}` |
| `/api/notifications` | GET | required | `?limit`/`?before` pagination → `{notifications: NotificationDTO[], unread_count}`. `NotificationDTO`: `id, type, category, title, body, actor{id,name,avatar}, entity_url, image_url, data, read_at, created_at` |
| `/api/notifications/read` | POST | required | no body = mark all read; sets `read_at` |
| `/api/deals` | GET | none | `?country=` (default `VN`), `?lang=` (falls back to `Accept-Language`, default `vi`) → `{success, deals: PartnerDeal[]}`. Fields: `id, partnerSlug, partnerName, partnerType, category, categoryKey, title, description, officialUrl, bannerImage, logoImage, isFeatured, discountLabel, voucherCode, endAt`. `category` = localized label, `categoryKey` = stable vi base (styling key, never localized) |
| `/api/deals/[id]/click` | POST | none | fire-and-forget click counter via SECURITY DEFINER RPC; always returns `{success:true}` |
| `/api/admin/deals`, `/api/admin/deals/[id]`, `/api/admin/deals/upload` | GET/POST/PATCH/DELETE | admin role | CRUD for `partner_deals`; admin-only, zod-validated, audit-logged |
| `/api/admin/rbac/roles`, `/api/admin/rbac/roles/[id]` | GET/POST/... | admin/owner | role-grant CRUD (Phase-0 role-hierarchy model, NOT the unmerged Component-3 permission registry) |
| `/api/admin/analytics/activation`, `/api/admin/analytics/auth`, `/api/admin/audit`, `/api/admin/settings` | GET | admin role | admin-only surfaces, no consumer impact |
| `/api/auth/zalo`, `/callback`, `/complete` | GET | — | `platform` param now strictly allowlisted to `ios`\|`android`\|else `web`; threaded via httpOnly cookie through the whole flow |
| `/auth/confirm` | GET | — | redirects by platform: `tappyai://auth/callback#...` (iOS) vs. `tappyai://auth-callback#access_token=...&refresh_token=...&expires_at=...` (Android, different registered scheme) |
| `/api/reviews/[id]/comments` | GET/POST/DELETE | mixed | comment now carries `parent_comment_id` (1-level nesting only), response includes `reactions: Record<string,count>` + caller's `my_reaction` |
| `/api/comments/[id]/reactions` | POST/DELETE | required | body `{reaction: string}` (free-form 1-20 chars, no fixed enum) → `{ok, reaction?}` |
| `/api/reviews/feed` | GET | mixed | `?sort=trending\|latest`, `?following=true` (only ever sent as `true`); **plain page/limit pagination, no cursor/total** — end-of-feed inferred client-side; dedupe-by-id is a client responsibility since inserts between requests can shift the window |
| `/api/reviews/[id]/interact` | POST | required | body `{watch_seconds: int, completion_rate: float}`; backend enforces min 3s watched, ignores anonymous callers, rate-limits 10/min |
| `/api/reviews/upload` | POST | required | multipart, field `file`, one file/request → `{url}`; server re-sniffs magic bytes regardless of client MIME |
| `/api/subscription` | GET | required | `{isPro, status, currentPeriodEnd, freeDailyLimit, todayMessageCount, remaining}` |
| `/api/integrations` | GET | required | `{integrations: [{provider, connected, connected_at}]}` |
| `/api/suggested-prompts` | GET | — | `{prompts: [{text, textEn, category, emoji, gradient}]}` — note `category`/`emoji`/`gradient` exist on the wire; Android currently decodes only `text`/`textEn` |
| `/api/reviews/[id]` | GET | — | **confirmed still does not exist** (only `PATCH`/`DELETE`) — 405 on any GET |
| `/api/profile`, `/api/account` DELETE | DELETE | — | **confirmed still does not exist anywhere** — no self-service account deletion API. No `supabase/functions/` in the repo at all. |

---

## 5. Architecture Changes

**ExploreSession** (`src/lib/explore/ExploreSession.ts`) — a UI-agnostic class that is now the sole owner of Explore's navigation state (`activeReviewId`, `activeIndex`, `scrollOffset`, `feedType`, `sort`, `query`, `filters`, `tab`). Every departure calls `leaveExplore()` (freezes a versioned snapshot to `sessionStorage`), every arrival calls `enterExplore()` → `restore(feedReviewIds)` resolving **by id first, index second, top last**, with every outcome explicitly reported (never silent). Formalized in `docs/web-sprint/ADR-001-explore-session.md` ("Design Freeze 2026-07-28"), implemented across milestones M1-M6 with a dead-code sweep removing the old popstate-based mechanism.

**PlaybackController / PlaybackSession** — new layering: **Feed → PlaybackSession → PlaybackController → media substrate**. `PlaybackController` is transport-only (play/pause/seek/dispose); `PlaybackSession` (`DefaultPlaybackSession`) is the sole autoplay-eligibility and lifecycle-policy owner (`isAutoplayEligible = active && visible && !userPaused`). Two concrete controllers exist today: `YouTubeController` (real IFrame-API sync) and `UploadCompatAdapter` (wraps the legacy `<video>` path, flagged `ownsLifecycle: true` so Session doesn't yet drive its activation/teardown — explicitly a Phase-1-only compromise, a future `HTMLVideoController` would unify this). Feed never holds a controller directly; it only forwards `visibilitychange`/`pagehide` browser signals into the session.

**Notifications — unified pipeline (ADR-014)** — replaced two disjoint systems (derived-on-read aggregation + ad-hoc push) with one `notifications` table every producer writes and every consumer reads. `emitNotification()` is the single writer (insert row → dispatch web push from the same payload → update `push_status`). Realtime delivery: one Supabase Realtime channel per user (`notifications:${uid}`, `postgres_changes` filtered to that user's rows) triggers a debounced REST re-fetch rather than trusting the push payload as state directly.

**Brand registry** (`src/config/brandRegistry.ts`) — deliberately framed as "a platform capability, not a Deals implementation detail," pure data/functions with zero React/Next imports, intended for reuse across Shopping/Food/Travel/Explore/Recommendations/Affiliate/Merchant/Admin/Ads surfaces. **This one has explicit cross-platform intent**: `docs/architecture/BRAND_ASSETS.md` includes Android (Kotlin `BrandDefinition`) and iOS (Swift `Codable` struct) schema-mirroring sections for future native ports — unlike the Design System token layer (below), which is Web-only.

**Design System semantic color layer** — Web-only CSS-variable/Tailwind-token refactor for WCAG AA compliance (63 files, 251 class replacements). Explicitly scoped as "no landing-page, Android, iOS, backend, API, or business-logic changes" in its own audit doc — no cross-platform intent.

**Controller V2 (admin/backoffice RBAC)** — layered rollout:
- **Components 1-2 (Platform Owner + Identity) are live in production**, merged via PR `fb21ebe`. DB: `platform_owner` table with a partial-unique "exactly one active owner" constraint, plus SECURITY DEFINER `fn_grant_admin_role`/`fn_revoke_admin_role` enforcing owner-only escalation at the DB layer. One manual HTTP-acceptance check (BL-002) remains open but is explicitly non-blocking.
- **Currently-live authorization model** is a simple 4-tier role hierarchy (`analyst < moderator < admin < super_admin`) gating `/api/admin/*`, NOT the granular permission registry.
- **Component 3 (RBAC permission registry, 13-14 permissions) is built and reviewed but NOT merged to `main`** — confirmed via `git merge-base --is-ancestor` returning false. Its own status doc says "READY TO START · NOT STARTED" for the next phase.
- Zero leakage into any consumer-facing route, table, or shared middleware — `middleware.ts` only adds an auth-redirect for paths starting with `/admin`.

---

## 6. ADRs Added or Modified

| ADR / doc | What it establishes |
|---|---|
| **ADR-014** — Notification Unification | One persisted `notifications` table as the single source of truth for inbox, badge, and push (see §5) |
| **ADR-015** — Bug Reproduction Gate (Constitution Amendment I) | Mandates classifying every bug (REPRODUCIBLE/PARTIAL/NOT) against an 11-category checklist before any code change; RED-before-GREEN evidence required for any PASS verdict. Filed after 3 false-PASS incidents. Binding, cited by 14+ other docs. |
| **ADR-016** — AI Language Detection & Localization | Single shared `detectLang()` function, cross-platform in scope (Web backend authoritative; Android/iOS render responses verbatim rather than reimplementing detection). Companion doc filed at `android/docs/adr/0004-ai-language-consistency.md`. **Directly relevant to any future iOS AI/chat work.** |
| **ADR-017** — Service-role hardening strategy | Governs the deferred `FOUNDATION_END_service_role_hardening.sql` migration timing (Controller V2) |
| **Engineering Constitution Articles II-VI** | Process/governance rules (Runtime Identity Proof, Owner Observation Supremacy, Execution Path Equivalence, Assumption Discipline, Sprint Retrospective Rules) — how engineering verification is done in this repo, not product behavior |
| **BL-001** | Backlog item: repo runs two colliding ADR numbering series; a cleanup is planned but not done. `ADR-015` is explicitly protected from renumbering. |

---

## 7. UI/UX Changes

- **Home immersive background** — iterated V2 → V5 (calmer grade, hide Home logo on immersive variant, drop `background-attachment: fixed`), desktop/tablet only.
- **Login page redesign** — two-column brand card: header uses the Tappy mascot ("wave" pose) as the brand mark instead of the old logo; left column has a hero mascot image + floating emoji chips + 4 feature bullets; right column has the sign-in card (Google/Zalo/Guest, Facebook gated off, in-app-browser-detection fallback for Zalo/FB/Instagram/Line/TikTok/WeChat webviews, Email-OTP present but hidden from the main card by a flag). Now consumes the new semantic design tokens.
- **`/startup` landing page** — full public marketing page (Hero/WhatIs/Vision/Overview/Features/Screenshots/Technology/About/Contact sections), bilingual EN/VI with `Organization` JSON-LD, ~30+ commits of copy/visual polish (founder profile, hero artwork iterations, mascot/logo swaps) but no structural changes since the initial build.
- **Mobile Explore header** — gained the "Đăng bài" (post) CTA alongside the feed-type filters (For You/Following/Latest).
- **Design System semantic color tokens** — replaced raw Tailwind gray/primary classes with contrast-guaranteed semantic tokens (`bg-interactive`, `text-link`, `text-content-secondary`, etc.) for WCAG AA; interactive-blue shifted one shade darker (`#007AFF` → `#0062CC` for text/fill contexts), brand hue itself preserved for decorative use.
- **Android Web Parity Sprint** (`d879acc`) — brought Android's Chat (positional photo galleries, TripPlanCard, CTA buttons, emoji picker, quick prompts, voice input, text-only composer), Home (exact hero-greeting engine — 7 time-of-day slots × templates × weekday/weekend, vi/en), Reviews (comment replies/reactions, notification time sections, attached-sound card, self-profile screen, split-bill), and Music (SoundSheet, trim-aware player) substantially closer to Web visually and behaviorally.

---

## 8. Security / Auth Changes

- **Next.js CVE-2025-29927 — patched and confirmed live.** `package.json` shows `14.2.35`. (An earlier check this session found it still at `14.2.5` — that was checking a different, stale branch state; re-confirmed now on current `main`.)
- **Scam Shield SSRF bypass — fixed (`3e7dbf0`).** Root cause: `checkUrl()`'s safety guard (`isSafeHttpsUrl()`) rejects any `http:` URL purely by scheme, before inspecting the hostname. The pre-fix code treated an "unsafe because http" result as a license to silently upgrade to `https:` **without re-running the check** — so `http://127.0.0.1/...` or `http://169.254.169.254/...` (cloud metadata endpoint) would take that upgrade branch and reach downstream providers unchecked. Fix: upgrade the scheme *first*, then re-validate the upgraded URL, so private/loopback/link-local targets are now actually caught by the existing IP-range checks. 3 regression tests added.
- **CSP allowlist** now includes `graph.zalo.me` (Zalo profile API, client-side fetch required because Zalo IP-gates that endpoint to Vietnam) and `vercel.com` (the Blob SDK's separate hardcoded upload host) — both were live-breaking omissions before the fix (see §3).
- **Zalo OAuth is now platform-keyed end-to-end**: `platform` param strictly allowlisted (`ios`/`android`/else `web`), carried via httpOnly cookie through `/api/auth/zalo` → `/callback` → `/auth/zalo-finish` (client-side, for the IP-gating reason above) → `/complete` → `/auth/confirm`, which redirects to a platform-specific custom scheme with tokens in the URL **fragment** (never sent to servers/logs). **Any new client (including iOS, if it ever needs its own value) must be added to this backend allowlist explicitly** — it's a hard-coded set, not open.
- **Controller V2 authorization** — SECURITY DEFINER functions (`fn_grant_admin_role`, `fn_revoke_admin_role`, `fn_is_platform_owner`) enforce owner-only escalation at the database layer, not just in application code; `platform_owner` has zero RLS policies (deny-by-default, service-role-only access) and a partial unique index guaranteeing exactly one active owner row. A deferred hardening migration (not yet applied, intentionally) will later revoke `service_role`'s direct INSERT/UPDATE/DELETE on `admin_roles`/`platform_owner`, forcing all future writes through the SECURITY DEFINER functions only.
- **Account deletion — important accuracy note.** `/delete-account` (new page) is a policy/request page, not a self-service delete: it explicitly states deletion is manually processed by support after email verification, and no DELETE API exists anywhere in the backend. **Separately, the page's own text and its commit message claim Android has a "Request account deletion" Settings menu item that opens a prefilled support email — this claim does NOT match the Android source actually in this repo.** `SettingsScreen.kt`'s "Other" section only has Terms + Privacy + Sign Out; the only account-deletion text anywhere in the Android app is one sentence inside the Privacy Policy screen, with no button or intent-based email flow. This is a real discrepancy between what the Web copy asserts and what Android actually ships — worth an owner note, independent of any iOS work.

---

## 9. AI Capability Changes

**Language detection (ADR-016)** — single shared `detectLang()` (`src/lib/ai/intent.ts`), called once per chat request, threaded into system-prompt building, every tool's execution, tool cache keys, and TTS voice selection. Detection is **stateless per-message**, not per-conversation (a language switch mid-chat gets that message's language back). Mechanism: script-based check first (CJK/kana/hangul/Arabic/Thai), then for Latin script a **word-level** analysis — critically, a **capitalized** accented word (a proper noun like "Phú Quốc") does not count as a Vietnamese signal, only lowercase accented words plus a curated Vietnamese function-word list do. An explicit "answer in English" / "trả lời bằng tiếng Việt" instruction always overrides detection. **This module is explicitly declared cross-platform-authoritative on the Web backend** — Android/iOS are meant to render backend responses verbatim, never reimplement their own detection (per ADR-016 §5).

**Chat enrichment** — architecture: the LLM writes prose only; the app deterministically injects each place's photo/review/order links immediately after that place's own mention in the text, using a tiered place-name-matching algorithm (canonical header match → exact tool-name match → distinctive segment match → token-overlap last resort) since the model often shortens/respells names. Places are accumulated across every tool call in a multi-search trip plan, not just the last one. Structured markers `[TAPPY_PLAN]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]` are a hard upper bound injection never writes past, so enrichment cannot corrupt those blocks. Token cap was raised (chitchat 300 / planning 4096 / image 1024 / general 3072) in tandem with the prompt no longer asking the model to write link markdown inline itself.

**Flight links** — always emits both a Traveloka deep link (with date if known) and a Google Flights search link; falls back to a ~7-day-out default date on any error path so links stay valid without live fare data.

**TTS voice selection** — strictly maps the detected reply language to a matching device voice; if no matching-language voice exists, returns null and the UI shows a "no voice" notice rather than falling back to a mismatched-language voice.

**LLM provider/model — no change in this window.** Still Anthropic via `@ai-sdk/anthropic`, `claude-haiku-4-5` (pinned to `claude-haiku-4-5-20251001` for smart/planning/vision roles), role-based config overridable via `LLM_FAST_MODEL`/`LLM_SMART_MODEL`/`LLM_PLANNING_MODEL`/`LLM_VISION_MODEL` env vars. No other provider referenced anywhere in `src/lib/ai`.

---

## 10. Commerce Capability Changes

**Deals — went from a hardcoded curated list to a full DB-backed commerce surface** across 3 migrations (`20260724_partner_deals*.sql`) + a translations migration (`20260731_partner_deal_translations.sql`):
- `partner_deals` table: `partner_name/slug/type`, `category`, `title/description`, `official_url` (https-only, checked), `banner/logo_image`, `display_order`, `is_active`, `start_at/end_at` (time-windowed visibility), `country_code`, `is_featured`, `click_count`, `affiliate_code` (placeholder, unused), `metadata jsonb` (currently only holds a `promotion` sub-object: discount label, voucher code).
- Public contract `GET /api/deals?lang=&country=`: `category` (localized) vs `categoryKey` (stable vi base, for styling) are deliberately separate fields — this split exists because color/styling logic keys off `categoryKey` and must not break when the display language changes.
- Localization: a separate `partner_deal_translations` join table (locale-keyed rows, NOT per-locale columns), field-by-field overlay onto the Vietnamese base row — a missing translated field falls back to the vi text rather than showing a gap. Explicitly framed in its own commit as "backend localization for partner deals (Web/Android/iOS)" — a shared cross-platform contract.
- Brand/logo resolution: `src/config/brandRegistry.ts`, a diacritic/punctuation-insensitive fuzzy matcher over a 7-partner registry (Shopee, ShopeeFood, TikTok Shop, Grab, Be, Agoda, Booking.com), each with logo asset, background variant, optical-scale correction, and licensing provenance fields. CI-enforced via a dedicated `validate:brands` job (no duplicate ids/aliases, asset files must exist, scale bounds, provenance completeness).
- Click tracking: a public `POST /api/deals/[id]/click` calls a SECURITY DEFINER RPC (`increment_deal_click`) since RLS denies direct client writes to the table; always returns success so link-opening is never blocked.
- Admin CRUD: `/api/admin/deals*`, admin-role-gated, zod-validated, audit-logged, with its own Blob upload endpoint for images.

**Currency** — exchange-rate display now scales decimal precision by magnitude instead of rounding to the target currency's fixed decimals (fixes weak→strong pairs rendering as `0,0000`); a missing/invalid currency now throws a typed error and shows a warning instead of silently converting at a wrong 1:1 rate. A parity fix landed on Android separately for the same underlying bug class.

---

## 11. Android Parity Changes (cross-platform contract facts)

These are real backend contracts Android's build-out revealed — not Android-only UI details:

- **Review creation**: `POST /api/reviews` with a `MusicSelectionDto` (`version, trackId, startSec, volume`) that has **no default values on any field** — the backend hard-rejects a missing/mismatched `version`, and the client's JSON encoder must not omit default/zero fields for this payload (a real trap, pinned by a permanent wire-contract test on Android).
- **Photo upload**: `POST /api/reviews/upload`, multipart field `file`, one file per request, `{url}` response; server re-sniffs magic bytes regardless of client-declared MIME.
- **Link sharing**: YouTube gets a client-derivable thumbnail (`i.ytimg.com/vi/{id}/maxresdefault.jpg`); TikTok/Facebook require `GET /api/explore/oembed?url=` since those providers block direct client-side fetch (`{thumbnail_url, title}`).
- **Comments**: `POST/DELETE /api/reviews/{id}/comments`, threaded replies via `parent_comment_id`, reactions via `POST/DELETE /api/comments/{id}/reactions` with `{reaction}` free-form string.
- **Follow**: `POST /api/users/{id}/follow` (no body) → `{following, follower_count}`; profile `GET /api/users/{id}` returns `is_following/is_self/follower_count/following_count/review_count` alongside base profile fields.
- **Feed pagination**: plain `page`/`limit`, no cursor or total count — end-of-feed is inferred client-side by a short page; **dedupe-by-id across pages is a client responsibility on every platform**, since inserts between requests can shift the window and repeat a row.
- **Watch analytics**: `POST /api/reviews/{id}/interact` with `{watch_seconds, completion_rate}` — backend requires ≥3s watched before accepting, silently ignores anonymous callers, rate-limits 10/min.
- **Subscription status**: `GET /api/subscription` → `{isPro, status, currentPeriodEnd, freeDailyLimit, todayMessageCount, remaining}` — Android currently only consumes 3 of the 6 fields; the other 3 (`status`, `currentPeriodEnd`, `todayMessageCount`) are available on the wire for any client without a backend change.
- **App Connections**: `GET /api/integrations` → `{integrations: [{provider, connected, connected_at}]}`.
- **Suggested prompts**: `GET /api/suggested-prompts` → includes `category`/`emoji`/`gradient` fields that Android currently drops (decodes only `text`/`textEn`) — available on the wire if a client wants richer chip rendering.
- **Zalo login end-to-end**: Custom Tab (or equivalent) → `platform=`-keyed backend flow → deep-link redirect with tokens in the URL **fragment**, using a platform-specific custom scheme registered on each client. A client's auth code must parse the fragment directly (not assume a PKCE `?code=` redirect) — this exact gap caused Android's Zalo login to silently fail to create a session until fixed.

---

## 12. Database Migrations (full reference)

8 new migrations since `d57f5ef`, all additive (no destructive changes to existing tables):

1. **`20260720_comment_replies_reactions.sql`** — `review_comments` gains `parent_comment_id` (self-FK, 1-level nesting); new `comment_reactions` table (`comment_id, user_id, reaction` free-form 1-20 chars, unique per user+comment, RLS: public read, owner write).
2. **`20260722_notification_realtime.sql`** — no schema change; adds `review_likes/review_comments/user_follows/review_milestones` to the Realtime publication (interim badge fix before the full table existed).
3. **`20260724_partner_deals.sql`** — creates `partner_deals` base table + `updated_at` trigger; RLS public-read-if-active-and-in-window; 7-partner seed.
4. **`20260724_partner_deals_hardening.sql`** — adds `partner_slug` (immutable via trigger, unique), `partner_type`, `affiliate_code`, `is_featured`, `click_count`; adds SECURITY DEFINER `increment_deal_click()` granted to `anon, authenticated`.
5. **`20260724_partner_deals_metadata.sql`** — adds `metadata jsonb` (currently only the `promotion` sub-object).
6. **`20260725_notifications_unification.sql`** — creates the full `notifications` table (see §5/§6), RLS recipient-only, added to Realtime publication with `REPLICA IDENTITY FULL`.
7. **`20260731_partner_deal_translations.sql`** — creates `partner_deal_translations` (locale-keyed join table, unique per deal+locale), RLS mirrors the parent deal's visibility.
8. **`20260803_platform_owner.sql`** (+ deferred `FOUNDATION_END_service_role_hardening.sql`, intentionally NOT yet applied) — creates `platform_owner` (single-active-owner constraint, zero RLS policies, service-role-only grants) and 3 SECURITY DEFINER functions enforcing owner-only privilege escalation at the DB layer.

**Security-relevant note**: only two SECURITY DEFINER, publicly-callable functions exist across all 8 migrations — `increment_deal_click` (deliberately public, limited to a counter increment) and the three `platform_owner` functions (deliberately NOT public — `service_role` only, with escalation guards baked into the function bodies themselves, not just RLS).

---

## Appendix — Corrections to prior working assumptions

For anyone continuing from the earlier, smaller-scoped audit this session:
- **Commit range was undercounted** (135 vs. actual 213) — re-derive any future range check directly rather than trusting a cached count.
- **"No new migrations" was wrong** — 8 real migrations landed (§12).
- **"Scam Shield has no nav entry point" was wrong** — Home now links to it directly.
- **"`/delete-account` doesn't exist" is now outdated** — it exists, but is confirmed to still be a request/policy page, not a self-service delete API (§8).
- **Android's claimed "Request account deletion" Settings menu item does not exist in this repo's Android source** — a real Web-copy-vs-Android-reality mismatch, independent of iOS, worth flagging to the owner.

No iOS code was read, audited, or modified as part of this document.

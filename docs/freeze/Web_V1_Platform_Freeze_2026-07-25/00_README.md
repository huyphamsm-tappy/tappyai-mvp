# Web V1 Platform Freeze — 2026-07-25

**Package ID:** `Web_V1_Platform_Freeze_2026-07-25`
**Snapshot timestamp:** 25 July 2026, 17:10 (Project Time)
**Frozen commit:** `79d05f351f20550e6f4e981cb9e4c3e29bf8837b` (`origin/main`)
**Production origin:** `https://tappyai-mvp.vercel.app`
**Status:** Web V1 — Feature Complete. Web is now the **reference implementation** for Android.

---

## What this package is

This is the frozen engineering reference for the TappyAI Web platform as it exists
in production at the snapshot timestamp. It is the **single authoritative source**
for Android development.

It documents **what is actually deployed** — not the roadmap, not experiments, not
abandoned work.

## What this package is NOT

- Not a design document for future features
- Not a wishlist or backlog (genuine remaining work is isolated in `12_Open_Items.md`)
- Not a substitute for reading the code — every claim here cites file paths so the
  code stays the ultimate authority

---

## Snapshot provenance (how the commit was established)

The frozen commit was not assumed — it was verified against live production:

```
GET https://tappyai-mvp.vercel.app/api/version
→ 200 {"v":"79d05f351f20550e6f4e981cb9e4c3e29bf8837b"}
```

`NEXT_PUBLIC_BUILD_ID` is baked from `VERCEL_GIT_COMMIT_SHA` at build time
(`next.config.mjs`), so this response is emitted by the running deployment itself and
identifies the exact source revision serving production.

`git rev-parse origin/main` → `79d05f351f20550e6f4e981cb9e4c3e29bf8837b` — identical.

**Therefore: `origin/main` == deployed production == this freeze.**

### ⚠ Trap for anyone re-verifying this package

The repository's **primary working directory was checked out on `feat/backoffice-phase0`
(`807d77b`) at freeze time, which is 192 files behind production.** Reading the primary
working directory will give you a materially wrong picture of production — it is missing
the entire Deals V1 module, the reviews feed/profile refactor, the stream-enrichment
rewrite, TTS voice selection, the finance library, and their tests.

All analysis in this package was performed against a clean checkout of `79d05f3`.
To reproduce, check out the frozen commit into its own worktree; do not trust the
primary tree.

---

## Document index

| # | Document | Covers |
|---|---|---|
| 01 | [Project Overview](01_Project_Overview.md) | Product, environments, deployment, runtime topology |
| 02 | [Architecture](02_Architecture.md) | Tech stack, layering, backend ownership, streaming topology |
| 03 | [Backend Contracts](03_Backend.md) | Every API endpoint: request, response, auth, business rules |
| 04 | [Database](04_Database.md) | Tables, relationships, RLS, functions, indexes, storage |
| 05 | [AI System](05_AI.md) | Prompt builder, memory, streaming, enrichment, tools, caching |
| 06 | [UI / UX](06_UI_UX.md) | Every production screen and cross-cutting UI system |
| 07 | [Feature Inventory](07_Features.md) | Every implemented feature by module, with production status |
| 08 | [Bug History](08_Bug_History.md) | Chronological engineering log of fixed production bugs |
| 09 | [Architectural Decisions](09_ADRs.md) | Why the system is built the way it is |
| 10 | [Testing](10_Testing.md) | Test inventory, coverage posture, how to run |
| 11 | [Android Migration Guide](11_Android_Migration.md) | Per-feature READY / NATIVE / WEB-ONLY / N-A classification |
| 12 | [Open Items](12_Open_Items.md) | Known limitations · technical debt · future enhancements (kept separate) |
| 13 | [Release Gate](13_Release_Gate.md) | End-to-end validation evidence for the freeze |
| 14 | [Appendix](14_Appendix.md) | Env vars, glossary, command reference, file map |
| ▸ | [Post-Release Web Fixes](#post-release-web-fixes) | Web changes released **after** this freeze that Android/iOS must mirror (appended per production release) |

---

## The three project principles

Every document in this package is written against these, in this order.

### Priority 1 — Cost Optimization
Minimise AI token usage, third-party API calls, storage, bandwidth, and redundant
processing. Where the codebase makes a deliberate cost trade-off, this package labels it
**`[COST]`**.

### Priority 2 — Security
Preserve authentication, authorization, RBAC, privacy, secret management, production
safety, and backend ownership of business logic. Security-relevant behaviour is labelled
**`[SEC]`**.

### Priority 3 — Stability
Production stability, predictable behaviour, backward compatibility, graceful fallback,
defensive programming. Labelled **`[STAB]`**.

**No optimization is permitted if it sacrifices stability.** Where a cost optimization was
rejected or bounded for stability reasons, this package records that explicitly.

---

## Evidence standard used in this package

This package distinguishes levels of confidence. It does not claim "PASS" without evidence.

| Marker | Meaning |
|---|---|
| **VERIFIED (live)** | Confirmed against the running production deployment during the freeze |
| **VERIFIED (repo)** | Confirmed by reading the frozen source at `79d05f3` |
| **VERIFIED (automated)** | Covered by an automated test that was executed and passed during the freeze |
| **NOT VERIFIED** | Present in source but not confirmed at runtime during the freeze |
| **PRODUCT UAT: OWNER** | Functional acceptance is the product owner's call, not this package's |

Anything not carrying one of these markers should be treated as **NOT VERIFIED**.

---

# Post-Release Web Fixes

Web changes **released to production after** the freeze snapshot (`79d05f3`, 2026-07-25). This
section is the running log of post-freeze web releases that **Android and iOS must mirror** to
stay in parity — appended per release; prior freeze content above is unchanged. Newest last.

## Remove TikTok V1 (Released)

- **Production commit(s):** `547f418` (`feat(reviews): unify link-video pipeline — V1: upload + YouTube + TikTok`) → `b68be0d` (`feat(web): remove TikTok from V1 video pipeline`). **VERIFIED (repo)** on `origin/main`.
- **What changed:** TikTok removed as a video source in V1. Video link providers are now a single backend source of truth: `GET /api/config` → `video.linkProviders: ["youtube"]`. YouTube poster downgraded `maxresdefault` → `hqdefault` (matches the resolver). Legacy TikTok/Facebook posts still decode/render (backward-compatible; DB `source_type` CHECK unchanged — still allows `tiktok`).
- **Mobile port (must mirror):** `docs/mobile-patches/README.md` + `android-remove-tiktok-v1.patch` / `ios-remove-tiktok-v1.patch`. Apply on each platform branch; default `supportedLinkProviders = ["youtube"]` and runtime-wire `setSupportedLinkProviders(...)` from `/api/config`. Keep `ReviewSourceType`/`ExternalSource` `tiktok`/`facebook` cases for legacy read.

## ADR-014 Notification Unification (Released)

- **Production commit:** `8a1be53` on `main` · **Deployment:** `tappyai-ott2fq2x4` (Vercel Production, Ready) → www.tappyai.com · **Date:** 2026-07-26. **VERIFIED (live)**.
- **What changed:** one persisted `notifications` table = the single source of truth for **Inbox + unread badge + device push**, shared cross-platform. `emitNotification()` is the only writer (persist row + dispatch push + record `push_status`). All 11 generators (like/comment/follow/milestone/deal/morning_brief/weekly/travel/lunch/price/broadcast + system) migrated to it. Web adds an app-level `NotificationProvider` (one Realtime subscription on `notifications`, filtered `user_id=me`) so the unread badge is correct on **every route** (fixes the off-route/Home badge bug); read-state is now **server-side (`read_at`)**. Full design: `docs/architecture/ADR-014-notification-unification.md`.
- **DB migration:** `supabase/migrations/20260725_notifications_unification.sql` — applied + verified on production (additive, idempotent): table + 3 indexes + RLS (select/update own; **no client INSERT** — only service-role mints rows) + `supabase_realtime` publication + `REPLICA IDENTITY FULL`.
- **API contract v1 (Android/iOS consume verbatim — no platform-specific endpoints):**
  - `GET /api/notifications` → `{ notifications: [{ id, type, category, title, body, actor: {id,name,avatar}|null, entity_url, image_url, data, read_at, created_at }], unread_count }` (paginated `?limit`≤100, `?before=<ISO>` cursor).
  - `POST /api/notifications/read` → server-side `read_at` (body `{ ids? }`, or omitted = mark-all).
  - Auth: cookie session (web) **or** `Authorization: Bearer <supabase-jwt>` (native). RLS scopes every read/update to the caller.
- **Production verification:** **VERIFIED (live)** — Follow, Like, Comment, Deal cron, Morning-Brief cron all PASS on production. Each: `notifications` row written, unread badge updates **live via Realtime on any route**, Notification Center renders (social + generic), server mark-read drops the badge, `push_status=sent`. Cron endpoints (deal/morning-brief + weekly-recap/travel-reminder/lunch-reminder) deployed + **401-protected** on prod (execution proven on the branch preview). No console errors. E2E test data cleaned + verified (0 orphan rows).
- **Mobile parity (must mirror):** consume the v1 `GET /api/notifications` + `POST /api/notifications/read` for Inbox history + unread badge (backend-first per ADR-011). Device push continues through the same server pipeline. Retention/pagination + push-retry worker are deferred (see `12_Open_Items.md` scope).

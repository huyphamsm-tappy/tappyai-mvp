# 01 — Project Overview

**Frozen commit:** `79d05f351f20550e6f4e981cb9e4c3e29bf8837b` · **Snapshot:** 25 July 2026 17:10.

---

## 1. What TappyAI is

TappyAI is a Vietnamese-first, mobile-first consumer super-app centered on an **AI lifestyle
assistant** (Tappy). Around the chat core sit a TikTok-style **short-video reviews feed**, a
**music/original-sound** library, **deals**, **fortune-telling**, **utility tools** (currency,
translate, OCR scan, split-bill, group dining), a **games** hub, and a **profile/personalization**
system. A **back office** provides RBAC-gated analytics and content administration.

The product surface is deliberately **config-driven**: quotas, upload limits, the auth provider
list, onboarding catalogs and feature flags all live server-side and are served to native clients
by `GET /api/config`, so a product change ships without an app release.

**Primary market:** Vietnam. Default locale is Vietnamese; English is the second locale. Time,
currency, quota-day boundaries and content are all VN-centric (day boundary =
`Asia/Ho_Chi_Minh`).

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 14.2.5** (App Router, RSC + client components) |
| Language | TypeScript 5.5 (strict; build fails on type/lint errors) |
| UI | React 18.3, Tailwind 3.4, a small shadcn/Radix primitive set, lucide-react |
| Backend runtime | Next.js Route Handlers on Vercel (Node + a few Edge routes) |
| Database / auth | **Supabase** (Postgres 17.6, Auth, Realtime, RLS) |
| Object storage | **Vercel Blob** (Supabase Storage is not used at all) |
| AI | Anthropic Claude via the Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), behind an in-house provider facade |
| Payments | Stripe (web) + Apple IAP StoreKit 2 (iOS) — both flag-gated off in V1 |
| Push | web-push / VAPID |
| Analytics | PostHog + an in-house event envelope → `user_events` |
| Games | SuperTux WASM (COOP/COEP isolated) |
| Testing | Vitest + Testing Library |

Full dependency list: `14_Appendix.md`.

---

## 3. Environments

| Environment | URL | Notes |
|---|---|---|
| **Production** | `https://tappyai-mvp.vercel.app` (apex `tappyai.vn` / `.com` 308-redirect in) | Serves the frozen commit — verified via `/api/version` |
| Preview | Vercel per-branch preview deploys | Used for UAT |
| Local | `next dev` on :3000 | **Blob and Serper keys are absent locally** — a localhost upload/search failure is NOT a prod bug (see `14_Appendix.md`) |

**Verified at freeze:** `GET https://tappyai-mvp.vercel.app/api/version` →
`{"v":"79d05f3…"}`, identical to `git rev-parse origin/main`. See `13_Release_Gate.md` for the
full provenance chain.

---

## 4. Deployment

- **Host:** Vercel. Build command `next build`; **build gates are enforced** — production builds
  fail on any TypeScript or ESLint error (`ignoreBuildErrors`/`ignoreDuringBuilds` were
  deliberately removed; see `next.config.mjs` and `08_Bug_History.md` `9b7a8d3`).
- **Commit SHA is baked into the client bundle** as `NEXT_PUBLIC_BUILD_ID` from
  `VERCEL_GIT_COMMIT_SHA`; `VersionWatcher` compares it against `/api/version` and self-reloads
  a stale tab — the fix for the recurring "iOS Safari shows an old build" problem. **[STAB]**
- **Cron:** 4 jobs scheduled in `vercel.json` (`deal-notifications` 07:30 VN, `morning-brief`
  08:00 VN, `price-check` daily, `analytics-snapshot` 00:05 VN). 4 further cron *routes* exist
  but are unscheduled (`03_Backend.md`, `12_Open_Items.md`).
- **Security headers** (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) are set in `next.config.mjs` and verified live in `13_Release_Gate.md`.
- **Database migrations are applied manually via the Supabase SQL Editor** — there is no
  automated migration pipeline. This is the root of the schema-drift risk documented in
  `04_Database.md`.

---

## 5. Backend topology

```
                    ┌─────────────────────────────────────────────┐
   Browser / TWA →  │  Next.js on Vercel (RSC + Route Handlers)    │
   Android (Bearer) │                                              │
                    │  middleware.ts  → cookie refresh, /admin gate│
                    │  /api/**        → business logic + auth      │
                    │  /api/config    → product contract for native│
                    └───────┬───────────────┬───────────────┬──────┘
                            │               │               │
                    ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼───────┐
                    │  Supabase    │ │ Anthropic   │ │ Vercel Blob  │
                    │  PG+Auth+RLS │ │ (via facade)│ │ video/audio/ │
                    │  +Realtime   │ │             │ │ img/avatars  │
                    └──────────────┘ └─────────────┘ └──────────────┘
       + Serper, Google Places, Travelpayouts, Stripe, web-push, wttr.in,
         open.er-api.com, OSM/Nominatim, Zalo, Google Calendar (see 03_Backend §3.10)
```

**Authorization is layered:** `middleware.ts` refreshes the Supabase session (using
`getUser()`, not `getSession()`) and redirects `/admin` pages when unauthenticated; each route
handler re-checks auth via `getRequestUser(req)` (Bearer or cookie); RLS enforces row ownership
at the database; the service-role client (`createAdminClient`) is the only path to
deny-by-default tables and is the single most sensitive secret. Details: `03_Backend.md`,
`04_Database.md`.

---

## 6. AI pipeline (summary — full detail in `05_AI.md`)

Chat requests flow: **flood-guard → validate → resolve auth/quota → truncate history →
intent-classify (picks model role, maxTokens, maxSteps) → `streamText` with a tool forced on
step 0 → deterministic enrichment repositions place photos/links → stream to client → client
parses `[TAPPY_PLAN]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]` and renders.**

Two architectural laws govern it:
1. **All LLM calls go through the `AI` facade**; vendor SDKs live only in `providers/claude.ts`,
   enforced by CI (`scripts/architecture/check.mjs`).
2. **The LLM writes prose; the system owns all structured output** (links, images, place cards,
   plan photos, layout) — established across the enrichment bug thread and worth ~1.6K tokens
   saved per multi-place reply.

At the freeze, only **Claude Haiku 4.5** is configured, so the four-role tiering is machinery
without differentiated models yet.

---

## 7. Repository shape

- `src/app/**` — pages (58) + API route handlers (91) + shell files.
- `src/components/**` — 52 shared components (largest: `ChatInterface.tsx`, 1466 lines).
- `src/lib/**` — domain libraries (ai, admin, analytics, auth, background, boi, deals, explore,
  finance, i18n, integrations, memory, notifications, platformLinks, preferences, qr,
  recommendation, security, tracking, tts, ui).
- `src/modules/music/**` — the one clean-architecture feature module (barrel-only imports).
- `supabase/migrations/**` — 52 SQL migrations (manual-apply model).
- `android/**`, `ios/**` — native clients (Android: 117 uncommitted changes at freeze; see
  `11_Android_Migration.md`).
- `docs/**` — architecture docs, release notes, and this freeze package under
  `docs/freeze/Web_V1_Platform_Freeze_2026-07-25/`.

See `14_Appendix.md` for the full file map and environment-variable inventory.

# 02 — Architecture

**Frozen commit:** `79d05f3`. This chapter covers the layering, ownership boundaries, and the
enforced architectural rules. Screen-level and route-level detail live in `06_UI_UX.md` and
`03_Backend.md`.

---

## 1. Layering

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation      React components + pages (src/app, src/components)
│                   Client owns rendering only. No business rules here.
├──────────────────────────────────────────────────────────────┤
│ Product config    src/lib/config/product.ts  →  GET /api/config
│                   Single source of quotas/limits/flags/catalogs.
├──────────────────────────────────────────────────────────────┤
│ API / business    src/app/api/**/route.ts
│                   Auth, validation, ownership, side effects, quotas.
├──────────────────────────────────────────────────────────────┤
│ Domain libraries  src/lib/**  +  src/modules/music
│                   AI facade, recommendation, preferences, memory, etc.
├──────────────────────────────────────────────────────────────┤
│ Data / auth       Supabase (Postgres + RLS + Auth + Realtime)
│                   Vercel Blob (object storage)
└──────────────────────────────────────────────────────────────┘
```

Two things cut vertically through every layer: **auth** (cookie or Bearer, resolved by
`getRequestUser`, enforced again by RLS) and **the three project principles** — every layer is
expected to preserve cost, security and stability in that priority order.

---

## 2. The four enforced architectural rules

These are not conventions; three of them are machine-checked or build-gated.

### 2.1 Backend owns business logic, clients own presentation
Product values live once in `src/lib/config/product.ts`. The web imports them at build time;
native clients read `/api/config`. Enforcement is always server-side — a tampered client changes
what it shows, never what it can do. (`01_Project_Overview.md`, `03_Backend.md` §1.)

### 2.2 One AI facade; vendor SDKs quarantined — **CI-enforced**
All model access is through `AI` from `@/lib/ai/llm`. `@ai-sdk/anthropic` may be imported only in
`llm/providers/claude.ts`. `.github/workflows/architecture-guard.yml` runs
`scripts/architecture/check.mjs` on every push/PR to reject vendor-SDK imports outside the
provider, hardcoded model IDs, and facade bypasses. (`05_AI.md` §1.3.)

### 2.3 The LLM writes prose; the system owns structured output
Links, images, place cards, plan photos and layout are injected deterministically by
`streamEnrichment.ts`, never trusted from the model. This is a correctness, cost and security
decision forged across the six-commit enrichment bug thread. (`05_AI.md` §7, `08_Bug_History.md`.)

### 2.4 Build gates are real — **build-enforced**
`next.config.mjs` deliberately does **not** set `ignoreBuildErrors`/`ignoreDuringBuilds`, so a
production build fails on any TypeScript or ESLint error. A green build is genuine evidence that
the whole surface type-checks. (`13_Release_Gate.md` Gate 2.)

---

## 3. Module boundaries

### 3.1 The music module — the reference clean-architecture slice
`src/modules/music/**` is the only fully-modularized feature: types / repository / services /
hooks / components / api. **Consumers import only from the barrel** `index.ts` (client) or
`server.ts` (route handlers). Its repository talks directly to Supabase; the `music_usage` table
deliberately has **no FK to feature tables** — that FK-lessness *is* the module boundary, letting
any feature reuse a sound by ID without coupling. (`04_Database.md` §1.5.)

### 3.2 Everything else
Other features live as `src/app/<feature>` pages + `src/lib/<domain>` libraries, without the
strict barrel discipline. This is a deliberate MVP trade-off, not an accident.

### 3.3 Personalization is three overlapping stores (debt)
`lib/userMemory.ts` (legacy, feed-only), `lib/memory/memoryService.ts` (Tappy Knows), and
`lib/preferences/*` (implicit weighted signals) coexist, plus two recommendation libs
(`lib/recommendation/` live, `lib/explore/recommendation.ts` apparently dead). Flagged for
consolidation in `12_Open_Items.md`.

---

## 4. Data ownership and safety model

- **RLS everywhere.** Every repo table has RLS enabled. Ownership is `auth.uid() = user_id`;
  public reads are explicit policies; analytics/admin tables are deny-by-default (service-role
  only). The one dangerous exception is `profiles`, which is world-readable in production — which
  is *why* `email` and `stripe_customer_id` were physically removed rather than policy-gated.
  (`04_Database.md` §3.)
- **Counters are denormalized and trigger-maintained** (`like_count`, `comment_count`,
  `save_count`, follow counts), with the trigger functions made `SECURITY DEFINER` after they
  were found silently counting 0 under RLS. Feed score is computed, never stored.
- **Aggregate-only exposure** for privacy: save/follow *counts* come from SECURITY DEFINER RPCs
  so the app can show "N people saved this" without ever revealing *who*.
- **Storage is 100% Vercel Blob**; large media uploads go client-direct via signed tokens to
  bypass the serverless body cap. (`04_Database.md` §7.)

---

## 5. Streaming architecture

The chat streaming topology is the most intricate part of the system and is documented in full in
`05_AI.md` §6–§9. The architecturally significant points:

- **Server buffers post-tool text** to reposition enrichment per-place, then re-emits it — so the
  place-list portion of a reply appears at end-of-generation rather than typing live. This is an
  accepted UX trade-off in exchange for correct grouping.
- **Client rendering is decoupled from network burst size** via `useSmoothText` (a rAF
  typewriter), so chunky network delivery still reads as smooth typing.
- **Structured blocks (`[TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`) are a protocol** parsed on
  the client and never written into by server-side injection.

Android must reproduce these behaviours, not the intermediate implementations — see
`11_Android_Migration.md` §5.

---

## 6. Why these choices (pointer)

The rationale for each major decision — backend ownership, localStorage for language, commerce
abstraction, the streaming/buffering trade-off, the self-healing media watchdog, the fallback
chains — is documented as numbered ADRs in `09_ADRs.md`.

---

## 7. Known architectural debts (pointer)

Per-instance in-memory rate limiting and tool caching, the chat quota fail-open, three parallel
personalization stores, the manual-migration model and resulting schema drift, and the absence of
CI test-gating are all real and are catalogued in `12_Open_Items.md`. They are recorded here so
the architecture is not read as cleaner than it is.

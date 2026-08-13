# Controller V2 — Component 9b: Typed Configuration — CONTRACT

**Status:** CONTRACT — authoritative and current · **Date:** 2026-08-13
**Closes:** audit finding **D5** — *"No boot-time configuration validation"*
**Owner decisions:** 2026-08-13 — **Q1 = A** (fail-fast at build time) · **Q2 = A** (five required variables)

---

## 1. What D5 actually says

> **D5:** *"44 distinct `process.env.*` references across `src`, accessed ad hoc. **There is no central typed config module and no startup assertion.** Consequence: a missing or misspelled variable fails at **request** time … rather than at **deploy** time. The prior `NEXT_PUBLIC_SITE_URL` incident is exactly this failure mode — **a wrong value** that everything except one production code path tolerated silently."*

Two things follow, and only two: a **central typed config module**, and a **startup assertion**. D5's own example is a *wrong* value, so presence alone is not enough — well-formedness matters.

Measured 2026-08-13: the count has grown from 44 to **55 distinct variables / 123 runtime accesses**. The historical audit line is left unedited; this is the current number.

## 2. Required set — exactly five

Owner decision Q2 = A:

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no database, no requests |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no auth |
| `SUPABASE_SERVICE_ROLE_KEY` | every privileged path |
| `ANTHROPIC_API_KEY` | the product is the assistant |
| `NEXT_PUBLIC_SITE_URL` | D5's own incident; also the input to the admin same-origin guard |

**A variable is NOT required merely because a consumer reads it without a fallback, or because it exists in Production.** That distinction is load-bearing: 31 variables are read without a fallback, and **12 of those are absent from Production today** (Apple IAP ×4, Google Web Risk ×2, LLM overrides ×3, PostHog, legacy Upstash names ×2). Requiring them would fail every deploy. Feature-specific variables of inactive capabilities stay optional until an authoritative decision promotes them.

## 3. Failure behaviour — fail-fast at build

`scripts/check-env.mjs` runs **before `next build`** (`"build": "node scripts/check-env.mjs && next build"`).

- A missing, empty, or malformed required variable **fails the deploy**. The previous deployment keeps serving.
- It is **never** a 500 on a live instance. That is the whole point of choosing deploy-time over request-time.
- Errors name the variable and the **kind** of problem. **No value is ever printed.**
- URL-shaped variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SITE_URL`) must parse as `http`/`https` — this is what catches D5's *wrong value* case.

The gate loads `.env.local` / `.env*` itself with the real environment taking precedence, mirroring Next.js. Without that, a local `npm run build` would fail despite correct configuration, because the gate runs before Next loads env files.

## 4. Runtime typed access

`src/lib/config/env.ts` provides `serverEnv.siteUrl()`, `envNumber()`, `envBoolean()`.

**It does not throw on missing configuration.** Presence is guaranteed by the deploy gate; throwing at runtime would recreate the failure mode D5 describes. Accessors normalise unset and whitespace-only to `undefined`, so callers keep the fallbacks they already had.

`envNumber` falls back instead of yielding `NaN`; `envBoolean` honours only the exact strings `'true'`/`'false'`, so a typo cannot silently flip a flag.

## 5. Two boundaries the implementation must respect

**a) `NEXT_PUBLIC_*` cannot be fully wrapped.** Next.js inlines these into the client bundle by literal text substitution at build time. Reading one through a function returns `undefined` in the browser. Client-reachable code (`src/lib/supabase/client.ts`, `PostHogProvider`, …) therefore keeps direct access. This module wraps **server-side reads only**. Framework constraint, not preference — pinned by a test.

**b) The required list cannot live in `src/`.** Two of the five are the service-role key and the Anthropic key, and the architecture guard forbids naming either outside its owning adapter (`no-adhoc-service-role-client` from C9a; `no-vendor-api-keys` from the AI platform freeze). Those rules are correct — a config module must not become a second place that knows privileged credentials. So the required set and its tests live in `scripts/`, outside those rules' scope.

> This was discovered by the guard failing on the first implementation attempt, not by inspection. The split that resulted is better than the original design: **validation is a deploy-time concern; credential ownership stays with the adapter.**

## 6. Migrated consumers

| File | Was | Now |
|---|---|---|
| `lib/admin/rbac.ts` (same-origin guard) | `process.env.NEXT_PUBLIC_SITE_URL` | `serverEnv.siteUrl()` |
| `api/stripe/checkout/route.ts` | `… \|\| 'https://tappyai.vercel.app'` | `serverEnv.siteUrl() ?? …` — fallback preserved |
| `api/stripe/portal/route.ts` | same | same |
| `api/admin/settings/route.ts` | `Number(… ?? 365)`, `… !== 'false'` | `envNumber`, `envBoolean` |
| `admin/settings/page.tsx` | same | same |

**Not migrated, deliberately:** the service-role key and the Anthropic key (§5b), and client-reachable `NEXT_PUBLIC_SUPABASE_*` (§5a).

**One intentional behaviour change:** `audit_log_retention_days` previously produced `NaN` when the variable held a non-numeric value; it now falls back to `365`. Everything else preserves prior behaviour exactly, including the `'false'` semantics of `BACKOFFICE_ENABLED`.

## 7. Out of scope

Migrating all 55 variables · promoting any further variable to required · secret rotation/storage · C8 · C11 · any change to C9a, C10, F-10, the PDP, or Resource Enforcement.

## 8. Verdict

C9b is **IMPLEMENTED**. It becomes **ACCEPTED** when the deploy gate has demonstrably run in a real Vercel build and production has been verified.

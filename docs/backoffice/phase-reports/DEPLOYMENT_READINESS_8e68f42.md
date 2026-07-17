# Deployment Readiness Report — commit `8e68f42`

**Context:** Deploying Phase 0 (`dc7fc84`) fast-forwards `origin/main` (`a4fda40`) by two commits, including its parent `8e68f42` ("backend production hardening sprint"), which is not yet in production. This report assesses `8e68f42` objectively before any deploy. **No merge, no deploy performed.**

**Method:** Evidence from the repository (`git show 8e68f42`, code inspection) and the live production database (read-only queries) + production env config. No assumptions.

---

## 1. What changes are in `8e68f42`

28 files, +1032 / −29. Grouped:

| Area | Change | New infra/env? |
|---|---|---|
| Auth | Zalo: replace `listUsers(perPage:1000)` with try-create (fixes silent break past 1000 users) | No |
| Rate limits | Per-IP on `sound/play` (30/min); per-user on `reviews/interact` (10/min); `conversations` payload validation (≤200 msgs, 512 KB) | No — in-memory `rateLimit.ts` |
| Payments | Stripe webhook: correct columns `stripe_sub_id` + `plan` (fixes PGRST204 → **Pro never granted**) | Needs existing Stripe env + columns |
| IAP / Sub | Apple IAP `verify` + `notifications` endpoints, unified `subscription` endpoint, `apple-iap` lib (JWS) | Needs `APPLE_IAP_*` to *function* |
| Infra | `/api/health`, AASA universal-links, dead push-token pruning, chat provider isolation + 20k cap + abort, idempotent baseline migration, env docs | No |

---

## 2. Whether each prerequisite is actually required

| Prerequisite (from memory) | Actually required for a safe deploy? | Basis |
|---|---|---|
| Migration `20260712` | **No** — idempotent, documented no-op vs existing prod | File header + `IF NOT EXISTS` throughout |
| `APPLE_IAP_*` env | **No (for deploy)** — only to *function*; code guards + returns 503 | `isAppleIAPConfigured()`; `verify/route.ts:92-93` |
| Stripe "live" keys | **No** — code fix works with whatever Stripe keys are set; "live vs test" is operational | `webhooks/stripe` uses existing `STRIPE_*` |
| KV rate limiter | **No** — rate limits use in-memory `rateLimit.ts`; KV is a future multi-instance upgrade | No KV import in the diff |

**Finding:** none of the four items is a *hard, site-breaking* deploy prerequisite. Code reads `APPLE_IAP_*` **lazily inside functions** (no module-load crash) and guards with `isAppleIAPConfigured()`.

---

## 3. Prerequisites already satisfied (evidence)

| Item | Evidence | Result |
|---|---|---|
| `20260712` migration applied to prod | Live DB: `review_saves` has both indexes (`review_saves_idx=2`), RLS enabled on `review_saves` **and** `subscriptions` | ✅ Applied |
| `subscriptions` schema for Stripe fix | Live DB: `has_stripe_sub_id=1`, `has_plan=1`, `uniq_constraints=3`, table present | ✅ Present |
| Stripe env | `.env.production.local`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` present | ✅ Present |
| Service role key | `SUPABASE_SERVICE_ROLE_KEY` present | ✅ Present |
| Rate-limit infra | In-memory `rateLimit.ts`, no external dependency | ✅ No infra needed |

---

## 4. Prerequisites still missing (evidence)

| Item | Evidence | Impact |
|---|---|---|
| `APPLE_IAP_*` (6 vars) | Absent from `.env.production.local`; memory notes owner-blocked. **Vercel dashboard is authoritative and I cannot read it — status there is UNCONFIRMED.** | If unset in prod: Apple IAP `verify` returns **503** (scoped), notifications no-op. **No site-wide break.** iOS IAP isn't live, so no user impact. |

No other prerequisite is missing.

---

## 5. Would deploying `8e68f42` introduce production risk?

**Overall: LOW, with one governance caveat.**

- ✅ No module-level env crash (IAP env is lazy + guarded).
- ✅ DB dependencies already satisfied in prod (verified live).
- ✅ Unconfigured IAP degrades gracefully (503), doesn't affect other routes.
- ✅ Rate limits are additive, conservative, in-memory.
- ✅ The Stripe webhook change is a **correctness fix**: production today (`a4fda40`) still has the **Pro-never-granted** bug; `8e68f42` fixes it. Not shipping it *keeps* that bug live.
- ⚠️ **Governance caveat:** `8e68f42` is a 28-file backend change that did **not** pass through the Phase 0 Release Gate. It changes core paths (chat provider isolation/caps; rate limits on live endpoints). Low-risk by inspection, but it deserves **its own smoke test**, separate from Phase 0.

**Correction to my earlier flag:** last turn I listed `8e68f42`'s prerequisites as possibly "breaking production." Evidence downgrades that: the migration is already applied, IAP degrades gracefully, and no unmet dependency is site-breaking. My earlier statement was a conservative hypothesis; the data does not support a site-break risk.

---

## 6. Can Phase 0 safely wait until `8e68f42` is intentionally released?

**Yes.** Phase 0 (`dc7fc84`) has **zero functional dependency** on `8e68f42` — RBAC/audit/admin-shell are self-contained (verified: build, tsc, lint, tests, arch-check, DB migration + seed + PV-5). Holding Phase 0 (Option C) is safe and loses nothing. Phase 0's DB migration + seed are already applied and independent of `8e68f42`.

---

## Recommendation (objective; decision is the owner's)

`8e68f42` has **no unmet hard prerequisite** and is technically deploy-ready; the only "missing" item (`APPLE_IAP_*`) is non-blocking and self-guarding. Two clean paths:

- **C-release:** intentionally release `8e68f42` first with a short dedicated smoke test (`/api/health`, a chat round-trip, Stripe webhook sanity, a rate-limit spot check, IAP returns 503), then deploy Phase 0 cleanly on top.
- **C-hold:** keep holding Phase 0 until you decide to release `8e68f42` on its own schedule.

Either is safe. Not recommended: rebasing Phase 0 off `8e68f42` (would change `dc7fc84`'s hash — against your rule).

---

*No merge. No deploy. Phase 0 commit unmodified. Awaiting owner decision.*

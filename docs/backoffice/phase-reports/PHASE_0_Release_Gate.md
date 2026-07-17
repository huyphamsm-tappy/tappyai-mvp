# Phase 0 — Release Gate Checklist

**Phase:** 0 — Foundation · **Architecture:** v1.1 (frozen)
**Rule:** Phase 0 is marked **Completed** only when every gate below is ✅ **and** the owner grants explicit approval.

---

## Gate A — Code Readiness (Claude-verified, no production access)

| # | Gate | Status |
|---|---|---|
| A1 | `tsc --noEmit` clean | ✅ |
| A2 | `npm run build` compiles; 9 admin routes dynamic | ✅ |
| A3 | `npm run lint` — no new issues in Phase 0 files | ✅ |
| A4 | `npm test` — 24/24 pass | ✅ |
| A5 | `npm run architecture:check` — 7/7 | ✅ |
| A6 | Migration SQL reviewed (idempotent, RLS, INSERT-only audit) | ✅ |
| A7 | Seed template present, no hardcoded prod UUIDs | ✅ |
| A8 | Deny-path pre-flight (unauth `/admin` → redirect; unauth `/api/admin/*` → 401) | ✅ verified 2026-07-13 (local dev, no migration needed) |

**A8 evidence (local dev server, unauthenticated):**
- `GET /admin` → 302 → `http://localhost:3000/login?redirect=/admin` (middleware auth guard) ✅
- `GET /api/admin/rbac/roles` → `401 UNAUTHORIZED` ✅
- `GET /api/admin/settings` → `401 UNAUTHORIZED` ✅
- `GET /api/admin/audit` → `401 UNAUTHORIZED` ✅
- `POST /api/admin/rbac/roles` → `401 UNAUTHORIZED` ✅
- `DELETE /api/admin/rbac/roles/{id}` → `401 UNAUTHORIZED` ✅
- Dev server: no compile/runtime errors.

> This pre-verifies the **deny side** of PV-2 (middleware) and PV-4 (API authz). The **allow side** (authenticated + role) requires the migration + seed + deploy, verified in Gate D.

## Gate B — Release Preparation (owner + Claude)

| # | Gate | Owner action | Status |
|---|---|---|---|
| B1 | Commit Phase 0 changes; record hash | approved | ✅ `dc7fc84` on `feat/backoffice-phase0` (74 files) |
| B2 | Confirm Super Admin UUID(s) to seed | provide UUID(s) | ⏳ awaiting |
| B3 | Confirm target environment for verification | chosen | ✅ **Production** (Option B — single Supabase project; no preview/staging DB, no new infra) |
| B4 | Allow-side PV method | chosen | ✅ Claude drives owner's logged-in Chrome (super_admin session); Claude never handles the password |

**Finalized release order (owner decision):** migration (C1) → seed (C2) → **then** merge `feat/backoffice-phase0` → `main` → deploy (C3) → smoke test → PV-1…6 → report → owner approval. No deploy before seed.

## Gate C — Production Execution (owner runs, in ORDER)

| # | Gate | Status |
|---|---|---|
| C1 | Apply migration `20260713_backoffice_phase0.sql` in Supabase | ⏳ |
| C2 | Run seed `backoffice_super_admins.sql` with real UUID(s) | ⏳ |
| C3 | Deploy (after C1 + C2 — never before) | ⏳ |

## Gate D — Production Verification (Claude-verified post-deploy)

| # | Gate | Status |
|---|---|---|
| D1 / PV-1 | RBAC verification | ⏳ |
| D2 / PV-2 | Middleware verification | ⏳ |
| D3 / PV-3 | Audit Log verification | ⏳ |
| D4 / PV-4 | API authorization verification | ⏳ |
| D5 / PV-5 | Seed verification | ⏳ |
| D6 / PV-6 | Browser verification (+ screenshot) | ⏳ |

## Gate E — Sign-off

| # | Gate | Status |
|---|---|---|
| E1 | Final Phase 0 Release Report produced | ⏳ |
| E2 | **Owner explicit approval** | ⏳ |
| E3 | Mark "Phase 0 — Completed" | ⛔ blocked until E2 |

---

*Order is strict: A → B → C (C1→C2→C3) → D → E. No deploy before seed. No "Completed" before E2.*

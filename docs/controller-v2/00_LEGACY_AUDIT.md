# TappyAI Controller V2 — Legacy Audit & Evolution Verdict

**Status:** Draft for owner review · **Date:** 2026-08-03
**Scope:** Constitution Steps 1–3 (Audit · KEEP/REFACTOR/REMOVE · Evolve-vs-Replace verdict)
**Method:** Direct source inspection of the working tree + `origin/main` + applied production migrations. Every claim below cites a file or a git object. Nothing in this document is inferred from prior session notes without re-verification.

---

## 1. What actually exists today

The thing currently called "the Back Office" is a real, shipped system — not a prototype. It is on `origin/main` and in the production release lineage (`ce9cde0`, branch `release/games-hidden`).

### 1.1 Surface inventory (verified on `origin/main`)

| Layer | Artefacts | Count |
|---|---|---|
| Admin pages | `/admin`, `/admin/analytics`, `/admin/analytics/auth`, `/admin/analytics/activation`, `/admin/audit`, `/admin/rbac`, `/admin/settings`, `/admin/deals` | 8 routes + layout |
| Admin APIs | `rbac/roles`, `rbac/roles/[id]`, `audit`, `settings`, `analytics/auth`, `analytics/activation`, `deals`, `deals/[id]`, `deals/upload` | 9 endpoints |
| Security kernel | `src/lib/admin/{rbac,roles,audit,page-guard}.ts` | 4 files |
| Analytics platform | `src/lib/admin/analytics/*` — services, rule engine, providers, writers, clients | 17 files |
| UI | `src/components/admin/{layout,analytics,audit,settings,rbac}` | 15 components |
| Architecture docs | `docs/backoffice/00–35` (frozen v1.1) + 45 phase reports | 81 documents |
| Applied prod schema | `admin_roles`, `admin_permissions`, `audit_log`, `system_health_log`, `user_events`(envelope), `user_acquisition`, `auth_daily_rollup`, `activation_daily_rollup` + 5 functions | 6 migrations applied |

### 1.2 The security kernel is genuinely good

This is the most important finding of the audit, and it is a positive one.

`src/lib/admin/rbac.ts` establishes a handler contract:

```
requireAdminRole → isSameOrigin → rateLimit → Zod validate → operate → writeAuditLog → uniform envelope
```

I verified this contract is honoured **independently across three modules built weeks apart by different work sessions**:

- `src/app/api/admin/rbac/roles/route.ts:16-81` (Phase 0)
- `src/app/api/admin/analytics/auth/route.ts` (Phase 1)
- `origin/main:src/app/api/admin/deals/route.ts:16-52` and `deals/[id]/route.ts:18-82` (built later, on a different branch)

A pattern that three separate implementations followed without drift is not a lucky accident — it is a working architectural constraint. That is the single strongest asset the current system has, and it is exactly what a decade-scale Controller needs at its base.

Other verified strengths:

- **Defense in depth is real, not claimed.** `src/app/admin/layout.tsx:18-19` gates the whole `/admin` tree; `src/lib/admin/page-guard.ts:16-17` gates individual pages; every API handler re-authorizes independently. Middleware deliberately does auth only, never DB roles — correct, because middleware runs on the edge where a DB round-trip per request would be a latency and correctness hazard.
- **Audit log is immutable by construction.** `audit_log` has RLS enabled with zero policies and no UPDATE/DELETE path in any code (`supabase/migrations/20260713_backoffice_phase0.sql:88-98`).
- **Audit writes cannot break operations.** `src/lib/admin/audit.ts:35-55` is fire-and-forget with swallowed errors — the right call for a safety net that must never become a availability risk.
- **Lockout guardrail exists.** `rbac/roles/[id]/route.ts:29-37` refuses to revoke the last `super_admin`.
- **Client/server split is deliberate.** `roles.ts` holds pure primitives specifically so client bundles never pull `next/headers` (`src/lib/admin/roles.ts:1-4`).
- **Analytics is architecturally disciplined.** The Activation module demonstrates a real abstraction chain — Engine → Rule Provider → Rule Source (`activationRuleEngine.ts` type-imports the registry only, so there is zero runtime coupling to a concrete rule store). Adding a new activation rule requires one registry entry and no pipeline, API, or dashboard change.

---

## 2. What is structurally wrong

The problems are **not** in the code that exists. They are in the code that does not exist. The current system is a well-built *application*; the Constitution asks for a *platform*. Those differ in specific, identifiable ways.

### G1 — There is no Owner. `super_admin` can self-replicate. (Violates RULE 2 — CRITICAL)

The role enum is `('super_admin', 'admin', 'moderator', 'analyst')` (`20260713_backoffice_phase0.sql:22`). **There is no `owner` role anywhere in the schema or the code.**

Consequence, verified by reading `src/app/api/admin/rbac/roles/route.ts:37-60`: the `POST /api/admin/rbac/roles` handler requires the caller to be `super_admin`, then inserts whatever role the request body specifies — including `super_admin`. `GrantRoleSchema` does not exclude it, and no check compares the granted role against the granter's own.

So today: **any Super Admin can mint another Super Admin, unbounded.** RULE 2 states "Only Owner can create Super Admin" and "Nobody can promote themselves." Neither is enforced at any layer — not in the API, not in a DB constraint, not in RLS. This is the most serious finding in the audit and it must be fixed before any new hub is built, because every future hub inherits this authorization root.

### G2 — Authorization is a 4-rung ladder. It cannot express 8 hubs. (Violates RULE 1)

`hasRole()` is `ROLE_RANK[userRole] >= ROLE_RANK[required]` (`src/lib/admin/roles.ts:16-18`). Every permission decision in the system is one integer comparison.

This works for 8 pages. It cannot work for the target system, because rank is totally ordered and the real permission matrix is not. Concrete example the Constitution already implies: a Finance analyst must read Commerce revenue but must never read User PII; a Moderator must act on user content but must never see payment data. On a ladder, granting the Finance analyst enough rank to see revenue necessarily grants them everything a Moderator can do. There is no rung that expresses "high in Commerce, zero in User Hub."

`admin_permissions` — the table designed to solve exactly this — **exists in production and is referenced by zero lines of code.** I grepped the entire `src/` tree: no match. It is dead schema.

### G3 — There is no module system. (Violates RULE 5 — the primary blocker for the 8-hub vision)

There is no module registry, no capability interface, no event bus, no manifest. I searched `src/lib/admin` for all four concepts; the only hits were the *activation rule* registry, which is a domain object, not module infrastructure.

Navigation is a hardcoded array literal (`src/components/admin/layout/AdminShell.tsx:25-37`), including `ready: false` placeholder entries for hubs that do not exist. Adding one module today means editing the shared shell, adding a page, adding an API route, and hand-wiring its role gate — four files, three of them shared. At 8 hubs × ~10 modules, that shell array becomes a merge-conflict funnel and a single point of failure for the entire Controller.

RULE 5 requires modules to communicate through events, capabilities, and interfaces. Today they communicate by importing each other directly.

### G4 — Rate limiting does not limit anything in production

`rateLimit()` is in-memory per serverless instance. On Vercel, `N` concurrent lambdas give an effective ceiling of `N × limit`. The `20/min` cap on role grants (`rbac/roles/route.ts:41`) is therefore not a real cap on the single most security-sensitive endpoint in the system. This was flagged as R2 in the prior readiness review and remains unfixed.

### G5 — The audit log is immutable against *admins*, not against *the platform*

RLS deny-by-default protects `audit_log` from anon and authenticated clients. But every back-office write path uses the service-role client, which **bypasses RLS entirely**. Anything holding `SUPABASE_SERVICE_ROLE_KEY` — including a compromised admin API route or a leaked env var — can delete audit rows silently. There is no hash chain, no append-only enforcement at the database level, no external log shipping. For a system that will hold financial and marketplace data, "immutable" needs to survive a service-role compromise, not just an RLS bypass attempt.

### G6 — No configuration persistence

`platform_settings` does not exist. `GET /api/admin/settings` returns env-derived constants and honestly reports `persistence_available: false` (`src/app/api/admin/settings/route.ts:22-29`); `PUT` is deliberately not implemented. RULE 2 requires the Owner to "Disable Modules" and "Install Plugins" — both are configuration writes. Neither is buildable today.

### G7 — Founder Hub is a stub (Violates RULE 13)

`src/app/admin/page.tsx:14-19` renders four KPI cards whose values are literal em-dashes with "Phase 1"/"Phase 3" badges. RULE 13 requires the Founder Dashboard to answer "How is the company performing?" within seconds. It currently answers nothing.

### G8 — UI is competent ERP, not a premium OS (Violates RULE 8 & 9)

`AdminShell` is a clean, correct sidebar layout with `bg-primary` active states and disabled "COMING SOON" nav items. It is well-built and it is exactly the AdminLTE silhouette RULE 8 rejects. There is no Tappy mascot anywhere in `/admin` (RULE 9), no motion language, no command palette, no density controls.

### G9 — Governance process has outrun delivery

81 documents govern ~40 source files. The frozen-v1.1 + ADR + phase-report discipline produced genuinely high code quality, but it also produced a state where Phase 0 has been "Implemented · Verified · Pending Owner Approval" for three weeks while the schema shipped to production anyway. The process needs to bind to smaller units or it will not survive 8 hubs.

### G10 — Branch divergence (operational, must be resolved before any work starts)

`feat/backoffice-phase0` (the current checkout) is **not** an ancestor of `origin/main`. Verified:

- `git merge-base --is-ancestor HEAD origin/main` → **false**
- `origin/main` contains 5 commits touching admin that this branch lacks, including the entire `admin/deals` module (`5a4a620`, `85d65df`, `0ebeae7`) and two merges of this branch back into main.
- This branch is 117 commits ahead of `origin/main` on other work.

**Any V2 work started on the current branch would fork the Controller.** `origin/main` is the true Controller baseline.

---

## 3. KEEP / REFACTOR / REMOVE

### KEEP — production-ready, reuse as-is

| Component | Files | Why |
|---|---|---|
| Handler security contract | `rbac.ts` (`requireAdminRole`, `AdminError`, `adminErrorResponse`, `isSameOrigin`) | Proven across 3 independent modules. This becomes the V2 Policy Enforcement Point. |
| Layout + page RBAC gates | `admin/layout.tsx`, `page-guard.ts` | Correct defense-in-depth placement. Only the *decision function* they call changes. |
| Audit writer | `audit.ts` | Right shape (fire-and-forget, non-blocking, error-swallowing). Needs a stronger *sink*, not a rewrite. |
| Audit schema | `audit_log` table + 4 indexes | Well-indexed on actor/target/action/date. Correct columns incl. before/after state. |
| Analytics platform | `src/lib/admin/analytics/*`, 5 applied migrations | Engine→Provider→Source layering is the reference pattern V2 should copy. It already satisfies RULE 5's spirit at the domain level. |
| Client/server RBAC split | `roles.ts` as pure primitives | Prevents server code leaking into client bundles. Preserve this boundary exactly. |
| shadcn `.admin-theme` scoping | `admin-theme` wrapper + `rounded-admin-*` tokens | Product design tokens stay uncontaminated. Correct isolation. |
| Architecture Guard | `scripts/architecture/check.mjs` | Generic rules-as-data engine, CI-enforced. V2 extends its rule list; the engine does not change. |
| Docs 04, 06, 07, 12, 13, 19 | Database, Analytics, Event Catalog, RBAC, Audit, Security | Substantively correct and already matched by shipped code. |

### REFACTOR — sound foundation, wrong shape for 8 hubs

| Component | Change | Compatibility |
|---|---|---|
| `hasRole()` rank ladder | Becomes `authorize(actor, permission, resource)` against a permission set. Roles become named permission *bundles*, not rungs. | Keep `hasRole` as a thin shim over the new PDP during migration; delete after cutover. |
| `resolveAdminRole()` + 60s cache | Becomes `resolveActor()` returning `{ identity, roles[], permissions[], isOwner }`. Same caching strategy, richer payload. | Signature change is internal; the 3 call sites are all in `src/lib/admin`. |
| `admin_roles` table | Add `owner` to the enum **and** move Owner out of this table entirely (see V2 design). Add `hub` scoping. | Additive migration. Existing rows keep working. |
| `AdminShell` NAV array | Nav becomes derived from the Module Registry, filtered by the actor's permissions. The array is deleted. | Shell component survives; only its data source changes. |
| `rateLimit()` | Move to a shared store (Redis/Upstash — already a dependency in the Scam Shield plan). | Same call signature, different backend. |
| `writeAuditLog()` | Add a tamper-evident sink: per-row hash chained to the previous row's hash. Keep the fire-and-forget caller contract. | Additive columns; existing callers unchanged. |
| Settings module | Backed by a real `platform_settings` table with typed, audited writes. | Currently read-only; no breakage possible. |
| Doc set 00–35 | Re-cut against the 8-hub model. Most content survives; the module map does not. | Governed by ADR. |

### REMOVE — delete completely, leave no compatibility layer

| Component | Why | Migration | Risk |
|---|---|---|---|
| `admin_permissions` table | Dead schema: zero code references, zero rows in use. It is a decoy that implies a permission system exists when none does. | Replaced by V2 `permission_grants` with a real `hub.module.action` key. Drop in the same migration that creates the replacement. | **None** — nothing reads it. |
| `ready: false` nav placeholders | Hardcoded "COMING SOON" entries for 6 hubs that do not exist. In V2 a module either is registered or is not in the nav. | Nav derives from the registry; unregistered modules simply do not appear. | None — cosmetic. |
| `ADMIN_IDS` env gate (any remaining references) | Deprecated compat path documented in Phase 0; a second authorization source is a privilege-escalation surface by definition. | `admin_roles` is already authoritative. | Must grep and confirm zero live references before deleting. |
| `/admin` Home stub | Four em-dash placeholder cards. Replaced wholesale by the Founder Hub. | Full replacement, not incremental. | None. |
| `AuthTrendChart` / `ActivationTrendChart` div-bar charts | Two near-duplicate hand-rolled bar charts. Genuine duplicated presentation logic; will become N duplicates at 8 hubs. | One charting primitive in the Controller design system. | Low — 2 consumers, both internal. |
| Root-level stray docs (`TAPPYAI_*`, `PHASE3_*`, `IMAGE_PIPELINE_*`, Facebook junk) | Untracked clutter identified during the Phase 0 commit audit; noise against a 10-year doc set. | Archive or delete. | None. |

**Explicit REMOVE justification for `admin_permissions`** (per RULE 4.1):
*Why:* it creates the illusion of permission-based access control while contributing nothing; a future engineer will reasonably assume it is wired up. *Risk:* zero — no reads, no writes, no code references. *Migration:* dropped in the same transaction that creates `permission_grants`, so there is never a window with both. *Replacement:* `permission_grants` keyed on `hub.module.action`. *Verification:* `grep -r admin_permissions src/` returns empty (already true today), and a post-migration query confirms the table is gone.

---

## 4. Verdict — Evolve or Replace?

> ### **EVOLVE the kernel. REPLACE the module layer. Do not rewrite.**

**The current Controller can become Controller V2.** A full rewrite is the wrong call, and I want to be precise about why rather than defaulting to "reuse is cheaper."

**The argument for keeping the kernel is empirical, not sentimental.** The security contract in `rbac.ts` was independently re-implemented correctly by three separate modules over several weeks. That is measured evidence that the pattern is learnable, enforceable, and resistant to drift — which is the actual thing that is hard to build and the actual thing a 10-year system needs. Rewriting it would discard a proven constraint to re-derive the same shape, while re-opening every authorization decision that is currently correct.

**The argument for replacing the module layer is that there is nothing to replace.** Gaps G2, G3, G6 are not bad implementations to be refactored — they are absences. There is no module system to be compatible with. So "replace" costs nothing in migration and there is no old-and-new coexistence to worry about: the Module Kernel is net-new, and the six existing modules get re-registered through it as its first consumers.

This split satisfies RULE 4 (build on current, do not rewrite) and RULE 4.1 (delete what creates technical debt rather than layering over it) simultaneously — because the parts worth keeping and the parts worth deleting are cleanly separable. They are not entangled.

**One thing must be fixed before anything else is built: G1.** The Owner/Super-Admin escalation hole sits at the authorization root. Every hub added on top inherits it, and every day it exists is a day the audit log cannot be trusted to attribute privilege changes correctly. It is a small, contained fix — but it is a precondition, not a task in a backlog.

### Recommended sequence

| # | Work | Gate |
|---|---|---|
| **0** | Resolve G10 — rebase/reconcile onto `origin/main`, the true Controller baseline | Owner decision on branch strategy |
| **1** | **Security Foundation:** Owner principal, permission model, PDP, tamper-evident audit, distributed rate limit (G1, G2, G4, G5) | Owner approval + security review |
| **2** | **Module Kernel:** registry, manifests, capabilities, event bus, derived navigation (G3) | Re-register all 6 existing modules through it, unchanged behaviour |
| **3** | **Configuration:** `platform_settings`, module enable/disable, feature flags (G6) | — |
| **4** | **Controller Design System + Founder Hub** (G7, G8, G9) | Owner UAT |
| **5** | Hubs, one at a time, each as a pure Module Kernel consumer | Per-hub gate |

Nothing in steps 1–4 adds a business feature. That is intentional: the Constitution's own RULE 3 says architecture comes before features, and steps 1–4 are the architecture that steps 5+ are impossible without.

---

## 5. Open questions requiring an owner decision

These change the V2 design materially and I have not assumed answers:

1. **Branch baseline (G10).** `origin/main` is the true Controller. Do we rebase `feat/backoffice-phase0` onto it, or start V2 fresh from `main`? *My recommendation: fresh branch from `origin/main`; that 117-commit branch carries unrelated Android/release work and a known secret in its history.*
2. **Owner identity.** Is the Owner a database row, an env-pinned UUID, or both (row + boot-time assertion)? *My recommendation: both — a `platform_owner` table with a one-row constraint, cross-checked at boot against an env-pinned UUID, so a database compromise alone cannot transfer ownership.*
3. **Deployment isolation.** Does the Controller stay inside the `tappyai-mvp` Next.js app (`/admin`), or become a separate deployment on its own domain? This is the largest structural decision in the document and it is genuinely two-sided — same-app means shared auth and zero new infra; separate means the Controller's blast radius never touches the consumer app. *My recommendation: stay in-app for now, but build the Module Kernel with no imports from consumer-app code, so extraction later is a build-config change and not a rewrite.*
4. **Does the frozen `docs/backoffice` v1.1 doc set get superseded by Controller V2 docs, or amended by ADR?** *My recommendation: superseded — the 8-hub model is a redesign, which the Constitution's own semver rule (§8) calls a major version.*

---

**Next:** `01_CONTROLLER_V2_ARCHITECTURE.md` contains Steps 4–5 (full V2 design + the 8 required diagrams), written against the "evolve kernel / replace module layer" verdict above. If the owner rejects that verdict, that document must be re-cut.

**No code has been written. No migration has been created. No branch has been changed.**

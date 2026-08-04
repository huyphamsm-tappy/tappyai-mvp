# Controller V2 — Phase 0 Repository Audit

**Status:** Awaiting owner approval · **Date:** 2026-08-03
**Baseline:** `origin/main` (per Branch Policy). Every finding below was re-verified against `origin/main`, not the working tree.
**Scope:** the seven Phase 0 sub-audits — Dependency · Security · API · Database · Permission · Event · UI.
**Companion:** `00_LEGACY_AUDIT.md` (KEEP/REFACTOR/REMOVE) and `01_CONTROLLER_V2_ARCHITECTURE.md` (target design).

**No code written. No migration created. No dependency changed. No branch modified.**

---

## 0. Method & honesty note

Every claim cites a command or a file. Two of my automated sweeps produced **false positives that I caught and corrected before reporting** — I am recording them because they bear on how much weight to give tooling here:

1. A route-authorization sweep flagged `admin/rbac/roles/[id]` and `admin/deals/[id]` as unauthenticated. Cause: `grep -x` treated the literal `[id]` path segment as a regex character class. Re-run with fixed-string matching — both are correctly authorized.
2. The corrected sweep still flagged `iap/apple/notifications` and `scan` as unauthenticated. Both are in fact correctly protected (full JWS certificate-chain verification, and IP-based daily rate limiting + MIME allowlist + size cap respectively). My symbol list was too narrow.

**Nothing in this document is reported from a grep alone.** Every security finding was confirmed by reading the file.

---

## 1. Dependency Audit

`origin/main:package.json` — **23 production dependencies, 16 dev.** For an application of this surface area that is genuinely lean, and it reflects real discipline. No dependency bloat, no duplicated utility libraries, no leftover framework experiments.

### D1 — `next@14.2.5` is a known-vulnerable release · **HIGH (dependency) / LOW (exploitable impact here)**

Lockfile-resolved version confirmed: `next: 14.2.5`.

Next.js 14.2.x below **14.2.25** is affected by **CVE-2025-29927** — a middleware authorization bypass via a crafted `x-middleware-subrequest` header, which causes middleware to be skipped entirely.

**The exploitable impact on this codebase is low, and that is not luck — it is the direct payoff of an architecture decision already made.** I read `origin/main:middleware.ts` in full. Middleware performs *authentication only*:

```
// middleware enforces AUTHENTICATION only — never a DB-backed role check. The
// authoritative RBAC role gate runs in the /admin server layout and in every
// /api/admin/* handler (defense-in-depth, Security §4).
```

An attacker who skips middleware reaches `/admin`, where `admin/layout.tsx:18-19` independently resolves the role and redirects, and any `/api/admin/*` call is independently re-authorized by its handler. The bypass yields nothing.

**This is the single most important architectural validation in the entire audit.** The Phase 0 decision to keep RBAC out of middleware neutralized a critical CVE class before it was published. It must become a Constitution-level invariant in V2, not merely a convention: **authorization never lives in middleware.**

Still required: upgrade Next. 14.2.5 carries other fixed advisories, and "our architecture happens to mitigate it" is not a patching strategy.

### D2 — Dead dependencies

| Package | Evidence | Action |
|---|---|---|
| `matter-js` | **0 files** in `src` reference it | REMOVE |
| `@types/matter-js` | 0 references, **and it sits in `dependencies`, not `devDependencies`** | REMOVE |

A physics engine, almost certainly a remnant of the parked Games work. Both ship in the production bundle graph today.

### D3 — Two parallel analytics systems · **MEDIUM, needs an owner decision**

`posthog-js` is referenced in **7 source files** and is a production dependency, alongside `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`.

This runs concurrently with the in-house analytics platform (`user_events` → `user_acquisition` → rollups → dashboards) that Phases 1–2 built and deployed. Two consequences:

- **Two sources of truth for product analytics.** This directly contradicts standing rule SR-1 ("single source of truth") that the in-house platform was built around.
- **A third-party data processor** receives user behavioural data. `docs/backoffice/33_Privacy_Data_Governance.md` exists; whether PostHog is covered by it is **Not verified**.

I am not recommending removal — PostHog may be deliberate and valuable. I am flagging that the Controller cannot claim to be the ecosystem's analytics authority while a parallel pipeline ships the same data elsewhere. **Owner decision required.**

### D4 — Dead configuration surface

`NEXT_PUBLIC_SUPERTUX_DATA_URL` and `NEXT_PUBLIC_SUPERTUX_WASM_URL` remain, and `middleware.ts` carries a COOP/COEP header block for `/games/supertux`. Games were parked for Arcade V2. On `origin/main` this path is still live. It is dead weight in the request path of *every* matched request. REMOVE candidate, pending confirmation that main's Games state matches the release branch.

### D5 — No boot-time configuration validation

**44 distinct `process.env.*` references** across `src`, accessed ad hoc. There is no central typed config module and no startup assertion.

Consequence: a missing or misspelled variable fails at *request* time, in the specific code path that reads it, rather than at deploy time. The prior `NEXT_PUBLIC_SITE_URL` incident is exactly this failure mode — a wrong value that everything except one production code path tolerated silently.

The Constitution's Security Foundation lists Secret Management. A validated config schema asserted at boot is the concrete form of that requirement.

**Positive:** all 13 `NEXT_PUBLIC_*` variables were reviewed individually — **none is a secret**. No tracked `.env` file exists (only `.env.local.example`). Secret *hygiene* is correct; secret *management* is unstructured.

---

## 2. Security Audit

### S1 — No Platform Owner; Super Admins self-replicate · **CRITICAL — blocks all other work**

Restated here because the Master Prompt makes it explicit policy. Your Platform Owner Rules require:

> *Only Platform Owner can create or demote Super Admins. Nobody can promote themselves.*

Current state, verified in `src/app/api/admin/rbac/roles/route.ts:37-60`: the handler requires the caller to hold `super_admin`, then inserts the role named in the request body. `GrantRoleSchema` does not exclude `super_admin`. No check compares the granted role to the granter's own. The `admin_role` enum (`20260713_backoffice_phase0.sql:22`) contains no `owner` value at all.

**Any Super Admin can mint unlimited additional Super Admins.** There is no Platform Owner in the schema, the code, or the environment.

This is the authorization root. Every Hub added on top inherits it. It is Phase 1 item one.

### S2 — Three privilege paths bypass the sanctioned admin client · **HIGH**

`createAdminClient` (`src/lib/supabase/admin.ts`) is the intended single construction point for the service-role client, and 42 files use it. But **three route files read `SUPABASE_SERVICE_ROLE_KEY` directly and build their own client**:

- `src/app/api/iap/apple/notifications/route.ts`
- `src/app/api/users/search/route.ts`
- `src/app/api/webhooks/stripe/route.ts`

Each is individually defensible (all three are webhook/service contexts with no user session). The architectural problem is that any future hardening applied to `createAdminClient` — call logging, query scoping, audit instrumentation, key rotation — **silently will not cover these three**. A single privileged construction point that has three unmonitored siblings is not a single construction point.

### S3 — The audit log is not tamper-evident · **HIGH**

`audit_log` has RLS enabled with zero policies, and no UPDATE/DELETE path exists in application code. But every back-office write uses the service-role client, which **bypasses RLS entirely**. Anything holding `SUPABASE_SERVICE_ROLE_KEY` — including the three unsanctioned clients in S2 — can delete audit rows with no trace.

There is no hash chain, no append-only database grant, no external log shipping. For a platform that will hold financial and marketplace data, immutability must survive a service-role compromise, not merely an RLS probe.

### S4 — Rate limiting does not limit in production · **HIGH**

`rateLimit()` is an in-memory per-instance counter. On Vercel, N concurrent lambdas yield an effective ceiling of N × limit. The `20/min` cap on role granting (`rbac/roles/route.ts:41`) — the most security-sensitive endpoint in the system — is therefore not a real cap. Flagged as R2 in the prior readiness review; still unfixed.

### S5 — Authorization placement is correct · **KEEP — elevate to invariant**

Covered in D1. Middleware does authentication only; authorization is enforced at the layout and independently at every handler. This is correct, it is deliberate, and it neutralized CVE-2025-29927. Preserve exactly.

### S6 — Session security

Session refresh uses `supabase.auth.getUser()` (not `getSession()`), with an in-code explanation that only `getUser()` revalidates against the auth server and rotates cookies. That is the correct choice and the reasoning is sound.

**Not verified:** session revocation behaviour, concurrent-session limits, and device-binding — the Constitution's Session Security requirement has no implementation I could locate. There is no session inventory or forced-logout capability.

---

## 3. API Audit

**94 route handlers on `origin/main`; 9 are admin.**

### Admin surface — coverage is complete

| Check | Result |
|---|---|
| `/admin` pages with an RBAC page guard | **6 / 6** ✅ |
| `/api/admin/*` handlers with `requireAdminRole` | **12 / 12 decision points** ✅ |
| Mutations with same-origin check | all verified present ✅ |
| Mutations with Zod validation | all verified present ✅ |
| Uniform `{data}` / `{error}` envelope | consistent across all 9 ✅ |

The handler contract holds without exception on the admin surface. This is the strongest evidence for the "evolve the kernel" verdict.

**One gap:** `admin/deals/upload/route.ts` is authorized, same-origin checked, and rate limited — but writes **no audit row**, while every other deals mutation does. A file upload is a mutation. Under V2, audit coverage is derived from the manifest rather than left to reviewer vigilance, which is what makes this class of omission structurally impossible rather than merely discouraged.

### Public surface

20 routes have no authentication symbol. I read each. **Most are correctly public** (config, health, version, rates, deals catalog, music catalog, oembed, links/resolve, viet-content). Rate limiting is present on the expensive ones — `scan`, `translate`, `viet-content`, `links/resolve`, `sound/[trackId]/play`.

Genuine findings:

| # | Finding | Severity |
|---|---|---|
| A1 | `deals/[id]/click` — unauthenticated, unrate-limited write (click counter). Trivially inflatable; it feeds affiliate/partner reporting. | MEDIUM |
| A2 | `explore/oembed` — unauthenticated, unrate-limited, and fetches a remote URL. SSRF and abuse surface; **I did not verify whether the target URL is allowlisted** — flagged for review, not asserted as a vulnerability. | MEDIUM · needs verification |
| A3 | `debug-places` and `test-photos` are correctly gated behind `Bearer CRON_SECRET` in production ✅ — but diagnostic endpoints calling paid APIs should not exist in a Controller-governed platform. | LOW |
| A4 | No uniform response envelope outside `/api/admin/*`. Product routes each invent their own error shape. | LOW (structural) |

### API governance gap

There is no generated API inventory, no shared route contract outside the admin namespace, and no automated check that a new route is authorized. Route #95 will be as safe as whoever writes it remembers to be. `docs/backoffice/28_API_Governance.md` exists but is not machine-enforced.

---

## 4. Database Audit

### The strongest result in this audit

Across all migration files on `origin/main`:

- **36 tables created**
- **37 `ENABLE ROW LEVEL SECURITY` statements**
- **Zero tables created without RLS enabled**

Deny-by-default is applied universally and without exception. That is unusual and it is worth stating plainly.

### Findings

| # | Finding | Severity |
|---|---|---|
| DB1 | **RLS enabled ≠ policies correct.** I verified the *enable* statements; I could not verify policy correctness. Requires live database access. | **Not verified** |
| DB2 | Migrations have no dependency declaration; apply order is filename-lexicographic. The prior readiness review found a *real* ordering bug this caused (analytics functions referencing not-yet-created tables), mitigated only by a manual runbook. Postgres does not validate `LANGUAGE sql` bodies at `CREATE` time, so a wrong order applies "successfully" and fails later at call time. | HIGH (process) |
| DB3 | `admin_permissions` — created in production, **zero code references** (grep-confirmed across all of `src`). Dead schema implying a permission system that does not exist. | MEDIUM |
| DB4 | No `supabase_migrations` tracking table; migrations are applied manually via the SQL editor. Applied state is not machine-verifiable — it is reconstructed by querying for expected objects. | MEDIUM |
| DB5 | Live production schema state **not verified this session** — no database credentials available. All schema claims derive from migration files. | **Not verified** |

DB2 and DB4 compound: no declared ordering, and no record of what was applied. That is survivable at 6 migrations and untenable at 60.

---

## 5. Permission Audit

**18 permission decision points exist in the entire system.** Every one is a role-rank comparison:

```
hasRole(userRole, required) → ROLE_RANK[userRole] >= ROLE_RANK[required]
```

| Role | Occurrences in admin code |
|---|---|
| `admin` | 12 |
| `super_admin` | 7 |
| `analyst` | 7 |
| `moderator` | **1** |

Findings:

1. **Rank is totally ordered; the real permission matrix is not.** A Finance analyst who must read Commerce revenue but never user PII has no expressible rung. Any rank high enough for the first grants the second.
2. **`moderator` is effectively vestigial** — one occurrence, and no moderation module exists.
3. **No resource-level authorization anywhere.** No decision considers *which* record is being acted on — only *whether* the actor outranks a threshold.
4. **No hub scoping.** An `admin` is an admin of everything, permanently.
5. **Permissions are string literals at call sites**, not entries in a registry. Nothing can enumerate "what permissions exist" without grepping, and nothing prevents a typo from silently creating a new, ungranted permission.
6. `admin_permissions` — the fine-grained override table — is unused (DB3).

The model is correct for 8 pages and cannot reach 10 Hubs. This is the Permission Engine requirement in your Phase 1.

---

## 6. Event Audit

### The headline number

| Metric | Count |
|---|---|
| Event types **documented** in `07_Event_Catalog.md` | **130** |
| Event types **actually emitted** in `src` | **12** |
| Implementation rate | **~9%** |

Emitted: `auth_login_completed`, `auth_login_failed`, `auth_logout_completed`, `auth_signup_completed`, `chat_response_received`, `page_time`, `page_view`, `place_save`, `review_like`, `review_search`, `review_share`, `search_result_saved`.

### Findings

| # | Finding | Severity |
|---|---|---|
| E1 | **There is no Event Bus.** `track()` posts to `/api/track`, which inserts into `user_events`. That is *telemetry ingestion*: no subscribers, no routing, no delivery guarantees, no retry, no dead-letter queue. The Constitution's Event Bus (`UserRegistered`, `OrderCreated`, `PaymentSucceeded`…) **does not exist in any form.** It must not be mistaken for the tracking pipeline — they solve different problems and V2 needs both. | **Structural** |
| E2 | The catalogue is aspirational, not descriptive. At 9% implementation it cannot be used to reason about system behaviour, yet its size implies authority. | HIGH |
| E3 | `auth_login_failed` is emitted but absent from the catalogue — documentation drift is **already present**, confirming hand-maintained sync has failed. | MEDIUM |
| E4 | `place_save` (legacy) and `search_result_saved` (its canonical replacement) are **both live simultaneously**. Duplicate semantics for one user action; any consumer counting saves double-counts or under-counts depending on which it picks. | MEDIUM |
| E5 | Modules communicate by direct import today. The Constitution's rule that Hubs may communicate only via Capability Gateway and Event Bus has no enforcement mechanism because neither exists. | Structural |

E2/E3 are the argument for generating the catalogue from module manifests rather than maintaining it by hand. A generated catalogue cannot drift.

---

## 7. UI Audit

**14 admin components, ~1,361 lines total.** Small and maintainable.

| Component | Lines |
|---|---|
| `deals/DealsManager.tsx` | 300 |
| `rbac/RolesManager.tsx` | 178 |
| `layout/AdminShell.tsx` | 142 |
| `analytics/AuthAnalyticsDashboard.tsx` | 128 |
| `audit/AuditViewer.tsx` | 121 |
| …9 more | ≤95 each |

### Findings

| # | Finding | Severity |
|---|---|---|
| U1 | **i18n discipline is intact** — a sweep for raw user-facing JSX strings returned **zero hits**. All copy routes through `t()`. Genuinely well done and rare. ✅ | — |
| U2 | Navigation is a hardcoded array (`AdminShell.tsx:25-37`) including `ready:false` placeholders for 6 non-existent hubs. At 10 Hubs this file becomes a merge-conflict funnel and a single point of failure. | HIGH |
| U3 | `AuthTrendChart` (41 lines) and `ActivationTrendChart` (47 lines) are near-duplicate hand-rolled div-bar charts. Two consumers today; ten Hubs will produce ten. | MEDIUM |
| U4 | No design-system layer between shadcn primitives and dashboards — no shared chart, data-table, or state (loading/empty/error/denied) primitives. Each dashboard re-solves them. | MEDIUM |
| U5 | No command palette, no hub switcher, no density control, no mascot. RULE 8 ("premium OS, not ERP") and RULE 9 (Tappy) are unimplemented. | MEDIUM |
| U6 | Disabled "COMING SOON" nav rows show operators doors they cannot open. V2 derives nav from permissions — you never see what you cannot access. | LOW |

---

## 8. Conflicts between the Constitution and the existing code

Per your rule — where Constitution and code disagree, explain before changing.

| # | Constitution requirement | Actual code | Resolution |
|---|---|---|---|
| **C1** | "Only Platform Owner can create or demote Super Admins" | Any `super_admin` can create `super_admin`. No Owner exists. | Code is wrong. Fix in Phase 1. **No ambiguity.** |
| **C2** | Hubs communicate only via Capability Gateway + Event Bus | Neither exists; modules import directly | Not a conflict — an absence. Phase 2 builds it. |
| **C3** | "Nothing is implemented before Security Foundation" | The **Commerce module (Deals) is already live on `main`** — a business Hub shipped before the Security Foundation | Genuine conflict. Deals predates this Constitution. Needs an owner decision: freeze it as-is and migrate it in Phase 3, or roll it back. **My recommendation: freeze and migrate — it is correctly built to the existing handler contract and rolling it back removes shipped value for no security gain.** |
| **C4** | "No long-term coexistence between old and new architectures" | 6 live modules will run on the old module layer while the kernel is built | Needs a defined cutover window with a deadline, not open-ended coexistence. Recommend: the Module Kernel is not "done" until all 6 are re-registered through it — that is its acceptance test. |
| **C5** | Analytics Hub owns analytics | PostHog runs a parallel pipeline (D3) | Owner decision required. |

---

## 9. "Not verified" register

Stated explicitly rather than assumed:

- **Live production database schema and RLS *policy* correctness** — no database credentials this session. All schema claims derive from migration files.
- **Whether `/admin` is reachable and functional in production right now** — not exercised. The code is on `origin/main` and in the release lineage (`ce9cde0`), but I did not load the deployed page.
- **Vercel environment variable current values** — not inspected this session.
- **`explore/oembed` URL allowlisting** (A2) — flagged for review, not asserted as a vulnerability.
- **Whether PostHog is covered by the existing privacy documentation** (D3).
- **Whether `main`'s Games/SuperTux state matches the release branch** (D4).
- **Session revocation / concurrent-session behaviour** (S6) — no implementation located, but absence of a grep hit is not proof of absence.

---

## 10. Phase 0 verdict and recommended Phase 1 scope

The audit does not change the verdict in `00_LEGACY_AUDIT.md`; it **strengthens** it with three findings that were not available before:

1. The middleware/authorization split **actively neutralized a critical CVE** (D1/S5). The kernel is not merely acceptable — it made a correct call that a rewrite would risk losing.
2. **100% RLS coverage** and **100% admin authorization coverage** show the existing security discipline is real and measurable.
3. The gaps are consistently *absences* (no Owner, no Event Bus, no permission engine, no module system), not *defects*. Absences are additive to fix, which is why "evolve the kernel, replace the module layer" is the low-risk path.

### Proposed Phase 1 — Security Foundation, in order

| # | Item | Addresses |
|---|---|---|
| 1 | **Platform Owner** — `platform_owner` table (one-row constraint) + boot-time env assertion + `SECURITY DEFINER` grant function; `owner` never becomes a grantable role | S1 / C1 |
| 2 | **Permission Engine** — `hub.module.action` keys, registry-declared, roles as bundles, deny-wins, PDP replacing `hasRole` | §5 |
| 3 | **Audit hardening** — hash chain, insert-only grant, chain verifier, coverage for denials and owner overrides | S3 |
| 4 | **Distributed rate limiting** — shared store; real global caps | S4 |
| 5 | **Secret & config management** — single admin-client construction point (closing S2), typed config validated at boot | S2 / D5 |
| 6 | **Session security** — inventory, revocation, forced logout | S6 |
| 7 | **Dependency remediation** — upgrade Next past 14.2.25; remove `matter-js` + `@types/matter-js` | D1 / D2 |

Item 1 is the precondition for everything. Items 2–7 can proceed in parallel once it lands.

### Decisions blocking Phase 1 start

1. **Branch baseline** — confirm a fresh branch cut from `origin/main` (Branch Policy says `origin/main`; the current checkout `feat/backoffice-phase0` is *not* an ancestor of it and carries a secret in its history).
2. **C3 — Deals module:** freeze and migrate in Phase 3, or roll back? *(Recommend: freeze and migrate.)*
3. **C5 / D3 — PostHog:** retain, retire, or scope to a defined non-overlapping purpose?
4. **Platform Owner identity** — confirm `platform_owner` table + boot-time env assertion (both), and nominate the Owner UUID.
5. **R6 — owner-key-loss break-glass procedure** — required before the Owner principal ships, or you can lock yourself out permanently.

**Phase 0 is complete and awaiting approval. No implementation will begin until you approve it and answer the five decisions above.**

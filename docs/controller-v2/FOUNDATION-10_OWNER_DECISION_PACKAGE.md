# FOUNDATION-10 — Owner Decision Package (re-audited from source)

**READ-ONLY. Documentation only. Nothing activated, created, enabled, deployed, committed or pushed.**
**Source of truth: `origin/main` = production `6f0296e`.** Every figure below was re-measured from source. **No previous report was used as authority** — and two of them turned out to be wrong.

---

## 0. THE FINDING THAT REFRAMES EVERY OTHER ANSWER

**Department membership does not gate API access today. It gates navigation.**

Measured, not inferred:

| Artefact | Enforcement status |
|---|---|
| `authorizeDepartmentResource` (the department resource gate) | **ZERO callers.** Only re-exported by `org/index.ts:12` and named in a comment in `navDepartment.ts:12`. No route, no page. |
| `Department.ownedPermissions` | **Read by nothing that enforces.** Occurrences: `departments.ts` (definition), `types.ts:50` (type), `departmentAuthorization.test.ts` (tests). |
| `Department.modules` | **Enforced** — `context.ts:26` (`allowedModules`), `context.ts:61` (`moduleCount`), `navDepartment.ts:25` (module→department map). |
| `/api/admin/*` routes | Gate on the **canonical PDP permission only**. Grep for `department` across all 10 admin route files matches **only** `org/memberships/route.ts`. `/api/admin/deals` → `requirePermission(COMMERCE_DEALS_READ / _CREATE)`; `/api/admin/deals/[id]` → `_UPDATE` (PATCH) / `_DELETE` (DELETE); `/api/admin/analytics/auth` → `ANALYTICS_AUTH_READ`. |
| `admin/layout.tsx:49-52` | When the flag is ON, `filterNavByDepartment` filters **navigation**. |

The source states it outright at `admin/layout.tsx:47`:

> *"This is presentation only; server authorization (page guards + the membership API) remains the boundary for direct access."*

**Consequence.** Turning F-10 on changes **what a Head sees in the menu**, not **what a Head can call**. A Head's actual API reach is determined by their **`AdminRole`** (`analyst | moderator | admin | super_admin`), not by their department. This is the current design of the phase, not a defect — but it invalidates any UAT line promising department isolation on APIs, and it changes which department is the safe first choice.

---

## 1. CAPABILITY MATRIX — measured from `departments.ts` + `permissions/registry.ts`

**15 departments · 3 `defined` · 12 `placeholder`.**

### Defined departments

| Dept | Modules (enforced → nav) | Declared `ownedPermissions` | Exists in PDP? | Category / risk | Roles that hold it |
|---|---|---|---|---|---|
| **commerce** | **1** — `tappy.hub.commerce.deals` | `commerce.deals.read` | ✅ | read / low | `admin`, `super_admin` |
| | | `commerce.deals.create` | ✅ | **write** / medium | `admin`, `super_admin` |
| | | `commerce.deals.update` | ✅ | **write** / medium | `admin`, `super_admin` |
| | | `commerce.deals.delete` | ✅ | **destructive** / **high** | `admin`, `super_admin` |
| **ai_data** | **3** — `analytics.auth`, `analytics.activation`, `analytics.content` | `analytics.read` | ❌ **DOES NOT EXIST** | — | — |
| | | `analytics.auth.read` | ✅ | read / low | `analyst`, `moderator`, `admin`, `super_admin` |
| | | `analytics.activation.read` | ✅ | read / low | `analyst`, `moderator`, `admin`, `super_admin` |
| | | `analytics.content.read` | ✅ | read / low | `analyst`, `moderator`, `admin`, `super_admin` |
| **marketing** | **0** | *(none)* | — | — | — |

### 🔧 Correction to earlier reporting

Previous packages said ai_data owns **4** permissions. **It owns 3.** `analytics.read` appears in `ai_data.ownedPermissions` but **is not a permission id** — it is the `capability` label on the three analytics permissions (`registry.ts:46, 61, 74`). It resolves to nothing in the PDP. Harmless today (nothing reads `ownedPermissions`), but the "4 vs 4" symmetry used to compare the two departments was false: **commerce has 4 real permissions, ai_data has 3.**

### Placeholder departments (12)

`executive`, `product`, `engineering`, `security`, `finance`, `business_development`, `support`, `legal`, `hr`, `content`, `qa`, `it` — each `status: 'placeholder'`, **0 modules, 0 permissions**. Pinned by `departmentAuthorization.test.ts:43`. A Head assigned to any of them gets an empty workspace.

`marketing` is `defined` but also **0 modules / 0 permissions** (`departmentAuthorization.test.ts:50` pins this). **Not a valid first functional department** — its `defined` status reflects organizational identity, not capability.

---

## 2. CROSS-DEPARTMENT PERMISSION MATRIX

`CROSS_DEPARTMENT_ACCESS` (`departments.ts:47-50`) — the complete table, two entries:

| From | To | Mode | Permissions | Read/Write | Intentional? |
|---|---|---|---|---|---|
| `ai_data` | `commerce` | `analyze` | `['commerce.deals.read']` | **READ** | **YES** — doc comment *"AI/Data may READ/ANALYZE Commerce- and Marketing-owned resources. This grants NO ownership and NO write."*; department note *"receives governed READ/ANALYZE into other departments — never ownership"*; honoured at `authorization.ts:34-43` |
| `ai_data` | `marketing` | `analyze` | **`[]` — empty** | — | Intentional but **INERT** — grants nothing |

**No other department has any cross-department grant.** `commerce` has none — it reaches nothing in `ai_data`, proven by rehearsal test *"the grant is one-directional"*.

🔑 **The grant is doubly gated, and the second gate matters:** `authorization.ts:16-19` runs the **canonical PDP first** and denies before scope is ever consulted. `commerce.deals.read` requires **`admin`+**. So a Head holding `analyst` or `moderator` **cannot exercise the cross-department read at all** — the PDP refuses it before the grant is reached. The exception is only live for an `admin`/`super_admin` Head.

---

## 3. COMMERCE vs AI/DATA — the actual trade-off

Ten criteria, measured. **"Head role"** below means the `AdminRole` granted to the first Head, which — per §0 — is the real determinant of reach.

| # | Criterion | `commerce` | `ai_data` |
|---|---|---|---|
| 1 | Scope complexity | 1 module, 4 permissions | 3 modules, 3 real permissions |
| 2 | Cross-department access | **none** (cleanest boundary) | 1 grant: read `commerce.deals.read`; 1 inert |
| 3 | Read vs write authority | 1 read, **2 write, 1 destructive** | **3 read, 0 write, 0 destructive** |
| 4 | Public-data exposure | **HIGH** — `/api/admin/deals*` writes `partner_deals`, the same table `src/lib/deals/partnerDeals.ts:120,176` serves to the **public** `/api/deals` | **none** — analytics are aggregate reads, no consumer surface |
| 5 | Destructive capability | **`commerce.deals.delete` = destructive/high**, wired to `DELETE /api/admin/deals/[id]:69` | **none** |
| 6 | Suitability for first Head UAT | Poor at low role: all 4 permissions need `admin`+, so an `analyst` Head sees the module and is denied every action | Good: all 3 permissions reachable by `analyst`/`moderator` |
| 7 | Demonstrating membership isolation | Equal — **and weak for both.** Per §0 isolation is observable **in navigation only** | Equal — same limitation, plus one documented exception to explain |
| 8 | Exercising PDP/delegation safely | Equal — both exercise the same `membershipService` + `canDelegate` | Equal |
| 9 | Rollback complexity | Suspend/remove is symmetric — **but any deal already created/updated/deleted is NOT rolled back by removing the membership**, and the change is publicly visible | Symmetric, and **nothing to roll back** — reads leave no state |
| 10 | Auditability | Membership events audited identically. Deal mutations are a separate audit surface | Membership events audited identically; no data mutations to audit |

**Where each wins.** `commerce` wins exactly one criterion: **#2**, a clean boundary with no cross-department exception to reason about. `ai_data` wins **#3, #4, #5, #6, #9** — and those are the criteria that carry blast radius.

**The decisive asymmetry:** because department membership does not restrict APIs (§0), choosing `commerce` and granting the Head `admin` hands them **create, update and delete on the table that feeds the public deals endpoint**. Choosing `ai_data` and granting `analyst`/`moderator` hands them **three aggregate read endpoints and nothing else** — and, at that role, not even the documented commerce read.

---

## 4. RECOMMENDATION — **A. `ai_data`**, with a binding role constraint

**Recommend `ai_data` as the first department, and the first Head's `AdminRole` MUST be `analyst` — never `admin`, never `super_admin`.**

The role constraint is not decoration; per §0 it is the control that actually bounds the Head.

🔎 **Now measured** (see `FOUNDATION-10_RESOURCE_ENFORCEMENT_DECISION.md`): the registry declares **16** permissions. `analyst` holds **4**, `moderator` holds **the identical 4** (`dashboard.home.view` + the three `analytics.*.read`), `admin` holds **11**, `super_admin` **16**. All four analyst permissions are `category: read`, `riskLevel: low`, and **none is a commerce permission**. `analyst` and `moderator` are equivalent today; `analyst` is preferred so that a future permission added to `moderator` cannot silently widen the first Head.

**Activation verdict: SAFE ONLY AS NAVIGATION / PRESENTATION SCOPE.** Activating this configuration weakens nothing — but F-10 must never be described as department isolation. See §10.

**Acknowledging the intentional commerce read, as required.** `ai_data → commerce.deals.read` exists and is deliberate. It remains acceptable because:
1. it is **read-only** — `commerce.deals.update` from an `ai_data` Head returns `SCOPE_DENIED`, proven by rehearsal test *"the cross grant is READ-ONLY"*;
2. it is **one permission wide** — no other commerce permission is reachable;
3. it is **one-directional** — commerce reaches nothing in ai_data;
4. at the mandated role (`analyst`/`moderator`) the **PDP denies it before the grant applies**, so for the first Head it is not exercisable at all;
5. it is **documented in source** at three places, so a UAT that flags it is testing the wrong invariant.

**Why not `commerce`:** its only capability set requires `admin`+, includes a `destructive/high` permission, and writes the table behind the public `/api/deals`. Its one advantage — no cross-department exception — buys clarity in a layer (§0) that is not enforced on APIs anyway. That is a poor trade for real write exposure on consumer-facing data.

**Why not `marketing` or any placeholder:** 0 modules, 0 permissions — an empty workspace that proves nothing.

> If the Owner prefers `commerce` regardless, it remains viable **only** with a role that cannot write: at `analyst`/`moderator` the Head can reach none of commerce's four permissions, which makes for a null UAT. There is no configuration in which `commerce` is both exercisable and low-risk.

---

## 5. CORRECTED HEAD UAT CONTRACT

The old rule — *"a Head cannot access another department"* — is **wrong twice**: it contradicts the deliberate `ai_data → commerce.deals.read` grant, and it implies an API-level department boundary that §0 shows does not exist.

**Replacement invariant:**

> A Department Head may reach exactly what the canonical PDP grants their role, further narrowed — **in navigation** — to their department scope, plus any cross-department permission explicitly listed in `CROSS_DEPARTMENT_ACCESS`. Every ungranted cross-department operation must be denied by the layer that owns it: the PDP for permissions, `authorizeDepartmentResource` for scope wherever it is wired.

### A Head MUST

| # | Requirement | Enforcing layer |
|---|---|---|
| A1 | reach resources their role is authorized for | canonical PDP |
| A2 | be narrowed to their department in navigation | `filterNavByDepartment` (flag ON) |
| A3 | receive **only** explicitly granted cross-department permissions | `CROSS_DEPARTMENT_ACCESS` |
| A4 | be unable to obtain `GLOBAL` scope | `delegation.ts:97` `SCOPE_ESCALATION` |
| A5 | be unable to become `ULTIMATE_OWNER` | `delegation.ts:81` `OWNER_IS_SINGULAR` |
| A6 | be unable to target the Owner | `delegation.ts:86` `CANNOT_MODIFY_OWNER` |
| A7 | be unable to self-grant | `delegation.ts:91` `CANNOT_SELF_GRANT` |
| A8 | be unable to grant unauthorized memberships | `membershipService` PDP + `canDelegate` |
| A9 | remain subject to the canonical PDP | `permissionEngine` |
| A10 | generate the expected audit events | `writeAuditLog` via `membershipService` |

### A Head MUST NOT

| # | Prohibition | Status today |
|---|---|---|
| B1 | reach an unrelated department **without** an explicit permission | ⚠️ **enforced by the PDP/role, NOT by department** (§0) |
| B2 | convert a read grant into write | ✅ `SCOPE_DENIED` where the scope gate is wired; PDP otherwise |
| B3 | reach another department's protected resources by guessing URLs | ⚠️ **PDP/role only** (§0) — no department check on `/api/admin/*` |
| B4 | bypass the PDP | ✅ mutation M5 RED |
| B5 | construct or forge an Actor | ✅ Actor built server-side in `rbac.ts`; route may not re-derive it (thin-adapter tests) |
| B6 | grant `GLOBAL` | ✅ M2 RED |
| B7 | assign `ULTIMATE_OWNER` | ✅ schema enum + `OWNER_IS_SINGULAR` |
| B8 | target the Owner | ✅ M3 RED |
| B9 | self-grant | ✅ M4 RED |
| B10 | bypass `membershipService` | ✅ route is a thin adapter, statically asserted |
| B11 | mutate membership via direct DB access | ⚠️ **out of scope of app code** — depends on RLS/grants, not verified here |

**B1/B3 are the honest gaps.** They are not failures of the F-10 code; they are the consequence of `authorizeDepartmentResource` having no callers. They must be stated to the Owner, not tested as if they passed.

### Paired cross-department tests — required for every grant found

For the single real grant `ai_data → commerce.deals.read`:

| Operation | Expected | Rationale |
|---|---|---|
| read partner deals **as an `admin` ai_data Head** | **PASS** — `CROSS_DEPARTMENT_ACCESS` | intentional; **not** a leak |
| update/delete partner deals as the same Head | **DENY** — `SCOPE_DENIED` | grant is read-only |
| any other commerce permission | **DENY** | grant is one permission wide |
| read partner deals **as an `analyst`/`moderator` Head** | **DENY** — `PERMISSION_DENIED` | PDP denies before the grant applies |
| commerce Head → any `ai_data` resource | **DENY** — `SCOPE_DENIED` | grant is one-directional |

For `ai_data → marketing`: the permission list is **empty**, so **every** marketing operation must deny. Nothing to pass.

---

## 6. PHASE-4 UAT MATRIX

| Group | Case | Expected | Enforced by | Rehearsed |
|---|---|---|---|---|
| **A. Identity** | A-1 `@tappyai.com` verified | PASS | `checkCorporateIdentity` | ✅ |
| | A-2 non-corporate domain | DENY `NON_CORPORATE_DOMAIN` | same | ✅ |
| | A-3 unconfirmed email | DENY `EMAIL_UNVERIFIED` | same | ✅ |
| | A-4 anonymous identity | DENY `ANONYMOUS_IDENTITY` | same | ✅ |
| | A-5 UUID ≠ Owner UUID | PASS | measured | ✅ |
| | A-6 is not the Owner | PASS | `isOwner: false` | ✅ |
| **B. Scope** | B-1 assigned department (`ai_data`) | visible + reachable | `authorizedScopes` | ✅ |
| | B-2 unassigned department | not visible | `canViewDepartment` false | ✅ |
| | B-3 placeholder department | not visible; empty even if assigned | 0 modules | registry-measured |
| | B-4 no membership at all | `NO_MEMBERSHIP` | `authorization.ts:27` | ✅ |
| **C. Cross-dept** | C-1 `admin` Head reads commerce deals | **PASS `CROSS_DEPARTMENT_ACCESS`** | `authorization.ts:34-43` | ✅ |
| | C-2 same Head writes commerce deals | DENY `SCOPE_DENIED` | `authorization.ts:46` | ✅ |
| | C-3 `analyst` Head reads commerce deals | DENY `PERMISSION_DENIED` | PDP first | **to add** |
| | C-4 commerce Head → ai_data | DENY `SCOPE_DENIED` | one-directional | ✅ |
| | C-5 any marketing operation | DENY | empty permission list | **to add** |
| **D. GLOBAL** | D-1 Head requests `GLOBAL` | DENY `SCOPE_ESCALATION` | `delegation.ts:97` | ✅ (M2 RED) |
| **E. Owner** | E-1 Owner global across 15 | PASS | `buildDepartmentContext` | ✅ |
| | E-2 Owner needs no membership | PASS (0 memberships) | measured | ✅ |
| | E-3 Owner keeps authority after Head exists | PASS | PDP bypass | ✅ |
| **F. Delegation** | F-1 Head → peer Head | DENY `CANNOT_CREATE_PEER_OR_HIGHER` | `delegation.ts:110` | ✅ (M7 RED) |
| | F-2 Head → `GLOBAL` | DENY | `delegation.ts:97` | ✅ |
| | F-3 Head → Owner | DENY `CANNOT_MODIFY_OWNER` | `delegation.ts:86` | ✅ (M3 RED) |
| | F-4 self-grant | DENY `CANNOT_SELF_GRANT` | `delegation.ts:91` | ✅ (M4 RED) |
| | F-5 assign `ULTIMATE_OWNER` | DENY `OWNER_IS_SINGULAR` | `delegation.ts:81` | ✅ |
| **G. Isolation** | G-1 no access outside explicit capability | per §5 | PDP + scope | partial |
| | G-2 no fabricated data | PASS — exactly 1 real department | `authorizedScopes` | ✅ |
| | G-3 enforcement is server-side, not client-only | PASS for membership; **nav filter is presentation** | §0 | ✅ / ⚠️ |
| | G-4 direct URL/API attempt still authorized server-side | ⚠️ **by PDP/role only — no department check** | §0 | **cannot pass as written** |
| **H. Audit** | H-1 assignment | `org.membership_assigned` + actor/target | `membershipService` | ✅ |
| | H-2 suspension | `org.membership_suspended` | same | ✅ |
| | H-3 reactivation | `org.membership_reactivated` | same | **to add** |
| | H-4 removal | `org.membership_removed` | same | ✅ |
| | H-5 actor identity on every event | Owner uuid + email | same | ✅ |
| | H-6 target identity | Head uuid | same | ✅ |
| | H-7 chain integrity | **NOT verifiable locally** | DB trigger | ❌ see below |

**Distinction the matrix enforces throughout:** C-1 is an **explicitly authorized cross-department read** and must be recorded as a PASS. C-2 through C-5 are **unauthorized cross-department access** and must DENY. Conflating the two is what the old wording did.

---

## 7. `support@tappyai.com` — REQUIRED VERIFICATION BEFORE IT IS A CANDIDATE

**The address string is not evidence of an identity.** Measured: `tappyai.com` mail is **Cloudflare Email Routing** (MX `route1/2/3.mx.cloudflare.net`, SPF `include:_spf.mx.cloudflare.net`, no Google MX, no `google-site-verification` TXT) — forwarding only, which creates **no mailbox and no account**. `support@tappyai.com` currently exists as a **routing rule**, and does **not** exist in Supabase auth.

It becomes a candidate only after **all** of the following are independently verified:

1. it authenticates successfully (Google, or email OTP — the Option B boundary reads neither `provider` nor `hd`);
2. a Supabase auth user exists for it, `is_anonymous = false`, `email_confirmed_at` set;
3. `checkCorporateIdentity` returns `ok` on the real record;
4. a **`profiles` row exists** — created on first sign-in; `department_membership.user_id` references `profiles(id)`;
5. its uuid **differs** from the Owner's `f9077a52…`;
6. it holds **no** existing membership;
7. it carries **no unexpected `admin_roles`**, and its role is deliberately set to `analyst` or `moderator` per §4.

Until 1–7 are measured on the real record, `support@tappyai.com` is a **proposal, not a candidate**.

---

## 8. CURRENT PRODUCTION STATE — verified read-only

| | |
|---|---|
| `department_membership` | **0** |
| Department Heads | **0** |
| `CONTROLLER_ORG_MEMBERSHIP_ENABLED` | **OFF** — 0 entries in Production, Preview, Development |
| Ultimate Owner | **`founder@tappyai.com`** (`f9077a52…`), active in `platform_owner` |
| F-10 | **INACTIVE** |
| Production version | `/api/version` → `6f0296eacc2365ad989a2cb90d74f20236c75296b` |
| Membership API | present, gated — `GET /api/admin/org/memberships` → **405**, `x-matched-path: /api/admin/org/memberships` |

---

## 9. OWNER DECISIONS

### DECISION A — First Head configuration
**`ai_data` + `AdminRole: analyst`**, one `DEPARTMENT_HEAD` membership scoped to `ai_data`.
Measured basis: `analyst` holds **4** permissions (`dashboard.home.view` + three `analytics.*.read`), **all read/low, no commerce, no write, no destructive**, reaching **2 of 10** admin routes — both read-only GETs. `moderator` holds the identical 4 today; `analyst` is preferred so a future widening of `moderator` cannot silently enlarge the first Head. **Never `admin` or `super_admin`.**

### DECISION B — Membership authority
**Owner / `super_admin` only.** `security.membership.read` and `.manage` are both `defaultRoles: ['super_admin']`; `.manage` is `riskLevel: critical`. Heads receive no global membership administration. *(Unchanged.)*

### DECISION C — F-10 activation semantics ← **the real choice**

| | **Option 1 — accept as navigation/context scoping** | **Option 2 — block until resource enforcement is wired** |
|---|---|---|
| What ships | department-aware navigation + role/PDP authorization + audited membership | the same, **plus** `authorizeDepartmentResource` wired into department-owned admin routes |
| Time to first Head | immediate once the identity is verified | delayed by an implementation + review + deploy cycle |
| Risk of the first Head | bounded by the `analyst` role: 2 read-only endpoints | identical — the role, not the wiring, is what bounds them |
| What may be claimed | "department-aware navigation" | "department-scoped resource authorization" |
| What must NOT be claimed | department isolation of APIs | — |
| Cost of deferring | the misleading `navDepartment.ts:11-13` comment stays in the tree; a future reader may over-trust it | none |
| Reversibility | flag OFF → byte-for-byte unchanged | same |

**Recommended immediate path: Option 1**, with resource enforcement tracked as a separate security-hardening phase — **but only if the Owner explicitly accepts, in writing, that F-10 is NOT resource isolation.** Without that acknowledgement the recommendation does not stand, because the risk of Option 1 is not technical but descriptive: a Controller believed to isolate departments when it does not.

**This choice is the Owner's. It is presented, not made.**

### DECISION D — Second corporate identity
`support@tappyai.com` is a candidate **only** after all 9 verification checks pass on the real Supabase Auth record (see `FOUNDATION-10_HEAD_UAT_PLAN.md` §5). A forwarded address is not an identity. *(The Head need not be a different person: `delegation.ts` gates on uuid, never on humanity.)*

### DECISION E — Activation
A **separate, explicit authorization**, only after a passing Head UAT against `FOUNDATION-10_HEAD_UAT_PLAN.md` §3.

## 10. OPEN RISKS CARRIED INTO ACTIVATION

1. **Department scope is not enforced on APIs** (§0) — **now audited and resolved as a decision, not a blocker.** Classification: **INCOMPLETE (staged, not overlooked)** — `authorization.ts` is built and tested but never wired, while `navDepartment.ts:11-13` wrongly describes it as an active boundary. **It is NOT a prerequisite for activating `ai_data` + `analyst`**, because that role grants only 4 read/low permissions. It **is** a prerequisite before F-10 may be *called* department isolation. Two follow-ups, neither implemented: (a) wire `authorizeDepartmentResource` into department-owned admin routes behind the same flag; (b) correct the `navDepartment.ts` comment. Full analysis: `FOUNDATION-10_RESOURCE_ENFORCEMENT_DECISION.md`.
2. **The audit hash chain has no runtime harness.** `embedded-postgres` sits in `package.json` **unused**; `auditChainInvariants.test.ts` asserts SQL **source text** and is the suite carrying the CRLF condition. The first real membership will be the trigger's first live exercise.
3. **`ownedPermissions` is inventory, not enforcement**, and already contains one non-existent entry (`analytics.read`). Nothing breaks today, but it cannot be cited as a capability boundary.
4. **Direct-database membership mutation** is bounded by RLS/grants, not by app code, and was not verified in this pass.
5. **The flag is a single global switch** — no per-department or per-user staged rollout.

> **A green rehearsal is not activation authority.** Sequence unchanged: verify the real second identity → Owner selects the department → create the membership through the deployed API → Head UAT against §6 → **separate explicit authorization** before the flag.

# FOUNDATION-10 — Resource Enforcement Decision Memo

**Security / architecture audit. READ-ONLY. Documentation only.** No production mutation, no Auth mutation, no membership, no flag change, no deploy, no commit, no push, no PR, no source change.
**Measured against `origin/main` = production `6f0296e`.** Previous reports were not used as authority.

---

## 1. EXECUTIVE DECISION

**Verdict: 2 — SAFE ONLY AS NAVIGATION / PRESENTATION SCOPE.**

F-10 may be activated with a first Head of **`ai_data` + `analyst`** without first building department-aware resource authorization. It is safe **because the `analyst` role itself grants only 4 read/low permissions** — not because department membership restricts anything.

**Classification of the gap: B — INCOMPLETE (staged, not overlooked).** The department resource gate is written, tested and correct; it simply has no callers, and no phase ever claimed to have wired it. One source comment nevertheless describes it as an active boundary, which overstates today's enforcement.

F-10 must therefore be described to stakeholders as **department-aware navigation**, never as department isolation.

---

## 2. CURRENT ARCHITECTURE — the six layers

| Layer | Enforced? | Where | Canonical function | Server-side? | Affects direct API? | Bypassable by calling the endpoint directly? | Intentional per source? |
|---|---|---|---|---|---|---|---|
| **A — Identity boundary** | ✅ **Yes** | `rbac.ts:198` inside `resolveActorForUser` | `checkCorporateIdentity` | Yes | **Yes** | **No** — every admin route enters through `resolveActor` | Yes — Option B design |
| **B — Role / PDP** | ✅ **Yes** | `guards.ts:18` | `permissionEngine.authorize` | Yes | **Yes** | **No** — it *is* the API decision | Yes |
| **C — Department membership** | ⚠️ **Loaded, never consulted for resources** | `admin/layout.tsx:50` only | `resolveActorMemberships` | Yes | **No** | n/a — it never participates | See §6 |
| **D — Module / navigation filter** | ✅ Yes, when flag ON | `admin/layout.tsx:49-52` | `filterNavByDepartment` | Yes (SSR) | **No** | **Yes** — hiding a menu item does not gate the route | Yes — layout comment line 47 |
| **E — Resource / API authorization** | ❌ **NOT enforced by department** | — | `authorizeDepartmentResource` — **zero callers** | n/a | **No** | n/a | **No — see §6** |
| **F — Audit** | ✅ Yes | `guards.ts:25,31`; `deals/route.ts:54`; `deals/[id]/route.ts:45,89`; `membershipService` | `writeAuditLog`, `auditAuthorizationDecision` | Yes | Yes | No | Yes |

**Supporting measurements**

- `Actor` has exactly 8 fields — `userId, email, isOwner, roles, highestRole, capabilities, source, resolvedAt`. **No membership, department, scope or org field.** The PDP therefore *cannot* consider membership; the data never reaches it.
- `permissionEngine.authorize(actor, permission, now)` — no membership parameter.
- `CAPABILITY_GATE_ENABLED = false` (`engine.ts:36`) and `Actor.capabilities` is hardcoded `NO_CAPABILITIES` (`rbac.ts:215`), so the capability gate is inert and is **not** a department link.
- Grepping `department` across all 10 `/api/admin/**/route.ts` files matches **only** `org/memberships/route.ts`.
- `Department.ownedPermissions` has **no runtime consumer** (definition, type, tests only). `Department.modules` is consumed by `context.ts:26,61` and `navDepartment.ts:25`.

---

## 3. REQUEST TRACE

### 3.1 `GET /api/admin/deals` — a Commerce resource

| Step | Executes? | Evidence |
|---|---|---|
| HTTP request | ✔ | `deals/route.ts:16` |
| `requirePermission(req, COMMERCE_DEALS_READ)` | ✔ | `deals/route.ts:18` |
| → authentication (`resolveActor`) | ✔ | `guards.ts:6-7`, 401 on failure |
| → **corporate boundary** | ✔ | `rbac.ts:198` `checkCorporateIdentity`, 403 on failure |
| → Actor construction (single site) | ✔ | `rbac.ts:194-215` |
| → Owner Gate | ✔ | `guards.ts:11-15` |
| → **canonical PDP** | ✔ | `guards.ts:18` |
| → role permission resolution | ✔ | `engine.ts:61-95` |
| **department context** | ✘ **never called** | no `resolveActorMemberships` in this path |
| **department membership** | ✘ **never consulted** | not an `Actor` field |
| **resource authorization (department)** | ✘ **never called** | `authorizeDepartmentResource` has zero callers |
| rate limit | ✔ | `deals/route.ts:19` |
| handler → data access | ✔ | `listAllDealsForAdmin()` → `partner_deals` |
| audit | ✔ on deny (`guards.ts:25`); mutations audit at `deals/route.ts:54`, `deals/[id]/route.ts:45,89` |

**Layers that execute: A, B, F. Layers that do not: C, D, E.**

### 3.2 `GET /api/admin/analytics/auth` — an AI/Data resource

Identical shape: `requirePermission(req, ANALYTICS_AUTH_READ)` (`analytics/auth/route.ts:17`) → same-origin → rate limit → schema → service. **No department layer anywhere.** Layers A, B execute; C, D, E do not; F only on denial (this is a read).

**Conclusion — proven, not assumed:** department membership **does not reach resource authorization** on either endpoint.

---

## 4. SECURITY PROOF MATRIX

Local, read-only: `src/lib/controller/org/__tests__/f10ResourceEnforcementProof.test.ts` — **12/12 pass**. It drives `permissionEngine.authorize`, which *is* the decision `/api/admin/*` reaches (`guards.ts:18`).

| # | Case | Result | Meaning |
|---|---|---|---|
| P-0.1 | `Actor` field list | 8 fields, **none** membership-related | the PDP structurally cannot see membership |
| P-0.2 | `authorize` arity | ≤ 3, no membership parameter | same |
| A | ai_data resource (`analytics.auth.read`), Head = `analyst` | **ALLOW** | granted by the **role** |
| B | commerce read (`commerce.deals.read`), Head = `analyst` | **DENY** | role lacks it — not the department |
| C | commerce destructive (`commerce.deals.delete`), Head = `analyst` | **DENY** | role lacks it |
| D | direct API call — does membership contribute any denial? | **No** | membership is not an input |
| E | placeholder-department membership | **changes no API decision**; a wired gate would still deny (0 modules) | nav-only effect |
| **F** | **`ai_data` membership + `analyst`  vs  no membership + `analyst`** | **IDENTICAL `allowed` and `reason` for every permission tested** | see statement below |
| — | `admin` Head, `commerce.deals.delete` | **ALLOW regardless of department** | role sets blast radius |
| P-3.1 | unwired gate: ai_data Head → ai_data resource | ALLOW | the gate works |
| P-3.2 | unwired gate: ai_data Head → `commerce.deals.update` | **DENY `SCOPE_DENIED`** — **while the real API path ALLOWS it** | the exact gap, side by side |
| P-3.3 | unwired gate: no membership | DENY `NO_MEMBERSHIP` | the gate works |

> **Department membership currently does not participate in resource authorization.**

---

## 5. MEMBERSHIP vs ROLE/PDP — what each actually controls

| Question | Department membership | Role / PDP |
|---|---|---|
| Which menu items appear (flag ON) | **Decides** | Decides first; department narrows |
| Which API endpoints answer | **No effect** | **Decides** |
| Which rows are returned | No effect | No effect — handlers are not row-scoped |
| Who may mutate memberships | Bounds a Head via `canDelegate` | `security.membership.manage` (super_admin) gates entry |
| Blast radius of a compromised Head | **None** | **Everything** |

**Operational consequence:** the security question for the first Head is *"which `AdminRole`?"*, not *"which department?"*.

---

## 6. INTENTIONAL vs INCOMPLETE — determination

**Verdict: B — INCOMPLETE (staged, not overlooked).**

Evidence *for* intentional:
- `navDepartment.ts:9-10` — *"NOT wired into the live AdminShell in this phase (flag OFF, F-06 code undeployed). Proven here so F-07D can wire it behind the flag with no logic change."* The codebase deliberately builds pure modules, proves them, and wires them a phase later. F-07D duly wired the **navigation** half.
- `admin/layout.tsx:47` — *"This is presentation only; server authorization (page guards + the membership API) remains the boundary for direct access."* This sentence is **accurate**: it names page guards and the membership API, and claims no department resource enforcement.

Evidence *for* incomplete — decisive:
- `navDepartment.ts:11-13` — *"hiding a module from nav is UX only — server authorization (**`authorizeDepartmentResource`** + the module's PDP guard) **remains the boundary** for direct URL/API access."* This names the department resource gate as an **active** boundary. It is not active: it has zero callers. The sentence describes an architecture that was intended but never completed.
- `departmentAuthorization.test.ts:10-15` states the intended contract as a **chain**: *"permission is decided by the canonical PDP; the department SCOPE / OWNERSHIP / cross-department ACCESS gate only further restricts."* A chain whose second link is never invoked is an unfinished chain, not a design choice.
- `authorization.ts` is complete: PDP-first, Owner bypass, `NO_MEMBERSHIP` fail-closed, `OWNED_SCOPE`, `CROSS_DEPARTMENT_ACCESS`, `SCOPE_DENIED` — built and tested for a job it never performs.

So: **the architecture intends membership to restrict resources; the wiring was never done.** The staging is intentional; the resulting security posture is weaker than one source comment asserts. That gap must be closed either in code or in the documentation — it should not be left as-is, because a future reader of `navDepartment.ts:12` will reasonably believe direct API access is department-gated.

---

## 7. WHAT F-10 GUARANTEES (with the flag ON)

- Department-aware **navigation**: a Head sees only their department's modules; department-neutral modules stay visible.
- The **Owner** remains global across all 15 departments and needs no membership.
- **Role/PDP permissions** are enforced on every admin route, server-side, unbypassable by calling the endpoint directly.
- The **corporate identity boundary** (Option B) is enforced on every admin route.
- **Explicit capability restrictions** on membership mutation: `canDelegate` refuses `ULTIMATE_OWNER`, Owner targets, self-grant, scope escalation and peer-Head creation.
- **Audit** of every membership mutation, naming actor and target.
- **Instant rollback**: flag OFF returns behaviour to byte-for-byte today.

## 8. WHAT F-10 DOES NOT GUARANTEE

- ❌ **Department membership does not restrict direct API resource access.** A Head who knows a URL reaches any endpoint their **role** permits, in any department.
- ❌ Navigation filtering is **not** a security control — it is UX.
- ❌ No row-level or record-level scoping: handlers return the full result set their permission allows.
- ❌ The `ai_data → commerce.deals.read` grant is **not** what limits a Head to reading; the role is. An `admin` Head reaches commerce **write and delete** regardless of department.
- ❌ Placeholder-department membership confers nothing and restricts nothing at the API.
- ❌ Direct-database membership mutation is bounded by RLS/grants, not verified here.

---

## 9. FIRST-HEAD RECOMMENDATION

Measured: the registry declares **16 permissions**. `analyst` holds **4**, `moderator` holds **the identical 4**, `admin` holds **11**, `super_admin` holds **16**.

`analyst` / `moderator` = `dashboard.home.view`, `analytics.auth.read`, `analytics.activation.read`, `analytics.content.read` — **all `category: read`, `riskLevel: low`**, and **zero commerce permissions**.

| Config | Reachable permissions | Write? | Destructive? | Public-data exposure | Verdict |
|---|---|---|---|---|---|
| **A. `ai_data` + `analyst`** | 4 (all read/low), all inside ai_data + home | none | none | none | ✅ **RECOMMENDED** |
| **B. `ai_data` + `moderator`** | **identical 4** — equivalent to A today | none | none | none | ✅ acceptable; no advantage over A |
| **C. `commerce` + `analyst`** | the same 4 — **none of which is a commerce permission** | none | none | none | ⚠️ safe but **null UAT** — the Head can reach nothing in their own department |
| **D. `commerce` + `admin`** | 11, incl. `deals.create`/`update` (write/medium) and **`deals.delete` (destructive/high)** | **yes** | **yes** | **HIGH** — `partner_deals` feeds the public `/api/deals` | ❌ **reject for a first Head** |

**Recommendation: A — `ai_data` + `analyst`.** Prefer `analyst` over `moderator` purely because the name states the intent; the permission sets are identical, so if `moderator` ever gains a permission, `analyst` is the safer default.

Note the interaction: at `analyst` the intentional `ai_data → commerce.deals.read` grant is **unreachable**, because the PDP denies `commerce.deals.read` before the cross-department grant is consulted (`authorization.ts:16-19`). The documented exception is therefore inert for the first Head.

---

## 10. REQUIRED CHANGES BEFORE ACTIVATION

**None are required for verdict 2.** Activating `ai_data` + `analyst` weakens nothing: it adds a navigation filter and a membership row, and the Head's reach is already bounded by a 4-permission read-only role.

Two items are required **before F-10 may be described as department isolation** — neither is implemented here:

1. **Wire the resource gate.** Minimum change: at each department-owned admin route, after `requirePermission` succeeds, call `authorizeDepartmentResource(actor, await resolveActorMemberships(actor), { ownerDepartment, permission })` and return 403 on denial — behind the same flag, so OFF is byte-for-byte unchanged. The function already exists and is tested; this is wiring, not design. **Not implemented in this pass.**
2. **Correct `navDepartment.ts:11-13`**, which currently names `authorizeDepartmentResource` as an active boundary. Either wire it (item 1) or reword the comment. **Not changed in this pass.**

A third, separate: the audit hash chain still has **no runtime harness** (`embedded-postgres` present in `package.json`, unused; `auditChainInvariants.test.ts` asserts SQL source text). The first real membership will be the trigger's first live exercise.

---

## 11. PRODUCTION STATE — verified read-only, UNCHANGED

| | |
|---|---|
| Production version | `6f0296e` |
| `department_membership` | **0** |
| Department Heads | **0** |
| `CONTROLLER_ORG_MEMBERSHIP_ENABLED` | **OFF** in all environments |
| Owner | `founder@tappyai.com` |
| Membership API | deployed, feature-gated |
| F-10 | **INACTIVE** |

Nothing in this audit changed production, Auth, Vercel, Supabase data, or any source file.

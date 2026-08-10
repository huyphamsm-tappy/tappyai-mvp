# FOUNDATION-10 — Head UAT Plan & Activation Sequence

**PLAN ONLY. Nothing executed.** No membership, no Head, no flag, no Vercel/Supabase change, no deploy, no commit, no push, no PR, no source change.
**Measured against `origin/main` = production `6f0296e`.**

**Governing contract for this entire document:**

> A Head can access only resources authorized by the canonical PDP for the Head's **role**. Department membership currently constrains **navigation/context**, not direct API authorization.

---

## 1. UAT ASSERTION AUDIT — what is testable, and what the correct result is

| UAT assertion | Testable today? | Correct result | Reason |
|---|---|---|---|
| Corporate identity required on every admin surface | ✅ Yes | **PASS** | `rbac.ts:198` `checkCorporateIdentity` inside the single Actor construction site; every route enters via `resolveActor` |
| Non-corporate identity denied | ✅ Yes | **PASS** (403) | same boundary |
| Head restricted to PDP permissions of their role | ✅ Yes | **PASS** | `guards.ts:18` is the API decision |
| Head cannot mint `ULTIMATE_OWNER` | ✅ Yes | **PASS** | `delegation.ts:81` |
| Head cannot target the Owner | ✅ Yes | **PASS** | `delegation.ts:86` |
| Head cannot self-grant | ✅ Yes | **PASS** | `delegation.ts:91` |
| Head cannot grant `GLOBAL` | ✅ Yes | **PASS** | `delegation.ts:97` |
| Head cannot create a peer Head | ✅ Yes | **PASS** | `delegation.ts:110` |
| Membership mutations audited | ✅ Yes | **PASS** | `membershipService` → `writeAuditLog` |
| Owner stays global without membership | ✅ Yes | **PASS** | `buildDepartmentContext(true, [])` |
| Nav shows only the Head's department modules | ✅ Yes (flag ON) | **PASS** | `filterNavByDepartment`, `admin/layout.tsx:49-52` |
| ~~"Head cannot access another department"~~ | ❌ **Not testable as stated** | **REMOVE** | Department is not an input to the API decision; `Actor` carries no membership field |
| ~~"direct URL/API remains blocked by department"~~ | ❌ **Not testable as stated** | **REMOVE** | `authorizeDepartmentResource` has zero callers |
| ~~"department membership isolates resources"~~ | ❌ **False today** | **REMOVE** | Proven: membership vs no-membership give identical PDP decisions |
| **Replacement:** "a Head reaches exactly the endpoints their role's permissions allow, in any department" | ✅ Yes | **PASS** | §3 group G |
| **Replacement:** "department membership changes navigation, not API authorization" | ✅ Yes | **PASS** | §3 groups F + G |

**Three assertions are struck.** They are not failing tests — they describe enforcement that does not exist. Running them would produce either a false alarm or a "fix" that removes intended behaviour.

---

## 2. HEAD UAT DESIGN

| Parameter | Value |
|---|---|
| Identity | `support@tappyai.com` — **only** if §5 verification passes all 9 checks |
| Department | `ai_data` |
| `AdminRole` | **`analyst`** |
| Membership | exactly one, `orgRole: DEPARTMENT_HEAD`, `scope: ai_data`, `status: active` |
| Created by | the Owner, **through the deployed Membership API only** — never direct SQL |

**No membership is created by this document.**

### What `analyst` can actually reach — measured

The registry declares **16** permissions. `analyst` holds **4**; `moderator` holds **the identical 4**; `admin` **11**; `super_admin` **16**.

`analyst` = `dashboard.home.view`, `analytics.auth.read`, `analytics.activation.read`, `analytics.content.read` — **all `category: read`, `riskLevel: low`**, **zero commerce permissions**, **zero write**, **zero destructive**.

Mapping those to the 10 admin routes:

| Route | Method | Permission | `analyst` |
|---|---|---|---|
| `/api/admin/analytics/auth` | GET | `ANALYTICS_AUTH_READ` | ✅ **ALLOW** |
| `/api/admin/analytics/activation` | GET | `ANALYTICS_ACTIVATION_READ` | ✅ **ALLOW** |
| `/api/admin/audit` | GET | `AUDIT_LOG_READ` | ❌ DENY |
| `/api/admin/deals` | GET / POST | `COMMERCE_DEALS_READ` / `_CREATE` | ❌ DENY |
| `/api/admin/deals/[id]` | PATCH / DELETE | `COMMERCE_DEALS_UPDATE` / `_DELETE` | ❌ DENY |
| `/api/admin/deals/upload` | POST | `COMMERCE_DEALS_UPLOAD_MEDIA` | ❌ DENY |
| `/api/admin/org/memberships` | POST/PATCH/DELETE | `SECURITY_MEMBERSHIP_MANAGE` | ❌ DENY |
| `/api/admin/rbac/roles` | GET / POST | `SECURITY_ROLES_READ` / `_GRANT` | ❌ DENY |
| `/api/admin/rbac/roles/[id]` | DELETE | `SECURITY_ROLES_REVOKE` | ❌ DENY |
| `/api/admin/settings` | GET | `SETTINGS_CONFIG_READ` | ❌ DENY |

**2 of 10 routes reachable — both read-only GETs.** `analytics.content.read` is held but has **no route** today; `dashboard.home.view` is a page permission, not an API.

---

## 3. UAT MATRIX

### A. Login / corporate boundary

| # | Case | Expected | Enforced by |
|---|---|---|---|
| A-1 | sign in as the verified `@tappyai.com` identity | **PASS** — reaches `/admin` | `checkCorporateIdentity` |
| A-2 | sign in with a non-corporate address | **DENY** 403 / redirect | same |
| A-3 | anonymous session reaching `/admin` | **DENY** | `ANONYMOUS_IDENTITY` |
| A-4 | unconfirmed corporate email | **DENY** | `EMAIL_UNVERIFIED` |

### B. Owner boundary

| # | Case | Expected |
|---|---|---|
| B-1 | Head attempts any membership change targeting the Owner | **DENY** `CANNOT_MODIFY_OWNER` |
| B-2 | Owner remains global, all 15 departments, zero memberships | **PASS** |
| B-3 | Owner retains membership authority after the Head exists | **PASS** |

### C. Membership boundary

| # | Case | Expected |
|---|---|---|
| C-1 | Head creates another `DEPARTMENT_HEAD` | **DENY** — at `analyst`, `PERMISSION_DENIED` (PDP) before delegation is reached |
| C-2 | Head grants `GLOBAL` scope | **DENY** — same; `SCOPE_ESCALATION` if the PDP were passed |
| C-3 | Head targets the Owner | **DENY** |
| C-4 | Head self-grants | **DENY** |
| C-5 | Head assigns `ULTIMATE_OWNER` | **DENY** `OWNER_IS_SINGULAR` |

> At `analyst` every C case is refused by the **PDP** (`security.membership.manage` is `super_admin`-only), so the delegation guards are never reached. That is correct defence in depth — the delegation layer was proven independently by the local rehearsal (mutations M2/M3/M4/M7 all RED).

### D. PDP

| # | Case | Expected |
|---|---|---|
| D-1 | `GET /api/admin/analytics/auth` | **PASS** |
| D-2 | `GET /api/admin/analytics/activation` | **PASS** |
| D-3 | `POST /api/admin/deals` (commerce write) | **DENY** 403 |
| D-4 | `DELETE /api/admin/deals/[id]` (commerce destructive) | **DENY** 403 |
| D-5 | any marketing operation | **DENY** — marketing owns 0 permissions; nothing exists to call |
| D-6 | `GET /api/admin/audit`, `/settings`, `/rbac/roles` | **DENY** 403 |

### E. Cross-department exception — `ai_data → commerce.deals.read`

| # | Case | Expected | **Why** |
|---|---|---|---|
| E-1 | Head (`analyst`) calls `GET /api/admin/deals` | **DENY 403** | **This is a role/PDP denial, NOT department isolation.** `commerce.deals.read` requires `admin`+; `analyst` does not hold it, so the PDP refuses at `guards.ts:18` before any department logic could apply |
| E-2 | documented for the record | the grant `ai_data --analyze--> commerce ['commerce.deals.read']` **exists and is intentional** | it is simply **unreachable at `analyst`** |
| E-3 | `ai_data --analyze--> marketing` | grants **nothing** — permission list is empty | inert entry |

**Do not record E-1 as proof of department isolation.** It is proof that the role is narrow.

### F. Navigation (flag ON)

| # | Case | Expected |
|---|---|---|
| F-1 | AI/Data modules visible to the Head | **PASS** |
| F-2 | Commerce modules hidden from the Head's nav | **PASS** — *UX only; see G* |
| F-3 | placeholder departments show no modules | **PASS** — 0 modules each |
| F-4 | Owner sees all 15 departments | **PASS** |
| F-5 | department-neutral modules stay visible | **PASS** — modules absent from `MODULE_OWNER` are never hidden (`navDepartment.ts:20-27`) |

### G. Direct API — demonstrating the current architecture

| # | Case | Expected | Meaning |
|---|---|---|---|
| G-1 | endpoint whose permission `analyst` holds → called directly, bypassing the UI | **PASS regardless of department scope** | department is not an input |
| G-2 | endpoint whose permission `analyst` lacks | **DENY 403 by the PDP** | role is the boundary |
| G-3 | Head calls a Commerce endpoint whose permission they lack | **DENY 403** — *by PDP, not by department* | wording matters |
| G-4 | **Control comparison:** the same role with **no** membership calls G-1 | **identical PASS** | proves membership contributes nothing to API authorization |

**G-4 is the assertion that makes the architecture explicit and must be included.**

### H. Audit

| # | Case | Expected |
|---|---|---|
| H-1 | membership assignment | `org.membership_assigned`, actor = Owner uuid + email, target = Head uuid |
| H-2 | suspension | `org.membership_suspended` |
| H-3 | reactivation | `org.membership_reactivated` |
| H-4 | removal | `org.membership_removed` |
| H-5 | every event names the acting Owner | **PASS** |
| H-6 | audit chain integrity | ⚠️ **first live exercise** — no runtime harness exists locally (`embedded-postgres` unused; `auditChainInvariants.test.ts` asserts SQL source text) |

---

## 4. TERMINOLOGY AUDIT

| Statement | Location | Class | Action |
|---|---|---|---|
| "Direct API access — same boundary (`requirePermission` → `resolveActor`)" | `FOUNDATION-10C_CORPORATE_IDENTITY_BOUNDARY.md:176,198` | **A — true** | keep; it refers to the identity boundary, which is enforced |
| "…direct API · direct route · middleware bypass · PDP/membership/cross-department bypass" (adversarial list, all denied) | `FOUNDATION-10C_OPTION_B_DEPLOYMENT_PACKAGE.md:81` | **C — true only when qualified** | it means *"the corporate boundary cannot be bypassed via those paths"*, which is true. A reader may misread it as membership enforcing resources. Qualify if the doc is revised |
| "server authorization (`authorizeDepartmentResource` + the module's PDP guard) **remains the boundary** for direct URL/API access" | **`navDepartment.ts:11-13` (SOURCE)** | **B — false today** | ⚠️ **the only genuinely misleading statement found.** `authorizeDepartmentResource` has 0 callers. **Not changed — source edits are out of scope.** Logged as required future work |
| "This is presentation only; server authorization (page guards + the membership API) remains the boundary" | `admin/layout.tsx:47` (source) | **A — true** | accurate; names page guards + membership API, claims no department resource gate |
| "department SCOPE / OWNERSHIP / cross-department ACCESS gate only further restricts" | `departmentAuthorization.test.ts:10-15` | **D — future architecture requirement** | describes the intended chain; the second link is not wired |
| "Head cannot reach another department by direct route or direct API" | earlier F-10 UAT drafts | **B — false** | already struck in §1; superseded |
| "ai_data is the LEAST isolated first department" | `FOUNDATION-10_LOCAL_REHEARSAL_REPORT.md:113` | **C — true only when qualified** | true *within the nav/scope layer*; at the API layer no department is isolated. Qualified in-place by that report's F-4 |

**No documentation outside the F-10 set claims department isolation** — verified by grep across `docs/`.

---

## 5. IDENTITY VERIFICATION PLAN — `support@tappyai.com`

**A forwarded email address is not an identity.** Measured: `tappyai.com` MX = `route1/2/3.mx.cloudflare.net`, SPF `include:_spf.mx.cloudflare.net`, **no Google MX, no `google-site-verification` TXT** ⇒ Cloudflare Email Routing is **forwarding only** and creates no account. `support@tappyai.com` is currently a **routing rule** and is **absent from Supabase Auth**. Only the actual Supabase Auth record counts.

All nine must pass before any membership operation:

| # | Check | Evidence required |
|---|---|---|
| 1 | sign-in succeeds | a real session for the address (Google **or** email OTP — the boundary reads neither `provider` nor `hd`) |
| 2 | Auth user exists | row in `auth.users` for that email |
| 3 | not anonymous | `is_anonymous = false` |
| 4 | email confirmed | `email_confirmed_at` is a non-empty timestamp |
| 5 | corporate check passes | `checkCorporateIdentity` → `{ ok: true, domain: 'tappyai.com' }` |
| 6 | **`profiles` row exists** | required — `department_membership.user_id` → `profiles(id)`; created on first sign-in |
| 7 | uuid ≠ Owner | differs from `f9077a52…` |
| 8 | no unexpected `admin_roles` | only the deliberate `analyst` grant |
| 9 | `department_membership` = 0 for this user | no pre-existing membership |

**If any check fails: create nothing and stop.**

---

## 6. ACTIVATION SEQUENCE — written, NOT executed

| Phase | Action | Gate |
|---|---|---|
| **0** | Membership API already deployed and feature-gated (`GET` → 405, `x-matched-path` matches) | ✅ done |
| **1** | Verify the second corporate identity against §5 checks 1–9 | all 9 pass |
| **2** | **Owner** creates the first membership through the deployed API: target = verified identity · department = `ai_data` · `orgRole = DEPARTMENT_HEAD` · scope = `ai_data`; separately grant `AdminRole = analyst` | Owner authorization |
| **3** | Verify audit record (`org.membership_assigned`, actor/target correct) and that exactly **one** membership exists | audit + count |
| **4** | Head signs in and runs the complete §3 matrix (A–H) | all rows match expectations |
| **5** | **Only after §3 passes**, the Owner **separately** authorizes `CONTROLLER_ORG_MEMBERSHIP_ENABLED = true` | separate explicit authorization |
| **6** | Re-run Owner UAT + Head UAT with the flag ON; confirm nav scoping appears and nothing else changes | both pass |

> ⚠️ **The flag must never be enabled before a membership exists.** With zero memberships and the flag ON, every non-Owner admin resolves to `NoWorkspace`.
> **Rollback at any point:** set the flag to `false` (or delete it) and redeploy — instantly inert, no data loss, audit preserved. Removing the membership is a separate, audited API call.

---

## 7. RESOURCE-ENFORCEMENT FUTURE WORK — not implemented

1. **Wire `authorizeDepartmentResource`.** At each department-owned admin route, after `requirePermission` succeeds, call it with the actor's memberships and the resource's owning department; deny 403 on refusal; keep it behind the same flag so OFF stays byte-for-byte unchanged. The function is written and tested — this is wiring, not design.
2. **Correct `navDepartment.ts:11-13`**, the only source statement that describes the department gate as active.
3. **Build a runtime harness for the audit hash chain** — today it is asserted at SQL-source level only.

Items 1–2 are prerequisites **only** for describing F-10 as resource isolation. Neither blocks the `ai_data` + `analyst` UAT.

---

## 8. PRODUCTION STATE

`/api/version` = `6f0296e` · `department_membership` **0** · Head **0** · flag **OFF** in all environments · Owner `founder@tappyai.com` · membership API deployed and gated · **F-10 INACTIVE**.

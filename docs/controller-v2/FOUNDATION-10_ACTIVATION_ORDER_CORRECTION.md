# FOUNDATION-10 — Activation Order Correction

**READ-ONLY analysis. Documentation only.** No flag change, no membership, no SQL, no POST mutation, no commit/push/deploy.
**Measured against production `787da3d8baa8c4a722c6d662723ecb681cd420cf`.**

---

## 1. THE CONTRADICTION, STATED PRECISELY

The previous runbook ordered activation as **membership first → Head UAT → flag last**, with the warning *"the flag must never be enabled before the first membership exists."*

**That order is not executable.** Measured on the deployed route:

```
route.ts:41  export async function POST(req: Request) {
route.ts:43    const gated = featureGate(); if (gated) return gated   ← FIRST statement
route.ts:44    const ctx = await requirePermission(...)
route.ts:29  function featureGate() { return orgMembershipEnabled() ? null : adminError('NOT_FOUND', 'Not found', 404) }
```

Live probe on production: `POST /api/admin/org/memberships` → **404**, body `{"error":{"code":"NOT_FOUND"}}`, `x-matched-path: /api/admin/org/memberships` (route present, gate produced the 404).

So: the membership must be created through the API to preserve PDP + delegation + audit, and the API does not exist until the flag is on. **The ordering was written without noticing its own precondition.** This document replaces it.

---

## 2. COMPLETE BLAST SURFACE — every read site of the flag

`git grep orgMembershipEnabled` over production source yields **exactly three behavioural sites** (plus the definition). There are **no write sites**.

| # | Site | Flag OFF | Flag ON, `department_membership` = 0 |
|---|---|---|---|
| 1 | `server.ts:36` `resolveActorMemberships` | short-circuits, returns `[]` | performs the query, returns `[]` (table empty) |
| 2 | `layout.tsx:49` `filterNavByDepartment` | **not called** | called with `memberships: []` |
| 3 | `route.ts:29` `featureGate` | endpoint 404 | endpoint reachable, still behind PDP |

Site 1 yields the **same value** in both states, so everything downstream of it (`buildDepartmentContext` → `homeMode`, `authorizedScopes`, `departmentSummaries`, the F-08 Home) is **identical**. Site 3 is the intended unblock. **Site 2 is the only user-visible delta.**

### What site 2 actually does — proven, not assumed

`src/lib/controller/org/__tests__/f10ActivationWindow.test.ts` — **13/13 pass**:

- **Owner (`isOwner: true`), zero memberships:** `isModuleVisibleForDepartment` returns `true` for every module; `filterNavByDepartment` removes **nothing**; Home stays `owner` with all **15** departments. The flag is a **no-op for the Owner**.
- **Non-Owner, zero memberships:** the **4 department-owned modules** (`tappy.hub.commerce.deals` + the three `tappy.hub.analytics.*`) disappear from nav; every **department-neutral** module stays (`moduleDepartment()` → `null` → always visible). A group made only of department-owned items is dropped.
- **Home equivalence:** `homeMode` is `'none'` for a member-less non-Owner **with the flag OFF as well**, because both states pass `[]`. **`NoWorkspace` is today's behaviour, not a new consequence of enabling the flag.**
- **The window closes immediately** once one `ai_data DEPARTMENT_HEAD` membership exists: mode → `department`, scopes → `['ai_data']`, ai_data nav returns, commerce nav stays hidden.

---

## 3. WHO COULD BE AFFECTED — production evidence, not inference

| Question | Measured answer |
|---|---|
| Every holder of an `admin_role` | **exactly one**: `4dcce7cf-5f49-4c58-9901-2d586e31352d` = `huypham.sm@gmail.com`, `super_admin`, no expiry |
| Does that identity pass the Option B boundary? | **No** — not `@tappyai.com` ⇒ `NON_CORPORATE_DOMAIN` at `rbac.ts:198`, thrown before any RBAC, nav or department logic runs |
| Is it the Owner? | No — its `platform_owner` row is `active: false` (retired by B-1) |
| All corporate `@tappyai.com` identities | **two**: `founder@` (active Owner, 0 `admin_roles` — reaches everything via Owner bypass) and `support@` (**0 `admin_roles`**) |
| **Non-Owner corporate identities holding an admin role** | **0** |
| `department_membership` | **0** |

**The population that site 2 could affect is empty, by measurement.** The only identity whose nav the filter would touch is a non-Owner corporate admin, and there are none: `support@` cannot reach `/admin` at all, because with **zero** `admin_roles` the canonical PDP denies every admin permission before nav is ever built.

---

## 4. IS THERE A SAFE ACTIVATION WINDOW?

**Yes, and it is empty of risk for the population that exists today.**

| Phase | Action | Who is affected |
|---|---|---|
| A | flag → `true` in Production | Owner: **no change** (proven W-1). Retired gmail admin: still blocked by the corporate boundary. `support@`: still blocked by the PDP (no role). **Nobody.** |
| B | `POST /api/admin/org/memberships` — Owner assigns `support@` → `ai_data` → `DEPARTMENT_HEAD` | creates one row; grants `support@` **no access** (see §5) |
| C | verify membership + audit | read-only |
| D | Head UAT | separate authorization |

**No interval exists in which a legitimate user is locked out of the Controller.** The only legitimate Controller user today is the Owner, and the Owner's path (`isOwner`) bypasses every department check at every one of the three sites.

**Rollback:** setting the flag back to `false` (or deleting it) is instant and non-destructive — the membership row survives, the audit row survives, and behaviour returns byte-for-byte to today.

---

## 5. 🔑 A SEQUENCING FACT THE PREVIOUS PLAN MISSED

**The membership API does not grant an `AdminRole`.** `assignMembership` writes only `department_membership`; `admin_roles` is never referenced (the only textual match is a comment).

The `analyst` grant is a **separate mutation** on a **separate route**: `POST /api/admin/rbac/roles`, gated by `PERMISSIONS.SECURITY_ROLES_GRANT` — and **not** gated by `orgMembershipEnabled`. It is available **today**, with the flag off.

Two consequences:

1. **"Phase 2" as previously written bundles two independent mutations.** They have different gates and can be ordered independently.
2. **The membership alone is inert for `support@`.** Without an `AdminRole`, the PDP denies every admin permission, so `support@` cannot enter `/admin` whether or not the membership or the flag exists. **The role grant — not the membership — is what actually grants access**, and it is therefore the more consequential of the two.

---

## 6. IS THERE A NON-FLAG PATH TO THE CANONICAL SERVICE? — measured

| Checked | Result |
|---|---|
| Owner exception inside `featureGate` | **None.** It returns 404 purely on the flag, and runs **before** `requirePermission`, so no identity exists yet to except |
| Other callers of `assignMembership` | **One** — `route.ts:53`, behind the gate |
| Provisioning script / seed / RPC touching `department_membership` | **None** — no match under `scripts/` or `supabase/` |
| Any other route under `api/admin/org` | **None** — only `memberships/route.ts` + `schema.ts` |

⇒ **No existing path creates the first membership through the canonical service without the flag on.** Any such path is new code.

---

## 7. OPTION COMPARISON

| | **A. Flag ON → API mutation → keep flag ON** | **B. Flag ON → API mutation → flag OFF before UAT** | **C. Code change so provisioning is flag-independent** |
|---|---|---|---|
| Security properties | Full canonical chain: corporate boundary → Owner Gate → PDP → delegation → audit | Identical during the mutation | Identical **if** designed correctly; introduces a **new ungated write surface**, which is exactly what the gate was built to avoid |
| Blast radius | Nav filter active; population affected = **0** (§3) | Same, then reverts | New route/flagless path must be re-reviewed and re-mutation-tested from scratch |
| Rollback | flag → `false`, instant, non-destructive | already off | revert a PR + deploy |
| Audit | `org.membership_assigned` written by the single canonical writer | same | same, if it reuses `membershipService` |
| Interval with membership = 0 **and** flag ON | seconds — between A and B | seconds | **none** |
| PR / deploy required | **no** | **no** | **yes** — code, review, CI, Preview, deploy |
| Fits F-10 as it stands | **yes** — this is the staged rollout the flag was designed for | yes, but Head UAT would then run with the flag OFF, so the Head would see the **unscoped** nav — the UAT would not exercise department scoping at all | no — it changes the architecture to work around a gate that is functioning as designed |

**Note on B:** turning the flag off before the UAT means `resolveActorMemberships` returns `[]` again, so the Head resolves to `NoWorkspace` and the department nav filter does not run. **A Head UAT under option B cannot test what F-10 does.** B is only coherent if the intent is to park the membership and defer the UAT.

**Note on C:** the gate is not a defect. It is the staged-rollout mechanism, proven inert by mutation M-M5. Building a bypass around it trades a reversible env-var flip for permanent new code and a second write surface.

**No option is selected here. This is the Owner's decision.**

---

## 8. CORRECTED ACTIVATION ORDER

Replaces *"membership first, flag last"*, which cannot be executed.

| Step | Action | Gate |
|---|---|---|
| 0 | Membership API deployed, gated | ✅ done |
| 1 | Second corporate identity verified | ✅ done — `support@tappyai.com`, `bafa6fc1-29b7-44aa-918c-74bc3af86b25`, all 11 checks pass |
| **2** | **Enable `CONTROLLER_ORG_MEMBERSHIP_ENABLED=true` in Production** | ⛔ **separate Owner authorization** — this is the step the old order got backwards |
| 3 | Owner creates the membership via `POST /api/admin/org/memberships` — `ai_data`, `DEPARTMENT_HEAD` | Owner authorization |
| 4 | Verify membership row + `org.membership_assigned` audit + counts | read-only |
| 5 | Grant `AdminRole = analyst` via `POST /api/admin/rbac/roles` — **independent of the flag; without it the Head has no access at all** | Owner authorization |
| 6 | Confirm `support@` can actually hold a session (`last_sign_in_at` is still **NULL**) | prerequisite for step 7 |
| 7 | Head UAT against the corrected matrix | separate authorization |

> ⚠️ The old warning *"never enable the flag before a membership exists"* is **withdrawn**. Its stated reason — non-Owner admins dropping to `NoWorkspace` — is (a) already today's behaviour with the flag off, and (b) applies to a population measured at **zero**.

---

## 9. PRODUCTION STATE — unchanged by this analysis

`/api/version` `787da3d8…` · `department_membership` **0** · Head **0** · flag **absent in Production/Preview/Development** · `audit_log` **3** · `platform_owner` unchanged (`f9077a52…` active, `4dcce7cf…` retired) · `admin_roles` unchanged (1 row, retired identity) · no Auth mutation.

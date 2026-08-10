# FOUNDATION-10 — Local Production-Safety Rehearsal

**Scope: LOCAL ONLY.** No Supabase write, no Vercel change, no flag enablement, no production membership, no Auth user, no deploy/commit/push/PR.
**Rehearsed against:** `origin/main` = production `6f0296eacc…` (`6f0296e`), verified live as `/api/version` → `6f0296eacc2365ad989a2cb90d74f20236c75296b`.
**Harness:** worktree `tappyai-memberapi`, whose tree is **byte-identical to `origin/main`** (`git diff 23f5d2c origin/main` = empty).

The rehearsal drives the **real** canonical PDP (`permissionEngine`, never mocked), the **real** `membershipService`, the **real** `delegation` layer and the **real** Option B boundary. Only the repository and the audit **sink** are injected — the two seams that would otherwise reach a database.

---

## BASELINE

| Run | Failed tests | Passed | Skipped | Total | Failed files |
|---|---|---|---|---|---|
| #1 — pristine, DB reachable | **3** | 1187 | 0 | 1190 | 1 / 95 |
| #2 — pristine, **rehearsal file removed, same worktree**, DB unreachable | **3** | 1121 | 66 | 1190 | 6 / 95 |
| #3 — with rehearsal file | **3** | 1197 | 20 | 1220 | 2 / 96 |

**The failed-test count is 3 in every run** — the documented CRLF condition in `src/lib/admin/auditChainInvariants.test.ts`, reproduced on the untouched baseline in the same worktree.

⚠️ **Environmental, not attributable to this work:** the `supabase/tests/*` suites require a reachable database and **skip variably between runs** (0 → 66 skipped, 1 → 6 failed files) **with the rehearsal file absent**. This was proven by removing the file and re-running in the same worktree. Any future report quoting a single "N passed" number from this repo without stating DB availability is quoting a moving target.

## TEST DELTA

**+30 tests, 0 new failures.** 1190 → 1220 total; failures constant at 3.

## MEMBERSHIP FLOW

Two synthetic identities, distinct UUIDs:

- **Actor A** — Ultimate Owner, `…-00000000000a`, `founder@tappyai.com`, `isOwner: true`, **0 memberships**
- **Target B** — `…-00000000000b`, `head.aidata@tappyai.com`, not Owner, not the actor
- **C** — third identity, used to prove a Head cannot mint a peer

Assignment ran through `assignMembership` (the same function the deployed route calls). Result: `ok: true`; `repo.activeForUser(B)` = **exactly 1** membership `{ ai_data, DEPARTMENT_HEAD, scope ai_data, active }`; `repo.activeForUser(A)` = **0** — the Owner's global reach never becomes a membership.

## PDP RESULTS

| Actor | Permission | Outcome |
|---|---|---|
| Owner (A) | `security.membership.manage` | **allowed** (Owner bypass) |
| Corporate `admin` (B) | `security.membership.manage` | **PERMISSION_DENIED** — registry reserves it for `super_admin` |
| unauthenticated | — | **UNAUTHENTICATED**, no write |

Policy C (membership authority stays Owner/super_admin) is **enforced by the canonical PDP**, not by the route.

## HEAD UAT (synthetic UUID B)

| Check | Result |
|---|---|
| scoped to `ai_data` only | ✅ `authorizedScopes` = `['ai_data']` |
| global scope | ✅ **false** |
| `homeMode` | ✅ `department` |
| may act on an `ai_data` resource | ✅ allowed |
| may write in `commerce` (`commerce.deals.update`) | ✅ **SCOPE_DENIED** — though the PDP allows it for `admin` |
| commerce Head → `ai_data` resource | ✅ **SCOPE_DENIED** (grant is one-directional) |
| corporate identity with **no** membership | ✅ **NO_MEMBERSHIP** |
| create a peer Head (even **with** `super_admin`) | ✅ denied |
| grant `GLOBAL` (even with `super_admin`) | ✅ denied |
| reach another department (even with `super_admin`) | ✅ denied |
| mint `ULTIMATE_OWNER` | ✅ `OWNER_IS_SINGULAR` |
| target the Owner | ✅ denied |
| fabricated department data | ✅ none — exactly one real department |

## OWNER UAT (synthetic UUID A)

Global ✅ · all **15** registry departments visible ✅ · **0 memberships required** ✅ · `homeMode` = `owner` ✅ · retains membership authority after the Head exists ✅ · unaffected by rollback ✅.

## AUDIT RESULTS

First success emits exactly one event, matching the predicted contract:

```
action: org.membership_assigned · actorId: <A> · actorEmail: founder@tappyai.com
targetType: user · targetId: <B>
afterState: { ai_data, DEPARTMENT_HEAD, scope ai_data, active }
metadata: { by_owner: true }
```

Full lifecycle (assign → suspend → remove) produced **≥3 append-only events, every one naming the acting Owner**. No anonymous mutation is representable.

🚧 **Chain integrity was NOT rehearsed at runtime, and this report will not claim it was.** The hash chain is a **database trigger**; this repo has **no live-DB harness for it** (`embedded-postgres` appears only in `package.json`, unused). `auditChainInvariants.test.ts` asserts the **SQL source text**, and it is the suite carrying the CRLF condition. Runtime chain verification remains available only against a real database.

## ROLLBACK RESULTS

| Check | Result |
|---|---|
| suspend via `setMembershipStatus` | ✅ `ok`, audited `org.membership_suspended` |
| Head loses department access | ✅ `activeForUser(B)` = 0; `authorizedScopes` = `[]` |
| record survives (non-destructive) | ✅ row present with `status: 'suspended'` |
| remove via `removeMembership` | ✅ `ok`, audited |
| Owner still global afterwards | ✅ 15 departments |
| audit history | ✅ append-only, intact |

## MUTATION RESULTS

Seven mutations, each **valid TypeScript** (a mutation that dies on a transform error proves nothing), each restored **byte-exact** via `git checkout --` and verified with `git diff --stat` = empty.

| ID | Mutation | Result |
|---|---|---|
| M1 | `authorization.ts` step 6 fails **open** instead of `SCOPE_DENIED` | **RED** (2) |
| M2 | scope-escalation guard disabled (allows `GLOBAL`) | **RED** (1) |
| M3 | Owner-targeting guard disabled | **RED** (1) |
| M4 | self-grant guard disabled | **RED** (1) |
| M5 | canonical PDP check disabled in `assignMembership` | **RED** (2) |
| M6 | audit write removed from the success path | **RED** (2) |
| M7 | peer-Head guard disabled | **RED** (1) |

**No mutation stayed GREEN**, so step 14's "investigate a surviving mutation" did not arise. **No test was weakened.** The two tests that failed on first run were corrected because *my assumptions* were wrong, not the code — both are documented under Security Findings.

## SECURITY FINDINGS

### 🔑 F-1 — `ai_data` is the LEAST isolated first department, not the most

`CROSS_DEPARTMENT_ACCESS` (`departments.ts`) contains exactly one real grant:

```
ai_data --analyze--> commerce   permissions: ['commerce.deals.read']
ai_data --analyze--> marketing  permissions: []            (empty)
```

`authorization.ts:34-43` honours it, so **an `ai_data` Department Head CAN read `commerce` partner deals** — by design ("governed READ/ANALYZE, never ownership").

Two consequences the Owner must see:

1. **My own recommendation needs qualifying.** The decision package recommended `ai_data` partly as the safer choice. That holds for **writes** — the cross grant is read-only, one permission wide, and one-directional (`commerce` reaches nothing in `ai_data`). But `ai_data` is the *only* department with any cross-department reach, so it is the **weakest** choice for *demonstrating* isolation. `commerce` has no cross grant at all and would prove isolation more cleanly — at the cost of its `partner_deals` feeding the public `/api/deals`.
2. **The F-10 Phase-4 UAT wording is wrong as written.** It says the Head "cannot reach another department by direct route or direct API". Against an `ai_data` Head that assertion **fails on a deliberate design grant**. Had this run first on production, it would have produced either a false security alarm or a "fix" that removed intended governance.

*This finding alone justifies the rehearsal.*

### F-2 — an unauthenticated membership attempt leaves **no audit row**

`membershipService.deny()` guards its emit with `if (actor)`. An unauthenticated call therefore writes nothing **and audits nothing**. Defensible — the audit schema requires `actorId`/`actorEmail`/`actorRole`, which a null actor cannot supply — and unreachable in production, where the route's `requirePermission` returns 401 before the service is entered. Now pinned by test so the trade-off cannot change silently. **Not treated as a defect**; flagged so it is a decision on record rather than an accident.

### F-3 — no runtime harness exists for the audit hash chain

See AUDIT RESULTS. Structural gap, pre-existing, unchanged by this work.

### 🔑 F-4 — department membership gates NAVIGATION, not API access *(added in the post-rehearsal source re-audit)*

Measured on `origin/main`:

- **`authorizeDepartmentResource` has ZERO callers** — only re-exported by `org/index.ts:12` and named in a comment at `navDepartment.ts:12`. No route, no page invokes the department resource gate.
- **`Department.ownedPermissions` is read by nothing that enforces** — only `departments.ts` (definition), `types.ts:50` (type) and `departmentAuthorization.test.ts`.
- **Every `/api/admin/*` route gates on the canonical PDP permission alone.** Grepping `department` across all 10 admin route files matches **only** `org/memberships/route.ts`. `/api/admin/deals` → `COMMERCE_DEALS_READ/_CREATE`; `/api/admin/deals/[id]` → `_UPDATE` / `_DELETE`; `/api/admin/analytics/auth` → `ANALYTICS_AUTH_READ`.
- `admin/layout.tsx:49-52` applies `filterNavByDepartment` when the flag is ON, and the source says so at line 47: *"This is presentation only; server authorization … remains the boundary for direct access."*

**Therefore a Head's real API reach is set by their `AdminRole`, not their department.** This is the phase's documented design, not a defect — but it means the Phase-4 lines "no access outside explicit capability" and "direct API/URL attempts still go through server authorization" **cannot be claimed as department isolation**, and it changes which department is the safe first choice (see the Owner Decision Package §3-§4).

### F-5 — `ai_data` owns 3 permissions, not 4

`ai_data.ownedPermissions` lists `analytics.read`, which **is not a permission id** — it is the `capability` label on the three analytics permissions (`registry.ts:46, 61, 74`). Verified: `id: 'analytics.read'` matches **0** entries in the registry. Inert today because nothing reads `ownedPermissions` (F-4), but the "commerce 4 / ai_data 4" symmetry used in earlier comparisons was false: **commerce 4, ai_data 3**.

## REMAINING PRODUCTION RISKS

1. **Nothing here proves production behaviour.** The rehearsal exercises real logic with an in-memory repository. It does **not** prove RLS, the DB `CHECK` constraints, the audit trigger, or PostgREST behaviour.
2. **The audit chain is unverified at runtime** (F-3). The first real membership will be the first live exercise of the trigger.
3. **Phase-4 UAT must be rewritten before it is run** (F-1), or it will fail on a designed grant.
4. **The first department choice is now a genuine trade-off**, not the one-sided recommendation previously given (F-1).
5. **`supabase/tests/*` cannot be relied on as a gate in this environment** — they skip when no database is reachable, silently.
6. The feature flag remains a **single global switch**; there is no per-department or per-user staged rollout.

## PRODUCTION STATE — verified read-only, UNCHANGED

`/api/version` → `6f0296eacc2365ad989a2cb90d74f20236c75296b` · `GET /api/admin/org/memberships` → **405** with `x-matched-path: /api/admin/org/memberships` (route present, only POST/PATCH/DELETE exported) · membership **0** · Head **0** · flag **OFF**.

> **A successful rehearsal is not authorization to activate.** The production sequence remains: verify the real second identity → select the department → create the membership through the deployed API → real Head UAT → **separate explicit authorization** before the flag.

# Release Readiness Report — Component 4 (Audited PDP)

**Branch:** `feat/controller-v2-component4-audited-pdp` · **Base:** `933c4f8` (`origin/main`)
**Diff:** 15 files (5 added · 10 modified) — `src/` **+889 / −130**
**Scope:** Owner-approved Option 1 — audited PDP (B+C+D), no resource dimension

# ✅ VERDICT: READY FOR REVIEW

Not merged. Not deployed. No production data, migration, environment variable or
deployment configuration touched.

---

## 1. Architecture audit (performed before any code changed)

The roadmap's "Component 4 = Permission Engine" was already delivered by
Component 3 — all nine constituent parts, verified symbol by symbol. Starting by
the name would have meant inventing scope. The architecture document supplied
the real remaining obligations; §1 of the design doc has the evidence table.

The finding that mattered: **the PDP recorded nothing.** `writeAuditLog`
appeared nowhere under `permissions/`, and production bore it out — the
`audit_log` table was **empty** after the Platform Owner had used the Controller.
The architecture calls this exact situation "the thing that makes an audit log
worthless".

## 2. Quality gates

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ exit 0 |
| Tests | `npx vitest run` | ✅ **71 files / 722 tests**, 0 failed |
| Architecture | `npm run architecture:check` | ✅ 7/7 |
| Lint | `npx next lint --dir src` | ✅ **0 errors** |
| Build | `npx next build` | ✅ exit 0 |

Trajectory: 657 (C3 in production) → **722**. Component 4 adds 66.

## 3. Deliverables

| # | Item | Evidence |
|---|---|---|
| B | Owner bypass writes `owner.override` | `decisionAudit.test.ts`, `apiGuard.test.ts` |
| C | Denials write `rbac.access_denied` | same, incl. row shape and `detail` |
| D | `requireAdminRole`, `resolveAdminRole`, `AdminContext` **deleted** | `singleDecisionPath.test.ts` |
| — | Every decision point provably routes through the PDP | `singleDecisionPath.test.ts` (31 assertions) |
| — | P-4 fixed properly: `actor_role` records `owner` / `none` | `auditActorRole` tests |

## 4. Attack review — one vulnerability found, in my own new code

**C4-A1 — audit-log flooding. Introduced by this component; closed by it.**

Auditing denials put a database write on a path any authenticated user can
drive. `rateLimit()` runs *inside* each handler, i.e. after `requirePermission`
returns, so a denied caller throws before reaching it — nothing throttled the
write. Any logged-in user could inflate `audit_log` without limit and drown the
real signal.

Verified from source ordering (`settings/route.ts:18` guard, `:19` rate limit),
not assumed. Closed with a 60 s per-`(actor, permission, reason, surface)`
collapse that preserves the count as `suppressed_since_last`, plus a bounded key
map so key-variation cannot grow memory instead.

**Proven RED/GREEN:** disabling the throttle fails the 500-request regression.

Other attacks attempted and held: unauthenticated flood (401 precedes the
audit, no row) · Owner Gate failure mislabelled as a denial (excluded, tested) ·
audit failure breaking a request (fire-and-forget preserved, 0 awaited calls) ·
engine importing the audit writer (blocked by test).

## 5. Audits

| Audit | Result |
|---|---|
| **Dead code** | ✅ Automated scan flagged 4 symbols; each verified as a named type/constant used by its own file's exported signatures (`PermissionSet`, `PermissionSetView`, `DecisionSurface`, `DECISION_AUDIT_WINDOW_MS`). Not dead. Three genuinely dead symbols were **deleted** (§3 D). |
| **Security** | ✅ Owner Gate still precedes authorization (now directly tested). Fire-and-forget audit preserved. Client/server boundary asserted by test. No new env, secret or privileged surface. |
| **Compatibility** | ✅ Component 3's 20-row permission matrix and per-role navigation lock both still pass unchanged (35 tests). No access decision changed. |
| **Regression** | ✅ All 159 tests under `permissions/` green; full suite 722/722. |
| **Documentation** | ✅ `04_COMPONENT4_AUDITED_PDP_DESIGN.md` written; `ROADMAP.md` updated with C3 accepted and C4 renamed with a pointer to why. Comments describing deleted symbols corrected in `rbac.ts`, `guards.ts`, `index.ts`, `roles.ts`, `rbac.test.ts`. |

## 6. Behaviour changes — declared, none silent

Four, all listed in design doc §7. The load-bearing point: **no access decision
changed.** New audit rows appear; who can do what is identical.

## 7. Two things the reviewer should push on

**The Owner-read exemption.** The architecture says "every bypass". I record
non-reads only, because a single Owner browsing would add hundreds of thousands
of rows a year and bury the rows that matter. This is a judgement call against a
written spec — it is one constant (`AUDIT_OWNER_READS`) to reverse, and it is
asserted by test either way. If you want literal compliance, say so.

**The action name.** The architecture writes `owner_override`; I emit
`owner.override` to match the vocabulary already in the table. Nothing greps for
the literal, but it is a deviation and you should know it exists.

## 8. Honest limits

- Every number here came from a command that ran; the diff stat is quoted for
  `src/` only, because a whole-diff total changes when written down.
- **Nothing has been verified against production**, and nothing should be — this
  is not merged. The audit-write path in particular has never executed against
  the real `audit_log` table; the tests mock `writeAuditLog`. First production
  evidence will be the first `rbac.access_denied` row.
- **BL-002 remains open** and Component 4 does not touch it.
- The audit write remains fire-and-forget on a serverless runtime, so an insert
  can in principle be lost if the function terminates first. That is inherited
  Component 0 behaviour (`13_Audit_Log.md` §5), not introduced here, but it now
  matters more because denials ride the same path. Worth a decision in
  Component 7 (Audit).

---

**Stopping here as instructed.** No merge, no deploy, Component 5 not started.

# Release Readiness Report — Component 4 (Audited PDP)

**Branch:** `feat/controller-v2-component4-audited-pdp` · **Base:** `933c4f8` (`origin/main`)
**Diff:** 17 files (6 added · 11 modified) — `src/` **+935 / −130**
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
| Tests | `npx vitest run` | ✅ **71 files / 725 tests**, 0 failed |
| Architecture | `npm run architecture:check` | ✅ 7/7 |
| Lint | `npx next lint --dir src` | ✅ **0 errors** |
| Build | `npx next build` | ✅ exit 0 |

Trajectory: 657 (C3 in production) → **725**. Component 4 adds 69.

## 3. Deliverables

| # | Item | Evidence |
|---|---|---|
| B | Owner bypass writes `owner.override` | `decisionAudit.test.ts`, `apiGuard.test.ts` |
| C | Denials write `rbac.access_denied` | same, incl. row shape and `detail` |
| D | `requireAdminRole`, `resolveAdminRole`, `AdminContext` **deleted** | `singleDecisionPath.test.ts` |
| — | Every decision point provably routes through the PDP | `singleDecisionPath.test.ts` (31 assertions) |
| — | P-4 fixed properly: `actor_role` records `owner` / `none` | `auditActorRole` tests |

## 4. Attack review — two defects found, both in my own new code

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

**C4-A2 — the throttle collapsed legitimate Owner overrides. Found by the
adversarial review, after C4-A1 was already "fixed".**

The throttle keyed on `(actor, permission, reason, surface)` and applied to
*every* audited decision. An Owner deleting five deals in a minute therefore
produced **one** `owner.override` row, not five — collapsing real privileged
actions, which is precisely what the architecture asks to be recorded 1:1. For
`/api/admin/deals/upload`, which writes no audit row of its own, the override IS
the only record, so four of five uploads would have vanished from the log.

Fixed by throttling **denials only**: an override is not attacker-reachable, so
it needs no flood protection. Regression tests pin both halves.

### Throttle attack surface — measured, not argued

| Attempt | Result |
|---|---|
| Bypass at the 60 s boundary | ❌ held — writes at exactly `W`, suppressed at `W−1`; no off-by-one |
| Key explosion (>5 000 keys) | ❌ held — a *repeated* key is still suppressed after the map overflows |
| Memory growth | ❌ held — map capped; expired entries evicted first, then oldest |
| Clock skew backwards | ❌ held — a live entry stays live |
| Concurrency race | ❌ n/a — map operations are synchronous on a single-threaded runtime |
| Process restart | ⚠️ resets the map; first request writes again. Bounded, in-memory by design |
| Serverless multi-instance | ⚠️ one map per instance ⇒ up to *N × 20* denial rows/min/actor |

**Does throttling weaken security visibility?** Partially, in one specific way,
and it is worth stating plainly: the suppressed count is only flushed by a
*later* attempt. An attacker who bursts and then stops leaves the first row
(attack visible) but never the count (magnitude understated). The bound on a
sustained attack is ~20 rows/min/actor/instance, because the permission is fixed
by the route — an attacker cannot choose it.

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
| **Regression** | ✅ All 162 tests under `permissions/` green; full suite 725/725. **The five files that make authorization decisions — `registry.ts`, `roleMap.ts`, `engine.ts`, `resolver.ts`, `cache.ts` — are BYTE-IDENTICAL to Component 3.** |
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
`owner.override`. The adversarial review searched the entire repository —
`.ts .tsx .js .jsx .sql .md .json .kt .swift .yml` — and `owner_override` occurs
in exactly **three places, all prose** (`01_CONTROLLER_V2_ARCHITECTURE.md` ×2,
`03_PHASE1_FOUNDATION_DESIGN.md` ×1). **Zero code consumers.** The audit UI's
action filter is a free-text box the operator types into
(`AuditViewer` → `?action=` → `.eq('action', …)`), not a hardcoded comparison,
so nothing breaks either way. The deviation is safe; you should still know it
exists.

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

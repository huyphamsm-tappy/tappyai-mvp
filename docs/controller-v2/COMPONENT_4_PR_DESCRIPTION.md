# feat(controller-v2): Component 4 — Audited PDP

**Branch:** `feat/controller-v2-component4-audited-pdp` → `main`
**Base:** `933c4f8` (the Component 3 merge) · **Merge strategy:** merge commit, do **not** squash
**Scope:** Owner-approved Option 1 — audited PDP (B+C+D). No resource dimension.

---

## Summary

Component 3 gave the Controller a Policy Decision Point. It recorded **nothing**.
`writeAuditLog` appeared nowhere under `permissions/`, denials went to
`console.warn`, and production proved the cost: after the Platform Owner had
used the Controller, the `audit_log` table was **empty** — only mutating
handlers write rows, and the Owner had only read. The most privileged principal
on the platform left no trace.

This component makes the PDP the *only* way to authorize, and makes it leave a
record.

**No access decision changes.** The five files that make authorization decisions
— `registry.ts`, `roleMap.ts`, `engine.ts`, `resolver.ts`, `cache.ts` — are
**byte-identical to Component 3**.

## Why Component 4 is not what the roadmap called it

`ROADMAP.md` lists Component 4 as "Permission Engine". Component 3 already
shipped all nine of its parts (verified symbol by symbol — design doc §1).
Starting by the name would have meant doing nothing or inventing scope. The
architecture document supplied the real remaining obligations.

## What changed

| | |
|---|---:|
| Files | 17 (6 added · 11 modified) |
| Lines in `src/` | +937 / −130 |
| Tests | 725 (Component 4 adds 69) |
| **SQL / migrations / env vars** | **0** |

### B — the Owner's power is now recorded

`owner.override` rows for every bypass on a write, destructive or security
permission. Owner **reads** are deliberately not recorded (§ "push back on this").

### C — refusals are now evidence, not log lines

`rbac.access_denied` rows carrying the reason, the `detail` explaining *why*,
the surface (`api` / `page`), and the permission's module, category and risk.

### D — there is now exactly one way to authorize

`requireAdminRole`, `resolveAdminRole` and `AdminContext` are **deleted**. Their
five security tests — including the two pinning Owner-Gate-before-authorization
— were **ported to `requirePermission` first**, so no coverage was lost.
`03_PHASE1_FOUNDATION_DESIGN.md` names this the Block-A exit condition.

`singleDecisionPath.test.ts` (31 assertions) locks it by reading the **source
tree**: it fails if a handler loses its guard, if the engine consults role rank,
if a client component imports a server-only module, or if a deleted symbol
returns. Behaviour tests can only prove the paths that exist are correct; they
cannot see a path added tomorrow.

### Also fixed

`audit_log.actor_role` now records `owner` rather than a role the Owner may not
hold — the P-4 defect carried over from Component 3. No schema change: the
column is `TEXT NOT NULL` with no enum, verified against the migration before
widening the type.

## Defects found in my own code during review

| # | Defect | Severity |
|---|---|---|
| C4-A1 | **Audit-log flooding.** Auditing denials put a DB write on a path any authenticated user can drive — `rateLimit()` runs *inside* each handler, after `requirePermission` has already thrown. Closed with a 60 s per-`(actor, permission, reason, surface)` collapse carrying `suppressed_since_last`. | security |
| C4-A2 | **That fix was over-broad.** It also collapsed `owner.override`, so an Owner deleting five deals produced one row. For `/api/admin/deals/upload`, which writes no audit row of its own, four of five uploads would have vanished. Now throttles **denials only**. | audit integrity |
| F-1 | **Unreachable branch.** `AUDIT_OWNER_READS = false` had literal type `false`, so its branch could never run — while the docs said to flip it. | correctness |
| F-2 | **False documentation.** The design doc claimed a rebase that git shows never happened. | doc |

All four were found by review, not by a failing test. Both regressions are
proven RED/GREEN.

## Verification

```bash
npx tsc --noEmit && npx vitest run && npm run architecture:check && npx next build
```

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ exit 0 |
| `vitest run` | ✅ **71 files / 725 tests** |
| `architecture:check` | ✅ 7/7 |
| `next lint` | ✅ 0 errors |
| `next build` | ✅ exit 0 |

## Two things to push back on

**Owner reads are not audited.** The architecture says "every bypass". A single
Owner browsing produces ~10 `authorize()` calls per page load; recording each
would add hundreds of thousands of rows a year and bury the ones that matter.
One constant (`AUDIT_OWNER_READS`) reverses it, and it is asserted by test either
way.

**The action is `owner.override`, not `owner_override`.** A repository-wide
search across `.ts .tsx .js .jsx .sql .md .json .kt .swift .yml` found the
architecture's spelling in **three places, all prose** — **zero code consumers**.
The audit UI's action filter is a free-text box, not a comparison against a
constant. Safe either way; you should still know.

## Risk

**Low.** No SQL, no migration, no environment variable, no production data. No
authorization decision changes. Rollback is a redeploy.

The residual risk is that the audit-write path has **never executed against the
real `audit_log` table** — the tests mock `writeAuditLog`. First production
evidence will be the first `rbac.access_denied` row.

## Open, unchanged

**BL-002** (non-Owner production validation of Component 3) remains open by Owner
decision. Component 4 neither touches nor depends on it.

## Documents

`04_COMPONENT4_AUDITED_PDP_DESIGN.md` · `RELEASE_READINESS_COMPONENT_4.md` ·
`ROADMAP.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

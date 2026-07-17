# ADR-015: Budget Policy (Capability Cost Policy, Budget Tiers, Future Routing Contracts)

**Status:** Accepted (Sprint 5). Metadata only — the Router and Provider
Policy ignore all of it, verified by permanent regression tests.
**Related:** ADR-008 (Router), ADR-009 (Provider Policy), ADR-013 (Pricing
Catalog), ADR-014 (Cost Calculator).

## Context

Sprint 5's Steps 5–7 ask for three related, but not-yet-actionable, pieces
of metadata: a preferred budget tier per capability, a defined set of budget
tier labels, and typed interfaces for routing strategies that don't exist
yet. All three are explicitly **metadata only** — "the Router MUST ignore
it," "no enforcement," "no implementation."

## Decision

### Budget Tiers (`budgetTiers.ts`)
`BudgetTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'PREMIUM' | 'ENTERPRISE'`, plus a
`BUDGET_TIERS` array of all five, matching the brief's example exactly.

### Capability Cost Policy (`capabilityCostPolicy.ts`)
`CAPABILITY_COST_POLICY: Record<ModelRole, BudgetTier>` —

| Role | Tier |
|---|---|
| `fast` | LOW |
| `smart` | HIGH |
| `planning` | PREMIUM |
| `vision` | HIGH |

Mapped onto this codebase's **real** `ModelRole` taxonomy (`fast`/`smart`/
`planning`/`vision`), not a new parallel one invented to match the brief's
illustrative `FAST_CHAT`/`SMART_CHAT`/`OCR`/`VISION` categories literally.
`fast`→LOW and `smart`→HIGH map directly. `planning` (this codebase's
heaviest, most agentic role — multi-step tool use, itineraries) isn't in the
brief's example set; it's assigned PREMIUM as the natural tier above HIGH,
since it represents strictly more reasoning load than `smart`. `vision` maps
to HIGH per the brief's "VISION" line — but the brief also lists a separate,
cheaper "OCR" category, which this codebase does **not** yet distinguish:
`api/scan/route.ts` (OCR) and `lib/explore/contentProcessor.ts` (richer
thumbnail analysis) both use the single `vision` role today. Splitting that
into two roles so OCR could carry its own LOW-tier entry is a real
capability-taxonomy change — correctly out of scope for a foundation-only
sprint, and called out here rather than silently forced into today's shape.

### Enforcement (or the deliberate lack of it)
Neither `router.ts` nor `policy.ts` imports `capabilityCostPolicy.ts` or
`budgetTiers.ts` — verified two ways in `golden.test.ts`:
1. **Static**: a source-text scan (comments stripped first, so a doc comment
   *mentioning* these module names isn't mistaken for an import) asserts
   neither file's source contains `capabilityCostPolicy`, `budgetTiers`,
   `costCalculator`, `pricingCatalog`, `CAPABILITY_COST_POLICY`, or
   `BudgetTier`.
2. **Behavioral**: a test mutates `CAPABILITY_COST_POLICY` at runtime (e.g.
   flips `fast` to `ENTERPRISE`) and asserts `resolveModel()`'s output for
   every role is byte-identical before and after — proving the corruption
   has literally zero effect, not just that no import exists today.

### Future Routing Contracts (`futureRoutingContracts.ts`)
Seven **interfaces only** — no implementing class, no runtime logic:
`CostBasedRoutingStrategy`, `QualityBasedRoutingStrategy`,
`LatencyBasedRoutingStrategy`, `UserTierRoutingStrategy`,
`MonthlyBudgetRoutingStrategy`, `DailyBudgetRoutingStrategy`,
`PerCapabilityBudgetStrategy`. Each names its own future sprint's worth of
design and owner approval before anything implements it. Daily and monthly
budgets are kept as **separate** interfaces rather than one generic
"period" parameter, since real billing systems configure, reset, and alert
on daily vs. monthly caps independently.

## Alternatives Considered

1. **Key the Capability Cost Policy on a new enum matching the brief's
   FAST_CHAT/SMART_CHAT/OCR/VISION literally.** Rejected — introducing a
   second, parallel capability taxonomy alongside the existing `ModelRole`
   would itself be a new abstraction with no real distinction to back it
   (today's code truly does treat OCR and richer vision analysis as the same
   role). Using the real taxonomy, and documenting the gap honestly, is more
   accurate than inventing categories the codebase doesn't actually have.
2. **Have Provider Policy read `CAPABILITY_COST_POLICY` but simply not act on
   it yet (e.g. log it without using it for a decision).** Rejected — even
   an unused *read* is a coupling a future change could accidentally start
   acting on without anyone noticing the line had always been there. "The
   Router/Policy MUST ignore it" is enforced most strongly by *not
   importing it at all*, which is also what makes it mechanically testable
   (an import can be grepped for and proven absent; "reads but doesn't act"
   cannot be proven the same way).
3. **Implement one of the seven Future Routing Contracts as a concrete
   (but unused) class, to prove the interface is realistic.** Rejected —
   the brief is explicit: "No implementation. Interfaces only." A concrete
   class not wired into anything is dead code with no test coverage
   protecting it from drifting out of sync with reality.

## Trade-offs

- **Pro:** every claim in this ADR is backed by a test that would fail if
  violated — not merely documented convention. The behavioral mutation test
  in particular is a strong guarantee: it doesn't just check imports, it
  proves the *values* in the policy table cannot influence routing even if
  something bypassed the import check some other way (e.g. a global mutation
  from unrelated code).
- **Pro:** the Future Routing Contracts give the next sprint(s) a concrete,
  reviewed shape to implement against, without pre-committing to any of
  their designs being final.
- **Con:** the Capability Cost Policy's `vision`/OCR conflation is a known,
  disclosed gap — a real future cost-optimization decision (e.g. "OCR calls
  should prefer a cheaper model") cannot be expressed by today's policy table
  without first splitting the role taxonomy.

## Future Evolution

- If OCR and richer vision analysis are ever split into distinct roles (or a
  finer-grained capability concept), `capabilityCostPolicy.ts` gets a new key
  for the new role — additive, no existing key changes.
- Implementing any of the seven `futureRoutingContracts.ts` interfaces is
  its own sprint: pick one, design its concrete decision logic, get owner
  approval, wire it into `policy.ts` explicitly (never silently), and prove
  — the same way this sprint proved the *absence* of routing — that its
  presence changes routing *only* when and how the owner intends.

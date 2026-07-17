// ── Budget Tiers ──────────────────────────────────────────────────────────
// Metadata only — no routing, no enforcement. A budget tier is a RELATIVE
// cost expectation label for a capability/role (or, in the future, a user),
// for a not-yet-built cost-aware Provider Policy to consult. Nothing in the
// current Router or Provider Policy reads this file — verified in
// golden.test.ts's architecture-boundary tests. See ADR-015.
export type BudgetTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'PREMIUM' | 'ENTERPRISE'

export const BUDGET_TIERS: BudgetTier[] = ['LOW', 'MEDIUM', 'HIGH', 'PREMIUM', 'ENTERPRISE']

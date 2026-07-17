import type { BudgetTier } from './budgetTiers'
import type { ModelRole, ProviderId } from './types'

// ── Future Routing Contracts — INTERFACES ONLY, NOT IMPLEMENTED ─────────────
// Extension points for routing strategies that do not exist yet. Nothing in
// this file is wired into the Router (router.ts) or Provider Policy
// (policy.ts) — no class implements any of these, nothing outside this file
// (and its own tests) imports them. Each interface is its own future sprint's
// worth of design and owner approval before implementation. See ADR-015.

/** Pick among providers that already passed Capability Registry validation,
 * by estimated cost (costCalculator.ts). NOT implemented. */
export interface CostBasedRoutingStrategy {
  selectProvider(role: ModelRole, eligibleProviders: ProviderId[]): ProviderId
}

/** Pick a provider by a measured/declared quality signal for a role,
 * independent of cost. NOT implemented. */
export interface QualityBasedRoutingStrategy {
  selectProvider(role: ModelRole, eligibleProviders: ProviderId[], minQualityScore: number): ProviderId
}

/** Pick a provider that can meet a latency budget for a role. NOT implemented. */
export interface LatencyBasedRoutingStrategy {
  selectProvider(role: ModelRole, eligibleProviders: ProviderId[], maxLatencyMs: number): ProviderId
}

/** Route differently depending on the requesting user's tier (e.g. free vs
 * Pro), rather than — or in addition to — the role alone. NOT implemented. */
export interface UserTierRoutingStrategy {
  selectProvider(role: ModelRole, userTier: BudgetTier, eligibleProviders: ProviderId[]): ProviderId
}

/** Decide whether/how to route once spend for the current calendar month has
 * crossed some threshold. NOT implemented. */
export interface MonthlyBudgetRoutingStrategy {
  selectProvider(role: ModelRole, monthToDateSpend: number, monthlyBudget: number, eligibleProviders: ProviderId[]): ProviderId
}

/** Same shape as MonthlyBudgetRoutingStrategy, scoped to a calendar day.
 * Kept as its own interface rather than a generic "period" parameter, since
 * daily and monthly budgets are typically configured, reset, and alerted on
 * independently in real billing systems. NOT implemented. */
export interface DailyBudgetRoutingStrategy {
  selectProvider(role: ModelRole, dayToDateSpend: number, dailyBudget: number, eligibleProviders: ProviderId[]): ProviderId
}

/** Give each capability/role its own budget cap, independent of any
 * user-level or time-period cap (e.g. "vision calls may never exceed $X/day
 * regardless of overall spend"). NOT implemented. */
export interface PerCapabilityBudgetStrategy {
  selectProvider(role: ModelRole, capabilityBudget: number, capabilitySpend: number, eligibleProviders: ProviderId[]): ProviderId
}

// Activation Analytics — Step 2 (Rule Provider). The ONLY seam between the
// Activation Engine and however rules are actually stored (spec §2.4a/SR-6).
// The Engine depends on this interface, never on a concrete Rule Source.
// Interface intentionally minimal per owner direction: getActiveRule + getRuleById
// only — no listAllRules() until a real consumer needs it (SR-4).

import { ACTIVATION_RULE_REGISTRY, type ActivationRule } from '@/lib/admin/analytics/activationRules/registry'

export interface ActivationRuleProvider {
  /** The rule that is enabled and effective as of `asOf` (defaults to now). */
  getActiveRule(asOf?: Date): ActivationRule | null
  /** A specific rule by id, regardless of its current enabled/effective state (for evaluating/auditing historical results — spec §2.4a). */
  getRuleById(id: string): ActivationRule | null
}

// Exported for unit testing the lifecycle-metadata filtering in isolation.
export function isEffective(rule: ActivationRule, asOf: Date): boolean {
  if (!rule.enabled) return false
  const t = asOf.getTime()
  if (rule.effectiveFrom && t < new Date(rule.effectiveFrom).getTime()) return false
  if (rule.effectiveTo && t >= new Date(rule.effectiveTo).getTime()) return false
  return true
}

// v1 Rule Source adapter: reads the in-code registry. A future database /
// feature-flag / remote-config Rule Source implements this same interface —
// zero change to the Engine, service, API, or dashboard (spec §17).
export const inCodeActivationRuleProvider: ActivationRuleProvider = {
  getActiveRule(asOf = new Date()) {
    return ACTIVATION_RULE_REGISTRY.find(r => isEffective(r, asOf)) ?? null
  },
  getRuleById(id) {
    return ACTIVATION_RULE_REGISTRY.find(r => r.id === id) ?? null
  },
}

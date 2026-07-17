// Activation Analytics — Step 2 (Activation Engine). The one generic evaluator
// (spec §2.4). Knows nothing about "AI answers" or "saved places" — only how to
// match domain events against a rule's signal definitions and apply its
// combinator/window. Depends only on the ActivationRuleProvider interface
// (spec §2.4a/SR-6), never on a concrete Rule Source.

import type { ActivationRule } from '@/lib/admin/analytics/activationRules/registry'

export interface DomainEvent {
  event_type: string
  properties?: Record<string, unknown>
  session_id?: string | null
  client_timestamp: string
}

// The Rule Evaluation Result model (spec §2.9) — computed on demand only,
// never persisted (owner's final refinement). No storage call exists anywhere
// in this module.
export interface RuleEvaluationResult {
  activation_rule_version: string
  evaluation_time: string
  matched_signals: Record<string, string>
  missing_signals: string[]
  activation_result: boolean
}

function windowedEvents(rule: ActivationRule, events: DomainEvent[]): DomainEvent[] {
  if (events.length === 0) return []
  const sorted = [...events].sort(
    (a, b) => new Date(a.client_timestamp).getTime() - new Date(b.client_timestamp).getTime(),
  )
  if (rule.window.type === 'session') {
    const firstSessionId = sorted[0].session_id
    return sorted.filter(e => e.session_id === firstSessionId)
  }
  // days window: relative to the earliest event in the set (caller passes the
  // relevant candidate events, e.g. since signup — the engine doesn't know
  // "signup" itself, that's a caller/service concern, not the Engine's).
  const cutoff = new Date(sorted[0].client_timestamp).getTime() + rule.window.days * 86_400_000
  return sorted.filter(e => new Date(e.client_timestamp).getTime() <= cutoff)
}

function combinatorSatisfied(rule: ActivationRule, matchedCount: number): boolean {
  switch (rule.combinator.type) {
    case 'ALL': return matchedCount === rule.signals.length
    case 'ANY': return matchedCount >= 1
    case 'AT_LEAST': return matchedCount >= rule.combinator.count
  }
}

// The single generic evaluator. `events` should be the candidate domain events
// for one user (any window/date pre-filtering beyond the rule's own window is
// the caller's concern, e.g. "events since signup").
export function evaluateActivationRule(rule: ActivationRule, events: DomainEvent[]): RuleEvaluationResult {
  const candidates = windowedEvents(rule, events)
  const matched_signals: Record<string, string> = {}
  const missing_signals: string[] = []

  for (const signal of rule.signals) {
    const matches = candidates
      .filter(e => e.event_type === signal.eventType && (!signal.match || signal.match(e.properties ?? {})))
      .sort((a, b) => new Date(a.client_timestamp).getTime() - new Date(b.client_timestamp).getTime())
    if (matches.length > 0) {
      matched_signals[signal.key] = matches[0].client_timestamp
    } else {
      missing_signals.push(signal.key)
    }
  }

  return {
    activation_rule_version: rule.ruleVersion,
    evaluation_time: new Date().toISOString(),
    matched_signals,
    missing_signals,
    activation_result: combinatorSatisfied(rule, Object.keys(matched_signals).length),
  }
}

// Activation Analytics — Step 2 (Rule Source). Declarative rule definitions
// only — no evaluation logic here (that's activationRuleEngine.ts) and no
// storage/lookup logic here (that's activationRuleProvider.ts). This is the
// v1 Rule Source per PHASE_2_ACTIVATION_ANALYTICS_SPEC.md §2.2/§2.4a.

export interface ActivationSignalDefinition {
  /** Stable key identifying this signal within the rule (e.g. "ai_answer"). */
  key: string
  /** The domain event_type this signal matches (reused, not activation-specific — spec §3). */
  eventType: string
  /** Optional property predicate; omit to match on event_type alone. */
  match?: (properties: Record<string, unknown>) => boolean
}

export type ActivationCombinator =
  | { type: 'ALL' }
  | { type: 'ANY' }
  | { type: 'AT_LEAST'; count: number }

export type ActivationWindow =
  | { type: 'session' }
  | { type: 'days'; days: number }

export interface ActivationRule {
  id: string
  ruleVersion: string
  name: string
  enabled: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  description: string
  signals: ActivationSignalDefinition[]
  combinator: ActivationCombinator
  window: ActivationWindow
}

// Rule v1 — exactly the definition frozen in the spec (§2.3): first successful
// AI answer AND first saved place, within the user's first session.
export const ACTIVATION_RULE_V1: ActivationRule = {
  id: 'activation-v1',
  ruleVersion: 'v1',
  name: 'AI Answer + Place Saved (v1)',
  enabled: true,
  effectiveFrom: null,
  effectiveTo: null,
  description:
    "Original doc-27 hypothesis: first successful AI answer and first saved place, within the user's first session.",
  signals: [
    { key: 'ai_answer', eventType: 'chat_response_received' },
    { key: 'place_saved', eventType: 'search_result_saved' },
  ],
  combinator: { type: 'ALL' },
  window: { type: 'session' },
}

// The v1 Rule Source: every known rule, regardless of enabled/effective state
// (lifecycle filtering is the Provider's job, not the Source's — spec §2.4a).
export const ACTIVATION_RULE_REGISTRY: ActivationRule[] = [ACTIVATION_RULE_V1]

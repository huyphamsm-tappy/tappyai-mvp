import type { RoutingHints } from './signals'

// ── Chat-turn facts → routing hints (P2, STEP 6) ─────────────────────────────
//
// P1 shipped the router but route.ts passed no hints, so every chat turn was
// observed as a generic tool dialogue — a planning turn never looked like
// planning, and the empty-premium-tier finding could not surface in telemetry.
//
// This closes that gap WITHOUT re-detecting anything. Every input is a value
// the chat route already computed for other reasons (`detectPlanningIntent`,
// `hasImage`, `extractBudget`, `detectLang`). Duplicating planning detection
// here would give us two definitions of "planning" that could drift.
//
// What it deliberately does NOT do: name a provider, name a model, express a
// preference, or accept free text. It states what KIND of job the turn is; the
// router remains the sole authority on which model serves it.

/** The closed hint surface this mapper may produce. */
export const CHAT_HINT_FIELDS = ['task', 'risk', 'lang', 'needsVision', 'latencyBudget'] as const

/** Facts the chat route already has. Booleans and enums only — no user text. */
export interface ChatTurnFacts {
  /** The turn runs with no tool definitions and maxSteps:1. */
  noToolTurn: boolean
  /** From detectPlanningIntent — passed in, never recomputed. */
  planningIntent: 'trip' | 'evening' | null
  hasImage: boolean
  /** From extractBudget — the turn carries a money constraint. */
  hasBudget: boolean
  lang: string
}

export function deriveChatRoutingHints(facts: ChatTurnFacts): RoutingHints {
  return {
    // noToolTurn wins over planning: it is the turn's real capability shape
    // (no tools declared, one step). Asking for a planning-grade model to do
    // work this turn cannot perform would be a routing lie.
    task: facts.noToolTurn ? 'conversational'
      : facts.planningIntent ? 'planning'
        : 'tool_dialogue',

    // An image turn needs vision capability regardless of which AI.* method
    // carries it — the chat route streams images through AI.stream, not
    // AI.vision, so method alone would miss the requirement.
    needsVision: facts.hasImage,

    // Same trigger moneyGuard uses. A turn carrying a budget is one where a
    // wrong number costs the user something concrete.
    risk: facts.hasBudget ? 'elevated' : 'routine',

    lang: facts.lang,

    // A human is watching the first token arrive.
    latencyBudget: 'interactive',

    // complexity is deliberately absent: the task class already implies it
    // (planning → high, tool_dialogue → medium, conversational → low). Setting
    // it here would restate the same rule in a second place, free to drift.
  }
}

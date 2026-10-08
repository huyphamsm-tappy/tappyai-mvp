// ── Phase 8 agent runtime (TAPPY_AGENT=2) — hard per-turn ceilings ───────────────────────────────────────────────────────────
//
// Owner spec (Phase 8, 08/10): these are SAFETY CEILINGS, not targets. The model stops as soon as the evidence is enough; the
// runtime only guarantees that no turn can go past them. Hierarchy: model rounds ≤ 6 · tool calls ≤ 8 · Serper ≤ 12 credits
// (≤ 15 for travel research) · overall deadline ≤ 85 s from the start of the request.

export const RUNTIME_LIMITS = {
  /** Model calls per turn, the forced final answer included. */
  maxModelRounds: 6,
  /** Executed tool invocations per turn (agent-level; a bundled tool's parts are one invocation). */
  maxToolCalls: 8,
  /** Serper credits per turn, every tool and the after-loop card photos together. */
  serperCredits: 12,
  /** Serper credits per turn when the turn is travel research (trip plan / travel intent). */
  serperCreditsTravel: 15,
  /** Overall hard deadline, measured from the start of the request. */
  deadlineMs: 85_000,
  /** One model step (also bounded by the time left before the deadline). */
  stepTimeoutMs: 45_000,
  /** One tool invocation (also bounded by the time left before the final reserve). */
  toolTimeoutMs: 15_000,
  /** Time kept back for the forced final answer: below this, no further tool runs and the next step is the final one. */
  finalReserveMs: 15_000,
  /** Below this much time, no model step is started at all — the turn ends with an honest fallback line. */
  minStepMs: 2_000,
  /** Serper credits ONE tool invocation may spend inside (provider fan-out). */
  serperCreditsPerTool: 8,
  /** M2: update_task control actions applied per turn (more are refused; they never count as tool calls). */
  maxTaskUpdates: 3,
} as const

export type RuntimeLimits = { -readonly [K in keyof typeof RUNTIME_LIMITS]: number }

/** The Serper ceiling of a turn: 15 for travel research, 12 otherwise. */
export function serperCeiling(travel: boolean, limits: Pick<RuntimeLimits, 'serperCredits' | 'serperCreditsTravel'> = RUNTIME_LIMITS): number {
  return travel ? limits.serperCreditsTravel : limits.serperCredits
}

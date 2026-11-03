// ── Phase 8 agent runtime (TAPPY_AGENT=2) — hard per-turn ceilings ───────────────────────────────────────────────────────────
//
// Owner spec (Phase 8, 08/10): these are SAFETY CEILINGS, not targets. The model stops as soon as the evidence is enough; the
// runtime only guarantees that no turn can go past them. Hierarchy: model rounds ≤ 6 · tool calls ≤ 8 · Serper ≤ 8 credits
// (≤ 10 for a travel plan; owner decision, 10/10/2026 — was 12 / 15) · overall deadline ≤ 85 s from the start of the request.

export const RUNTIME_LIMITS = {
  /** Model calls per turn, the forced final answer included. */
  maxModelRounds: 6,
  /** Executed tool invocations per turn (agent-level; a bundled tool's parts are one invocation). */
  maxToolCalls: 8,
  /** Serper credits per turn, every tool and the after-loop card photos together. */
  serperCredits: 8,
  /** Serper credits per turn when the turn is travel research (trip plan / travel intent). */
  serperCreditsTravel: 10,
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
  /** M3: pages read_page may open per turn (each is also one of the tool calls). */
  maxPageReads: 4,
  /**
   * CONSULTATIVE_IN_AGENT (flag on only): pages one turn may open when the answer must be verified on official pages (several sources of a
   * fresh fact, a rate/price/schedule/regulation). Same 8 tool calls, same 85 s deadline, same SSRF / size / 8 s-per-page limits, no Serper credit
   * (a page read is a plain HTTPS fetch). Reads of one call run in parallel, so the extra reads cost one more tool round (~3–8 s), never more
   * than the deadline allows.
   */
  maxPageReadsConsult: 6,
} as const

export type RuntimeLimits = { -readonly [K in keyof typeof RUNTIME_LIMITS]: number }

/** The Serper ceiling of a turn: 10 for travel research, 8 otherwise. */
export function serperCeiling(travel: boolean, limits: Pick<RuntimeLimits, 'serperCredits' | 'serperCreditsTravel'> = RUNTIME_LIMITS): number {
  return travel ? limits.serperCreditsTravel : limits.serperCredits
}

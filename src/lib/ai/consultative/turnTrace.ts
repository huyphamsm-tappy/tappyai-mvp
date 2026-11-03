// ── One brain · one line per turn about how the model loop ended (P2-8, 30/10/2026) ─────────────────────────────────────────
//
// The audit could not say, for a lost answer, whether the model ran out of steps, was cut at the output ceiling, or never wrote at all: the numbers were
// only in the audit trace of a test tree. This is the production-safe summary: counts, flags and tool NAMES. Never the text, never a tool argument.

export interface OneBrainTurnTraceInput {
  /** Vendor and reasoning effort the role is served with (`AI.serving(role)`). */
  serving: { provider?: string; effort?: string | null } | null
  finishReason: unknown
  maxSteps: number
  maxTokens: number
  text: string
  usage: { promptTokens?: number; completionTokens?: number } | undefined
  /** Each step may carry the model id the provider reported (`response.modelId`): the LAST one is what actually answered. */
  steps: ReadonlyArray<{ toolCalls?: ReadonlyArray<{ toolName?: unknown }>; response?: { modelId?: unknown } }> | undefined
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const reported = (steps: OneBrainTurnTraceInput['steps']): string | null => {
  for (let k = (steps?.length ?? 0) - 1; k >= 0; k--) { const m = steps![k]?.response?.modelId; if (typeof m === 'string' && m) return m.slice(0, 80) }
  return null
}

export function oneBrainTurnTrace(i: OneBrainTurnTraceInput) {
  const tools: Record<string, number> = {}
  let toolCalls = 0
  for (const s of i.steps ?? []) for (const c of s.toolCalls ?? []) {
    if (typeof c?.toolName !== 'string' || !c.toolName) continue
    tools[c.toolName] = (tools[c.toolName] ?? 0) + 1
    toolCalls++
  }
  const stepsRun = i.steps?.length ?? 0
  const finish = typeof i.finishReason === 'string' ? i.finishReason : null
  return {
    type: 'tappyai_one_brain_turn' as const,
    response_model: reported(i.steps),
    provider: i.serving?.provider ?? null,
    effort: i.serving?.effort ?? null,
    finish_reason: finish,
    steps_run: stepsRun,
    max_steps: i.maxSteps,
    step_cap_hit: stepsRun >= i.maxSteps,
    wrote_text: i.text.length > 0,
    text_chars: i.text.length,
    length_cut: finish === 'length',
    tools,
    tool_calls: toolCalls,
    prompt_tokens: num(i.usage?.promptTokens),
    completion_tokens: num(i.usage?.completionTokens),
  }
}

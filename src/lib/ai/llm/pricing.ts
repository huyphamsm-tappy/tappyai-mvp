// ── Worst-case price of one model call (BENCH_SPEND_GATE) ───────────────────────────────────────────────────────────────────────
// Vendor-neutral entry: the list prices live in each adapter (providers/*). A model with no known price returns null, and the spend gate
// refuses a call it cannot bound.
import { openaiWorstCaseCallUsd } from './providers/openai'

/** Tokens the request format adds on top of the payload (message framing, tool wrappers): a flat allowance on top of "tokens <= bytes". */
export const INPUT_TOKEN_OVERHEAD = 512

/**
 * USD upper bound of one call. `inputTokens` must already be an upper bound (the UTF-8 byte length of everything sent, plus the overhead),
 * `outputTokens` the cap the call is sent with. Null when the model has no list price.
 */
export function worstCaseLlmCallUsd(model: { provider: string; modelId: string }, inputTokens: number, outputTokens: number): number | null {
  if (model.provider.startsWith('openai')) return openaiWorstCaseCallUsd(model.modelId, inputTokens, outputTokens)
  return null
}

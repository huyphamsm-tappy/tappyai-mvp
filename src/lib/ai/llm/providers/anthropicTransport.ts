// ── Anthropic request transport for the agent model (AGENT_MODEL=haiku55) ─────────────────────────────────────────────
// @ai-sdk/anthropic 1.2.x builds and sends the Messages API request itself; this is the `fetch` it is given. It does
// ONE thing on top of the platform fetch: it adds `thinking: {type: "disabled"}` to a request for the agent model.
//
// Why: Claude Haiku 5.5 runs adaptive thinking when a request does not set `thinking`, and the SDK can only SEND
// `thinking` when it is enabled (its `disabled` option is parsed and dropped). The agent runtime rebuilds every
// assistant tool-call turn by hand (runtime/loop.ts) and carries no thinking block, which the API refuses once thinking
// is on — and the Luna path it is compared against runs at reasoning effort `none`. Thinking off keeps both the request
// shape and the comparison honest. Haiku 5.5 accepts `disabled` at its default effort (medium).
//
// 🔒 Not a download path (see scripts/architecture/check.mjs, no-raw-network-in-provider-layer): the URL is the one the
// SDK built from its own base URL, and anything that is not https://api.anthropic.com/ is refused here, before a socket
// opens. The body is only touched when it is a JSON request for exactly the agent model.

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const ANTHROPIC_ORIGIN = 'https://api.anthropic.com'

/**
 * The request body for `modelId` with thinking turned off and the sampling settings removed, or the body unchanged when it
 * is not a JSON request for that model. Sampling: the AI SDK always sends `temperature` (0 when the caller sets none —
 * ai@4 prepareCallSettings), and Claude Haiku 5.5 refuses any temperature but 1 and any top_p / top_k with a 400; no agent
 * call sets one (Luna drops them too, openai.ts lunaCallOptions), so they are removed rather than sent.
 */
export function withThinkingDisabled(body: unknown, modelId: string): unknown {
  if (typeof body !== 'string') return body
  let json: Record<string, unknown>
  try { json = JSON.parse(body) as Record<string, unknown> } catch { return body }
  if (!json || typeof json !== 'object' || json.model !== modelId) return body
  const { temperature: _t, top_p: _p, top_k: _k, ...rest } = json
  void _t; void _p; void _k
  return JSON.stringify(rest.thinking === undefined ? { ...rest, thinking: { type: 'disabled' } } : rest)
}

/** The fetch handed to createAnthropic for the agent model. `base` is injectable for tests. */
export function agentTransport(modelId: string, base: FetchLike = globalThis.fetch.bind(globalThis)): FetchLike {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(ANTHROPIC_ORIGIN + '/')) return Promise.reject(new Error('anthropic_transport_refused_origin'))
    return base(input, init ? { ...init, body: withThinkingDisabled(init.body, modelId) as BodyInit | null | undefined } : init)
  }
}

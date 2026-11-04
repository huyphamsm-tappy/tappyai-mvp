// Security audit 04/11 (W-09): the chat stream carries each tool's result (`a:` frames) to the browser, and those results hold the server's
// own working fields (`_tappy_ranking`, `_tappy_constraint_unmet`, `_tappy_hard_gaps`, ...): how a shortlist was built, which constraint
// failed. A person reading the network tab sees the machinery. This strips every `_tappy_*` key from a tool-result frame except the ones a
// client READS (the web cards and the recommendation code); the native apps read only the frame's toolCallId. Nothing else on the wire
// changes: text, annotations, the finish frame and every other key pass byte for byte.

/** The `_tappy_*` keys a client reads from a tool result. Anything else with that prefix is internal and leaves the server no further. */
export const CLIENT_READ_INTERNAL_KEYS: ReadonlySet<string> = new Set([
  '_tappy_place', '_tappy_place_domain', '_tappy_shortlist', '_tappy_ranking',
  '_tappy_business_p', '_tappy_requested_provider', '_tappy_debug', '_tappy_total_found',
])

const INTERNAL_PREFIX = '_tappy_'

/** A copy of `value` without its internal keys (deep, arrays included). Pure. */
export function stripInternalFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalFields)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith(INTERNAL_PREFIX) && !CLIENT_READ_INTERNAL_KEYS.has(k)) continue
      out[k] = stripInternalFields(v)
    }
    return out
  }
  return value
}

/** One stream line (without its newline): a tool-result frame is rewritten, anything else - or a frame that does not parse - is returned as it is. */
export function stripInternalFrameLine(line: string): string {
  const sse = line.startsWith('data: ')
  const body = sse ? line.slice(6) : line
  if (!body.startsWith('a:')) return line
  try {
    const parsed = JSON.parse(body.slice(2)) as unknown
    return `${sse ? 'data: ' : ''}a:${JSON.stringify(stripInternalFields(parsed))}`
  } catch {
    return line
  }
}

/** A pass-through transform applying [stripInternalFrameLine] to each complete line; a partial line waits for its newline, the tail is flushed at the end. */
export function internalFieldStripper(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      const cut = pending.lastIndexOf('\n')
      if (cut === -1) return
      const complete = pending.slice(0, cut)
      pending = pending.slice(cut + 1)
      controller.enqueue(encoder.encode(`${complete.split('\n').map(stripInternalFrameLine).join('\n')}\n`))
    },
    flush(controller) {
      pending += decoder.decode()
      if (pending) controller.enqueue(encoder.encode(stripInternalFrameLine(pending)))
    },
  })
}

/** The same response with its body filtered; status and headers are kept (a response without a body is returned as it is). */
export function withoutInternalToolFields(res: Response): Response {
  if (!res.body) return res
  return new Response(res.body.pipeThrough(internalFieldStripper()), { status: res.status, statusText: res.statusText, headers: res.headers })
}

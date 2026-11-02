// ── Wave 6 · BENCH_CAPTURE_WRITER_INPUT — what the writing model RECEIVED, kept for a replay of the writing step only ─────────────────────────────────────────────────────────────
//
// Measured (W5 blind grading, 28/10): the R3 turns lost on depth of content even with a deeper search (L4) and with the reserve fixed (W5-1). To test whether the bottleneck is the WRITING step
// (model + writing instructions) rather than the search, the writing call has to be replayed on the very same input. Neither the bench json nor the de-identified output keeps that input (VERIFIED:
// they keep tokens and costs, not the system prompt, the history or the tool results).
//
// BENCH ONLY. With BENCH_CAPTURE_WRITER_INPUT exactly "1", in the extension mode (BENCH_TRIAL_MODE=dev-multi) and never in a production runtime, the trial's own network wrapper (liveTrial.ts) keeps
// the BODY of every request it already lets through to api.openai.com/v1/chat/completions - in the order sent, tagged with the turn - plus a summary of each response (status, characters of text,
// number of tool calls, finish reason, the provider's usage). Never a header (the key travels in the Authorization header, which is never read); the body text goes through redactSecrets first.
// Written ONCE, at the end of the run, to its own file `capture-<n>.json` in the run folder: not into the bench json, not into SEND\, not through the de-identifier - it holds the user's words and
// the page texts, like a raw child output, and stays on the Owner's disk. Which call was "the writer" is decided at replay time (writerReplay.ts), from the shapes recorded here.
// Production never imports this file.

export const WRITER_CAPTURE_FLAG = 'BENCH_CAPTURE_WRITER_INPUT'
/** A run keeps at most this many request bodies (a 13-turn L4 run sent about 80): beyond it the capture stops and says so (`truncated`). */
export const WRITER_CAPTURE_MAX_CALLS = 400

/** Pure. ON only for the exact value "1", only in the extension mode, never in a production runtime. */
export function writerCaptureOn(env: Record<string, string | undefined>): boolean {
  return env[WRITER_CAPTURE_FLAG] === '1' && env.BENCH_TRIAL_MODE === 'dev-multi' && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production'
}

/** Pure. The one endpoint whose requests are kept. */
export function isChatCompletionsUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'api.openai.com' && u.pathname === '/v1/chat/completions' } catch { return false }
}

export interface ResponseSummary {
  status: number
  /** Characters of assistant text the response carried (the streamed deltas added up, or the message content). */
  textChars: number
  /** Distinct tool calls the response asked for. */
  toolCalls: number
  finishReason: string | null
  usage: { prompt_tokens?: number; completion_tokens?: number } | null
}

export interface CapturedCall {
  /** The bench turn id (null outside a turn). */
  turn: string | null
  /** 1-based order of this request WITHIN its turn: the same order as that turn's llmCalls in the bench json (the gate books every request it lets through). */
  n: number
  /** The request body as sent (JSON), secrets redacted; `null` with `bodyError` when it could not be read. */
  body: unknown
  bodyError?: string
  response: ResponseSummary | null
}

export interface WriterCaptureFile {
  kind: 'tappy-writer-capture'
  version: 1
  /** When the run started (the stamp the capture file is named with). */
  stamp: number
  calls: CapturedCall[]
  truncated: boolean
}

/** Pure. Summarises a chat-completions response body: server-sent events (stream) or one JSON object. */
export function summarizeCompletion(text: string, status: number): ResponseSummary {
  const out: ResponseSummary = { status, textChars: 0, toolCalls: 0, finishReason: null, usage: null }
  const take = (o: unknown, stream: boolean): void => {
    const r = (o ?? {}) as { choices?: Array<Record<string, unknown>>; usage?: ResponseSummary['usage'] }
    if (r.usage && typeof r.usage === 'object') out.usage = { prompt_tokens: r.usage.prompt_tokens, completion_tokens: r.usage.completion_tokens }
    for (const c of r.choices ?? []) {
      const m = (stream ? c.delta : c.message) as { content?: unknown; tool_calls?: Array<{ index?: number; id?: string }> } | undefined
      if (typeof m?.content === 'string') out.textChars += m.content.length
      if (Array.isArray(m?.tool_calls)) for (const t of m.tool_calls) if (!stream || typeof t.id === 'string') out.toolCalls++
      if (typeof c.finish_reason === 'string') out.finishReason = c.finish_reason
    }
  }
  const t = text.trimStart()
  if (t.startsWith('data:')) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const d = line.slice(5).trim()
      if (d === '' || d === '[DONE]') continue
      try { take(JSON.parse(d), true) } catch { /* a malformed event adds nothing */ }
    }
  } else {
    try { take(JSON.parse(text), false) } catch { /* not JSON: an error page; status says what happened */ }
  }
  return out
}

/** The capture of one run. `record` never throws and never delays the response it is given (the copy is read in the background). */
export function createWriterCapture(o: { stamp: number; redact: (s: string) => string }) {
  const calls: CapturedCall[] = []
  const pending: Array<Promise<void>> = []
  const perTurn = new Map<string, number>()
  let truncated = false
  return {
    /** `bodyText` = the request body as sent; `res` = the response the wrapper is about to return (only a clone is read). */
    record(turn: string | null, bodyText: string | null, res: Response): void {
      try {
        if (calls.length >= WRITER_CAPTURE_MAX_CALLS) { truncated = true; return }
        const key = turn ?? '(none)'
        const n = (perTurn.get(key) ?? 0) + 1
        perTurn.set(key, n)
        let body: unknown = null, bodyError: string | undefined
        if (bodyText === null) bodyError = 'body_not_a_string'
        else { try { body = JSON.parse(o.redact(bodyText)) } catch { bodyError = 'body_not_json' } }
        const entry: CapturedCall = { turn, n, body, ...(bodyError ? { bodyError } : {}), response: null }
        calls.push(entry)
        if (!res.ok) { entry.response = { status: res.status, textChars: 0, toolCalls: 0, finishReason: null, usage: null }; return }
        pending.push(res.clone().text().then(t => { entry.response = summarizeCompletion(t, res.status) }, () => { entry.response = { status: res.status, textChars: 0, toolCalls: 0, finishReason: 'read_error', usage: null } }))
      } catch { /* the capture must never change what the turn gets */ }
    },
    /** Waits (bounded) for the background reads, then returns the file content. */
    async finish(waitMs = 5_000): Promise<WriterCaptureFile> {
      await Promise.race([Promise.allSettled(pending), new Promise(r => setTimeout(r, waitMs))])
      return { kind: 'tappy-writer-capture', version: 1, stamp: o.stamp, calls: [...calls], truncated }
    },
    size: () => calls.length,
  }
}

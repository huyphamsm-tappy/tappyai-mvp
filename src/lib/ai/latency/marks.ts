// ── C2 · latency marks: WHERE the time of one chat turn goes, and WHEN the user can first see text ──────────────────────────────────────────────
//
// Three numbers that must never be merged (owner C2 brief):
//   · time-to-first-token (TTFT)   — the first text delta from the UPSTREAM model (`upstream_first_delta`; only a streaming adapter can produce it),
//   · time-to-first-visible-text   — the first `0:` text frame that LEAVES the server (`first_text_forwarded`); the browser adds `first_text_rendered`,
//   · end-to-end completion        — the last byte of the response (`done`).
// Observation only: nothing here changes a byte of the response, a decision or a timeout. Off unless C2_LATENCY_MARKS=1 (then one
// `tappyai_latency_marks` JSON line per chat turn, no prompt/answer text — only names, counts and milliseconds).
//
// Request scope is carried with AsyncLocalStorage so the adapter and the runtime trace can mark without threading a parameter through 40 call sites.

import { AsyncLocalStorage } from 'node:async_hooks'

export interface Mark { name: string; t: number; data?: Record<string, unknown> }

export interface LatencyMarks {
  readonly startedAt: number
  /** `at` = an offset in ms since the request (for a point that is known only afterwards, e.g. the START of a round whose end is being recorded). */
  mark(name: string, data?: Record<string, unknown>, at?: number): void
  /** First call wins: marks the point only once (first byte, first text frame, first upstream delta…). */
  markOnce(name: string, data?: Record<string, unknown>): void
  summary(): LatencySummary
  emit(): void
}

export interface LatencySummary {
  type: 'tappyai_latency_marks'
  /** ms from request received (t=0). null = never happened in this turn. */
  t_first_byte_forwarded: number | null
  t_first_text_forwarded: number | null
  t_upstream_first_delta: number | null
  /** C2 P2: first answer text released by the runtime into the data stream (present only when it streamed). */
  t_runtime_first_text?: number
  t_done: number | null
  model_rounds: number
  tool_calls: number
  /** per model round: start/end offsets and what the model said about why it stopped (finish reason, tokens, reasoning). */
  rounds: Array<{ round: number; start: number | null; end: number | null; ms: number | null; finish?: string | null; tokens_out?: number | null; reasoning_tokens?: number | null; streamed?: boolean }>
  tools: Array<{ tool: string; start: number | null; end: number | null; ms: number | null; ok?: boolean }>
  /** The provider's finish reason of the LAST model call (stop | length | tool-calls | error | …). */
  last_finish: string | null
  /** True when any model call ended because it ran out of output tokens (the answer may be cut). */
  hit_length_limit: boolean
  /** Which stage held the text back: gap between the last model round ending and the first text frame leaving the server. */
  hold_after_last_round_ms: number | null
  response_status: number | null
  aborted: boolean
  marks: number
}

const store = new AsyncLocalStorage<LatencyMarks>()

export const latencyMarksEnabled = (): boolean => (process.env.C2_LATENCY_MARKS ?? '').trim() === '1'

/** The marks of the chat turn this code is running for, or null (flag off / outside a turn). Never throws. */
export function currentMarks(): LatencyMarks | null { return store.getStore() ?? null }

export function createLatencyMarks(now: () => number = Date.now, log: (line: string) => void = l => console.log(l)): LatencyMarks {
  const startedAt = now()
  const marks: Mark[] = []
  const seen = new Set<string>()
  const t = () => now() - startedAt
  const m: LatencyMarks = {
    startedAt,
    mark(name, data, at) { try { marks.push({ name, t: at ?? t(), ...(data ? { data } : {}) }) } catch { /* observation only */ } },
    markOnce(name, data) { if (seen.has(name)) return; seen.add(name); m.mark(name, data) },
    summary() {
      const first = (n: string) => marks.find(x => x.name === n)?.t ?? null
      const all = (n: string) => marks.filter(x => x.name === n)
      const rounds = new Map<number, { start: number | null; end: number | null; finish?: string | null; tokens_out?: number | null; reasoning_tokens?: number | null; streamed?: boolean }>()
      for (const x of all('model_round_start')) { const r = Number(x.data?.round); rounds.set(r, { ...(rounds.get(r) ?? { start: null, end: null }), start: x.t }) }
      for (const x of all('model_round_end')) {
        const r = Number(x.data?.round)
        rounds.set(r, { ...(rounds.get(r) ?? { start: null, end: null }), end: x.t, finish: (x.data?.finish as string | null | undefined) ?? null, tokens_out: (x.data?.tokens_out as number | null | undefined) ?? null, reasoning_tokens: (x.data?.reasoning_tokens as number | null | undefined) ?? null, ...(x.data?.streamed !== undefined ? { streamed: x.data.streamed === true } : {}) })
      }
      const roundList = [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([round, v]) => ({ round, start: v.start, end: v.end, ms: v.start !== null && v.end !== null ? v.end - v.start : null, finish: v.finish, tokens_out: v.tokens_out, reasoning_tokens: v.reasoning_tokens, ...(v.streamed !== undefined ? { streamed: v.streamed } : {}) }))
      const toolStarts = all('tool_start'), toolEnds = all('tool_end')
      // Pair every start with the first not-yet-used end of the same tool at or after it (tools of one round may overlap).
      const usedEnds = new Set<Mark>()
      const toolList = toolStarts.map(s => {
        const e = toolEnds.find(x => !usedEnds.has(x) && x.data?.tool === s.data?.tool && x.t >= s.t)
        if (e) usedEnds.add(e)
        return { tool: String(s.data?.tool ?? '?'), start: s.t, end: e?.t ?? null, ms: e ? e.t - s.t : null, ...(e?.data?.ok !== undefined ? { ok: e.data.ok === true } : {}) }
      })
      const lastEnd = roundList.reduce<number | null>((a, r) => (r.end !== null && (a === null || r.end > a) ? r.end : a), null)
      const firstText = first('first_text_forwarded')
      const finishes = roundList.map(r => r.finish).filter((f): f is string => !!f)
      return {
        type: 'tappyai_latency_marks',
        t_first_byte_forwarded: first('first_byte_forwarded'), t_first_text_forwarded: firstText, t_upstream_first_delta: first('upstream_first_delta'), t_done: first('done'),
        // C2 P2: the first answer text the RUNTIME released into the data stream (server-internal; the route may still hold it) — only when streaming ran
        ...((rt => (rt !== null ? { t_runtime_first_text: rt } : {}))(first('runtime_first_text'))),
        model_rounds: roundList.length, tool_calls: toolStarts.length, rounds: roundList, tools: toolList,
        last_finish: finishes.length ? finishes[finishes.length - 1] : null, hit_length_limit: finishes.includes('length'),
        hold_after_last_round_ms: lastEnd !== null && firstText !== null ? Math.max(0, firstText - lastEnd) : null,
        response_status: (marks.find(x => x.name === 'response_headers')?.data?.status as number | undefined) ?? null,
        aborted: marks.some(x => x.name === 'client_aborted'), marks: marks.length,
      }
    },
    emit() { try { log(JSON.stringify(m.summary())) } catch { /* observation only */ } },
  }
  return m
}

/** Runs `fn` with `marks` as the current turn's marks. */
export function runWithMarks<T>(marks: LatencyMarks, fn: () => T): T { return store.run(marks, fn) }

/**
 * Starts the marks of the chat request that is being handled, SYNCHRONOUSLY (no await, no wrapper, nothing is returned that the handler must thread):
 * the marks scope is entered for this request's async chain (`enterWith`), so the adapter, the runtime trace and the response observer find them via
 * `currentMarks()`. Returns null and does nothing when the flag is off. A client abort of the request is marked `client_aborted`.
 */
export function startTurnMarks(req: { signal?: AbortSignal | null }): LatencyMarks | null {
  if (!latencyMarksEnabled()) return null
  const marks = createLatencyMarks()
  marks.mark('request_received')
  req.signal?.addEventListener('abort', () => marks.markOnce('client_aborted'), { once: true })
  store.enterWith(marks)
  return marks
}

/** The response of the current turn observed (byte for byte) when marks are on; the same object untouched when they are off. */
export function observeCurrent(res: Response): Response {
  const m = currentMarks()
  return m ? observeResponse(res, m) : res
}

/**
 * Passes the response body through BYTE FOR BYTE and marks: headers, first byte, first `0:` text frame, last byte. Emits the summary once, when the body ends
 * (or is cancelled by the client → `client_aborted`). A response without a body is returned as is.
 */
export function observeResponse(res: Response, marks: LatencyMarks): Response {
  marks.markOnce('response_headers', { status: res.status })
  if (!res.body) { marks.markOnce('done'); marks.emit(); return res }
  const dec = new TextDecoder()
  let tail = ''
  let ended = false
  let textSeen = false
  const finish = () => { if (ended) return; ended = true; marks.markOnce('done'); marks.emit() }
  // A PULL-driven passthrough (highWaterMark 0): the upstream body is read only when the consumer asks for a chunk, exactly as without the observer. (A pipeTo /
  // TransformStream would read ahead eagerly and change WHEN the source runs — an observer must not alter the pace or order of what it watches.)
  const reader = res.body.getReader()
  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let r: ReadableStreamReadResult<Uint8Array>
      try { r = await reader.read() } catch (e) { marks.markOnce('stream_error'); finish(); controller.error(e); return }
      if (r.done) { finish(); controller.close(); return }
      const chunk = r.value
      marks.markOnce('first_byte_forwarded')
      if (!textSeen) {
        tail += dec.decode(chunk, { stream: true })
        const lines = tail.split('\n'); tail = lines.pop() ?? ''
        // A non-empty `0:` text frame is the first thing a user can read. (`0:""` carries nothing visible.)
        if (lines.some(l => l.startsWith('0:') && l !== '0:""')) { textSeen = true; marks.markOnce('first_text_forwarded') }
      }
      controller.enqueue(chunk)
    },
    async cancel(reason) { marks.markOnce('client_aborted'); finish(); try { await reader.cancel(reason) } catch { /* already closed */ } },
  }, { highWaterMark: 0 })
  return new Response(out, { status: res.status, statusText: res.statusText, headers: res.headers })
}

// ── Tool-call trace SEAM (diagnostics only) ──────────────────────────────────────────────────────────────────────────────────────────
//
// WHY. A benchmark run could not say which turn made a request, nor what a tool call returned: the logs have no turn id and no tool result. The bench (scripts/uat/consultUat/liveTrial.ts)
// installs an observer here; this module hands it, for every tool call, the tool name, its arguments, its result and a CALL ID that the code running inside the call can read
// (currentToolCall()), so that the network wrapper can tag each request with the tool call that made it.
//
// THE RULE THAT KEEPS THE PRODUCT UNCHANGED. With NO observer set (production, every test but the bench's) `traceToolCall` returns exactly `run()` - the very same value or promise
// the tool returned, no extra promise, no extra tick, no context. Only the bench ever calls `setToolTraceObserver`. The observer's own errors are swallowed: it can never break a turn.
// What the observer receives is the RAW tool result; it is the observer's job to keep counts only (the bench does: rows, provider, a flag - never a title, snippet or URL).
import { AsyncLocalStorage } from 'node:async_hooks'

export interface ToolTraceEvent {
  tool: string
  /** Unique within the process, in the order the calls started. */
  call: number
  args: unknown
  /** The raw result; undefined when the call threw. */
  result: unknown
  ms: number
  threw: boolean
}
export type ToolTraceObserver = (event: ToolTraceEvent) => void

let observer: ToolTraceObserver | null = null
let seq = 0
const store = new AsyncLocalStorage<{ call: number; tool: string }>()

/** Bench only. `null` removes the observer. */
export function setToolTraceObserver(fn: ToolTraceObserver | null): void { observer = fn }

/** The tool call the current code runs inside, or undefined (no observer, or outside a tool call). */
export function currentToolCall(): { call: number; tool: string } | undefined { return store.getStore() }

export function traceToolCall<T>(tool: string, args: unknown, run: () => T): T {
  const obs = observer
  if (!obs) return run()
  const call = ++seq
  const t0 = Date.now()
  const done = (result: unknown, threw: boolean): void => {
    try { obs({ tool, call, args, result, ms: Date.now() - t0, threw }) } catch { /* diagnostics must never change what the user gets */ }
  }
  return store.run({ call, tool }, () => {
    let r: T
    try { r = run() } catch (e) { done(undefined, true); throw e }
    if (r !== null && typeof r === 'object' && typeof (r as unknown as { then?: unknown }).then === 'function') {
      return (r as unknown as Promise<unknown>).then(v => { done(v, false); return v }, e => { done(undefined, true); throw e }) as unknown as T
    }
    done(r, false)
    return r
  })
}

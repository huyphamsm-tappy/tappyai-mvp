// ── REQUEST CAP: L1 per turn + L2 per bench run (CONSULT_REQUEST_CAP, default OFF) ───────────────────────────────────────
//
// What it limits: the NUMBER OF SERPER REQUESTS one user turn may send (L1), and the number one bench run may send in total (L2). It is
// checked in serperPost, synchronously, BEFORE the first await and before anything is sent (serperClient.ts). It is a count, not a price:
// it does not know what a request costs, so it does not replace the daily credit ceiling or the bench spend gate (L3).
//
//   CONSULT_REQUEST_CAP            '1' | 'true' turns the whole thing on. Anything else (or unset) = OFF = the old behaviour, untouched.
//   CONSULT_REQUEST_CAP_PER_TURN   L1 value. No default in code: the owner chooses it.
//   CONSULT_REQUEST_CAP_PER_RUN    L2 value, read only when a bench run begins (beginRequestCapRun). No default in code.
//
// FAIL-CLOSED when the flag is ON:
//   · a missing / empty / zero / negative / fractional / non-numeric / absurdly large L1 value refuses EVERY request (reason config_invalid);
//     the parser never falls back to a default (unlike serperDailyCeiling, which does — a missing cap must never become "no cap");
//   · a request that runs with no turn object (and outside an agent credit scope) is refused (reason no_turn_scope), never let through;
//   · a request that starts after its turn was closed is refused (reason turn_closed);
//   · every refusal is logged as a structured line, counted on the turn, and the first one per reason per instance is also an ERROR alert.
//
// HOW THE TURN OBJECT REACHES THE REQUEST: the chat route creates ONE RequestCapTurn per user turn (createRequestCapTurn) and hands it to the
// three kinds of entry point that exist on the legacy path — every tool's execute() (wrapToolsWithRequestCap: the model's own calls, the
// pre-search, the evening frame and the trip pre-fetch all run those same wrapped objects), and the after-loop lookups (runWithRequestCapTurn).
// serperPost reads it from AsyncLocalStorage. An entry point that was missed has no turn and is refused, not let through — EXCEPT inside an open credit
// scope (serperToolBudget.ts: the bounded agent, or a withSerperToolBudget around a call): there the request is admitted under that scope and counted on L2 only.
// On the legacy chat path every such scope sits inside a wrapped tool.execute(), so it carries the turn (route.ts:2658 is the one place; checked by reading).
// What is covered by a ROUTE test (mock model, stub network): the pre-search and what it fans out into (search_products, search_places, vendor links) and the
// after-loop photo lookup. By reading only, not exercised by any test: the evening frame, the trip pre-fetch and the TikTok lookup (same wrapped execute / same
// afterLoopSerper). The real AI SDK tool loop is exercised in src/lib/ai/llm/serperRequestCap.sdkToolLoop.test.ts (fake model).
//
// SIDE EFFECT OF THE FLAG ON, stated: every other caller of serperPost outside a chat turn is refused (no_turn_scope) — today that is the price-watch cron
// (src/app/api/cron/price-check/route.ts), which then finds nothing and updates nothing, with one ERROR alert per instance. The flag is for the bench; whether
// it may ever be ON in production, and what the cron should do then, is the owner's decision (design 5.1).
//
// SCOPE OF THE GUARANTEE (what this does NOT claim): a count held by this process only. On several serverless instances every instance
// has its own count (L2 is per process on purpose: one bench run = one process). It is not a bill guarantee.

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { hasSerperCreditScope } from './serperToolBudget'

export const REQUEST_CAP_FLAG = 'CONSULT_REQUEST_CAP'
export const REQUEST_CAP_PER_TURN_ENV = 'CONSULT_REQUEST_CAP_PER_TURN'
export const REQUEST_CAP_PER_RUN_ENV = 'CONSULT_REQUEST_CAP_PER_RUN'
/** Validation bounds only (a value above them is a typo, not a policy). They are NOT defaults and never fill in a missing value. */
export const REQUEST_CAP_MAX_PER_TURN = 100
export const REQUEST_CAP_MAX_PER_RUN = 5_000

type Env = Record<string, string | undefined>
const flagIsOn = (v: string | undefined): boolean => { const s = (v ?? '').trim().toLowerCase(); return s === '1' || s === 'true' }

/** A strict positive integer in [1, max], decimal digits only ('1e3', '+5', '05', '5.0', ' ' and '' are all invalid). null = invalid. */
export function parseCapValue(raw: string | undefined, max: number): number | null {
  const s = (raw ?? '').trim()
  if (!/^[1-9][0-9]{0,5}$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null
}

export const requestCapOn = (env: Env = process.env): boolean => flagIsOn(env[REQUEST_CAP_FLAG])

export type RequestCapConfig =
  | { on: false }
  | { on: true; valid: false; problems: string[] }
  | { on: true; valid: true; perTurn: number }

/** Read at call time (never cached): the flag and the L1 value. The L2 value is read by beginRequestCapRun. */
export function requestCapConfig(env: Env = process.env): RequestCapConfig {
  if (!requestCapOn(env)) return { on: false }
  const perTurn = parseCapValue(env[REQUEST_CAP_PER_TURN_ENV], REQUEST_CAP_MAX_PER_TURN)
  if (perTurn === null) return { on: true, valid: false, problems: [`${REQUEST_CAP_PER_TURN_ENV} is missing or not an integer in 1..${REQUEST_CAP_MAX_PER_TURN}`] }
  return { on: true, valid: true, perTurn }
}

export type RequestCapRefusal = 'config_invalid' | 'no_turn_scope' | 'turn_closed' | 'turn_cap' | 'run_cap' | 'run_config_invalid'

/** One user turn's request budget. Created by the route, one per turn; `sent` counts reservations that were not given back. */
export interface RequestCapTurn {
  readonly id: string
  readonly limit: number
  sent: number
  refused: number
  closed: boolean
  readonly refusals: Partial<Record<RequestCapRefusal, number>>
}

const turnStore = new AsyncLocalStorage<RequestCapTurn>()

/** null = flag OFF (nothing to create). Flag ON + invalid L1 value = a turn with limit 0 — it exists, and refuses everything. */
export function createRequestCapTurn(env: Env = process.env): RequestCapTurn | null {
  const cfg = requestCapConfig(env)
  if (!cfg.on) return null
  return { id: randomUUID().slice(0, 8), limit: cfg.valid ? cfg.perTurn : 0, sent: 0, refused: 0, closed: false, refusals: {} }
}

export function runWithRequestCapTurn<T>(turn: RequestCapTurn, fn: () => T): T {
  return turnStore.run(turn, fn)
}
export function currentRequestCapTurn(): RequestCapTurn | undefined { return turnStore.getStore() }

/** Same wrap point as wrapToolsWithTurnWebTicket: the turn is the current one inside every tool.execute(), wherever the stream calls it from. */
export function wrapToolsWithRequestCap<T extends Record<string, unknown>>(tools: T, turn: RequestCapTurn): T {
  for (const t of Object.values(tools)) {
    const def = t as { execute?: (...a: unknown[]) => unknown }
    const orig = def?.execute
    if (typeof orig === 'function') def.execute = (...a: unknown[]) => turnStore.run(turn, () => orig.apply(def, a))
  }
  return tools
}

/** The turn is over: any request that starts afterwards is refused (turn_closed). Idempotent; logs one summary line. */
export function closeRequestCapTurn(turn: RequestCapTurn): void {
  if (turn.closed) return
  turn.closed = true
  console.log(JSON.stringify({ type: 'tappyai_serper_request_cap_turn', turn: turn.id, limit: turn.limit, sent: turn.sent, refused: turn.refused, refusals: turn.refusals }))
}

// ── L2: one bench run (one process) ─────────────────────────────────────────────────────────────────────────────────────
interface RunState { limit: number; sent: number; refused: number }
let run: RunState | null = null

export type BeginRunResult = { ok: true; limit: number } | { ok: false; problem: string }
/** Starts the bench run's total. A missing/invalid L2 value is a refusal to start (the caller must not run). Flag OFF = nothing to start. */
export function beginRequestCapRun(env: Env = process.env): BeginRunResult | { ok: true; limit: null } {
  if (!requestCapOn(env)) return { ok: true, limit: null }
  const limit = parseCapValue(env[REQUEST_CAP_PER_RUN_ENV], REQUEST_CAP_MAX_PER_RUN)
  if (limit === null) { run = { limit: 0, sent: 0, refused: 0 }; return { ok: false, problem: `${REQUEST_CAP_PER_RUN_ENV} is missing or not an integer in 1..${REQUEST_CAP_MAX_PER_RUN}` } }
  run = { limit, sent: 0, refused: 0 }
  return { ok: true, limit }
}
export function endRequestCapRun(): { limit: number; sent: number; refused: number } | null {
  const r = run
  run = null
  return r ? { ...r } : null
}
export function requestCapRunState(): { limit: number; sent: number; refused: number } | null { return run ? { ...run } : null }

// ── counters + visibility ───────────────────────────────────────────────────────────────────────────────────────────────
const totals: { reserved: number; refused: Partial<Record<RequestCapRefusal, number>> } = { reserved: 0, refused: {} }
const alerted = new Set<RequestCapRefusal>()
export function requestCapTotals(): { reserved: number; refused: Partial<Record<RequestCapRefusal, number>> } { return { reserved: totals.reserved, refused: { ...totals.refused } } }
/** Test seam. */
export function __resetRequestCap(): void { run = null; totals.reserved = 0; totals.refused = {}; alerted.clear() }

export type RequestReservation = { ok: true; release: () => void } | { ok: false; reason: RequestCapRefusal }
const NOOP_OK: RequestReservation = { ok: true, release: () => undefined }

function refuse(reason: RequestCapRefusal, endpoint: string, turn: RequestCapTurn | undefined): RequestReservation {
  totals.refused[reason] = (totals.refused[reason] ?? 0) + 1
  if (turn) { turn.refused++; turn.refusals[reason] = (turn.refusals[reason] ?? 0) + 1 }
  if (run) run.refused++ // every refusal while a bench run is active, whatever its reason: the run's own tally of searches that were NOT made
  console.log(JSON.stringify({ type: 'tappyai_serper_request_cap', endpoint, refused: true, reason, ...(turn ? { turn: turn.id, sent: turn.sent, limit: turn.limit } : {}) }))
  if (!alerted.has(reason)) {
    alerted.add(reason)
    console.error(JSON.stringify({ type: 'tappyai_alert', alert: 'serper_request_cap_refused', reason, endpoint, note: 'fail-closed: the request was NOT sent; first occurrence per reason per instance' }))
  }
  return { ok: false, reason }
}

/**
 * Reserves ONE request, synchronously. OFF = a no-op reservation (the old behaviour, nothing read but the flag). The caller sends only on ok:true,
 * and calls release() for a reservation it gives back because the request was provably NOT sent (a later gate refused it, or it was cancelled
 * before fetch). A request that was sent — even one that timed out — is never released: the provider may have processed it.
 */
export function reserveRequest(endpoint: string, env: Env = process.env): RequestReservation {
  if (!requestCapOn(env)) return NOOP_OK
  const cfg = requestCapConfig(env)
  const turn = turnStore.getStore()
  if (!cfg.on || !cfg.valid) return refuse('config_invalid', endpoint, turn)
  // L2 first (read only): a bench run whose own value is invalid refuses everything; a spent run total refuses before the turn is touched.
  if (run && run.limit === 0) return refuse('run_config_invalid', endpoint, turn)
  if (run && run.sent >= run.limit) return refuse('run_cap', endpoint, turn)
  if (!turn) {
    // The bounded agent (TAPPY_AGENT) has its own credit scope (serperToolBudget.ts) and is NOT counted per turn here; it still counts on L2.
    if (hasSerperCreditScope()) {
      if (run) run.sent++
      totals.reserved++
      let given = false
      return { ok: true, release: () => { if (given) return; given = true; if (run) run.sent = Math.max(0, run.sent - 1); totals.reserved = Math.max(0, totals.reserved - 1) } }
    }
    return refuse('no_turn_scope', endpoint, undefined)
  }
  if (turn.closed) return refuse('turn_closed', endpoint, turn)
  if (turn.sent >= turn.limit) return refuse('turn_cap', endpoint, turn)
  turn.sent++
  if (run) run.sent++
  totals.reserved++
  let given = false
  return {
    ok: true,
    release: () => {
      if (given) return
      given = true
      turn.sent = Math.max(0, turn.sent - 1)
      if (run) run.sent = Math.max(0, run.sent - 1)
      totals.reserved = Math.max(0, totals.reserved - 1)
    },
  }
}

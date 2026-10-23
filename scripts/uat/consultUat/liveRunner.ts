/**
 * Benchmark runner for the 13 fixed UAT turns (scripts/uat/consultUat/questions.ts) — round 2: MOCK-TESTED ONLY.
 *
 * What it is: a `TurnRunner` for `runUat` (harness.ts). Each turn gets its own spend gate (a BudgetGuard with the per-turn cap, injected through the
 * one injection point of src/lib/ai/budget/spendGate.ts), the whole chat request runs inside it, and what the turn spent is what the gate booked —
 * never a bill added up afterwards. `runUat` reserves the per-turn maximum from the run guard BEFORE the turn, so the run cap holds as well.
 *
 * What it is not: it does not log in, does not start a server, does not read or print a key, and nothing here has ever been run against a real
 * provider. The chat transport is injected: `routeTransport` calls any `POST` handler in-process (the way scripts/consult/replay does). Which
 * handler, and how the app is authenticated there, is for the Owner to decide before a real run (see the report).
 *
 * It refuses to run unless the spend is confirmed (`confirmSpend` with the run cap), BENCH_SPEND_GATE is ON, the caps in the environment are the
 * caps asked for, the flag set is listed explicitly and equals the environment, no flag that must be OFF is on, and the output folder is outside
 * the repository.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { benchSpendGateOn, readBenchCaps, runWithSpendGate } from '@/lib/ai/budget/spendGate'
import { BudgetGuard, runUat, summarize, type ChatMessage, type TurnRunner, type UatReport } from './harness'
import { UAT_TURNS, type UatTurn } from './questions'
import { GuardSpendGate } from './spendGateAdapter'
import { parseDataStream } from '../../consult/replay/lib/stream'

/** Every flag the result records. The caller must list ALL of them (value, or null = unset) and the list must equal the environment. */
export const BENCH_FLAG_NAMES: readonly string[] = [
  'BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD',
  'TURN_WEB_TICKET', 'SEARCH_FALLBACK_GATE',
  'CONSULT_LUNA', 'CONSULT_LUNA_FAST', 'CONSULT_LUNA_PLAN', 'CONSULT_LUNA_ONE', 'CONSULTATIVE_V1', 'CONSULT_V2', 'CONSULT_V3',
  'TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'TAPPY_ANSWER_V4', 'RETRIEVAL_V5',
  'LLM_PROVIDER', 'LLM_OPENAI_API', 'AGENT_MODEL', 'HAIKU_FALLBACK', 'C2_REQUEST_BUDGET',
  'MONEY_GUARD_KEEP_VERIFIED', 'PLACE_CLAIM_KEEP_VERIFIED_PRICE', 'LEGACY_STREAM_TRACE', 'SERPER_CACHE_V2',
  // what the prices are read from: a different model id or per-credit price changes what a call is booked at
  'SERPER_USD_PER_CREDIT', 'LLM_LUNA_MODEL', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL',
]

/** Flags that put a paid path outside the spend gate's reach (agent runtime, V4 hosted search, V5, Responses API, Anthropic models): must be OFF. */
export const BENCH_MUST_BE_OFF: readonly string[] = [
  'TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'TAPPY_ANSWER_V4', 'RETRIEVAL_V5', 'LLM_OPENAI_API', 'AGENT_MODEL', 'HAIKU_FALLBACK', 'CONSULT_V3',
]

export class BenchRefusal extends Error {
  constructor(readonly reasons: string[]) {
    super(`benchmark refused: ${reasons.join('; ')}`)
    this.name = 'BenchRefusal'
  }
}

export type ChatTransport = (req: { messages: ChatMessage[]; chatSessionId: string }) => Promise<{ raw: string; status?: number }>

export interface BenchOptions {
  chat: ChatTransport
  /** USD per turn (the hard per-turn cap). */
  turnCapUsd: number
  /** USD for the whole run (the hard run cap). */
  runCapUsd: number
  /** `--confirm-spend <cap>`: the explicit confirmation that this run may spend up to that cap. */
  confirmSpend: { capUsd: number } | null
  /** Every flag of BENCH_FLAG_NAMES with its value (null = unset). */
  declaredFlags: Record<string, string | null> | null
  env?: Record<string, string | undefined>
  /** Where the result goes. Must be outside the repository and outside the backups folder. */
  outDir?: string
  write?: (path: string, text: string) => void
  repoRoot?: string
  turns?: readonly UatTurn[]
  now?: () => number
}

export interface TurnRecord {
  id: string
  conversation: string
  turn: number
  answer: string
  ms: number
  toolNames: string[]
  /** The `tappyai_web_ticket` log lines the turn produced (the ticket log: taken / settled / refunded / blocked). */
  ticketLog: unknown[]
  cost: { state: 'known' | 'unknown'; usd: number | null }
  llmRequests: number
  serperRequests: number
  refusals: number
  /** Paid calls the app tried to start AFTER its answer (refused: their cost could not be booked to the turn). Reported, not counted as degraded. */
  lateRefusals: number
  /** A paid call was refused by the cap: the answer is not the answer the app would have given. */
  degraded: boolean
  blocked: string | null
  openReservedUsd: number
  httpStatus?: number
  streamErrors: string[]
  error?: string
}

export interface BenchResult {
  valid: boolean
  report: UatReport
  records: TurnRecord[]
  outPath: string | null
  flags: Record<string, string | null>
}

const norm = (v: string | undefined | null): string | null => { const s = (v ?? '').trim(); return s === '' ? null : s }
const isOffValue = (v: string | null): boolean => v === null || ['0', 'false', 'off', 'no'].includes(v.toLowerCase())
const slash = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')
/** Both paths resolved first (relative paths and `..` segments cannot hide a location inside the repository). */
const inside = (path: string, root: string): boolean => { const a = slash(resolve(path)).toLowerCase(), b = slash(resolve(root)).toLowerCase(); return a === b || a.startsWith(`${b}/`) }

function outDirProblems(outDir: string | undefined, repoRoot: string | undefined): string[] {
  if (!outDir) return []
  const out: string[] = []
  if (inside(outDir, repoRoot ?? process.cwd())) out.push(`the output folder (${outDir}) is inside the repository: results go outside it`)
  if (/tappyai-backups/i.test(slash(outDir))) out.push(`the output folder (${outDir}) is inside the backups folder: not in this round`)
  return out
}

/** Every reason the run may not start, or nothing. */
export function assertBenchAllowed(o: BenchOptions): void {
  const env = o.env ?? process.env
  const reasons: string[] = []
  if (!(Number.isFinite(o.turnCapUsd) && o.turnCapUsd > 0 && Number.isFinite(o.runCapUsd) && o.runCapUsd >= o.turnCapUsd)) reasons.push('the per-turn cap and the run cap must be finite, positive, and the turn cap not above the run cap')
  if (!o.confirmSpend) reasons.push('no explicit spend confirmation (--confirm-spend with the cap)')
  else if (o.confirmSpend.capUsd !== o.runCapUsd) reasons.push(`the spend confirmation (${o.confirmSpend.capUsd}) is not for the run cap (${o.runCapUsd})`)
  if (!benchSpendGateOn(env)) reasons.push('BENCH_SPEND_GATE is not ON')
  else {
    const caps = readBenchCaps(env)
    if (!caps) reasons.push('BENCH_SPEND_TURN_CAP_USD / BENCH_SPEND_RUN_CAP_USD are missing or invalid')
    else if (caps.turnUsd !== o.turnCapUsd || caps.runUsd !== o.runCapUsd) reasons.push('the caps in the environment (cap variables) differ from the caps asked for')
  }
  if (!o.declaredFlags) reasons.push('the flag set is not listed explicitly (declaredFlags)')
  else {
    const names = new Set(BENCH_FLAG_NAMES)
    const missing = BENCH_FLAG_NAMES.filter(k => !(k in o.declaredFlags!))
    const extra = Object.keys(o.declaredFlags).filter(k => !names.has(k))
    if (missing.length) reasons.push(`flags not listed: ${missing.join(', ')}`)
    if (extra.length) reasons.push(`flags listed that are not part of the benchmark flag set: ${extra.join(', ')}`)
    const differ = BENCH_FLAG_NAMES.filter(k => k in o.declaredFlags! && norm(o.declaredFlags![k]) !== norm(env[k]))
    if (differ.length) reasons.push(`listed flag value differs from the environment: ${differ.join(', ')}`)
  }
  // The app reads process.env, whatever environment object was checked above.
  if (env !== process.env) {
    const apart = BENCH_FLAG_NAMES.filter(k => norm(env[k]) !== norm(process.env[k]))
    if (apart.length) reasons.push(`the environment the app reads (process.env) differs from the one that was checked: ${apart.join(', ')}`)
  }
  for (const k of BENCH_MUST_BE_OFF) if (!isOffValue(norm(env[k]))) reasons.push(`${k} must be OFF for this benchmark (a paid path outside the spend gate)`)
  const provider = norm(env.LLM_PROVIDER)
  if (provider !== null && provider.toLowerCase() !== 'openai') reasons.push('LLM_PROVIDER must be unset or openai (other providers have no list price: the gate refuses them)')
  reasons.push(...outDirProblems(o.outDir, o.repoRoot))
  if (reasons.length) throw new BenchRefusal(reasons)
}

/** Where results go: the folder asked for (outside the repo), else a temporary folder. */
export function resolveBenchOutDir(o: { outDir?: string; repoRoot?: string; tmp?: string; stamp?: number }): string {
  const problems = outDirProblems(o.outDir, o.repoRoot)
  if (problems.length) throw new BenchRefusal(problems)
  if (o.outDir) return slash(o.outDir)
  return `${slash(o.tmp ?? tmpdir())}/tappy-bench-${o.stamp ?? Date.now()}`
}

/** The `tappyai_web_ticket` lines the app logs during a turn. Everything else is passed through untouched. */
function captureTicketLines(into: unknown[]): () => void {
  const original = console.log
  console.log = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.startsWith('{"type":"tappyai_web_ticket"')) { try { into.push(JSON.parse(first)) } catch { /* not JSON: not a ticket line */ } }
    original.apply(console, args as never)
  }
  return () => { console.log = original }
}

export function createBenchRunner(o: BenchOptions): { runner: TurnRunner; records: TurnRecord[]; finalize: () => void } {
  const records: TurnRecord[] = []
  const gates: GuardSpendGate[] = []
  /** Refreshes what can still change after a turn ended: paid calls the app tried to start late. Call once the run is over. */
  const finalize = () => { records.forEach((r, i) => { r.lateRefusals = gates[i].lateRefusals }) }
  const sessions = new Map<string, string>()
  const now = o.now ?? Date.now
  const runner: TurnRunner = async ({ turn, history }) => {
    const gate = new GuardSpendGate(new BudgetGuard(o.turnCapUsd))
    let sessionId = sessions.get(turn.conversation)
    if (!sessionId) { sessionId = randomUUID(); sessions.set(turn.conversation, sessionId) }
    const messages: ChatMessage[] = [...history, { role: 'user', content: turn.text }]
    const ticketLog: unknown[] = []
    const restore = captureTicketLines(ticketLog)
    const t0 = now()
    let raw = ''
    let status: number | undefined
    let thrown: unknown = null
    try {
      const res = await runWithSpendGate(gate, () => o.chat({ messages, chatSessionId: sessionId! }))
      raw = res.raw; status = res.status
    } catch (e) { thrown = e } finally { restore() }
    const ms = now() - t0
    gate.close() // work the app left running after its answer can no longer add cost the books would miss
    const parsed = parseDataStream(raw)
    const blocked = gate.guard.blockedBy
    const open = gate.guard.openReservedUsd
    const known = gate.guard.knownUsd
    // The cost of the turn is known only when nothing failed, nothing is blocked (exceeded / unknown / unusable) and nothing is still open.
    const costKnown = thrown === null && blocked === null && open === 0 && known !== null
    const record: TurnRecord = {
      id: turn.id, conversation: turn.conversation, turn: turn.turn,
      answer: parsed.text, ms,
      toolNames: parsed.tools.map(t => t.toolName).filter((n): n is string => !!n),
      ticketLog,
      cost: { state: costKnown ? 'known' : 'unknown', usd: costKnown ? known : null },
      llmRequests: gate.count('llm:'), serperRequests: gate.count('serper:'),
      refusals: gate.refusals, lateRefusals: gate.lateRefusals, degraded: gate.refusals > 0,
      blocked, openReservedUsd: open,
      ...(status !== undefined ? { httpStatus: status } : {}),
      streamErrors: parsed.errors,
      ...(thrown !== null ? { error: thrown instanceof Error ? thrown.message : String(thrown) } : {}),
    }
    records.push(record)
    gates.push(gate)
    if (thrown !== null) throw thrown // an ordinary failure: runUat books the cost as unknown and stops
    // A cost that is not known is reported as NaN: runUat settles it as invalid and stops the run, and no total is reported.
    return { text: parsed.text, toolCalls: record.toolNames.map(name => ({ name })), ms, usd: costKnown ? known! : Number.NaN }
  }
  return { runner, records, finalize }
}

export async function runBench(o: BenchOptions): Promise<BenchResult> {
  assertBenchAllowed(o)
  const { runner, records, finalize } = createBenchRunner(o)
  const now = o.now ?? Date.now
  const report = await runUat({ turns: o.turns ?? UAT_TURNS, runner, guard: new BudgetGuard(o.runCapUsd), maxUsdPerTurn: o.turnCapUsd })
  await new Promise(r => setTimeout(r, 0)) // let work the app left running reach the closed gate before it is counted
  finalize()
  // The run is valid only if the books are complete AND no turn was degraded by a refused call or an error frame.
  const valid = report.cost.complete && records.every(r => r.cost.state === 'known' && !r.degraded && !r.error && r.streamErrors.length === 0)
  const flags = Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, norm(o.declaredFlags![k])])) as Record<string, string | null>
  const stamp = now()
  const dir = resolveBenchOutDir({ outDir: o.outDir, repoRoot: o.repoRoot, stamp })
  const outPath = `${dir}/bench-${stamp}.json`
  const text = JSON.stringify({
    at: new Date(stamp).toISOString(), valid, flags, caps: { turnUsd: o.turnCapUsd, runUsd: o.runCapUsd },
    summary: summarize(report), turns: records, report,
  }, null, 2)
  const write = o.write ?? ((path: string, t: string) => { mkdirSync(dir, { recursive: true }); writeFileSync(path, t, 'utf8') })
  write(outPath, text)
  return { valid, report, records, outPath, flags }
}

/**
 * Calls any `POST(req)` handler in-process the way scripts/consult/replay/replay.test.ts does and reads the WHOLE response stream. It adds no
 * session and no cookie: how the app authenticates the request is the handler's business and the Owner's decision.
 */
export function routeTransport(post: (req: never) => Promise<Response>): ChatTransport {
  return async ({ messages, chatSessionId }) => {
    const req = {
      url: 'http://localhost/api/chat',
      nextUrl: new URL('http://localhost/api/chat'),
      headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', 'accept-language': 'vi' }),
      json: () => Promise.resolve({ messages, chatSessionId }),
      signal: undefined,
    }
    const res = await post(req as never)
    let raw = ''
    if (res.body) {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        raw += dec.decode(value, { stream: true })
      }
      raw += dec.decode()
    }
    return { raw, status: res.status }
  }
}

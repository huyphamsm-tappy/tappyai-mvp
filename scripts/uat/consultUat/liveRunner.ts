/**
 * Benchmark runner for the 13 fixed UAT turns (scripts/uat/consultUat/questions.ts) — MOCK-TESTED ONLY (round 2, hardened in round 2b).
 *
 * What it is: a `TurnRunner` for `runUat` (harness.ts). Each turn gets its own spend gate (a BudgetGuard with the per-turn cap, injected through the
 * one injection point of src/lib/ai/budget/spendGate.ts), the whole chat request runs inside it, and what the turn spent is what the gate booked —
 * never a bill added up afterwards. `runUat` reserves the per-turn maximum from the run guard BEFORE the turn, and the runner keeps a run guard of
 * its own, so the run cap holds however the runner is driven.
 *
 * What it is not: it does not log in, does not start a server, does not read or print a key, and nothing here has ever been run against a real
 * provider. The chat transport is injected: `routeTransport` calls any `POST` handler in-process (the way scripts/consult/replay does). Which
 * handler, and how the app is authenticated there, is for the Owner to decide before a real run (see the report).
 *
 * Round 2b: the caps can never exceed $0.05 per turn / $0.65 per run (checked on the exact decimal value at every entry); the result folder is
 * required, on drive D, outside the repository and the backups folder, and proven writable before the first request; every turn is appended to a
 * JSONL file the moment it ends; a failed or invalid run still leaves a final file (valid=false, no `totalUsd` anywhere); a failed write STOPS the
 * run. After any stop the runner sends nothing more — there is no automatic re-run.
 *
 * It refuses to run unless the spend is confirmed (`confirmSpend` with the run cap), BENCH_SPEND_GATE is ON, the caps in the environment are the
 * caps asked for, the flag set is listed explicitly and equals the environment, and no flag that must be OFF is on.
 */
import { appendFileSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { benchSpendGateOn, checkBenchCaps, readBenchCaps, runWithSpendGate } from '@/lib/ai/budget/spendGate'
import { BudgetGuard, BudgetRefusal, RequestNotSent, runUat, summarize, type ChatMessage, type Reservation, type RunOptions, type TurnRunner, type UatReport } from './harness'
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

/** Evidence could not be saved: the run stops and says so. `cause` is the underlying file-system error. */
export class BenchWriteError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'BenchWriteError'
  }
}

export type ChatTransport = (req: { messages: ChatMessage[]; chatSessionId: string }) => Promise<{ raw: string; status?: number }>

/** The file operations the runner needs, injectable so tests never touch a disk. */
export interface BenchFs {
  mkdirp(dir: string): void
  write(path: string, text: string): void
  append(path: string, text: string): void
  remove(path: string): void
  /** The real location of an existing path (junctions / symlinks / 8.3 short names resolved). */
  realpath(path: string): string
}
/** The repository this file lives in, whatever the working directory is (the output folder must be outside it as well as outside `repoRoot`). */
const MODULE_REPO_ROOT = win32.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const realFs: BenchFs = {
  realpath: path => realpathSync.native(path),
  mkdirp: dir => { mkdirSync(dir, { recursive: true }) },
  write: (path, text) => writeFileSync(path, text, 'utf8'),
  append: (path, text) => appendFileSync(path, text, 'utf8'),
  remove: path => unlinkSync(path),
}

export interface BenchOptions {
  chat: ChatTransport
  /** USD per turn (the hard per-turn cap). Never above $0.05. */
  turnCapUsd: number
  /** USD for the whole run (the hard run cap). Never above $0.65. */
  runCapUsd: number
  /** `--confirm-spend <cap>`: the explicit confirmation that this run may spend up to that cap. */
  confirmSpend: { capUsd: number } | null
  /** Every flag of BENCH_FLAG_NAMES with its value (null = unset). */
  declaredFlags: Record<string, string | null> | null
  env?: Record<string, string | undefined>
  /** REQUIRED. Where the results go: an absolute path on drive D, outside the repository and the backups folder, and writable. There is no default. */
  outDir: string
  /** File operations (default: the real file system). */
  fs?: BenchFs
  repoRoot?: string
  turns?: readonly UatTurn[]
  now?: () => number
  /** Test seam: the function that drives the turns (default `runUat`). */
  runUatImpl?: (o: RunOptions) => Promise<UatReport>
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
  /** `images` (place / product photo) lookups skipped on purpose because their cost has no proven bound: the text answer is unchanged, so they do not degrade the turn. */
  photoSkips: number
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
/** Both paths resolved first (relative paths and `..` segments cannot hide a location inside the repository). Windows rules, whatever the host. */
const inside = (path: string, root: string): boolean => { const a = slash(win32.resolve(path)).toLowerCase(), b = slash(win32.resolve(root)).toLowerCase(); return a === b || a.startsWith(`${b}/`) }

/**
 * Why `outDir` may not be used, or nothing. It must be given, be an absolute path that STARTS with the drive letter D (D:/ or D:\, either case),
 * contain no `..` segment (a path that could climb out to another drive or into the repository is not examined further), no second `:` (drive
 * or stream syntax) and none of < > " | ? *, and lie outside the repository and the backups folder.
 */
function outDirProblems(outDir: unknown, repoRoot: string | undefined): string[] {
  if (typeof outDir !== 'string' || outDir.trim() === '') return ['no output folder (outDir is required: results go to an absolute path on drive D)']
  const raw = outDir.trim()
  const out: string[] = []
  if (!/^[dD]:[\\/]/.test(raw)) out.push(`the output folder (${raw}) is not an absolute path on drive D (D:/… or D:\\…)`)
  if (/(^|[\\/])\.\.([\\/]|$)/.test(raw)) out.push(`the output folder (${raw}) contains a ".." segment`)
  if (raw.indexOf(':') !== 1 || raw.slice(2).includes(':')) out.push(`the output folder (${raw}) contains a drive or stream separator ":" beyond the drive letter`)
  if (/[<>"|?*]/.test(raw)) out.push(`the output folder (${raw}) contains a character that is not allowed in a path`)
  if (out.length) return out
  out.push(...locationProblems(raw, repoRoot))
  return out
}

/** The location rules on a path: outside the repository (the one given or the working directory, AND the one this module lives in) and outside the backups folder. */
function locationProblems(path: string, repoRoot: string | undefined, extraRoots: readonly string[] = []): string[] {
  const out: string[] = []
  if ([repoRoot ?? process.cwd(), MODULE_REPO_ROOT, ...extraRoots].some(r => inside(path, r))) out.push(`the output folder (${path}) is inside the repository: results go outside it`)
  if (/tappyai-backups/i.test(slash(win32.resolve(path)))) out.push(`the output folder (${path}) is inside the backups folder: not in this round`)
  return out
}

/** Every reason the run may not start, or nothing. Pure: it touches no file. */
export function assertBenchAllowed(o: BenchOptions): void {
  const env = o.env ?? process.env
  const reasons: string[] = []
  // The caps asked for: exact decimal value, at most $0.05 per turn and $0.65 per run, turn cap not above the run cap.
  const asked = checkBenchCaps(o.turnCapUsd, o.runCapUsd)
  if (!asked.ok) reasons.push(...asked.reasons)
  if (!o.confirmSpend) reasons.push('no explicit spend confirmation (--confirm-spend with the cap)')
  else if (o.confirmSpend.capUsd !== o.runCapUsd) reasons.push(`the spend confirmation (${o.confirmSpend.capUsd}) is not for the run cap (${o.runCapUsd})`)
  if (!benchSpendGateOn(env)) reasons.push('BENCH_SPEND_GATE is not ON')
  else {
    const caps = readBenchCaps(env)
    if (!caps) reasons.push('BENCH_SPEND_TURN_CAP_USD / BENCH_SPEND_RUN_CAP_USD are missing, invalid or above the maximum ($0.05 per turn, $0.65 per run)')
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

/** The folder results go to: `outDir` itself (required — there is no temporary-folder default), after the location rules. */
export function resolveBenchOutDir(o: { outDir?: string; repoRoot?: string }): string {
  const problems = outDirProblems(o.outDir, o.repoRoot)
  if (problems.length) throw new BenchRefusal(problems)
  return slash(o.outDir!.trim())
}

/**
 * Proves the folder can be created and written BEFORE the first request: it is created, its REAL location (junctions, symlinks and 8.3 short names
 * resolved) is checked against the same rules as its name — drive D, outside the repository and the backups folder — and only then a probe file is
 * written and deleted. Any failure refuses the run.
 */
function probeOutDir(fs: BenchFs, dir: string, repoRoot: string | undefined): void {
  const probe = `${dir}/.probe-${randomUUID()}`
  try { fs.mkdirp(dir) } catch (e) { throw new BenchRefusal([`the output folder (${dir}) is not writable: ${e instanceof Error ? e.message : String(e)}`]) }
  let real: string
  try { real = slash(fs.realpath(dir)) } catch (e) { throw new BenchRefusal([`the real location of the output folder (${dir}) cannot be determined: ${e instanceof Error ? e.message : String(e)}`]) }
  const problems = [
    ...(/^[dD]:\//.test(real) && !real.startsWith('//') ? [] : [`the output folder (${dir}) really lives at ${real}, which is not an absolute path on drive D`]),
    // the repository itself may be reached through a junction: its real location counts too
    ...locationProblems(real, repoRoot, [repoRoot ?? process.cwd(), MODULE_REPO_ROOT].flatMap(r => { try { return [fs.realpath(r)] } catch { return [] } })).map(p => `${p} [real location ${real}]`),
  ]
  if (problems.length) throw new BenchRefusal(problems)
  try { fs.write(probe, 'probe'); fs.remove(probe) } catch (e) {
    throw new BenchRefusal([`the output folder (${dir}) is not writable: ${e instanceof Error ? e.message : String(e)}`])
  }
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

export interface BenchRunner {
  runner: TurnRunner
  records: TurnRecord[]
  /** Refreshes what can still change after a turn ended: paid calls the app tried to start late. Call once the run is over. */
  finalize: () => void
  /** The files this run writes: one JSONL line per finished turn, and the final result. */
  paths: { jsonl: string; result: string }
  /** Reservations still open (held, unknown or unreconciled) per turn, including a turn that is still in flight. */
  openReservations: () => Array<{ turn: string; openReservedUsd: number; reservations: Array<{ label: string; maxUsd: number; state: string }> }>
  /** Set when a turn's record could not be saved: the run was stopped because of it. */
  writeFailure: () => BenchWriteError | null
  /** Why the runner will send nothing more (null while it may). */
  halted: () => string | null
}

/**
 * Every way into the runner goes through here, so the preflight cannot be skipped: the full `assertBenchAllowed` (caps, confirmation, flags,
 * folder rules) and the writable-folder probe run BEFORE a runner exists. The runner then holds the run cap itself (a run guard) and stops for good
 * after a turn whose cost is unknown, a failed turn or a failed write.
 */
export function createBenchRunner(o: BenchOptions): BenchRunner {
  assertBenchAllowed(o)
  const fs = o.fs ?? realFs
  const dir = slash(o.outDir.trim())
  probeOutDir(fs, dir, o.repoRoot)
  const now = o.now ?? Date.now
  const stamp = now()
  const paths = { jsonl: `${dir}/bench-${stamp}.turns.jsonl`, result: `${dir}/bench-${stamp}.json` }

  const records: TurnRecord[] = []
  const gates: GuardSpendGate[] = []
  const runGuard = new BudgetGuard(o.runCapUsd)
  const sessions = new Map<string, string>()
  let halted: string | null = null
  let writeFailure: BenchWriteError | null = null
  const finalize = () => { records.forEach((r, i) => { r.lateRefusals = gates[i].lateRefusals }) }
  const openReservations = () => gates
    .map((g, i) => ({ turn: records[i]?.id ?? `in-flight-${i + 1}`, openReservedUsd: g.guard.openReservedUsd, reservations: g.records.filter(r => r.state === 'held' || r.state === 'unknown' || r.state === 'unreconciled').map(r => ({ label: r.label, maxUsd: r.maxUsd, state: r.state })) }))
    .filter(x => x.openReservedUsd > 0)

  const runner: TurnRunner = async ({ turn, history }) => {
    // After a stop nothing more is sent — no path re-runs a turn or replaces an answer.
    if (halted) throw new RequestNotSent(`the run is stopped (${halted}): no further request is made`)
    // The run cap is held HERE as well as by runUat: however the runner is driven, the turns together cannot book more than the run cap.
    let runRes: Reservation
    try { runRes = runGuard.reserve(o.turnCapUsd) } catch (e) {
      if (e instanceof BudgetRefusal) throw new RequestNotSent(`the run cap would be exceeded: ${e.message}`)
      throw e
    }
    const gate = new GuardSpendGate(new BudgetGuard(o.turnCapUsd))
    gates.push(gate)
    let sessionId = sessions.get(turn.conversation)
    if (!sessionId) { sessionId = randomUUID(); sessions.set(turn.conversation, sessionId) }
    const messages: ChatMessage[] = [...history, { role: 'user', content: turn.text }]
    const ticketLog: unknown[] = []
    // The turn is announced on disk BEFORE anything is sent: if the process dies or hangs mid-turn, the file still says which turn was in flight and how
    // much was reserved for it. A failed write here stops the run before the request exists.
    try { fs.append(paths.jsonl, `${JSON.stringify({ started: turn.id, at: now(), reservedUsd: o.turnCapUsd })}\n`) } catch (e) {
      halted = 'a turn could not be announced'
      runGuard.release(runRes)
      writeFailure = new BenchWriteError(`turn ${turn.id} could not be announced in ${paths.jsonl}: ${e instanceof Error ? e.message : String(e)} — nothing was sent, the run is stopped`, e)
      throw writeFailure
    }
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
    // A stream the parser cannot read must not lose the turn: the raw text is kept as the answer and the failure is recorded like any other.
    let parsed: ReturnType<typeof parseDataStream>
    try { parsed = parseDataStream(raw) } catch (e) {
      if (thrown === null) thrown = new Error(`the answer stream could not be parsed: ${e instanceof Error ? e.message : String(e)}`)
      parsed = { text: raw, tools: [], errors: [`unparseable stream: ${e instanceof Error ? e.message : String(e)}`] } as unknown as ReturnType<typeof parseDataStream>
    }
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
      refusals: gate.refusals, photoSkips: gate.photoSkips, lateRefusals: gate.lateRefusals, degraded: gate.refusals > 0,
      blocked, openReservedUsd: open,
      ...(status !== undefined ? { httpStatus: status } : {}),
      streamErrors: parsed.errors,
      ...(thrown !== null ? { error: thrown instanceof Error ? thrown.message : String(thrown) } : {}),
    }
    // A non-2xx answer or an empty one is not a benchmark answer, whatever it cost: the turn carries an error, so the run is not valid.
    if (!record.error && status !== undefined && (status < 200 || status >= 300)) record.error = `HTTP ${status}: not an answer`
    if (!record.error && parsed.text.trim() === '') record.error = 'empty answer'
    // The run cannot be valid any more: nothing more is sent (the bad answer would also become the history of the later turns).
    if (record.error && thrown === null) halted = 'a turn was not an answer'
    records.push(record)
    // The run guard learns what the turn cost; a cost that is not known keeps its reservation open and stops the runner for good.
    if (costKnown) runGuard.settle(runRes, known!)
    else { runGuard.markUnknown(runRes); halted = thrown !== null ? 'a turn failed' : 'a turn\'s cost is unknown' }
    // The turn is on disk BEFORE runUat goes on (or throws). A write that fails stops the run: no silence, no next turn.
    try { fs.append(paths.jsonl, `${JSON.stringify(record)}\n`) } catch (e) {
      halted = 'a turn could not be saved'
      writeFailure = new BenchWriteError(`turn ${turn.id} could not be saved to ${paths.jsonl}: ${e instanceof Error ? e.message : String(e)} — the run is stopped`, e)
      throw writeFailure
    }
    if (thrown !== null) throw thrown // an ordinary failure: runUat books the cost as unknown and stops
    // A cost that is not known is reported as NaN: runUat settles it as invalid and stops the run, and no total is reported.
    return { text: parsed.text, toolCalls: record.toolNames.map(name => ({ name })), ms, usd: costKnown ? known! : Number.NaN }
  }
  return { runner, records, finalize, paths, openReservations, writeFailure: () => writeFailure, halted: () => halted }
}

export async function runBench(o: BenchOptions): Promise<BenchResult> {
  // Preflight and the writable-folder probe happen inside createBenchRunner: nothing is sent before they pass.
  const { runner, records, finalize, paths, openReservations, writeFailure } = createBenchRunner(o)
  const fs = o.fs ?? realFs
  const now = o.now ?? Date.now
  const drive = o.runUatImpl ?? runUat
  let report: UatReport | null = null
  let runError: unknown = null
  try {
    report = await drive({ turns: o.turns ?? UAT_TURNS, runner, guard: new BudgetGuard(o.runCapUsd), maxUsdPerTurn: o.turnCapUsd })
    await new Promise(r => setTimeout(r, 0)) // let work the app left running reach the closed gate before it is counted
  } catch (e) { runError = e } // whatever happened, the evidence is written below before anything is thrown
  finalize()
  const wf = writeFailure()
  // The run is valid only if it ended normally, the books are complete AND no turn was degraded by a refused call, an error frame or a failed save.
  const valid = runError === null && wf === null && report !== null && report.cost.complete && records.length === (o.turns ?? UAT_TURNS).length && records.every(r => r.cost.state === 'known' && !r.degraded && !r.error && r.streamErrors.length === 0)
  const costState = report !== null && report.cost.costAccounted && records.every(r => r.cost.state === 'known') ? 'known' : 'unknown'
  const flags = Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, norm(o.declaredFlags![k])])) as Record<string, string | null>
  const body = {
    at: new Date(now()).toISOString(), valid, costState, flags, caps: { turnUsd: o.turnCapUsd, runUsd: o.runCapUsd },
    ...(runError !== null ? { error: runError instanceof Error ? `${runError.name}: ${runError.message}` : String(runError) } : {}),
    ...(wf ? { writeError: wf.message } : {}),
    openReservations: openReservations(),
    summary: report ? summarize(report) : null, turns: records, report,
  }
  // An invalid run states no total: the key `totalUsd` is dropped at every level (not 0, not a partial sum). Done here, in the serialization layer.
  let text: string
  try { text = JSON.stringify(body, valid ? undefined : (k, v) => (k === 'totalUsd' ? undefined : v), 2) } catch (e) {
    // never let a serialization failure hide the run: fall back to the per-turn records alone
    text = JSON.stringify({ valid: false, costState: 'unknown', error: `the result could not be serialized: ${e instanceof Error ? e.message : String(e)}`, turns: records }, (k, v) => (k === 'totalUsd' ? undefined : v), 2)
  }
  let saveError: unknown = null
  try { fs.write(paths.result, text) } catch (e) { saveError = e }
  if (saveError !== null) {
    // one more attempt under another name, then say plainly where the evidence is (the per-turn JSONL already holds every finished turn)
    let retried = ''
    try { fs.write(`${paths.result}.retry`, text); retried = ` — the same content was saved to ${paths.result}.retry` } catch { retried = ` — a second attempt (${paths.result}.retry) failed too; the turns finished so far are in ${paths.jsonl}` }
    throw new BenchWriteError(`the result file ${paths.result} could not be saved: ${saveError instanceof Error ? saveError.message : String(saveError)}${retried}${runError !== null ? ` (the run had also failed: ${runError instanceof Error ? runError.message : String(runError)})` : ''}`, saveError)
  }
  if (wf) throw wf
  if (runError !== null) throw runError
  return { valid, report: report!, records, outPath: paths.result, flags }
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

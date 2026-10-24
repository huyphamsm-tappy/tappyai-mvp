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
import { GuardSpendGate, type SpendRecord, type SpendRecordState } from './spendGateAdapter'
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
  // audit switches the chat route reads: AUDIT_DRY_RUN answers with a canned line and NO model call; the other two write full model requests / usage to a file
  'AUDIT_DRY_RUN', 'AUDIT_MODEL_REQUEST_FILE', 'AUDIT_USAGE_LOG_FILE',
  // round 3b-1: routing guard for the aviation word "hàng không" (intent.ts routeFlightGuardOn); default OFF
  'ROUTE_FLIGHT_HANG_KHONG_GUARD',
]

/** Variables the route reads as FILE PATHS: ANY value ("off", "0" and "false" included) makes it append the full model requests / usage there. They must be UNSET. */
export const BENCH_MUST_BE_UNSET: readonly string[] = ['AUDIT_MODEL_REQUEST_FILE', 'AUDIT_USAGE_LOG_FILE']

/**
 * Removes secrets from text that is about to be written or shown: the exact values of the two API keys (when long enough to be a key) and anything shaped like an
 * OpenAI key ("sk-…", also its masked form in a provider's error message). A provider that rejects a key echoes part of it back.
 */
export function redactSecrets(text: string, env: Record<string, string | undefined> = process.env): string {
  let out = text
  // case-insensitive: a host name is lower-cased by the URL parser, so a key that ended up in a host label would otherwise survive
  // the keys of the environment passed in AND of process.env (what the app reads): they are the same object in a real run, and may differ in a rehearsal
  for (const e of env === process.env ? [env] : [env, process.env]) {
    for (const name of ['OPENAI_API_KEY', 'SERPER_API_KEY']) { const v = e[name]; if (v && v.length >= 8) out = out.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '***') }
  }
  return out.replace(/\bsk-[A-Za-z0-9_*.-]{4,}/g, 'sk-***')
}

/** The model ids whose price the gate really knows. The price table (providers/openai.ts) matches by PREFIX, so any other id would be priced and capped at the wrong rate. */
const PRICED_MODEL_ID_VARS: readonly string[] = ['LLM_LUNA_MODEL', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL']
const PRICED_MODEL_IDS: readonly string[] = ['gpt-6-luna']

/** Flags that put a paid path outside the spend gate's reach (agent runtime, V4 hosted search, V5, Responses API, Anthropic models): must be OFF. */
export const BENCH_MUST_BE_OFF: readonly string[] = [
  'TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'TAPPY_ANSWER_V4', 'RETRIEVAL_V5', 'LLM_OPENAI_API', 'AGENT_MODEL', 'HAIKU_FALLBACK', 'CONSULT_V3',
  // a run measured with a canned answer, or one that writes model requests to a file, is not the app being benchmarked
  'AUDIT_DRY_RUN', 'AUDIT_MODEL_REQUEST_FILE', 'AUDIT_USAGE_LOG_FILE',
]

export class BenchRefusal extends Error {
  constructor(readonly reasons: string[]) {
    super(`benchmark refused: ${reasons.join('; ')}`)
    this.name = 'BenchRefusal'
  }
}

/** Evidence could not be saved: the run stops and says so. `cause` is the underlying file-system error. */
export class BenchWriteError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    // a file-system error may quote a path or a value that holds a key: the message and the cause are redacted before anything can print or save them
    super(redactSecrets(message))
    this.name = 'BenchWriteError'
    if (cause !== undefined) this.cause = cause instanceof Error ? Object.assign(new Error(redactSecrets(cause.message)), { name: cause.name }) : redactSecrets(String(cause))
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

/** One Serper request as it was SENT (round 3a). A RECORD, not a verdict: `num` is the one in the body that went out, `credits` what the provider said it charged. */
export interface SerperCallRecord {
  /** 1-based order in which the requests were reserved (= sent). */
  n: number
  endpoint: string | null
  num: number | null
  /** The query, redacted and then cut to at most 200 characters. */
  q: string | null
  credits: number | null
  /** The ledger USD (credits × price per credit); null when the provider did not say what it charged. */
  usd: number | null
  /** W = web research (the turn's web ticket); V = a vertical's own request. null = the caller did not say. */
  purpose: 'W' | 'V' | null
  state: SpendRecordState
}
export interface LlmCallRecord { n: number; role: string; tokensIn: number | null; tokensOut: number | null; cachedIn: number | null; reasoning: number | null; usd: number | null; state: SpendRecordState }
interface KindTotals { requests: number; credits: number; usd: number }
export interface RequestTotals {
  /**
   * `requests` = every request the gate let through, INCLUDING the released ones (reserved, then released before any send). It is NOT the number sent:
   * use `sentRequests` for that (an upper bound: see its doc). `credits` = what the provider said it charged (not a request count).
   */
  serper: KindTotals & {
    W: KindTotals; V: KindTotals; unclassified: KindTotals
    /** requests whose USD is unknown: the `usd` above does not include them */
    unknownCalls: number
    /** `requests` minus the released ones. An UPPER BOUND of what was sent: a held or unknown request may or may not have left the process. */
    sentRequests: number
    /** the released ones: reserved and then released before any send (provably not sent). */
    notSent: number
  }
  llm: { requests: number; usd: number; unknownCalls: number; sentRequests: number; notSent: number }
}

const round9 = (x: number): number => Math.round(x * 1e9) / 1e9
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * The per-request detail of a turn from the gate's records. Listed: every request the gate let through (the same set `serperRequests` / `llmRequests` count), i.e.
 * sent ones AND the ones that may have been sent - each entry carries its `state` (settled / unknown / released / held / unreconciled) so a reader can tell them apart.
 * A refused request is not listed (it is counted apart, as `refusals`). It is a SNAPSHOT taken when the turn record is written: a reservation that settles later stays
 * `held` here. `unknownCalls` counts the requests whose USD is not known, so a total that left them out is not mistaken for a complete one. The query is redacted
 * BEFORE it is cut to 200 characters (a key that straddles the 200th character must not survive as a prefix). Pure.
 */
export function describeRequests(records: readonly SpendRecord[], env: Record<string, string | undefined>): { serperCalls: SerperCallRecord[]; llmCalls: LlmCallRecord[]; requestTotals: RequestTotals } {
  const sent = records.filter(r => r.state !== 'refused')
  const serperCalls: SerperCallRecord[] = sent.filter(r => r.label.startsWith('serper:')).map((r, i) => ({
    n: i + 1,
    endpoint: r.detail?.endpoint ?? r.label.slice('serper:'.length),
    num: numOrNull(r.detail?.num),
    q: typeof r.detail?.q === 'string' ? redactSecrets(r.detail.q, env).slice(0, 200) : null,
    credits: numOrNull(r.settleDetail?.credits),
    usd: numOrNull(r.actualUsd),
    purpose: r.detail?.purpose ?? null,
    state: r.state,
  }))
  const llmCalls: LlmCallRecord[] = sent.filter(r => r.label.startsWith('llm:')).map((r, i) => ({
    n: i + 1, role: r.label.slice('llm:'.length),
    tokensIn: numOrNull(r.settleDetail?.tokensIn), tokensOut: numOrNull(r.settleDetail?.tokensOut), cachedIn: numOrNull(r.settleDetail?.cachedIn), reasoning: numOrNull(r.settleDetail?.reasoning),
    usd: numOrNull(r.actualUsd), state: r.state,
  }))
  const sum = (calls: SerperCallRecord[]): KindTotals => ({ requests: calls.length, credits: round9(calls.reduce((a, c) => a + (c.credits ?? 0), 0)), usd: round9(calls.reduce((a, c) => a + (c.usd ?? 0), 0)) })
  const requestTotals: RequestTotals = {
    serper: {
      ...sum(serperCalls), W: sum(serperCalls.filter(c => c.purpose === 'W')), V: sum(serperCalls.filter(c => c.purpose === 'V')), unclassified: sum(serperCalls.filter(c => c.purpose === null)),
      unknownCalls: serperCalls.filter(c => c.usd === null && c.state !== 'released').length,
      sentRequests: serperCalls.filter(c => c.state !== 'released').length, notSent: serperCalls.filter(c => c.state === 'released').length,
    },
    llm: {
      requests: llmCalls.length, usd: round9(llmCalls.reduce((a, c) => a + (c.usd ?? 0), 0)), unknownCalls: llmCalls.filter(c => c.usd === null && c.state !== 'released').length,
      sentRequests: llmCalls.filter(c => c.state !== 'released').length, notSent: llmCalls.filter(c => c.state === 'released').length,
    },
  }
  return { serperCalls, llmCalls, requestTotals }
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
  /** Round 3a: every request that was sent, with its detail (see SerperCallRecord / LlmCallRecord), and the totals by kind and by W/V. */
  serperCalls: SerperCallRecord[]
  llmCalls: LlmCallRecord[]
  requestTotals: RequestTotals
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

/**
 * The report a run hands back. A VALID run carries the full `UatReport` with a real `cost.totalUsd`. An INVALID run carries the same report with
 * `cost.complete = false` and NO `totalUsd` property at all (not null, not undefined): a total that could not be established must not exist as a
 * value that later code could use by accident. Every other field of the cost book (knownUsd, knownSubtotalUsd, unknownTurns, unresolvedReservedUsd,
 * costAccounted) is kept: it is the evidence needed to diagnose the cost. `UatReport` itself is unchanged.
 */
export type ValidBenchReport = Omit<UatReport, 'cost'> & { cost: UatReport['cost'] & { totalUsd: number } }
export type InvalidBenchReport = Omit<UatReport, 'cost'> & { cost: Omit<UatReport['cost'], 'totalUsd'> }

interface BenchResultBase {
  records: TurnRecord[]
  outPath: string | null
  flags: Record<string, string | null>
}
export type BenchResult = (BenchResultBase & { valid: true; report: ValidBenchReport }) | (BenchResultBase & { valid: false; report: InvalidBenchReport })

/** The cost book without its total: a COPY with `totalUsd` removed (the property does not exist) and `complete` forced to false. */
function withoutTotal(report: UatReport): InvalidBenchReport {
  const cost: Partial<UatReport['cost']> = { ...report.cost, complete: false }
  delete cost.totalUsd
  return { ...report, cost: cost as Omit<UatReport['cost'], 'totalUsd'> }
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
  // A variable that is SET but empty or blank is not "unset": `norm` reads it as unset, but the app reads the raw value (LLM_LUNA_MODEL="" makes the model id ""
  // and the gate then refuses every model call). Unset is fine; set-but-blank is refused, by name. Both the environment checked and process.env (what the app reads).
  // "Blank" = nothing but whitespace AND invisible characters (zero-width space / joiners, word joiner, soft hyphen, Mongolian vowel separator, BOM), which `trim()` keeps.
  // Built from a string with the `u` flag (property escapes): whitespace, control, format and separator characters and the default-ignorable ones (zero-width and
  // bidi marks, variation selectors, tag characters, fillers…), none of which `trim()` removes. No invisible character is typed in this file.
  const BLANK = new RegExp('^[\\p{White_Space}\\p{Cc}\\p{Cf}\\p{Zs}\\p{Default_Ignorable_Code_Point}]*$', 'u')
  const blankOf = (e: Record<string, string | undefined>) => BENCH_FLAG_NAMES.filter(k => e[k] !== undefined && BLANK.test(e[k]!))
  const blank = [...new Set([...blankOf(env), ...(env !== process.env ? blankOf(process.env) : [])])]
  if (blank.length) reasons.push(`set but empty or blank (unset is allowed, an empty value is not): ${blank.join(', ')}`)
  // A model id must be EXACTLY an id the gate can price: the price table matches by prefix, so "gpt-6-luna-<anything>" would be capped at the Luna rate whatever it costs.
  const unpricedOf = (e: Record<string, string | undefined>) => PRICED_MODEL_ID_VARS.filter(k => e[k] !== undefined && !BLANK.test(e[k]!) && !PRICED_MODEL_IDS.includes(e[k]!))
  const unpriced = [...new Set([...unpricedOf(env), ...(env !== process.env ? unpricedOf(process.env) : [])])]
  if (unpriced.length) reasons.push(`${unpriced.join(', ')}: not exactly a priced model id (${PRICED_MODEL_IDS.join(', ')}); the price table matches by prefix, so any other id would be priced and capped at the wrong rate`)
  for (const k of BENCH_MUST_BE_UNSET) if (env[k] !== undefined) reasons.push(`${k} must be UNSET (the app treats ANY value, "off" and "0" included, as a file path to write to)`)
  for (const k of BENCH_MUST_BE_OFF) if (!BENCH_MUST_BE_UNSET.includes(k) && !isOffValue(norm(env[k]))) reasons.push(`${k} must be OFF for this benchmark (a paid path outside the spend gate)`)
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
function captureTicketLines(into: unknown[], redact: (s: string) => string): () => void {
  const original = console.log
  console.log = (...args: unknown[]) => {
    const first = args[0]
    // the stored copy is redacted BEFORE it is parsed (a key inside a ticket field must not reach the JSONL); the line the app printed is passed on untouched
    if (typeof first === 'string' && first.startsWith('{"type":"tappyai_web_ticket"')) { try { into.push(JSON.parse(redact(first))) } catch { /* not JSON: not a ticket line */ } }
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
 * C-1 state: a runner was created in this process (see createBenchRunner). It is PROCESS-WIDE, not module-level: it lives on `globalThis` under a
 * Symbol key, so that if this module were loaded twice in one process (another spelling of its URL, a reset module registry) both copies still see
 * the same flag. Never read from the environment.
 */
const PROCESS_LOCK = Symbol.for('tappyai.consultUat.benchRunnerCreated')
const processLock = globalThis as unknown as Record<symbol, unknown>

/**
 * TEST SEAM ONLY. Forgets that a runner was created, so one test file can build several runners. Nothing outside test files calls it (a test scans
 * src/ and scripts/ to prove it), it reads no environment variable, and no entry point exports or wires it. Do not call it from a real run.
 */
export function __resetBenchProcessGuardForTests(): void { processLock[PROCESS_LOCK] = false }

/**
 * Every way into the runner goes through here, so the preflight cannot be skipped: the full `assertBenchAllowed` (caps, confirmation, flags,
 * folder rules) and the writable-folder probe run BEFORE a runner exists. The runner then holds the run cap itself (a run guard) and stops for good
 * after a turn whose cost is unknown, a failed turn or a failed write.
 *
 * C-1 (round 2c): only ONE runner is created per process. WHAT THIS IS: a guard against creating a second runner by MISTAKE inside the same process
 * (a second `createBenchRunner` / `runBench` call would otherwise get a fresh run guard and could spend another full run cap). WHAT IT IS NOT: it does
 * not stop several processes from being started, it is not a ledger shared between processes, and it is NOT a way to cap total spend.
 * Order: preflight → "is there already a runner in this process?" (refused before the file system is touched) → writability probe → build →
 * mark the process as used LAST, so a failed preflight, a failed probe or an error while building leaves the process free for a valid call.
 */
export function createBenchRunner(o: BenchOptions): BenchRunner {
  assertBenchAllowed(o)
  if (processLock[PROCESS_LOCK] === true) {
    throw new BenchRefusal(['a benchmark runner was already created in this process: one runner per process (this guard does not cover other processes). Start a new process for another run'])
  }
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
    const restore = captureTicketLines(ticketLog, s => redactSecrets(s, o.env ?? process.env))
    const t0 = now()
    let raw = ''
    let status: number | undefined
    let thrown: unknown = null
    try {
      const res = await runWithSpendGate(gate, () => o.chat({ messages, chatSessionId: sessionId! }))
      raw = res.raw; status = res.status
    } catch (e) { // a provider error may echo (part of) a key: a redacted COPY is kept, the caught object is never assigned to (a DOMException's message is a getter-only accessor; an error can be shared)
      thrown = e instanceof Error ? Object.assign(new Error(redactSecrets(e.message)), { name: e.name }) : new Error(redactSecrets(String(e)))
    } finally { restore() }
    const ms = now() - t0
    gate.close() // work the app left running after its answer can no longer add cost the books would miss
    // A stream the parser cannot read must not lose the turn: the raw text is kept as the answer and the failure is recorded like any other.
    let parsed: ReturnType<typeof parseDataStream>
    try { parsed = parseDataStream(raw) } catch (e) {
      if (thrown === null) thrown = new Error(redactSecrets(`the answer stream could not be parsed: ${e instanceof Error ? e.message : String(e)}`))
      parsed = { text: raw, tools: [], errors: [`unparseable stream: ${e instanceof Error ? e.message : String(e)}`] } as unknown as ReturnType<typeof parseDataStream>
    }
    const blocked = gate.guard.blockedBy
    const open = gate.guard.openReservedUsd
    const known = gate.guard.knownUsd
    // The cost of the turn is known only when nothing failed, nothing is blocked (exceeded / unknown / unusable) and nothing is still open.
    const costKnown = thrown === null && blocked === null && open === 0 && known !== null
    const record: TurnRecord = {
      id: turn.id, conversation: turn.conversation, turn: turn.turn,
      answer: redactSecrets(parsed.text), ms,
      toolNames: parsed.tools.map(t => t.toolName).filter((n): n is string => !!n),
      ticketLog,
      cost: { state: costKnown ? 'known' : 'unknown', usd: costKnown ? known : null },
      llmRequests: gate.count('llm:'), serperRequests: gate.count('serper:'),
      ...describeRequests(gate.records, o.env ?? process.env),
      refusals: gate.refusals, photoSkips: gate.photoSkips, lateRefusals: gate.lateRefusals, degraded: gate.refusals > 0,
      blocked, openReservedUsd: open,
      ...(status !== undefined ? { httpStatus: status } : {}),
      streamErrors: parsed.errors.map(x => redactSecrets(x)),
      ...(thrown !== null ? { error: thrown instanceof Error ? thrown.message : String(thrown) } : {}),
    }
    // A non-2xx answer or an empty one is not a benchmark answer, whatever it cost: the turn carries an error, so the run is not valid.
    if (!record.error && status !== undefined && (status < 200 || status >= 300)) record.error = `HTTP ${status}: not an answer`
    if (!record.error && parsed.text.trim() === '') record.error = 'empty answer'
    // The run cannot be valid any more: nothing more is sent (the bad answer would also become the history of the later turns).
    if (record.error && thrown === null) halted = 'a turn was not an answer'
    // M1: a degraded turn (a paid call was refused by the gate) or an error frame in the stream also makes the run invalid for good: stop sending.
    // A skipped photo lookup (photoSkips) is NOT degraded and does not stop the run.
    if (!halted && (record.degraded || record.streamErrors.length > 0)) halted = 'the run can no longer be valid'
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
    return { text: record.answer, toolCalls: record.toolNames.map(name => ({ name })), ms, usd: costKnown ? known! : Number.NaN }
  }
  processLock[PROCESS_LOCK] = true // LAST: everything above has succeeded
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
  // M3: the cost book must be fully accounted (no unknown turn, nothing still open), and a valid run has a REAL total (a number).
  const valid = runError === null && wf === null && report !== null && report.cost.complete && report.cost.costAccounted && Number.isFinite(report.cost.totalUsd) && records.length === (o.turns ?? UAT_TURNS).length && records.every(r => r.cost.state === 'known' && !r.degraded && !r.error && r.streamErrors.length === 0)
  // M2: an invalid run hands back (and writes) a cost book WITHOUT the `totalUsd` property; a valid one hands back the report as it is.
  const returned: ValidBenchReport | InvalidBenchReport | null = report === null ? null : valid ? (report as ValidBenchReport) : withoutTotal(report)
  const costState = report !== null && report.cost.costAccounted && records.every(r => r.cost.state === 'known') ? 'known' : 'unknown'
  const flags = Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, norm(o.declaredFlags![k])])) as Record<string, string | null>
  const body = {
    at: new Date(now()).toISOString(), valid, costState, flags, caps: { turnUsd: o.turnCapUsd, runUsd: o.runCapUsd },
    ...(runError !== null ? { error: redactSecrets(runError instanceof Error ? `${runError.name}: ${runError.message}` : String(runError)) } : {}),
    ...(wf ? { writeError: redactSecrets(wf.message, o.env ?? process.env) } : {}),
    openReservations: openReservations(),
    summary: returned ? summarize({ ...returned, cost: { ...returned.cost, totalUsd: (returned.cost as { totalUsd?: number }).totalUsd ?? null } } as UatReport) : null, turns: records, report: returned,
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
  const base = { records, outPath: paths.result, flags }
  return valid ? { ...base, valid: true, report: returned as ValidBenchReport } : { ...base, valid: false, report: returned as InvalidBenchReport }
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

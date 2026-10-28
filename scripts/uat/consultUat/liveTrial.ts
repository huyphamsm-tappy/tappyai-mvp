/**
 * The core of the LIVE TRIAL: ONE development question through the REAL chat route of this process, with the network wrapped so that only the two hosts the
 * spend gate can account for are reachable. Round 2e. This file holds the logic; it uses no test framework and reads NO environment variable by itself - the
 * caller passes `env` (the real file passes process.env, the dry rehearsal passes the same, with a fake network). Two files run it:
 *   · liveTrial.test.ts           the real thing: skipped unless BENCH_LIVE_TRIAL has the exact confirmation text. Real network. Costs real money.
 *   · liveTrial.rehearsal.test.ts the dry rehearsal: always runs, SAME function, a fake network, nothing is ever sent.
 *
 * ORDER (nothing is read, written or sent until every check that needs no I/O has passed):
 *   1. preflight (pure): CI unset · BENCH_EXPECT_CONSULTATIVE_V1 / BENCH_EXPECT_CONSULT_V2 are exactly 0 or 1 and equal the flags the route will see (see
 *      CONSULTATIVE_CONFIRMATIONS: they exist because the vitest setup overwrites those two flags) · caps exact and ≤ 0.10 per turn / ≤ 0.65 per run (≤ 1.75 per run only in
 *      the extension mode, BENCH_TRIAL_MODE exactly dev-multi; anything else is the 0.65 acceptance mode) · BENCH_CONFIRM_SPEND = the run cap ·
 *      the question file is named · the runner's own preflight
 *      (flags explicit and equal to the environment, no flag that must be OFF, no set-but-blank variable, exact model ids, output folder on drive D)
 *   2. the question file is read (UTF-8, one optional byte-order mark dropped) and checked: not empty, not one of the 12 benchmark questions
 *   3. the network wrappers are installed (globalThis.fetch AND node:https / node:http request+get: the app's page reader uses node:https, not fetch), ONE turn runs
 *      through runBench. The moment the turn is over the wrappers are CLOSED (a state they all share and look at at EVERY call, so a reference taken while the turn was
 *      open is closed too): from then on every request, the two allowed hosts included, is blocked before it is sent and recorded (summary.lateBlocked; any entry makes the
 *      trial NOT CLEAN). A short drain follows, only to SEE background work. Then, depending on `afterTrial`:
 *        'restore' (default; the dry rehearsal): the originals are put back.
 *        'deny' (the real run, in a process of its own): the originals are NOT put back. Every later request - to ANY host, the two allowed ones included - fails before it is
 *        sent and is recorded, and the console filter stays on, until the process ends. In this mode the deny wrappers and the console filter are installed FIRST (before the
 *        preflight), so that a refusal leaves the network closed too.
 *
 * WHAT THE WRAPPERS ALLOW: only https, default port, and only these paths of these two hosts: api.openai.com /v1/chat/completions; google.serper.dev /search /maps
 * /shopping. Everything else (another host, another path, plain http, another port, an unparseable URL) is BLOCKED before it is sent, counted and reported;
 * a redirect is never followed. The check judges the LOGICAL URL, not the machine the connection really reaches: the preflight therefore refuses a proxy in the
 * environment, NODE_TLS_REJECT_UNAUTHORIZED=0, preloads and trust-store options on the node command line and in NODE_OPTIONS, and node:https options that redirect the
 * connection or change what is trusted (socketPath, createConnection, an agent other than false, a lookup other than the app's safeLookup, rejectUnauthorized: false, ca,
 * checkServerIdentity); a fetch with a `dispatcher` is blocked. After the answer and a short drain the behaviour is the one chosen by `afterTrial` (above).
 * NOT covered: transports that use neither of these (a raw socket, a library with its own client, undici's own global dispatcher, http2, worker threads, a child process):
 * none was found on the chat path, but that is a reading of the code, not a guarantee; a fetch reference captured BEFORE the wrapper was installed keeps the original.
 *
 * Costs in the ledger are ESTIMATES (tokens × the price table in the code; Serper by credits), NOT the provider's invoice. The caps are enforced on that
 * estimate for the paths the gate covers; they are not a promise about the invoice.
 */
import { readFileSync, realpathSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CAPABILITY_FLAG_LEVELS, CONSULT_CAPABILITY_LEVEL_FLAG, capabilityLevel } from '@/lib/config/consultFlags'
import { benchModeOf, checkBenchCaps, capToScaled, MAX_TURN_CAP_USD, maxRunCapUsd, type BenchMode } from '@/lib/ai/budget/spendGate'
import { safeLookup } from '@/lib/security/safeFetch'
import { validateHop } from '@/lib/security/safePageFetch'
import { matchesFixedUatSet } from './harness'
import { BENCH_FLAG_NAMES, BenchRefusal, assertBenchAllowed, redactSecrets, routeTransport, runBench, type BenchFs } from './liveRunner'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { currentToolCall, setToolTraceObserver } from '@/lib/ai/tools/toolTrace'
import { currentTurn } from './turnScope'
import { UAT_TURNS, type UatTurn } from './questions'
import { REQUEST_CAP_MAX_PER_RUN, REQUEST_CAP_MAX_PER_TURN, REQUEST_CAP_PER_RUN_ENV, REQUEST_CAP_PER_TURN_ENV, beginRequestCapRun, endRequestCapRun, parseCapValue, requestCapOn } from '@/lib/ai/tools/serperRequestCap'

/** The only requests a trial may send: host → exact paths. Everything else is BLOCKED before it is sent (and counted). */
const ALLOWED_PATHS: Readonly<Record<string, readonly string[]>> = {
  'api.openai.com': ['/v1/chat/completions'],
  'google.serper.dev': ['/search', '/maps', '/shopping'],
}
export const TRIAL_ALLOWED_HOSTS: readonly string[] = Object.keys(ALLOWED_PATHS)

/**
 * Option B (owner decision): the EXTENSION mode (BENCH_TRIAL_MODE exactly dev-multi) also lets through the three OpenStreetMap endpoints that search_places itself falls back to
 * when the Serper maps search returns nothing (food.ts searchPlacesOSM, travel.ts): exactly these hosts and exact paths, https, default port. No wildcard, no subdomain, no other
 * path. They are free (no Serper credit, no OpenAI cost), so they are counted, not priced, and stay outside the request cap and the USD gate. Every other mode blocks them.
 */
const OSM_PATHS: Readonly<Record<string, readonly string[]>> = {
  'nominatim.openstreetmap.org': ['/search'],
  'overpass-api.de': ['/api/interpreter'],
  'maps.mail.ru': ['/osm/tools/overpass/api/interpreter'],
}
export const OSM_FALLBACK_HOSTS: readonly string[] = Object.keys(OSM_PATHS)
/**
 * Wave 2 (owner decision a): in the same extension mode, the ONE endpoint the web_search fallback asks when Serper returns no rows (common.ts webSearchImpl): exactly host
 * html.duckduckgo.com and exact path /html/, https, default port. Same rules as the OSM hosts: no wildcard, no subdomain, a redirect is never followed, a COUNT per host (never the
 * query), free (outside the request cap and the USD gate). Every other mode blocks it.
 */
const DDG_PATHS: Readonly<Record<string, readonly string[]>> = { 'html.duckduckgo.com': ['/html/'] }
export const DDG_FALLBACK_HOSTS: readonly string[] = Object.keys(DDG_PATHS)
/** The extension-only endpoints: the three OSM ones and the DuckDuckGo one. */
const EXTENSION_PATHS: Readonly<Record<string, readonly string[]>> = { ...OSM_PATHS, ...DDG_PATHS }
/** Wave 2 · P1.2: what the result file keeps about one tool call. Counts and flags only; the query text only in the extension mode; never a result's content. */
export interface ToolCallRecord {
  turn: string | null
  call: number
  tool: string
  ms: number
  ok: boolean
  /** Rows the result held (null when the shape has no list). */
  rows: number | null
  /** Who really answered: serper | duckduckgo | none (no rows, a note or a provider error) | other (a tool without that notion). */
  provider: 'serper' | 'duckduckgo' | 'none' | 'other'
  empty: boolean
  serperPaths: string[]
  ddg: number
  osm: number
  query?: string
}
const ROW_LISTS = ['results', 'rows', 'items', 'products', 'entities', 'places', 'offers', 'hits', 'data']
/** Pure. How many rows a tool result holds: an array is its length; an object, the length of its first list among the usual names; otherwise null. */
export function rowsOfToolResult(result: unknown): number | null {
  if (Array.isArray(result)) return result.length
  if (result !== null && typeof result === 'object') for (const k of ROW_LISTS) { const v = (result as Record<string, unknown>)[k]; if (Array.isArray(v)) return v.length }
  return null
}
/** Pure. The provider that answered, from the result's own `source` when it has one. */
export function providerOfToolResult(result: unknown, rows: number | null): ToolCallRecord['provider'] {
  const src = result !== null && typeof result === 'object' ? (result as { source?: unknown }).source : undefined
  if (typeof src === 'string') return /serper/i.test(src) ? 'serper' : /duckduckgo/i.test(src) ? 'duckduckgo' : 'other'
  if (rows === 0) return 'none'
  if (result !== null && typeof result === 'object' && ('note' in result || 'provider_status' in result) && !(rows !== null && rows > 0)) return 'none'
  return 'other'
}

/** True only for the extension mode, spelled exactly. (One rule for every extension-only host.) */
export const osmFallbackAllowed = (env: Record<string, string | undefined>): boolean => env.BENCH_TRIAL_MODE === 'dev-multi'
export const extensionHostsAllowed = osmFallbackAllowed

/**
 * Wave 4 (C-PRE-0), bench only: BENCH_ALLOW_PUBLIC_PAGE_FETCH=1 (exactly "1", default OFF, and only in the extension mode like the other extension hosts) lets the page reader's own
 * requests - the ones made INSIDE a `read_page` tool call (the page and its robots.txt, every redirect hop being a request of its own) - reach a public HTTP(S) page. Everything else stays
 * blocked: only GET; no credentials, no explicit port, no localhost / private / link-local / metadata address and no internal name (the same string check `validateHop` gives the product), the
 * connection pinned by the product's own `safeLookup` (already required of every request, see `nodeRequestUrl`), at most PUBLIC_PAGE_MAX_PER_TURN requests per turn. The product's own limits (800 KB
 * per page, 8 s, robots.txt asked on every hop, fail-closed when it cannot be read) are NOT touched: they are what the reader does. The requests are free (no Serper credit, no OpenAI cost), so they
 * are counted in their own ledger (`pageRequests`) and recorded in `requestLog` (host + path, never the query), outside the Serper request cap and the USD gate. Production never imports this file.
 */
export const PUBLIC_PAGE_FETCH_FLAG = 'BENCH_ALLOW_PUBLIC_PAGE_FETCH'
export const PUBLIC_PAGE_MAX_PER_TURN = 40
export const publicPageFetchAllowed = (env: Record<string, string | undefined>): boolean => env[PUBLIC_PAGE_FETCH_FLAG] === '1' && osmFallbackAllowed(env)
/** Pure. The state the two bench-side switches REALLY have (the words Gate 1 prints; liveTrialLauncher.mjs benchSwitchLine says the same, a test compares). */
export function benchSwitchState(env: Record<string, string | undefined>): { trace: 'BẬT' | 'TẮT'; page: string } {
  const t = (env.LEGACY_STREAM_TRACE ?? '').trim()
  const v = env[PUBLIC_PAGE_FETCH_FLAG]
  return {
    trace: t === '1' || t === 'true' ? 'BẬT' : 'TẮT',
    page: v === undefined ? 'TẮT' : v !== '1' ? 'TẮT (giá trị không phải đúng "1")' : env.BENCH_TRIAL_MODE !== 'dev-multi' ? 'KHÔNG CÓ HIỆU LỰC — chỉ chế độ extension (BENCH_TRIAL_MODE=dev-multi)' : 'BẬT',
  }
}
/** Pure. `ok` only for a GET to a public http(s) page that passes the product's own string-level host check. */
export function isPublicPageRequest(url: string, method = 'GET'): { ok: true; host: string } | { ok: false; label: string } {
  if (String(method).toUpperCase() !== 'GET') return { ok: false, label: `(method ${String(method).slice(0, 12)})` }
  const v = validateHop(url, { allowHttp: true })
  if ('reason' in v) { let h = '(unparseable)'; try { h = new URL(url).hostname } catch { /* keep */ } return { ok: false, label: `${h} (${v.reason})` } }
  return { ok: true, host: v.url.hostname }
}

/** Pure. `ok` only for https, no explicit port, no credentials, an allowed host and an allowed exact path. `label` names what was blocked (a host, host+path, or "(unparseable)"). `allowExtension` (default false) adds the extension-only endpoints above (OSM and DuckDuckGo). */
export function isAllowedRequest(url: string, allowExtension = false): { ok: true; host: string } | { ok: false; label: string } {
  let u: URL
  try { u = new URL(url) } catch { return { ok: false, label: '(unparseable)' } }
  const paths = ALLOWED_PATHS[u.hostname] ?? (allowExtension && Object.hasOwn(EXTENSION_PATHS, u.hostname) ? EXTENSION_PATHS[u.hostname] : undefined)
  if (!paths) return { ok: false, label: u.hostname }
  if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return { ok: false, label: `${u.protocol}//${u.username || u.password ? '(credentials)@' : ''}${u.hostname}${u.port ? `:${u.port}` : ''}` }
  if (!paths.includes(u.pathname)) return { ok: false, label: `${u.hostname}${u.pathname}` }
  return { ok: true, host: u.hostname }
}

/** Wave 2B · the question file as the run saw it. `notesWithheld` = ids of the turns that have a judge note; the note text is NOT kept here (it never leaves the file). */
export interface QuestionFileInfo { sha256: string; formatVersion: 1 | 2; notesWithheld: string[] }

export interface LiveTrialInput {
  /** The environment, passed explicitly (the app itself reads process.env: the runner refuses if the two differ). */
  env: Record<string, string | undefined>
  /** The chat route's POST handler. */
  post: (req: never) => Promise<Response>
  /** The network the wrapper forwards allowed requests to. Default: the global fetch at the time of the call (the real network). */
  fetchImpl?: typeof fetch
  fs?: BenchFs
  /** Reads the question file (default: UTF-8 from disk). Injectable so a rehearsal can prove when it is, and is not, read. */
  readTextFile?: (path: string) => string
  repoRoot?: string
  now?: () => number
  /** How long the wrappers stay installed after the answer, for background work that outlives it (default 100 ms). */
  drainMs?: number
  /**
   * Round 3c: the development turns, already validated by the caller (devQuestions.ts). When given, they replace the one question of the file;
   * the question file is then not read for its text. One process, one run cap; each turn is closed on its own (turnScope.ts).
   */
  turns?: readonly UatTurn[]
  /** Wave 2B: what the caller knows about the question file the turns came from (SHA-256, format version, ids of the turns whose judge note was withheld). Reported, never sent. */
  questionInfo?: QuestionFileInfo
  /** The node command-line options of this process (default process.execArgv). Injectable so a rehearsal can prove what is refused. */
  execArgv?: readonly string[]
  /**
   * What happens to the network when the trial is over. 'restore' (default; the dry rehearsal needs it): the original fetch / node:http(s) / console are put back.
   * 'deny' (the real run, in its own process): they are NOT put back - every later request, to ANY host, fails before it is sent and is recorded, and the console
   * filter stays on, until the process ends (outcome.controls.release() undoes it; only tests call it).
   */
  afterTrial?: 'restore' | 'deny'
}

export interface TrialSummary {
  /** The technical and cost conditions of THIS turn hold. */
  turnOk: boolean
  /** runBench's `valid`, untouched (false for one turn: it needs the fixed 13-turn set). */
  runValid: boolean
  /** Only the exact 13 UAT turns in order AND a valid run. Always false for the trial. */
  benchmarkEligible: boolean
  /** turnOk AND no host was blocked AND no redirect AND no warning. A trial that is not clean is NOT a complete result. */
  trialClean: boolean
  /** Hosts a request was attempted to while the network was closed - after the turn was over (through any wrapper reference), or in 'deny' mode before the wrappers were installed - blocked before it was sent: late background work. Any entry makes the trial NOT CLEAN. */
  lateBlocked: string[]
  /** Round 3c: why the run stopped before its last turn (null = it ran every turn it was given). */
  stopped: string | null
  /** Round 3c: turns that were run / turns given. One turn: 1 / 1. */
  turnsRun: number
  turnsTotal: number
  /** Round 3c: one row per turn that ran. `cards` counts the card entries in the answer (a rough count of `"key":"` items). The full answer is in the result file, not here. */
  turnRows: Array<{ id: string; tools: string[]; serper: number; serperW: number; serperV: number; llm: number; usd: number | null; chars: number; cards: number }>
  costState: 'known' | 'unknown' | 'none'
  /** ESTIMATE from the ledger (tokens × price table, Serper credits); NOT an invoice. */
  usd: number | null
  ms: number | null
  tools: string[]
  /** Requests counted by the spend gate. */
  llmRequests: number
  serperRequests: number
  /** Requests the wrappers actually SENT, by host. */
  hostRequests: Record<string, number>
  /** Requests sent to each of the three OSM fallback hosts (always the three keys; all 0 outside the extension mode, where they are blocked). A count only: free hosts, outside the request cap and the USD gate. */
  osmRequests: Record<string, number>
  /** Requests sent to the DuckDuckGo fallback host of web_search (always the one key; 0 outside the extension mode, where it is blocked). A count only: free host, outside the request cap and the USD gate. */
  ddgRequests: Record<string, number>
  /** Wave 2 · P1.2: the trace in numbers. The turn-tagged logs themselves (requestLog, blockedLog, toolCalls) are in the result file. */
  trace: { toolCalls: number; emptyToolCalls: number; requestsWithTurn: number; requestsLogged: number; blocked: Array<{ turn: string | null; label: string }> }
  /** Quota option (d): whether the free-question counter was reset before each turn (ON only for mode dev-multi + flag 1), why, and how many resets were really made. */
  quotaReset: { on: boolean; reason: string; resets: number }
  /** Wave 2B: the question file (SHA-256, format version, turns whose judge note was withheld from the model); null when the caller did not report it. */
  question: QuestionFileInfo | null
  refusals: number
  photoSkips: number
  answerChars: number
  /** Hosts (or host+path, scheme/port forms, "(unparseable)") that were blocked before being sent. */
  hostsBlocked: string[]
  redirects: Array<{ host: string; status: number }>
  /** Allowed hosts that answered 401 or 403 (host and status only). Each one is also a warning, so the trial is NOT CLEAN. */
  providerRejections: Array<{ host: string; status: number }>
  warnings: string[]
  /** Why the turn is not OK (empty when it is). */
  problems: string[]
  /** The consultative flags as the run SAW them (null = unset). Under vitest the setup pins CONSULTATIVE_V1 and CONSULT_V2 to "0" when they are unset. */
  flagsInEffect: Record<string, string | null>
  resultPath: string | null
  /** The Serper REQUEST cap of this run (serperRequestCap.ts): the two limits, the requests it let through (this process) and the ones it refused. A count, not a price. */
  requestCap: { perTurnLimit: number | null; runLimit: number | null; sent: number; refused: number }
  /** The budget MODE in force (acceptance = $0.65 run maximum, extension = $1.75, chosen only by BENCH_TRIAL_MODE=dev-multi) and the USD caps the run was held to (ESTIMATES, not an invoice). */
  budget: { mode: BenchMode; turnCapUsd: number; runCapUsd: number }
}

export interface TrialControls {
  /** Requests attempted while the network was closed (they were all blocked before being sent): after the turn was over, through any wrapper reference, in either mode; in 'deny' mode also before the wrappers were installed. */
  lateAttempts: () => string[]
  /** Gives the originals back (fetch, node:http(s), console). A no-op in 'restore' mode, where it was done already. The real run never calls it. */
  release: () => void
}
export type TrialOutcome = { kind: 'refused'; reasons: string[]; controls: TrialControls } | { kind: 'ran'; summary: TrialSummary; controls: TrialControls }

/** Trim, collapse whitespace, lower case, drop Vietnamese marks (đ → d): two questions that differ only in those are the same question. */
export function normalizeQuestion(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toLowerCase()
}
/** The key two questions are compared by: normalized, and with everything that is not a letter or a digit removed (punctuation, zero-width characters, spacing). */
const questionKey = (s: string): string => normalizeQuestion(s).replace(/[^\p{L}\p{N}]/gu, '')

/** True only for the exact fixed benchmark turns, in order (the harness's own frozen definition), with a valid run. */
export function isBenchmarkEligible(turns: readonly UatTurn[], runValid: boolean): boolean {
  return runValid === true && matchesFixedUatSet(turns)
}

const TWELVE = new Set(UAT_TURNS.map(t => questionKey(t.text)))
// (read at summary time: the wave-2 flag list is declared further down) the value of each is printed as the run saw it, "unset" when it was not set
const flagsInEffectNames = (): string[] => ['CONSULTATIVE_V1', 'CONSULT_V2', 'CONSULT_LUNA', 'TURN_WEB_TICKET', 'SEARCH_FALLBACK_GATE', 'BENCH_SPEND_RUN_CAP_USD', QUOTA_RESET_FLAG, ...WAVE2_FLAGS, CONSULT_CAPABILITY_LEVEL_FLAG]

/**
 * WHY THESE VARIABLES EXIST (round 2f): the real trial runs under the project's vitest setup (src/test/consultativeFlag.setup.ts), which OVERWRITES
 * CONSULTATIVE_V1 and CONSULT_V2 with "0" when they are not set, before this code runs. "The Owner forgot to set the flag" and "the Owner set it to 0" therefore look
 * the same here, so checking the flag for undefined proves nothing. The Owner states the two values independently (copied from Vercel production) and the trial is
 * refused unless each statement is exactly "0" or "1" AND equals the value the route will actually see. The messages name variables, never values.
 * They are not behaviour flags and are not part of BENCH_FLAG_NAMES.
 */
export const CONSULTATIVE_CONFIRMATIONS: ReadonlyArray<readonly [confirmVar: string, flagVar: string]> = [
  ['BENCH_EXPECT_CONSULTATIVE_V1', 'CONSULTATIVE_V1'],
  ['BENCH_EXPECT_CONSULT_V2', 'CONSULT_V2'],
]
/** Pure. One reason per confirmation that is missing, not exactly "0"/"1", or different from the flag value in `env` (compared exactly, no trimming). */
export function consultativeConfirmationReasons(env: Record<string, string | undefined>): string[] {
  const reasons: string[] = []
  for (const [confirmVar, flagVar] of CONSULTATIVE_CONFIRMATIONS) {
    const said = env[confirmVar]
    if (said === undefined) reasons.push(`${confirmVar} is not set (state the production value of ${flagVar}, exactly 0 or 1)`)
    else if (said !== '0' && said !== '1') reasons.push(`${confirmVar} must be exactly 0 or 1`)
    else if (env[flagVar] !== said) reasons.push(`${confirmVar} differs from ${flagVar} as the route will see it (set ${flagVar} explicitly; the test setup writes 0 into an unset flag)`)
  }
  return reasons
}

/**
 * Pure. The Serper REQUEST cap must be armed for a paid run (owner decision: no paid measurement on a counter that only observes): the flag ON, and BOTH values valid
 * (strict integers; there is no default in code, so a missing value is a refusal, not a guess). The messages name variables, never values. This is a check of the
 * configuration; the cap itself is enforced in serperPost (serperRequestCap.ts) and covered by MOCK tests (mock model, stub network: serperRequestCap*.test.ts).
 * It is checked again right before every request (the flag could change after the preflight): a changed value sends nothing.
 */
export function requestCapReasons(env: Record<string, string | undefined>): string[] {
  const reasons: string[] = []
  if (!requestCapOn(env)) reasons.push('CONSULT_REQUEST_CAP is not ON (set it to 1: a paid run needs the Serper request cap armed in code)')
  if (parseCapValue(env[REQUEST_CAP_PER_TURN_ENV], REQUEST_CAP_MAX_PER_TURN) === null) reasons.push(`${REQUEST_CAP_PER_TURN_ENV} is missing or not an integer in 1..${REQUEST_CAP_MAX_PER_TURN} (the owner chooses the value; there is no default)`)
  if (parseCapValue(env[REQUEST_CAP_PER_RUN_ENV], REQUEST_CAP_MAX_PER_RUN) === null) reasons.push(`${REQUEST_CAP_PER_RUN_ENV} is missing or not an integer in 1..${REQUEST_CAP_MAX_PER_RUN} (the owner chooses the value; there is no default)`)
  return reasons
}

/**
 * The allow-list judges the LOGICAL URL (api.openai.com), not the machine the connection really goes to. With Node's proxy support switched on from the
 * environment (NODE_USE_ENV_PROXY=1 or --use-env-proxy in NODE_OPTIONS, with HTTP(S)_PROXY / ALL_PROXY), fetch and node:https connect to the PROXY while the wrapper
 * still sees an allowed host, and the request carries the Authorization header. NODE_TLS_REJECT_UNAUTHORIZED=0 switches certificate checking off. Both are refused,
 * by name (never the value). Pure.
 */
export function connectionRedirectReasons(env: Record<string, string | undefined>, execArgv: readonly string[] = process.execArgv, repoRoot: string = process.cwd()): string[] {
  const reasons: string[] = []
  // The node COMMAND LINE (process.execArgv) is read, not only NODE_OPTIONS: `node --use-env-proxy …` routes fetch and node:https through a proxy as well, a preloaded module
  // (--require / -r / --import / --loader) can replace fetch or the socket layer, and the trust-store, inspector, env-file and eval options change what runs or what is trusted.
  // The ONE thing accepted is `--require <file>` (or `-r`) where <file> is, by REAL PATH, this repository's own node_modules/vitest/suppress-warnings.cjs (every vitest worker
  // has it): a file merely NAMED like that, in another directory, is refused. (A stat of that one path is the only file-system access the preflight makes.)
  let vitestPreload: string | null = null
  try { vitestPreload = realpathSync(join(repoRoot, 'node_modules', 'vitest', 'suppress-warnings.cjs')) } catch { vitestPreload = null }
  const samePreload = (value: string): boolean => {
    if (vitestPreload === null) return false
    try { const real = realpathSync(value); return process.platform === 'win32' ? real.toLowerCase() === vitestPreload.toLowerCase() : real === vitestPreload } catch { return false }
  }
  const BAD_LONG = /^--(use-env-proxy|inspect(-brk|-wait|-port)?|use-system-ca|use-openssl-ca|openssl-config|openssl-shared-config|env-file(-if-exists)?|eval|print|import|loader|experimental-loader)(=|$)/
  for (let i = 0; i < execArgv.length; i++) {
    const a = execArgv[i]
    const name = a.split('=')[0]
    if (/^(--require|-r)(=|$)/.test(a)) {
      const value = a.includes('=') ? a.slice(a.indexOf('=') + 1) : execArgv[i + 1] ?? ''
      if (!samePreload(value)) reasons.push(`the node command line (process.execArgv) preloads a module (${name}) that is not this repository's vitest preload: it could replace the network layer; start node without it`)
    } else if (BAD_LONG.test(a) || /^-(e|p|pe)$/.test(a)) {
      reasons.push(`the node command line (process.execArgv) contains ${name}: ${name === '--use-env-proxy' ? 'Node would send the requests through a proxy' : 'it can change what runs or what is trusted'}; start node without it`)
    }
  }
  for (const k of Object.keys(env)) if (/^(https?_proxy|all_proxy)$/i.test(k) && (env[k] ?? '') !== '') reasons.push(`${k} is set: a proxy would receive the requests (and their Authorization header) while the host check still sees the allowed host; unset it for the trial`)
  const useProxy = env.NODE_USE_ENV_PROXY
  if (useProxy !== undefined && useProxy !== '' && useProxy !== '0') reasons.push('NODE_USE_ENV_PROXY is set: Node would send the requests through a proxy; unset it for the trial')
  // NODE_OPTIONS is read by the core on its own too (the launcher drops it, but the core must not rely on that): no preload, proxy, trust-store, inspector, env-file or eval option.
  if (/(^|\s)(--(require|import|loader|experimental-loader|use-env-proxy|inspect(-brk|-wait|-port)?|use-system-ca|use-openssl-ca|openssl-config|openssl-shared-config|env-file(-if-exists)?|eval|print)|-r|-e|-p)(=|\s|$)/.test(env.NODE_OPTIONS ?? '')) {
    reasons.push('NODE_OPTIONS contains a preload, proxy, trust-store, inspector, env-file or eval option: it could change where the requests go or what is trusted; remove it for the trial')
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') reasons.push('NODE_TLS_REJECT_UNAUTHORIZED is 0: certificate checking is off; unset it for the trial')
  return reasons
}

/**
 * Quota option (d) (owner decision). The route meters the simulated registered FREE account at FREE_DAILY_LIMIT (10) questions a day, in a counter held in this process: the 11th
 * turn of any run is refused with HTTP 429 free_limit_reached (this is what stopped the baseline at E11). The benchmark measures the advice, not that commercial limit, so
 * the extension mode can reset the counter before each turn - and only when BOTH the mode is exactly dev-multi AND this flag is exactly 1. Default OFF = the real limit applies.
 * The reset is the test hook the rehearsals already use; the user, the conversation, the history, the L1 cache, the cap and the cost gate are not touched.
 */
export const QUOTA_RESET_FLAG = 'BENCH_RESET_FREE_QUOTA_PER_TURN'
const shown = (v: string | undefined): string => (v === undefined ? 'unset' : /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : JSON.stringify(v.slice(0, 24)))
/** Pure. ON only for mode === 'dev-multi' and flag === '1'. `reason` names the two values that decided it (what the summary and Gate 1 print). */
export function quotaResetState(env: Record<string, string | undefined>): { on: boolean; reason: string } {
  const mode = env.BENCH_TRIAL_MODE, flag = env[QUOTA_RESET_FLAG]
  return { on: mode === 'dev-multi' && flag === '1', reason: `mode=${shown(mode)}, flag=${shown(flag)}` }
}
/** Pure. The flag must be unset, 0 or 1; any other value (including blank) is refused by name, never guessed at. */
export function quotaResetFlagReasons(env: Record<string, string | undefined>): string[] {
  const v = env[QUOTA_RESET_FLAG]
  return v === undefined || v === '0' || v === '1' ? [] : [`${QUOTA_RESET_FLAG} must be exactly 1, 0 or unset (any other value is refused, not guessed at)`]
}

/**
 * Wave 2: the product-behaviour flags of this round. Each is read by the product as ON only when it is exactly "1" (src/lib/config/consultFlags.ts) and every one defaults to OFF
 * (unset = the old behaviour, byte for byte). A paid run states them explicitly: the preflight accepts unset, 0 or 1 and refuses anything else by name; the summary, the
 * result file, the preflight report and Gate 1 print the state the configuration really has (never an assumed ON).
 */
export const WAVE2_FLAGS: readonly string[] = ['CONSULT_FINAL_SYNTHESIS', 'CONSULT_ANSWER_ATTRIBUTION', 'CONSULT_GENERAL_ASSISTANT', 'CONSULT_TRACE_DIAGNOSTICS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_THREAD_AWARE_ASK', 'CONSULT_ABORT_ABANDONED_FIRST_PART', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_STRUCTURED_SYNTHESIS', 'CONSULT_CHAT_DOMAIN_AGREEMENT', 'CONSULT_KNOWLEDGE_PATH', 'CONSULT_PICK_TURN_TOOLS', 'CONSULT_PICK_PAGE_READ', 'CONSULT_READ_PAGE_LATE']
/** Pure. One reason per wave-2 flag whose value is not unset, 0 or 1. */
export function wave2FlagReasons(env: Record<string, string | undefined>): string[] {
  return WAVE2_FLAGS.filter(k => { const v = env[k]; return !(v === undefined || v === '0' || v === '1') }).map(k => `${k} must be exactly 1, 0 or unset (any other value is refused, not guessed at)`)
}
/** Wave 2J (F6): a flag that the product reads as OFF unless another flag is exactly "1" too (src/lib/config/consultFlags.ts: consultKnowledgeTurnToolsOn needs the search-now gate). */
export const WAVE2_FLAG_NEEDS: Readonly<Record<string, string>> = { CONSULT_KNOWLEDGE_TURN_TOOLS: 'CONSULT_SEARCH_NOW_INTENT_GATE', CONSULT_TOOL_BY_NEED: 'CONSULT_SEARCH_NOW_INTENT_GATE' }
/** Wave 3 (W6): CONSULT_CAPABILITY_LEVEL is unset or a single character 0-4; anything else is refused by name (the product would read it as level 0 and the run would not measure what was meant). */
export function capabilityLevelReasons(env: Record<string, string | undefined>): string[] {
  const v = env[CONSULT_CAPABILITY_LEVEL_FLAG]
  return v === undefined || /^[0-4]$/.test(v) ? [] : [`${CONSULT_CAPABILITY_LEVEL_FLAG} must be a single character 0-4 or unset (any other value is refused, not guessed at)`]
}
/**
 * Pure. The state each wave-2 flag really has: ON for the value "1", or - for a Wave 3 flag that is UNSET - when the capability level switches it on; a flag that is set to anything else is OFF even at a level.
 * INERT = on but without the flag it needs (the product reads it as OFF).
 */
export function wave2FlagState(env: Record<string, string | undefined>): Record<string, 'ON' | 'OFF' | 'INERT'> {
  const level = capabilityLevel(env)
  const on = (k: string): boolean => env[k] !== undefined ? env[k] === '1' : level >= (CAPABILITY_FLAG_LEVELS[k] ?? 5)
  return Object.fromEntries(WAVE2_FLAGS.map(k => [k, !on(k) ? 'OFF' : (WAVE2_FLAG_NEEDS[k] !== undefined && !(env[WAVE2_FLAG_NEEDS[k]!] === '1' || (env[WAVE2_FLAG_NEEDS[k]!] === undefined && level >= (CAPABILITY_FLAG_LEVELS[WAVE2_FLAG_NEEDS[k]!] ?? 5)))) ? 'INERT' : 'ON' as const]))
}

/** The message for an OpenAI key that is there but is not shaped like one. Names the variable and the rule; holds no character of the value. */
export const OPENAI_KEY_SHAPE_REASON = 'OPENAI_API_KEY không đúng dạng key OpenAI (phải bắt đầu bằng sk-): kiểm tra có dán nhầm key khác hoặc đảo thứ tự hai ô không'
/**
 * Pure. A value that is present must start with `sk-` (a swapped or wrong pasted key is refused BEFORE the first paid call, not after a 401). An unset or blank value is not
 * judged here: the presence check reports it. Only OpenAI is checked: the Serper key format is not verified. Never echoes any character of the value.
 */
export function openaiKeyShapeReasons(env: Record<string, string | undefined>): string[] {
  const v = env.OPENAI_API_KEY
  if (v === undefined || v.trim() === '') return []
  return v.startsWith('sk-') ? [] : [OPENAI_KEY_SHAPE_REASON]
}

/** Pure: no file, no network. Every reason at once. Exported for the preflight report (preflightReport.ts), which runs the same checks without the trial. */
export function preflight(env: Record<string, string | undefined>, repoRoot?: string, execArgv?: readonly string[]): { reasons: string[]; caps: { turnUsd: number; runUsd: number } | null } {
  const reasons: string[] = [...consultativeConfirmationReasons(env), ...connectionRedirectReasons(env, execArgv, repoRoot), ...requestCapReasons(env), ...openaiKeyShapeReasons(env), ...quotaResetFlagReasons(env), ...wave2FlagReasons(env)]
  if ((env.CI ?? '') !== '') reasons.push('CI is set: the live trial never runs in CI')
  const caps = checkBenchCaps(env.BENCH_SPEND_TURN_CAP_USD, env.BENCH_SPEND_RUN_CAP_USD, benchModeOf(env))
  if (!caps.ok) reasons.push(...caps.reasons)
  const confirm = capToScaled(env.BENCH_CONFIRM_SPEND)
  const run = capToScaled(env.BENCH_SPEND_RUN_CAP_USD)
  if (confirm === null || run === null || confirm !== run) reasons.push('BENCH_CONFIRM_SPEND is missing or is not exactly the run cap')
  if ((env.BENCH_TRIAL_QUESTION_FILE ?? '').trim() === '') reasons.push('BENCH_TRIAL_QUESTION_FILE is not set (the question is read from that file only)')
  try {
    assertBenchAllowed({
      chat: async () => ({ raw: '' }), turnCapUsd: caps.ok ? caps.turnUsd : Number.NaN, runCapUsd: caps.ok ? caps.runUsd : Number.NaN,
      confirmSpend: caps.ok ? { capUsd: caps.runUsd } : null,
      declaredFlags: Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, (env[k] ?? '').trim() === '' ? null : env[k]!.trim()])),
      env, outDir: env.BENCH_TRIAL_OUT_DIR ?? '', repoRoot,
    })
  } catch (e) {
    if (!(e instanceof BenchRefusal)) throw e
    reasons.push(...e.reasons)
  }
  return { reasons: [...new Set(reasons)], caps: caps.ok ? { turnUsd: caps.turnUsd, runUsd: caps.runUsd } : null }
}

/** The URL a node:http(s) request/get call is about, from its arguments ((url[, options][, cb]) or (options[, cb])). */
function nodeRequestUrl(proto: 'http' | 'https', args: unknown[]): string {
  const [a, b] = args
  // Options that send the CONNECTION somewhere other than the name that was checked: a local pipe, a hand-made connection, a custom agent (`agent: false` is what the
  // app's own fetchers pass, and `lookup` only pins the same name: both stay allowed). Such a call cannot be judged by its URL, so it is refused.
  // `lookup` decides which ADDRESS a name connects to: only the app's own safeLookup is accepted - it resolves the given host name itself and refuses any non-public
  // address (src/lib/security/safeFetch.ts createSafeLookup) - never a function of unknown behaviour (a lookup could map an allowed name to any address).
  // The same goes for what is TRUSTED: rejectUnauthorized: false, a custom ca / secureContext / checkServerIdentity, a replaced default agent.
  const redirectsConnection = (o: Record<string, unknown>): boolean => 'socketPath' in o || 'createConnection' in o || (o.agent !== undefined && o.agent !== false) || (o.lookup !== undefined && o.lookup !== safeLookup)
    || o.rejectUnauthorized === false || o.ca !== undefined || o.secureContext !== undefined || o.checkServerIdentity !== undefined || '_defaultAgent' in o
  if (typeof a === 'string' || a instanceof URL) {
    // Node lets the options of (url, options) override the URL's host, port, protocol and path - an explicit `undefined` included (Node then falls back to localhost).
    const over = b && typeof b === 'object' ? b as Record<string, unknown> : {}
    if (['host', 'hostname', 'port', 'protocol', 'path'].some(k => k in over) || redirectsConnection(over)) return '(unparseable)'
    return typeof a === 'string' ? a : a.href
  }
  const o = { ...(a && typeof a === 'object' ? a as Record<string, unknown> : {}), ...(b && typeof b === 'object' ? b as Record<string, unknown> : {}) }
  if (redirectsConnection(o)) return '(unparseable)'
  const hostRaw = typeof o.hostname === 'string' ? o.hostname : typeof o.host === 'string' ? o.host : ''
  const host = hostRaw.includes(':') && !hostRaw.startsWith('[') ? hostRaw.split(':')[0] : hostRaw
  const port = o.port !== undefined && o.port !== null && String(o.port) !== '' ? `:${String(o.port)}` : ''
  const protocol = typeof o.protocol === 'string' ? o.protocol : `${proto}:`
  const path = typeof o.path === 'string' ? o.path : '/'
  return host ? `${protocol}//${host}${port}${path.startsWith('/') ? '' : '/'}${path}` : '(unparseable)'
}

/** The HTTP method a node:http(s) request/get call asks for: the `method` of its options object, otherwise GET (`get` variants and the node default). Wave 4 (C-PRE-0): only GET may reach a public page. */
function nodeRequestMethod(args: unknown[]): string {
  const [a, b] = args
  const o = { ...(a && typeof a === 'object' && !(a instanceof URL) ? a as Record<string, unknown> : {}), ...(b && typeof b === 'object' ? b as Record<string, unknown> : {}) }
  return typeof o.method === 'string' ? o.method : 'GET'
}

/** Wave 4 fix N4(b): a node:http(s) call whose connection is pinned by the product's own `safeLookup` (the page reader's realHop always passes it). `nodeRequestUrl` only refuses a lookup that is
 *  present and different; a public-page request is admitted only when it is PRESENT and is safeLookup, so a page request without it cannot reach an address the name was not checked for. */
function nodeRequestPinned(args: unknown[]): boolean {
  const [a, b] = args
  const o = { ...(a && typeof a === 'object' && !(a instanceof URL) ? a as Record<string, unknown> : {}), ...(b && typeof b === 'object' ? b as Record<string, unknown> : {}) }
  return o.lookup === safeLookup
}

/** Only a string, a URL or a Request: any other object (one that merely carries a `url` property) could be sent somewhere other than what was checked. */
const urlOf = (input: unknown): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : '(unparseable)')

export async function runLiveTrial(input: LiveTrialInput): Promise<TrialOutcome> {
  const { env } = input
  const mode = input.afterTrial ?? 'restore'
  // The originals, taken BEFORE anything is replaced.
  const originalFetch = globalThis.fetch
  const originalNode = { httpsRequest: https.request, httpsGet: https.get, httpRequest: http.request, httpGet: http.get }
  const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug, dir: console.dir, table: console.table, group: console.group, groupCollapsed: console.groupCollapsed, trace: console.trace }
  const consoleNames = Object.keys(originalConsole) as Array<keyof typeof originalConsole>
  const setNode = (r: typeof https.request, g: typeof https.get, hr: typeof http.request, hg: typeof http.get): void => {
    https.request = r; https.get = g; http.request = hr; http.get = hg
    syncBuiltinESMExports() // the ESM namespace bindings of node:https / node:http follow the patch (a named import `import { request } from 'node:https'` sees it too)
  }
  const restoreNetwork = (): void => { globalThis.fetch = originalFetch; setNode(originalNode.httpsRequest, originalNode.httpsGet, originalNode.httpRequest, originalNode.httpGet) }

  // The console is filtered BEFORE it prints: the route logs provider errors (`[chat] stream error: …`) that may quote a key, and the printed text ends up in a
  // terminal transcript. Strings, Errors (cause, AggregateError members and own properties included, through util.inspect) and objects are redacted; anything unchanged is
  // passed on as it was. (Direct writes to process.stdout/stderr are not console calls: the launcher, which owns the child's output, filters those.)
  // Wave 2C (CONSULT_TRACE_DIAGNOSTICS=1 only): a `tappyai_*` JSON log line printed while a turn runs gets that turn's id inserted right after its "type" field, so the OLD log lines (which carry
  // no turn id) can be joined to the turn too. Text insertion only (no parse); a line that already has a traceId, or a turn id that is not a plain identifier, is left as it is.
  const traceTagOn = env.CONSULT_TRACE_DIAGNOSTICS === '1'
  const tagWithTurn = (s: string): string => {
    if (!traceTagOn || !s.startsWith('{"type":"tappyai_') || s.includes('"traceId":')) return s
    const id = currentTurn()?.id
    return id && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id) ? s.replace(/^(\{"type":"tappyai_[a-z0-9_]+")/, `$1,"traceId":"${id}"`) : s
  }
  const redactArg = (a: unknown): unknown => {
    if (typeof a === 'string') return tagWithTurn(redactSecrets(a, env))
    if (a !== null && typeof a === 'object') {
      let text: string
      try { text = inspect(a, { depth: 6, breakLength: Infinity }) } catch { return a }
      const redacted = redactSecrets(text, env)
      return redacted === text ? a : redacted
    }
    return a
  }
  let consoleFiltered = false
  const filterConsole = (): void => {
    if (consoleFiltered) return
    consoleFiltered = true
    for (const n of consoleNames) (console as unknown as Record<string, unknown>)[n] = (...args: unknown[]) => (originalConsole[n] as (...a: unknown[]) => void).apply(console, args.map(redactArg))
  }
  const restoreConsole = (): void => { consoleFiltered = false; for (const n of consoleNames) (console as unknown as Record<string, unknown>)[n] = originalConsole[n] }

  // 'deny': the network is not given back. Every later request - to ANY host, the two allowed ones included - fails before it is sent and is recorded.
  const late: string[] = []
  const hostLabel = (url: string): string => { try { return new URL(url).hostname } catch { return '(unparseable)' } }
  const denied = (label: string): Error => { late.push(redactSecrets(label, env)); return new Error(`trial: the trial is closed - a request to ${redactSecrets(label, env)} was blocked before it was sent`) }
  const denyNetwork = (): void => {
    globalThis.fetch = (async (req: unknown) => { throw denied(hostLabel(urlOf(req))) }) as typeof fetch
    const deny = (proto: 'http' | 'https') => function (...args: unknown[]): never { throw denied(hostLabel(nodeRequestUrl(proto, args))) }
    setNode(deny('https') as never, deny('https') as never, deny('http') as never, deny('http') as never)
  }
  const closeTrial = (): void => { setToolTraceObserver(null); if (mode === 'deny') denyNetwork(); else { restoreNetwork(); restoreConsole() } }
  const controls: TrialControls = { lateAttempts: () => [...late], release: () => { if (mode === 'deny') { restoreNetwork(); restoreConsole() } } }
  // In 'deny' mode the network is closed and the console filtered from the very start: a refusal (preflight, question, runner) leaves them so, not open.
  if (mode === 'deny') { filterConsole(); denyNetwork() }

  // 1. preflight: nothing is read, written or sent
  // every text that leaves this function (a reason, a label) is redacted: a value that holds a key must not be echoed
  const refuse = (reasons: string[]): TrialOutcome => ({ kind: 'refused', reasons: reasons.map(r => redactSecrets(r, env)), controls })
  const pre = preflight(env, input.repoRoot, input.execArgv)
  if (pre.reasons.length || !pre.caps) return refuse(pre.reasons.length ? pre.reasons : ['the caps are not valid'])
  // 2. the question (one question from the file) — or, round 3c, the development turns the caller validated
  let question = ''
  if (input.turns === undefined) {
    const file = env.BENCH_TRIAL_QUESTION_FILE!.trim()
    let raw: string
    try { raw = (input.readTextFile ?? (p => readFileSync(p, 'utf8')))(file) } catch (e) {
      return refuse([`the question file cannot be read: ${e instanceof Error ? e.message : String(e)}`])
    }
    question = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()
    if (question === '') return refuse(['the question is empty'])
    if (TWELVE.has(questionKey(question))) return refuse(['the question is one of the 12 benchmark questions: the trial uses a development question outside them'])
  } else if (input.turns.length === 0) return refuse(['no development turns were given'])

  // 3. the wrapped network and the one turn
  const forward = input.fetchImpl ?? originalFetch
  const sent: Record<string, number> = {}
  const blocked = new Set<string>()
  const redirects: Array<{ host: string; status: number }> = []
  /** Requests SENT to each of the three OSM fallback hosts: a count per host, nothing else (no query, URL or coordinate is kept). Always the three keys. */
  const osmCounts = (): Record<string, number> => Object.fromEntries(OSM_FALLBACK_HOSTS.map(h => [h, sent[h] ?? 0]))
  /** The same for the DuckDuckGo fallback host (Wave 2): a count only. */
  const ddgCounts = (): Record<string, number> => Object.fromEntries(DDG_FALLBACK_HOSTS.map(h => [h, sent[h] ?? 0]))
  // E1 investigation: an allowed host that answers 401/403 has rejected the credentials. Only host and status are kept (never a body: the provider echoes part of the key in it).
  const providerRejections: Array<{ host: string; status: number }> = []
  // THE SHARED "CLOSED" STATE (round 3a). Set the moment the turn is over - BEFORE the drain and before the process tree is ended. Every wrapper below looks at it AT
  // EVERY CALL, so a reference taken while the turn was open (a library that kept `fetch`, a callback scheduled for later) is closed too: after this, every request -
  // the two allowed hosts included - is blocked before it is sent and recorded (`late`). A request to a host outside the list is still reported in `blocked`.
  let trialClosed = false
  const osmAllowed = osmFallbackAllowed(env)
  // Quota option (d): decided ONCE from the effective configuration (mode + flag); the count is what was really done.
  const quotaState = quotaResetState(env)
  let quotaResets = 0
  const quotaSummary = (): { on: boolean; reason: string; resets: number } => ({ on: quotaState.on, reason: quotaState.reason, resets: quotaResets })
  // Wave 2 · P1.2: WHICH TURN made each request. Host + path only (the path is one of the allow-listed ones: never a query, a URL or a body); `call` = the tool call that made it (null for the model's own calls).
  const requestLog: Array<{ n: number; turn: string | null; host: string; path: string; call: number | null }> = []
  const blockedLog: Array<{ turn: string | null; label: string; late?: boolean }> = []
  const toolCalls: ToolCallRecord[] = []
  const closedAttempt = (url: string): never => {
    const d = isAllowedRequest(url, osmAllowed)
    if (!d.ok) blocked.add(redactSecrets(d.label, env))
    blockedLog.push({ turn: currentTurn()?.id ?? null, label: redactSecrets(d.ok ? hostLabel(url) : d.label, env), late: true })
    throw denied(hostLabel(url))
  }
  // Wave 4 (C-PRE-0): the page reader's own requests, only with BENCH_ALLOW_PUBLIC_PAGE_FETCH=1 (see publicPageFetchAllowed). A separate ledger: counts per host and per turn, nothing else.
  const pagesAllowed = publicPageFetchAllowed(env)
  const pageSent: Record<string, number> = {}
  const pagePerTurn: Record<string, number> = {}
  // `nodePinned`: null for a fetch call (its admission is unchanged), else whether a node:http(s) call carries the product's safeLookup (fix N4(b): required for a public page).
  const admit = (url: string, method = 'GET', nodePinned: boolean | null = null): void => {
    const d = isAllowedRequest(url, osmAllowed)
    if (!d.ok && pagesAllowed && currentToolCall()?.tool === 'read_page') {
      const turnId = currentTurn()?.id ?? '(none)'
      const p = isPublicPageRequest(url, method)
      if (p.ok && nodePinned !== false && (pagePerTurn[turnId] ?? 0) < PUBLIC_PAGE_MAX_PER_TURN) {
        pagePerTurn[turnId] = (pagePerTurn[turnId] ?? 0) + 1
        pageSent[p.host] = (pageSent[p.host] ?? 0) + 1
        let path = ''; try { path = new URL(url).pathname.slice(0, 120) } catch { path = '' }
        requestLog.push({ n: requestLog.length + 1, turn: currentTurn()?.id ?? null, host: p.host, path, call: currentToolCall()?.call ?? null })
        return
      }
    }
    if (!d.ok) { const label = redactSecrets(d.label, env); blocked.add(label); blockedLog.push({ turn: currentTurn()?.id ?? null, label }); throw new Error(`trial: ${label} is not allowed (blocked before it was sent)`) }
    sent[d.host] = (sent[d.host] ?? 0) + 1
    let path = ''; try { path = new URL(url).pathname } catch { path = '' }
    requestLog.push({ n: requestLog.length + 1, turn: currentTurn()?.id ?? null, host: d.host, path, call: currentToolCall()?.call ?? null })
  }
  filterConsole()
  globalThis.fetch = (async (req: unknown, init?: RequestInit) => {
    if (trialClosed || currentTurn()?.open === false) closedAttempt(urlOf(req)) // round 3c: a closed turn refuses its late requests too
    // a `dispatcher` in the init is undici's way of changing where the connection goes (a proxy agent, a custom connector): such a call cannot be judged by its URL
    if (init && typeof init === 'object' && 'dispatcher' in init) admit('(unparseable)')
    const url = urlOf(req)
    admit(url, String(init?.method ?? (req instanceof Request ? req.method : 'GET')))
    // never follow a redirect: a request to an allowed host cannot be turned into a request to another host
    const res = await forward(req as never, { ...(init ?? {}), redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) redirects.push({ host: new URL(url).hostname, status: res.status })
    if (res.status === 401 || res.status === 403) {
      const host = new URL(url).hostname
      if (!providerRejections.some(x => x.host === host && x.status === res.status)) providerRejections.push({ host, status: res.status })
    }
    return res
  }) as typeof fetch
  const guardNode = (proto: 'http' | 'https', original: (...a: never[]) => unknown) => function (this: unknown, ...args: unknown[]) {
    if (trialClosed || currentTurn()?.open === false) closedAttempt(nodeRequestUrl(proto, args)) // round 3c: as for fetch
    admit(nodeRequestUrl(proto, args), nodeRequestMethod(args), nodeRequestPinned(args))
    return (original as (...a: unknown[]) => unknown).apply(proto === 'https' ? https : http, args)
  }
  setNode(guardNode('https', originalNode.httpsRequest as never) as never, guardNode('https', originalNode.httpsGet as never) as never, guardNode('http', originalNode.httpRequest as never) as never, guardNode('http', originalNode.httpGet as never) as never)

  // Wave 2 · P1.2: one record per tool call. The observer is bench-only (toolTrace.ts does nothing without it) and is removed when the trial closes.
  setToolTraceObserver(e => {
    const mine = requestLog.filter(x => x.call === e.call)
    const rows = e.threw ? null : rowsOfToolResult(e.result)
    const args = e.args !== null && typeof e.args === 'object' ? e.args as { query?: unknown; q?: unknown } : {}
    const q = typeof args.query === 'string' ? args.query : typeof args.q === 'string' ? args.q : null
    toolCalls.push({
      turn: currentTurn()?.id ?? null, call: e.call, tool: e.tool, ms: e.ms, ok: !e.threw, rows, provider: e.threw ? 'none' : providerOfToolResult(e.result, rows), empty: !e.threw && rows === 0,
      serperPaths: mine.filter(x => x.host === 'google.serper.dev').map(x => x.path), ddg: mine.filter(x => DDG_FALLBACK_HOSTS.includes(x.host)).length, osm: mine.filter(x => OSM_FALLBACK_HOSTS.includes(x.host)).length,
      // the query text only in the extension mode (cut at 200 characters, redacted); the acceptance mode keeps counts only
      ...(osmAllowed && q !== null ? { query: redactSecrets(q.slice(0, 200), env) } : {}),
    })
  })
  const trialTurn: UatTurn = { id: 'TRIAL', conversation: 'TRIAL', turn: 1, text: question }
  const trialTurns: readonly UatTurn[] = input.turns ? [...input.turns] : [trialTurn]
  // L2: this run (this process) gets its own request total. The preflight already refused an invalid value; this is the same check at the point of use.
  const capRun = beginRequestCapRun(env)
  if (!capRun.ok) { closeTrial(); return refuse([capRun.problem]) }
  let capFinal: { limit: number; sent: number; refused: number } | null = null
  let result
  try {
    result = await runBench({
      // the confirmations are checked once more right before the request is made: a flag that changed since the preflight (the env object is the live process.env in the real run) sends nothing
      chat: routeTransport(((req: never) => {
        const again = [...consultativeConfirmationReasons(env), ...requestCapReasons(env)]
        if (again.length) throw new Error(`trial: ${again.join('; ')} (checked again just before the request; nothing was sent)`)
        // one request = one turn: the free-question counter is reset right before the route meters this turn (only when the configuration says so)
        if (quotaState.on) { __resetAiQuestionQuotaLocal(); quotaResets++ }
        return input.post(req)
      }) as typeof input.post), turnCapUsd: pre.caps.turnUsd, runCapUsd: pre.caps.runUsd, confirmSpend: { capUsd: pre.caps.runUsd },
      declaredFlags: Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, (env[k] ?? '').trim() === '' ? null : env[k]!.trim()])),
      env, outDir: env.BENCH_TRIAL_OUT_DIR!, repoRoot: input.repoRoot, fs: input.fs, turns: trialTurns, now: input.now,
      extraResult: () => ({ osmRequests: osmCounts(), ddgRequests: ddgCounts(), ...(pagesAllowed ? { pageRequests: { ...pageSent } } : {}), freeQuotaReset: quotaSummary(), requestLog, blockedLog, toolCalls, questionFile: input.questionInfo ?? null }),
    })
    // The turn is over: CLOSE first, then watch. Background work that outlives the answer (memory, logging…) is no longer let through, it is only seen (and recorded).
    trialClosed = true
    await new Promise(r => setTimeout(r, input.drainMs ?? 100))
  } catch (e) {
    if (e instanceof BenchRefusal) return refuse(e.reasons) // (a file-system error quoted in a reason may hold a key)
    throw e
  } finally {
    trialClosed = true
    capFinal = endRequestCapRun()
    closeTrial()
  }

  // Round 3c: every record of the run. For one turn this is exactly what it was.
  const records = result.records
  const warnings: string[] = []
  const problems: string[] = []
  if (records.length === 0) problems.push('no turn record: the turn never ran')
  for (const r of records) {
    if (r.cost.state !== 'known') problems.push(`${r.id}: cost not known (${r.blocked ?? 'unknown'}; open reservations ≈ ${r.openReservedUsd})`)
    if (r.degraded) problems.push(`${r.id}: degraded: ${r.refusals} paid call(s) refused by the gate`)
    if (r.error) problems.push(`${r.id}: error: ${r.error}`)
    if (r.streamErrors.length) problems.push(`${r.id}: stream errors: ${r.streamErrors.join('; ')}`)
  }
  if (records.length > 0 && !result.report.cost.costAccounted) problems.push('the cost book is not fully accounted')
  const sumLlm = records.reduce((a, r) => a + r.llmRequests, 0)
  const sumSerper = records.reduce((a, r) => a + r.serperRequests, 0)
  if (records.length > 0 && (sent['api.openai.com'] ?? 0) !== sumLlm) warnings.push(`LLM request count differs: the wrapper sent ${sent['api.openai.com'] ?? 0}, the ledger booked ${sumLlm}`)
  if (records.length > 0 && (sent['google.serper.dev'] ?? 0) !== sumSerper) warnings.push(`Serper request count differs: the wrapper sent ${sent['google.serper.dev'] ?? 0}, the ledger booked ${sumSerper}`)
  // The request cap is a safety stop, not a result: a request it refused is a search that was NOT made, so the answer it fed is not the app's normal answer. Never clean.
  if (capFinal && capFinal.refused > 0) warnings.push(`the Serper request cap refused ${capFinal.refused} request(s): those searches were not made`)
  if (capFinal && records.length > 0 && capFinal.sent !== (sent['google.serper.dev'] ?? 0)) warnings.push(`request cap count differs: the cap let ${capFinal.sent} through, the wrapper sent ${sent['google.serper.dev'] ?? 0}`)
  // Named first: a rejected credential on the first paid call is the whole story (cost unknown → run blocked → every later paid call refused), and "reported cost NaN" does not say so.
  for (const x of providerRejections) warnings.unshift(`${x.host} answered HTTP ${x.status}: the provider rejected the credentials (check the key and recreate it); the cost, refusal and blocked-host lines below follow from that`)
  const turnOk = records.length > 0 && problems.length === 0
  const allKnown = records.length > 0 && records.every(r => r.cost.state === 'known')
  const usdSum = allKnown ? Math.round(records.reduce((a, r) => a + (r.cost.usd ?? 0), 0) * 1e9) / 1e9 : null
  const hostsBlocked = [...blocked].sort()
  const summary: TrialSummary = {
    turnOk, runValid: result.valid, benchmarkEligible: isBenchmarkEligible(trialTurns, result.valid),
    // a run that stopped before its last turn is never clean, whatever the books say: the turns it did not run are not part of the result
    trialClean: turnOk && hostsBlocked.length === 0 && redirects.length === 0 && warnings.length === 0 && late.length === 0 && records.length === trialTurns.length && result.report.stopped === null,
    lateBlocked: [...late],
    // a run stops either inside runUat (report.stopped) or because a turn left the runner halted (an error, a degraded turn, an unknown cost):
    // then the later turns were never sent and runUat names no stop. Both are reported; the text is redacted like every other summary line.
    stopped: result.report.stopped
      ? redactSecrets(`${result.report.stopped.reason} at ${result.report.stopped.atTurn}: ${result.report.stopped.detail}`, env)
      : records.length < trialTurns.length
        ? redactSecrets(`the runner halted after ${records.length} of ${trialTurns.length} turns (a turn was not an answer, or its cost was not known); the rest were not sent`, env)
        : null,
    turnsRun: records.length, turnsTotal: trialTurns.length,
    turnRows: records.map(r => ({
      id: r.id, tools: r.toolNames, serper: r.serperRequests, serperW: r.requestTotals.serper.W.requests, serperV: r.requestTotals.serper.V.requests,
      llm: r.llmRequests, usd: r.cost.state === 'known' ? r.cost.usd : null, chars: r.answer.length, cards: (r.answer.match(/"key":"/g) ?? []).length,
    })),
    costState: records.length === 0 ? 'none' : allKnown ? 'known' : 'unknown', usd: usdSum, ms: records.length === 0 ? null : records.reduce((a, r) => a + r.ms, 0),
    tools: [...new Set(records.flatMap(r => r.toolNames))],
    llmRequests: sumLlm, serperRequests: sumSerper, hostRequests: sent, osmRequests: osmCounts(), ddgRequests: ddgCounts(), quotaReset: quotaSummary(), question: input.questionInfo ?? null,
    trace: { toolCalls: toolCalls.length, emptyToolCalls: toolCalls.filter(c => c.empty).length, requestsWithTurn: requestLog.filter(x => x.turn !== null).length, requestsLogged: requestLog.length, blocked: blockedLog.map(b => ({ turn: b.turn, label: b.label })) },
    refusals: records.reduce((a, r) => a + r.refusals, 0), photoSkips: records.reduce((a, r) => a + r.photoSkips, 0), answerChars: records.reduce((a, r) => a + r.answer.length, 0),
    hostsBlocked, redirects, providerRejections, warnings: warnings.map(w => redactSecrets(w, env)), problems: problems.map(p => redactSecrets(p, env)),
    flagsInEffect: Object.fromEntries(flagsInEffectNames().map(k => [k, env[k] === undefined ? null : env[k]!])), resultPath: result.outPath,
    requestCap: { perTurnLimit: parseCapValue(env[REQUEST_CAP_PER_TURN_ENV], REQUEST_CAP_MAX_PER_TURN), runLimit: capFinal?.limit ?? null, sent: capFinal?.sent ?? 0, refused: capFinal?.refused ?? 0 },
    budget: { mode: benchModeOf(env), turnCapUsd: pre.caps.turnUsd, runCapUsd: pre.caps.runUsd },
  }
  return { kind: 'ran', summary, controls }
}

/** The summary as text. Contains no key and no environment value other than the few flag values it names on purpose. */
export function formatSummary(s: TrialSummary): string {
  const lines = [
    'TRIAL SUMMARY (cost figures are ESTIMATES: tokens × the price table in the code, Serper by credits - not the provider invoice)',
    `turnOk=${s.turnOk} runValid=${s.runValid} benchmarkEligible=${s.benchmarkEligible} trialClean=${s.trialClean}`,
  ]
  if (!s.trialClean) {
    lines.push(`NOT CLEAN: this is NOT a complete trial result${s.hostsBlocked.length ? ` - blocked: ${s.hostsBlocked.join(', ')}` : ''}${s.redirects.length ? ` - redirects: ${s.redirects.map(x => `${x.host} ${x.status}`).join(', ')}` : ''}${s.lateBlocked.length ? ` - late requests (after the turn was closed, or before the wrappers were installed; blocked before they were sent):${[...new Set(s.lateBlocked)].join(', ')}` : ''}${s.warnings.length ? ` - warnings: ${s.warnings.join(' | ')}` : ''}${s.problems.length ? ` - problems: ${s.problems.join(' | ')}` : ''}`)
  }
  lines.push(
    `costState=${s.costState} usd(estimate)=${s.usd} ms=${s.ms} tools=${s.tools.join(',') || '-'}`,
    `ledger: llm=${s.llmRequests} serper=${s.serperRequests} refusals=${s.refusals} photoSkips=${s.photoSkips} | wrappers sent: ${JSON.stringify(s.hostRequests)}`,
    `OSM fallback hosts (free: no Serper credit, no OpenAI cost; outside the request cap and the USD gate; counted, not priced): ${Object.entries(s.osmRequests).map(([h, n]) => `${h}=${n}`).join(' ')}`,
    `tool calls recorded: ${s.trace.toolCalls} (empty: ${s.trace.emptyToolCalls}) | requests logged with a turn id: ${s.trace.requestsWithTurn}/${s.trace.requestsLogged}${s.trace.blocked.length ? ` | blocked by turn: ${[...s.trace.blocked.reduce((m, b) => m.set(`${b.turn ?? '(no turn)'}: ${b.label}`, (m.get(`${b.turn ?? '(no turn)'}: ${b.label}`) ?? 0) + 1), new Map<string, number>())].map(([k, n]) => `${k}×${n}`).join('; ')}` : ''}`,
    `DuckDuckGo fallback host (free: no Serper credit, no OpenAI cost; outside the request cap and the USD gate; counted, not priced): ${Object.entries(s.ddgRequests).map(([h, n]) => `${h}=${n}`).join(' ')}`,
    `free-question quota reset per turn: ${s.quotaReset.on ? 'ON' : 'OFF'} (reason: ${s.quotaReset.reason}) | resets: ${s.quotaReset.resets}${s.quotaReset.on ? ' (the Free limit of 10 questions a day was NOT applied; the benchmark measures the advice, not that limit)' : ' (the real Free limit of 10 questions a day applies: more than 10 questions stop the run with HTTP 429)'}`,
    `budget mode: ${s.budget.mode} | run cap ${s.budget.runCapUsd} USD (maximum of the mode ${maxRunCapUsd(s.budget.mode)}) | per-turn cap ${s.budget.turnCapUsd} USD (maximum ${MAX_TURN_CAP_USD}) — ESTIMATES, not an invoice`,
    `request cap (a COUNT of Serper requests, not a price): per turn ${s.requestCap.perTurnLimit ?? '-'} | per run ${s.requestCap.runLimit ?? '-'} | let through ${s.requestCap.sent} | refused ${s.requestCap.refused}`,
    s.question === null
      ? 'question file: not reported by the caller'
      : `question file: sha256=${s.question.sha256} | format v${s.question.formatVersion} | notes withheld from the model: ${s.question.notesWithheld.length}${s.question.notesWithheld.length ? ` (${s.question.notesWithheld.join(', ')})` : ''}`,
    `flags in effect: ${Object.entries(s.flagsInEffect).map(([k, v]) => `${k}=${v === null ? 'unset' : v}`).join(' ')}`,
    `answerChars=${s.answerChars} result=${s.resultPath ?? '-'}`,
  )
  if (s.turnsTotal !== 1) {
    // Round 3c: a development run. Not an acceptance result, and never a benchmark (runValid / benchmarkEligible are false by construction).
    lines.push(
      `DEV RUN: ${s.turnsRun}/${s.turnsTotal} turns ran | STOPPED: ${s.stopped ?? 'no (every turn ran)'} | dev run, not an acceptance result`,
      `turn | tools | serper (W/V) | llm calls | USD est. | answer chars | cards`,
      ...s.turnRows.map(t => `${t.id} | ${t.tools.join(',') || '-'} | ${t.serper} (${t.serperW}/${t.serperV}) | ${t.llm} | ${t.usd ?? 'unknown'} | ${t.chars} | ${t.cards}`),
      s.usd === null
        ? `total USD est.: unknown (at least one turn's cost is not known; the sum of the known turns is not reported as a total)`
        : `total USD est. (all ${s.turnsRun} turns known): ${s.usd} | run cap ${s.flagsInEffect.BENCH_SPEND_RUN_CAP_USD ?? '?'}`,
    )
  }
  return lines.join('\n')
}

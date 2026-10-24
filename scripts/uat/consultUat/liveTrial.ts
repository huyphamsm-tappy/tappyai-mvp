/**
 * The core of the LIVE TRIAL: ONE development question through the REAL chat route of this process, with the network wrapped so that only the two hosts the
 * spend gate can account for are reachable. Round 2e. This file holds the logic; it uses no test framework and reads NO environment variable by itself - the
 * caller passes `env` (the real file passes process.env, the dry rehearsal passes the same, with a fake network). Two files run it:
 *   · liveTrial.test.ts           the real thing: skipped unless BENCH_LIVE_TRIAL has the exact confirmation text. Real network. Costs real money.
 *   · liveTrial.rehearsal.test.ts the dry rehearsal: always runs, SAME function, a fake network, nothing is ever sent.
 *
 * ORDER (nothing is read, written or sent until every check that needs no I/O has passed):
 *   1. preflight (pure): CI unset · BENCH_EXPECT_CONSULTATIVE_V1 / BENCH_EXPECT_CONSULT_V2 are exactly 0 or 1 and equal the flags the route will see (see
 *      CONSULTATIVE_CONFIRMATIONS: they exist because the vitest setup overwrites those two flags) · caps exact and ≤ 0.05 / ≤ 0.65 · BENCH_CONFIRM_SPEND = the run cap ·
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
import { checkBenchCaps, capToScaled } from '@/lib/ai/budget/spendGate'
import { safeLookup } from '@/lib/security/safeFetch'
import { matchesFixedUatSet } from './harness'
import { BENCH_FLAG_NAMES, BenchRefusal, assertBenchAllowed, redactSecrets, routeTransport, runBench, type BenchFs } from './liveRunner'
import { currentTurn } from './turnScope'
import { UAT_TURNS, type UatTurn } from './questions'

/** The only requests a trial may send: host → exact paths. Everything else is BLOCKED before it is sent (and counted). */
const ALLOWED_PATHS: Readonly<Record<string, readonly string[]>> = {
  'api.openai.com': ['/v1/chat/completions'],
  'google.serper.dev': ['/search', '/maps', '/shopping'],
}
export const TRIAL_ALLOWED_HOSTS: readonly string[] = Object.keys(ALLOWED_PATHS)

/** Pure. `ok` only for https, no explicit port, no credentials, an allowed host and an allowed exact path. `label` names what was blocked (a host, host+path, or "(unparseable)"). */
export function isAllowedRequest(url: string): { ok: true; host: string } | { ok: false; label: string } {
  let u: URL
  try { u = new URL(url) } catch { return { ok: false, label: '(unparseable)' } }
  const paths = ALLOWED_PATHS[u.hostname]
  if (!paths) return { ok: false, label: u.hostname }
  if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return { ok: false, label: `${u.protocol}//${u.username || u.password ? '(credentials)@' : ''}${u.hostname}${u.port ? `:${u.port}` : ''}` }
  if (!paths.includes(u.pathname)) return { ok: false, label: `${u.hostname}${u.pathname}` }
  return { ok: true, host: u.hostname }
}

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
  refusals: number
  photoSkips: number
  answerChars: number
  /** Hosts (or host+path, scheme/port forms, "(unparseable)") that were blocked before being sent. */
  hostsBlocked: string[]
  redirects: Array<{ host: string; status: number }>
  warnings: string[]
  /** Why the turn is not OK (empty when it is). */
  problems: string[]
  /** The consultative flags as the run SAW them (null = unset). Under vitest the setup pins CONSULTATIVE_V1 and CONSULT_V2 to "0" when they are unset. */
  flagsInEffect: Record<string, string | null>
  resultPath: string | null
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
const FLAGS_IN_EFFECT = ['CONSULTATIVE_V1', 'CONSULT_V2', 'CONSULT_LUNA', 'TURN_WEB_TICKET', 'SEARCH_FALLBACK_GATE', 'BENCH_SPEND_RUN_CAP_USD']

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

/** Pure: no file, no network. Every reason at once. Exported for the preflight report (preflightReport.ts), which runs the same checks without the trial. */
export function preflight(env: Record<string, string | undefined>, repoRoot?: string, execArgv?: readonly string[]): { reasons: string[]; caps: { turnUsd: number; runUsd: number } | null } {
  const reasons: string[] = [...consultativeConfirmationReasons(env), ...connectionRedirectReasons(env, execArgv, repoRoot)]
  if ((env.CI ?? '') !== '') reasons.push('CI is set: the live trial never runs in CI')
  const caps = checkBenchCaps(env.BENCH_SPEND_TURN_CAP_USD, env.BENCH_SPEND_RUN_CAP_USD)
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
  const redactArg = (a: unknown): unknown => {
    if (typeof a === 'string') return redactSecrets(a, env)
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
  const closeTrial = (): void => { if (mode === 'deny') denyNetwork(); else { restoreNetwork(); restoreConsole() } }
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
  // THE SHARED "CLOSED" STATE (round 3a). Set the moment the turn is over - BEFORE the drain and before the process tree is ended. Every wrapper below looks at it AT
  // EVERY CALL, so a reference taken while the turn was open (a library that kept `fetch`, a callback scheduled for later) is closed too: after this, every request -
  // the two allowed hosts included - is blocked before it is sent and recorded (`late`). A request to a host outside the list is still reported in `blocked`.
  let trialClosed = false
  const closedAttempt = (url: string): never => {
    const d = isAllowedRequest(url)
    if (!d.ok) blocked.add(redactSecrets(d.label, env))
    throw denied(hostLabel(url))
  }
  const admit = (url: string): void => {
    const d = isAllowedRequest(url)
    if (!d.ok) { const label = redactSecrets(d.label, env); blocked.add(label); throw new Error(`trial: ${label} is not allowed (blocked before it was sent)`) }
    sent[d.host] = (sent[d.host] ?? 0) + 1
  }
  filterConsole()
  globalThis.fetch = (async (req: unknown, init?: RequestInit) => {
    if (trialClosed || currentTurn()?.open === false) closedAttempt(urlOf(req)) // round 3c: a closed turn refuses its late requests too
    // a `dispatcher` in the init is undici's way of changing where the connection goes (a proxy agent, a custom connector): such a call cannot be judged by its URL
    if (init && typeof init === 'object' && 'dispatcher' in init) admit('(unparseable)')
    const url = urlOf(req)
    admit(url)
    // never follow a redirect: a request to an allowed host cannot be turned into a request to another host
    const res = await forward(req as never, { ...(init ?? {}), redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) redirects.push({ host: new URL(url).hostname, status: res.status })
    return res
  }) as typeof fetch
  const guardNode = (proto: 'http' | 'https', original: (...a: never[]) => unknown) => function (this: unknown, ...args: unknown[]) {
    if (trialClosed || currentTurn()?.open === false) closedAttempt(nodeRequestUrl(proto, args)) // round 3c: as for fetch
    admit(nodeRequestUrl(proto, args))
    return (original as (...a: unknown[]) => unknown).apply(proto === 'https' ? https : http, args)
  }
  setNode(guardNode('https', originalNode.httpsRequest as never) as never, guardNode('https', originalNode.httpsGet as never) as never, guardNode('http', originalNode.httpRequest as never) as never, guardNode('http', originalNode.httpGet as never) as never)

  const trialTurn: UatTurn = { id: 'TRIAL', conversation: 'TRIAL', turn: 1, text: question }
  const trialTurns: readonly UatTurn[] = input.turns ? [...input.turns] : [trialTurn]
  let result
  try {
    result = await runBench({
      // the confirmations are checked once more right before the request is made: a flag that changed since the preflight (the env object is the live process.env in the real run) sends nothing
      chat: routeTransport(((req: never) => {
        const again = consultativeConfirmationReasons(env)
        if (again.length) throw new Error(`trial: ${again.join('; ')} (checked again just before the request; nothing was sent)`)
        return input.post(req)
      }) as typeof input.post), turnCapUsd: pre.caps.turnUsd, runCapUsd: pre.caps.runUsd, confirmSpend: { capUsd: pre.caps.runUsd },
      declaredFlags: Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, (env[k] ?? '').trim() === '' ? null : env[k]!.trim()])),
      env, outDir: env.BENCH_TRIAL_OUT_DIR!, repoRoot: input.repoRoot, fs: input.fs, turns: trialTurns, now: input.now,
    })
    // The turn is over: CLOSE first, then watch. Background work that outlives the answer (memory, logging…) is no longer let through, it is only seen (and recorded).
    trialClosed = true
    await new Promise(r => setTimeout(r, input.drainMs ?? 100))
  } catch (e) {
    if (e instanceof BenchRefusal) return refuse(e.reasons) // (a file-system error quoted in a reason may hold a key)
    throw e
  } finally {
    trialClosed = true
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
    llmRequests: sumLlm, serperRequests: sumSerper, hostRequests: sent,
    refusals: records.reduce((a, r) => a + r.refusals, 0), photoSkips: records.reduce((a, r) => a + r.photoSkips, 0), answerChars: records.reduce((a, r) => a + r.answer.length, 0),
    hostsBlocked, redirects, warnings: warnings.map(w => redactSecrets(w, env)), problems: problems.map(p => redactSecrets(p, env)),
    flagsInEffect: Object.fromEntries(FLAGS_IN_EFFECT.map(k => [k, env[k] === undefined ? null : env[k]!])), resultPath: result.outPath,
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

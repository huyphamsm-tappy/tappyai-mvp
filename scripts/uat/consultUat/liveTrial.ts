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
 *      through runBench, the wrappers stay in place for a short drain (background work after the answer) and are removed in a finally.
 *
 * WHAT THE WRAPPERS ALLOW: only https, default port, and only these paths of these two hosts: api.openai.com /v1/chat/completions; google.serper.dev /search /maps
 * /shopping. Everything else (another host, another path, plain http, another port, an unparseable URL) is BLOCKED before it is sent, counted and reported;
 * a redirect is never followed. The check judges the LOGICAL URL, not the machine the connection really reaches: the preflight therefore refuses a proxy in the
 * environment, NODE_TLS_REJECT_UNAUTHORIZED=0, and node:https options that redirect the connection (socketPath, createConnection, an agent other than false). The real
 * fetch and node:http(s) are restored after a short drain, so background work that runs later is no longer filtered (paid calls are still refused: the gate is closed).
 * NOT covered: transports that use neither of these (a raw socket, a library with its own client): none was found on the chat path,
 * but that is a reading of the code, not a guarantee.
 *
 * Costs in the ledger are ESTIMATES (tokens × the price table in the code; Serper by credits), NOT the provider's invoice. The caps are enforced on that
 * estimate for the paths the gate covers; they are not a promise about the invoice.
 */
import { readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { checkBenchCaps, capToScaled } from '@/lib/ai/budget/spendGate'
import { matchesFixedUatSet } from './harness'
import { BENCH_FLAG_NAMES, BenchRefusal, assertBenchAllowed, redactSecrets, routeTransport, runBench, type BenchFs } from './liveRunner'
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

export type TrialOutcome = { kind: 'refused'; reasons: string[] } | { kind: 'ran'; summary: TrialSummary }

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
const FLAGS_IN_EFFECT = ['CONSULTATIVE_V1', 'CONSULT_V2', 'CONSULT_LUNA', 'TURN_WEB_TICKET', 'SEARCH_FALLBACK_GATE']

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
export function connectionRedirectReasons(env: Record<string, string | undefined>): string[] {
  const reasons: string[] = []
  for (const k of Object.keys(env)) if (/^(https?_proxy|all_proxy)$/i.test(k) && (env[k] ?? '') !== '') reasons.push(`${k} is set: a proxy would receive the requests (and their Authorization header) while the host check still sees the allowed host; unset it for the trial`)
  const useProxy = env.NODE_USE_ENV_PROXY
  if (useProxy !== undefined && useProxy !== '' && useProxy !== '0') reasons.push('NODE_USE_ENV_PROXY is set: Node would send the requests through a proxy; unset it for the trial')
  if ((env.NODE_OPTIONS ?? '').includes('--use-env-proxy')) reasons.push('NODE_OPTIONS contains --use-env-proxy: Node would send the requests through a proxy; remove it for the trial')
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') reasons.push('NODE_TLS_REJECT_UNAUTHORIZED is 0: certificate checking is off; unset it for the trial')
  return reasons
}

/** Pure: no file, no network. Every reason at once. */
function preflight(env: Record<string, string | undefined>, repoRoot?: string): { reasons: string[]; caps: { turnUsd: number; runUsd: number } | null } {
  const reasons: string[] = [...consultativeConfirmationReasons(env), ...connectionRedirectReasons(env)]
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
  const redirectsConnection = (o: Record<string, unknown>): boolean => 'socketPath' in o || 'createConnection' in o || (o.agent !== undefined && o.agent !== false)
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
  // 1. preflight: nothing is read, written or sent
  // every text that leaves this function (a reason, a label) is redacted: a value that holds a key must not be echoed
  const refuse = (reasons: string[]): TrialOutcome => ({ kind: 'refused', reasons: reasons.map(r => redactSecrets(r, env)) })
  const pre = preflight(env, input.repoRoot)
  if (pre.reasons.length || !pre.caps) return refuse(pre.reasons.length ? pre.reasons : ['the caps are not valid'])
  // 2. the question
  const file = env.BENCH_TRIAL_QUESTION_FILE!.trim()
  let raw: string
  try { raw = (input.readTextFile ?? (p => readFileSync(p, 'utf8')))(file) } catch (e) {
    return refuse([`the question file cannot be read: ${e instanceof Error ? e.message : String(e)}`])
  }
  const question = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim()
  if (question === '') return { kind: 'refused', reasons: ['the question is empty'] }
  if (TWELVE.has(questionKey(question))) return { kind: 'refused', reasons: ['the question is one of the 12 benchmark questions: the trial uses a development question outside them'] }

  // 3. the wrapped network and the one turn
  const originalFetch = globalThis.fetch
  const forward = input.fetchImpl ?? originalFetch
  const originalNode = { httpsRequest: https.request, httpsGet: https.get, httpRequest: http.request, httpGet: http.get }
  const sent: Record<string, number> = {}
  const blocked = new Set<string>()
  const redirects: Array<{ host: string; status: number }> = []
  const admit = (url: string): void => {
    const d = isAllowedRequest(url)
    if (!d.ok) { const label = redactSecrets(d.label, env); blocked.add(label); throw new Error(`trial: ${label} is not allowed (blocked before it was sent)`) }
    sent[d.host] = (sent[d.host] ?? 0) + 1
  }
  globalThis.fetch = (async (req: unknown, init?: RequestInit) => {
    const url = urlOf(req)
    admit(url)
    // never follow a redirect: a request to an allowed host cannot be turned into a request to another host
    const res = await forward(req as never, { ...(init ?? {}), redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) redirects.push({ host: new URL(url).hostname, status: res.status })
    return res
  }) as typeof fetch
  const guardNode = (proto: 'http' | 'https', original: (...a: never[]) => unknown) => function (this: unknown, ...args: unknown[]) {
    admit(nodeRequestUrl(proto, args))
    return (original as (...a: unknown[]) => unknown).apply(proto === 'https' ? https : http, args)
  }
  ;(https as unknown as Record<string, unknown>).request = guardNode('https', originalNode.httpsRequest as never)
  ;(https as unknown as Record<string, unknown>).get = guardNode('https', originalNode.httpsGet as never)
  ;(http as unknown as Record<string, unknown>).request = guardNode('http', originalNode.httpRequest as never)
  ;(http as unknown as Record<string, unknown>).get = guardNode('http', originalNode.httpGet as never)

  const trialTurn: UatTurn = { id: 'TRIAL', conversation: 'TRIAL', turn: 1, text: question }
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
      env, outDir: env.BENCH_TRIAL_OUT_DIR!, repoRoot: input.repoRoot, fs: input.fs, turns: [trialTurn], now: input.now,
    })
    // background work that outlives the answer (memory, logging…) still goes through the wrappers
    await new Promise(r => setTimeout(r, input.drainMs ?? 100))
  } catch (e) {
    if (e instanceof BenchRefusal) return refuse(e.reasons) // (a file-system error quoted in a reason may hold a key)
    throw e
  } finally {
    globalThis.fetch = originalFetch
    https.request = originalNode.httpsRequest; https.get = originalNode.httpsGet; http.request = originalNode.httpRequest; http.get = originalNode.httpGet
  }

  const r = result.records[0]
  const warnings: string[] = []
  const problems: string[] = []
  if (!r) problems.push('no turn record: the turn never ran')
  else {
    if (r.cost.state !== 'known') problems.push(`cost not known (${r.blocked ?? 'unknown'}; open reservations ≈ ${r.openReservedUsd})`)
    if (r.degraded) problems.push(`degraded: ${r.refusals} paid call(s) refused by the gate`)
    if (r.error) problems.push(`error: ${r.error}`)
    if (r.streamErrors.length) problems.push(`stream errors: ${r.streamErrors.join('; ')}`)
    if (!result.report.cost.costAccounted) problems.push('the cost book is not fully accounted')
    if ((sent['api.openai.com'] ?? 0) !== r.llmRequests) warnings.push(`LLM request count differs: the wrapper sent ${sent['api.openai.com'] ?? 0}, the ledger booked ${r.llmRequests}`)
    if ((sent['google.serper.dev'] ?? 0) !== r.serperRequests) warnings.push(`Serper request count differs: the wrapper sent ${sent['google.serper.dev'] ?? 0}, the ledger booked ${r.serperRequests}`)
  }
  const turnOk = !!r && problems.length === 0
  const hostsBlocked = [...blocked].sort()
  const summary: TrialSummary = {
    turnOk, runValid: result.valid, benchmarkEligible: isBenchmarkEligible([trialTurn], result.valid),
    trialClean: turnOk && hostsBlocked.length === 0 && redirects.length === 0 && warnings.length === 0,
    costState: r ? r.cost.state : 'none', usd: r ? r.cost.usd : null, ms: r ? r.ms : null, tools: r ? r.toolNames : [],
    llmRequests: r ? r.llmRequests : 0, serperRequests: r ? r.serperRequests : 0, hostRequests: sent,
    refusals: r ? r.refusals : 0, photoSkips: r ? r.photoSkips : 0, answerChars: r ? r.answer.length : 0,
    hostsBlocked, redirects, warnings: warnings.map(w => redactSecrets(w, env)), problems: problems.map(p => redactSecrets(p, env)),
    flagsInEffect: Object.fromEntries(FLAGS_IN_EFFECT.map(k => [k, env[k] === undefined ? null : env[k]!])), resultPath: result.outPath,
  }
  return { kind: 'ran', summary }
}

/** The summary as text. Contains no key and no environment value other than the few flag values it names on purpose. */
export function formatSummary(s: TrialSummary): string {
  const lines = [
    'TRIAL SUMMARY (cost figures are ESTIMATES: tokens × the price table in the code, Serper by credits - not the provider invoice)',
    `turnOk=${s.turnOk} runValid=${s.runValid} benchmarkEligible=${s.benchmarkEligible} trialClean=${s.trialClean}`,
  ]
  if (!s.trialClean) {
    lines.push(`NOT CLEAN: this is NOT a complete trial result${s.hostsBlocked.length ? ` - blocked: ${s.hostsBlocked.join(', ')}` : ''}${s.redirects.length ? ` - redirects: ${s.redirects.map(x => `${x.host} ${x.status}`).join(', ')}` : ''}${s.warnings.length ? ` - warnings: ${s.warnings.join(' | ')}` : ''}${s.problems.length ? ` - problems: ${s.problems.join(' | ')}` : ''}`)
  }
  lines.push(
    `costState=${s.costState} usd(estimate)=${s.usd} ms=${s.ms} tools=${s.tools.join(',') || '-'}`,
    `ledger: llm=${s.llmRequests} serper=${s.serperRequests} refusals=${s.refusals} photoSkips=${s.photoSkips} | wrappers sent: ${JSON.stringify(s.hostRequests)}`,
    `flags in effect: ${Object.entries(s.flagsInEffect).map(([k, v]) => `${k}=${v === null ? 'unset' : v}`).join(' ')}`,
    `answerChars=${s.answerChars} result=${s.resultPath ?? '-'}`,
  )
  return lines.join('\n')
}

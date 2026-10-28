// ── Wave 6 · the paid entry of the WRITING-STEP replay (Owner decision A, 28/10) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Replays the writer call of every turn of a capture (writerCapture.ts) with ONE pre-registered variant (writerReplay.ts, probe2/w6-bien-the.md). It is run by liveTrial.test.ts, under the launcher: the launcher keeps
// every check it had (hidden key prompt, a real terminal, Gate 0 = the preflight child, Gate 1 = the line typed by hand, the child's environment allow-list), and prints the replay lines in Gate 1.
//
// What this file adds to the safety of a run, and nothing else:
//   · it runs the SAME preflight as a normal run (liveTrial.ts `preflight`: caps, confirmation, flags, folder on drive D, network switches...) and then its own replay conditions;
//   · the only request it can send is POST https://api.openai.com/v1/chat/completions (no Serper, no other host, no other path, no redirect, nothing through node:http(s)); the wrapper is closed when the run ends;
//   · every model call goes through `meteredModel` and the bench spend gate (BENCH_SPEND_GATE must be ON): the call is reserved at its WORST case BEFORE it is sent - the whole request body is counted as input
//     (messages, tools, every other field), the output is capped at max_completion_tokens (reasoning included) and the cap SENT is the cap PRICED. A call whose cost is not known, or that fails after it may have left,
//     stops the run (the spend gate's own rule); a request with a part whose cost cannot be bounded by its bytes (an image...) is refused;
//   · the run cap of a replay is at most 0.30 USD (REPLAY_MAX_RUN_CAP_USD), the per-turn cap at most 0.10 (the bench maximum);
//   · the answers are written to bench-<stamp>.json in the run folder (drive D, outside the repository): the shape make-blind-pairs.mjs reads, plus the characters of every answer.
// The capture itself is read here, by code, and its text is never printed. Production never imports this file.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import type { LanguageModelV1 } from 'ai'
import { meteredModel } from '@/lib/ai/budget/meteredModel'
import { capToScaled, runWithSpendGate } from '@/lib/ai/budget/spendGate'
import { openaiCallCost } from '@/lib/ai/llm/providers/openai'
import { BudgetGuard, BudgetRefusal, type Reservation } from './harness'
import { redactSecrets } from './liveRunner'
import { preflight } from './liveTrial'
import { GuardSpendGate } from './spendGateAdapter'
import { EVIDENCE_LIMITS, VARIANTS, evidencePagesFrom, packReplayRun, pickWriterCalls, replayVariant, variantRequest, type EvidencePage, type ReplayAnswer, type VariantSpec, type WriterPick } from './writerReplay'
import type { WriterCaptureFile } from './writerCapture'

export const REPLAY_CAPTURE_ENV = 'BENCH_REPLAY_CAPTURE'
export const REPLAY_VARIANT_ENV = 'BENCH_REPLAY_VARIANT'
export const REPLAY_EVIDENCE_DIR_ENV = 'BENCH_REPLAY_EVIDENCE_DIR'
/** The replay's own ceilings (Owner, 28/10): never above these whatever the launcher is given. */
export const REPLAY_MAX_RUN_CAP_USD = '0.30'
export const REPLAY_MAX_TURN_CAP_USD = '0.10'
/** The only model a replay may use: the one the code's price table knows. */
export const REPLAY_PRICED_MODEL = 'gpt-6-luna'
const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const TURN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

type Env = Record<string, string | undefined>
type Body = Record<string, unknown> & { model?: string; messages?: Array<{ role?: string; content?: unknown }>; tools?: unknown[] }

export const isReplayRequested = (env: Env): boolean => (env[REPLAY_VARIANT_ENV] ?? '') !== '' || (env[REPLAY_CAPTURE_ENV] ?? '') !== ''
export const variantSpecOf = (id: string | undefined): VariantSpec | null => VARIANTS.find(v => v.id === id) ?? null

/** Pure. A part of a message that is not plain text (an image, a file, an audio part...) cannot be bounded by its bytes: such a request is refused before it is priced. */
export function unboundedPartReason(body: Body): string | null {
  for (const m of body.messages ?? []) {
    if (!Array.isArray(m.content)) continue
    for (const p of m.content as Array<{ type?: unknown }>) if (p?.type !== 'text') return `a message part of type ${typeof p?.type === 'string' ? p.type.slice(0, 20) : '?'} cannot be bounded by its size`
  }
  return null
}

export interface ReplayPlan {
  variant: VariantSpec
  captureFile: string
  captureSha256: string
  capture: WriterCaptureFile
  picks: WriterPick[]
  /** Picks that will be sent (a turn without a writer call is reported, never sent). */
  sendable: number
  models: string[]
  efforts: string[]
  evidenceDir: string | null
}

export interface ReplayDeps { readText?: (path: string) => string; readBytes?: (path: string) => Uint8Array }

/**
 * Pure apart from reading the capture (and the evidence folder for X variants). Every replay-specific reason AT ONCE, and the plan when the capture could be read. The capture's text is never put in a reason.
 */
export function replayCheck(env: Env, deps: ReplayDeps = {}): { reasons: string[]; plan: ReplayPlan | null } {
  const readBytes = deps.readBytes ?? ((p: string) => readFileSync(p))
  const readText = deps.readText ?? ((p: string) => readFileSync(p, 'utf8'))
  const reasons: string[] = []
  if (env.BENCH_TRIAL_MODE !== 'dev-multi') reasons.push('a replay needs BENCH_TRIAL_MODE=dev-multi (the extension mode, like the run that made the capture)')
  const variant = variantSpecOf(env[REPLAY_VARIANT_ENV])
  if (!variant) reasons.push(`${REPLAY_VARIANT_ENV} must be exactly one of ${VARIANTS.map(v => v.id).join(', ')}`)
  const runCap = capToScaled(env.BENCH_SPEND_RUN_CAP_USD)
  if (runCap === null || runCap > capToScaled(REPLAY_MAX_RUN_CAP_USD)!) reasons.push(`a replay's run cap must be at most ${REPLAY_MAX_RUN_CAP_USD} USD`)
  // (the per-turn cap's ceiling, REPLAY_MAX_TURN_CAP_USD, is the bench maximum: the preflight above already refuses a higher one)
  const file = (env[REPLAY_CAPTURE_ENV] ?? '').trim()
  let plan: ReplayPlan | null = null
  if (file === '') reasons.push(`${REPLAY_CAPTURE_ENV} is not set`)
  else if (!/^D:[\\/]/i.test(file) || !/(^|[\\/])capture-\d+\.json$/.test(file)) reasons.push(`${REPLAY_CAPTURE_ENV} must be a capture-<n>.json file on drive D`)
  else {
    try {
      const bytes = readBytes(file)
      const capture = JSON.parse(Buffer.from(bytes).toString('utf8')) as WriterCaptureFile
      if (capture?.kind !== 'tappy-writer-capture' || capture.version !== 1 || !Array.isArray(capture.calls)) reasons.push('the capture file is not a writer capture (kind / version)')
      else {
        const picks = pickWriterCalls(capture)
        const sendable = picks.filter(p => p.n !== null)
        const bad = sendable.flatMap(p => p.n === null ? [] : [
          ...(TURN_ID.test(p.turn) ? [] : [`turn id ${JSON.stringify(p.turn.slice(0, 12))} is not a plain identifier`]),
          ...(p.body.model === REPLAY_PRICED_MODEL ? [] : [`${p.turn}: the writer call's model is not exactly ${REPLAY_PRICED_MODEL} (the price table knows no other)`]),
          ...(unboundedPartReason(p.body) ? [`${p.turn}: ${unboundedPartReason(p.body)}`] : []),
        ])
        reasons.push(...bad)
        if (sendable.length === 0) reasons.push('the capture has no turn with a writer call')
        const models = [...new Set(sendable.map(p => (p.n === null ? '' : String(p.body.model ?? '?'))))]
        const efforts = [...new Set(sendable.map(p => (p.n === null ? '' : typeof p.body.reasoning_effort === 'string' ? p.body.reasoning_effort : 'unset')))]
        const evidenceDir = (env[REPLAY_EVIDENCE_DIR_ENV] ?? '').trim()
        if (variant?.evidence) {
          if (evidenceDir === '' || !/^D:[\\/]/i.test(evidenceDir)) reasons.push(`${REPLAY_EVIDENCE_DIR_ENV} must be a folder on drive D (the variant adds outside evidence)`)
          else {
            const missing = sendable.filter(p => { try { return evidencePagesOfText(readText(evidenceFile(evidenceDir, p.turn))).length === 0 } catch { return true } }).map(p => p.turn)
            if (missing.length) reasons.push(`no usable outside evidence for turn(s): ${missing.join(', ')} (a variant with evidence is never run on part of the turns)`)
          }
        } else if (evidenceDir !== '') reasons.push(`${REPLAY_EVIDENCE_DIR_ENV} is set but the variant ${variant?.id ?? '?'} takes no evidence`)
        if (variant) plan = { variant, captureFile: file, captureSha256: createHash('sha256').update(bytes).digest('hex'), capture, picks, sendable: sendable.length, models, efforts, evidenceDir: variant.evidence ? evidenceDir : null }
      }
    } catch (e) { reasons.push(`the capture file cannot be read as JSON (${e instanceof Error ? e.name : 'error'})`) }
  }
  return { reasons: [...new Set(reasons)], plan }
}

export const evidenceFile = (dir: string, turn: string): string => `${dir.replace(/[\\/]+$/, '')}/evidence-${turn}.json`
/** Pure. The pages of one evidence file's text (one byte-order mark dropped: a Windows editor may add it). Throws on text that is not JSON. */
export const evidencePagesOfText = (text: string): EvidencePage[] => evidencePagesFrom(JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text))

export interface ReplayInput {
  env: Env
  /** The network the wrapper forwards the allowed request to. Default: the global fetch at the time of the call. */
  fetchImpl?: typeof fetch
  readText?: (path: string) => string
  readBytes?: (path: string) => Uint8Array
  writeText?: (path: string, text: string) => void
  repoRoot?: string
  execArgv?: readonly string[]
  now?: () => number
  /** 'deny' (the real run): the network is not given back. 'restore' (tests). */
  afterTrial?: 'restore' | 'deny'
  /** Milliseconds one request may take (default 150 000: a reasoning variant is slow). */
  requestTimeoutMs?: number
}

export interface ReplaySummary {
  turnOk: boolean
  trialClean: boolean
  variant: string
  model: string
  efforts: string[]
  turnsInCapture: number
  replayed: number
  notReplayed: number
  answered: number
  emptyAnswers: string[]
  truncated: string[]
  totalChars: number
  evidenceChars: number
  usd: number | null
  llmRequests: number
  hostRequests: Record<string, number>
  hostsBlocked: string[]
  lateBlocked: string[]
  refusals: number
  problems: string[]
  warnings: string[]
  captureSha256: string
  resultPath: string | null
  budget: { turnCapUsd: number; runCapUsd: number }
}
export type ReplayOutcome = { kind: 'refused'; reasons: string[] } | { kind: 'ran'; summary: ReplaySummary }

/** Pure. One `LanguageModelV1` that sends the RAW request body it is given: the metered model prices what it receives, so everything that travels is passed in the call options the meter counts. */
function rawChatModel(modelId: string, post: (body: Body) => Promise<{ text: string; finish: string | null; usage: Record<string, unknown> | null }>): LanguageModelV1 {
  return {
    specificationVersion: 'v1', provider: 'openai.chat', modelId, defaultObjectGenerationMode: 'json', supportsStructuredOutputs: false, supportsImageUrls: false,
    async doGenerate(opts) {
      const rest = ((opts.providerMetadata as { replay?: { rest?: Record<string, unknown> } } | undefined)?.replay?.rest ?? {}) as Record<string, unknown>
      const tools = opts.mode.type === 'regular' ? (opts.mode.tools as unknown[] | undefined) : undefined
      // the cap SENT is the cap the meter PRICED (opts.maxTokens, set and limited by the meter); `max_tokens` never goes out
      const body: Body = { ...rest, model: modelId, messages: opts.prompt as never, ...(tools && tools.length ? { tools } : {}), max_completion_tokens: opts.maxTokens }
      delete body.max_tokens
      const r = await post(body)
      const u = (r.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } | null; completion_tokens_details?: { reasoning_tokens?: number } | null }
      const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined
      const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined
      // priced like the product's adapter: the uncached input at the cache-write rate (never an under-count); no usage = no cost = the gate stops the run
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0
      const cost = promptTokens === undefined || completionTokens === undefined ? null
        : openaiCallCost(modelId, { prompt_tokens: promptTokens, completion_tokens: completionTokens, prompt_tokens_details: { cached_tokens: cached, cache_write_tokens: Math.max(0, promptTokens - cached) }, completion_tokens_details: { reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? 0 } })
      return {
        text: r.text, finishReason: r.finish === 'length' ? 'length' : 'stop', usage: { promptTokens: promptTokens ?? Number.NaN, completionTokens: completionTokens ?? Number.NaN },
        rawCall: { rawPrompt: null, rawSettings: {} },
        ...(cost ? { providerMetadata: { tappy: { cost: cost as unknown as Record<string, unknown> } } as never } : {}),
      }
    },
    async doStream() { throw new Error('replay: streaming is not used') },
  }
}

export async function runReplayTrial(input: ReplayInput): Promise<ReplayOutcome> {
  const { env } = input
  const afterTrial = input.afterTrial ?? 'restore'
  const originalFetch = globalThis.fetch
  const originalNode = { httpsRequest: https.request, httpsGet: https.get, httpRequest: http.request, httpGet: http.get }
  const setNode = (r: typeof https.request, g: typeof https.get, hr: typeof http.request, hg: typeof http.get): void => { https.request = r; https.get = g; http.request = hr; http.get = hg; syncBuiltinESMExports() }
  const restoreNetwork = (): void => { globalThis.fetch = originalFetch; setNode(originalNode.httpsRequest, originalNode.httpsGet, originalNode.httpRequest, originalNode.httpGet) }
  const late: string[] = []
  const blocked = new Set<string>()
  const label = (url: string): string => { try { const u = new URL(url); return `${u.hostname}${u.pathname}` } catch { return '(unparseable)' } }
  const denyNetwork = (): void => {
    globalThis.fetch = (async (req: unknown) => { const l = redactSecrets(label(typeof req === 'string' ? req : req instanceof URL ? req.href : req instanceof Request ? req.url : ''), env); late.push(l); throw new Error(`replay: the run is closed - a request to ${l} was blocked before it was sent`) }) as typeof fetch
    const deny = function (): never { late.push('(node:http/https)'); throw new Error('replay: the run is closed - a node:http(s) request was blocked before it was sent') }
    setNode(deny as never, deny as never, deny as never, deny as never)
  }
  const refuse = (reasons: string[]): ReplayOutcome => ({ kind: 'refused', reasons: reasons.map(r => redactSecrets(r, env)) })

  // 1. the SAME preflight a normal run has (nothing weakened), then the replay's own conditions: nothing is read further, nothing is sent until all pass
  const pre = preflight(env, input.repoRoot, input.execArgv)
  if (pre.reasons.length || !pre.caps) return refuse(pre.reasons.length ? pre.reasons : ['the caps are not valid'])
  const chk = replayCheck(env, { readText: input.readText, readBytes: input.readBytes })
  if (chk.reasons.length || !chk.plan) return refuse(chk.reasons.length ? chk.reasons : ['no replay plan'])
  const plan = chk.plan
  if ((env.OPENAI_API_KEY ?? '').trim() === '') return refuse(['OPENAI_API_KEY is UNSET'])
  const readText = input.readText ?? ((p: string) => readFileSync(p, 'utf8'))
  const evidenceOf = (turn: string): readonly EvidencePage[] => (plan.evidenceDir ? evidencePagesOfText(readText(evidenceFile(plan.evidenceDir, turn))) : [])

  // 2. the wrapped network: ONE endpoint, POST, https, default port, no dispatcher, never a redirect
  const forward = input.fetchImpl ?? originalFetch
  const sent: Record<string, number> = {}
  let closed = false
  globalThis.fetch = (async (req: unknown, init?: RequestInit) => {
    const url = typeof req === 'string' ? req : req instanceof URL ? req.href : req instanceof Request ? req.url : '(unparseable)'
    if (closed) { const l = redactSecrets(label(url), env); late.push(l); throw new Error(`replay: the run is closed - a request to ${l} was blocked before it was sent`) }
    const method = String(init?.method ?? (req instanceof Request ? req.method : 'GET')).toUpperCase()
    if (url !== CHAT_URL || method !== 'POST' || (init && typeof init === 'object' && 'dispatcher' in init)) {
      const l = redactSecrets(url === CHAT_URL ? `${label(url)} (method ${method}${init && 'dispatcher' in init ? ', dispatcher' : ''})` : label(url), env)
      blocked.add(l)
      throw new Error(`replay: ${l} is not allowed (blocked before it was sent)`)
    }
    sent['api.openai.com'] = (sent['api.openai.com'] ?? 0) + 1
    return forward(req as never, { ...(init ?? {}), redirect: 'manual' })
  }) as typeof fetch
  const denyNode = function (): never { blocked.add('(node:http/https)'); throw new Error('replay: a node:http(s) request is not allowed (blocked before it was sent)') }
  setNode(denyNode as never, denyNode as never, denyNode as never, denyNode as never)

  // 3. the run: one writer call per turn, through the metered model and the spend gate, like the bench runner books a turn
  const now = input.now ?? Date.now
  const runGuard = new BudgetGuard(pre.caps.runUsd)
  const gates: GuardSpendGate[] = []
  const problems: string[] = []
  const warnings: string[] = []
  const redirects: string[] = []
  const key = env.OPENAI_API_KEY!.trim()
  const timeoutMs = input.requestTimeoutMs ?? 150_000
  const post = async (body: Body): Promise<{ text: string; finish: string | null; usage: Record<string, unknown> | null }> => {
    const res = await globalThis.fetch(CHAT_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    if (res.status >= 300 && res.status < 400) { redirects.push(String(res.status)); throw new Error(`replay: HTTP ${res.status} (a redirect is never followed)`) }
    if (!res.ok) throw new Error(`replay: HTTP ${res.status}`)
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>; usage?: Record<string, unknown> }
    const c = json.choices?.[0]
    return { text: typeof c?.message?.content === 'string' ? c.message.content : '', finish: typeof c?.finish_reason === 'string' ? c.finish_reason : null, usage: json.usage ?? null }
  }
  const send = async (request: Body, meta: { turn: string; variant: string }): Promise<{ text: string; usd: number | null; finish: string | null }> => {
    // the run guard refuses once a turn's cost was unknown (it is BLOCKED for good) and once the cap would be exceeded
    let runRes: Reservation
    try { runRes = runGuard.reserve(pre.caps!.turnUsd) } catch (e) {
      if (e instanceof BudgetRefusal) throw new Error(`the run cap would be exceeded or the run is stopped: ${e.message}`)
      throw e
    }
    const gate = new GuardSpendGate(new BudgetGuard(pre.caps!.turnUsd))
    gates.push(gate)
    const { messages, tools, max_completion_tokens, max_tokens, model, ...rest } = request as Body & { max_completion_tokens?: unknown; max_tokens?: unknown }
    const asked = typeof max_completion_tokens === 'number' ? max_completion_tokens : typeof max_tokens === 'number' ? max_tokens : undefined
    let finish: string | null = null
    let thrown: unknown = null
    let text = ''
    const base = rawChatModel(String(model), async b => { const r = await post(b); finish = r.finish; return r })
    const metered = meteredModel(base, `replay:${meta.variant}`)
    try {
      const r = await runWithSpendGate(gate, () => metered.doGenerate({
        inputFormat: 'messages', mode: { type: 'regular', ...(tools && tools.length ? { tools: tools as never } : {}) }, prompt: (messages ?? []) as never,
        ...(asked !== undefined ? { maxTokens: asked } : {}), providerMetadata: { replay: { rest } } as never,
      }))
      text = r.text ?? ''
    } catch (e) { thrown = e }
    gate.close()
    const blockedBy = gate.guard.blockedBy
    const open = gate.guard.openReservedUsd
    const known = gate.guard.knownUsd
    const costKnown = thrown === null && blockedBy === null && open === 0 && known !== null
    if (costKnown) runGuard.settle(runRes, known!)
    else runGuard.markUnknown(runRes)
    if (thrown !== null) throw new Error(redactSecrets(thrown instanceof Error ? thrown.message : String(thrown), env))
    return { text, usd: costKnown ? known! : null, finish }
  }

  const stamp = now()
  let answers: ReplayAnswer[] = []
  try {
    answers = await replayVariant(plan.picks, plan.variant, send as never, { evidence: evidenceOf })
  } catch (e) { problems.push(`the replay stopped: ${redactSecrets(e instanceof Error ? e.message : String(e), env)}`) } finally {
    closed = true
    if (afterTrial === 'deny') denyNetwork(); else restoreNetwork()
  }

  // 4. the books and the result
  const sentCount = sent['api.openai.com'] ?? 0
  const llm = gates.reduce((a, g) => a + g.count('llm:'), 0)
  const refusals = gates.reduce((a, g) => a + g.refusals, 0)
  if (sentCount !== llm) warnings.push(`LLM request count differs: the wrapper sent ${sentCount}, the ledger booked ${llm}`)
  if (refusals > 0) problems.push(`${refusals} paid call(s) refused by the gate`)
  const sendable = answers.filter(a => !a.error?.startsWith('not replayed'))
  for (const a of sendable) if (a.error) problems.push(`${a.turn}: ${a.error}`)
  const unknownCost = sendable.filter(a => a.usd === null)
  if (unknownCost.length) problems.push(`cost not known for: ${unknownCost.map(a => a.turn).join(', ')}`)
  if (blocked.size) problems.push(`blocked before being sent: ${[...blocked].join(', ')}`)
  const costKnownAll = sendable.length > 0 && unknownCost.length === 0
  const usd = costKnownAll ? Math.round(sendable.reduce((s, a) => s + (a.usd ?? 0), 0) * 1e6) / 1e6 : null
  const model = plan.models.length === 1 ? plan.models[0]! : plan.models.join('+')
  const evidenceChars = plan.evidenceDir ? plan.picks.reduce((s, p) => { try { const m = p.n === null ? null : variantRequest(p.body, plan.variant, { evidence: evidenceOf(p.turn) }); const last = (m?.messages as Array<{ content?: unknown }> | undefined)?.slice(-1)[0]; return s + (typeof last?.content === 'string' ? last.content.length : 0) } catch { return s } }, 0) : 0
  const packed = packReplayRun(answers, { variant: plan.variant.id, captureFile: plan.captureFile.replace(/^.*[\\/]/, ''), questionSha256: (() => { try { return createHash('sha256').update(Buffer.from((input.readText ?? ((p: string) => readFileSync(p, 'utf8')))((env.BENCH_TRIAL_QUESTION_FILE ?? '').trim()), 'utf8')).digest('hex') } catch { return null } })(), model, at: new Date(stamp).toISOString() })
  const extras = {
    captureSha256: plan.captureSha256, effort: plan.variant.effort ?? 'as captured', capturedEfforts: plan.efforts, note: plan.variant.note, evidence: plan.variant.evidence, evidenceChars,
    evidenceLimits: plan.variant.evidence ? EVIDENCE_LIMITS : null, caps: { turnUsd: pre.caps.turnUsd, runUsd: pre.caps.runUsd }, hostRequests: sent, llmRequests: llm, refusals, problems, warnings,
  }
  let resultPath: string | null = null
  try {
    const outDir = env.BENCH_TRIAL_OUT_DIR!.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    resultPath = `${outDir}/bench-${stamp}.json`
    ;(input.writeText ?? ((p: string, t: string) => writeFileSync(p, t, 'utf8')))(resultPath, JSON.stringify({ ...packed, ...extras }, null, 2))
  } catch (e) { resultPath = null; problems.push(`the result could not be written: ${redactSecrets(e instanceof Error ? e.message : String(e), env)}`) }
  const emptyAnswers = answers.filter(a => !a.error && (a.text ?? '') === '').map(a => a.turn)
  const truncated = answers.filter(a => a.finish === 'length').map(a => a.turn)
  const turnOk = sendable.length > 0 && problems.length === 0 && costKnownAll
  const summary: ReplaySummary = {
    turnOk, trialClean: turnOk && blocked.size === 0 && late.length === 0 && redirects.length === 0 && warnings.length === 0 && resultPath !== null,
    variant: plan.variant.id, model, efforts: plan.variant.effort ? [plan.variant.effort] : plan.efforts, turnsInCapture: plan.picks.length, replayed: sendable.length, notReplayed: answers.length - sendable.length,
    answered: answers.filter(a => (a.text ?? '') !== '').length, emptyAnswers, truncated, totalChars: packed.summary.totalChars, evidenceChars, usd, llmRequests: llm, hostRequests: sent,
    hostsBlocked: [...blocked].sort(), lateBlocked: [...late], refusals, problems: problems.map(p => redactSecrets(p, env)), warnings: warnings.map(w => redactSecrets(w, env)),
    captureSha256: plan.captureSha256, resultPath, budget: { turnCapUsd: pre.caps.turnUsd, runCapUsd: pre.caps.runUsd },
  }
  return { kind: 'ran', summary }
}

/** The summary as text. Same words the launcher looks for (`turnOk=true`, `trialClean=true`, `NOT CLEAN`). Holds no key and no question or answer text. */
export function formatReplaySummary(s: ReplaySummary): string {
  const lines = [
    'REPLAY SUMMARY (cost figures are ESTIMATES: tokens × the price table in the code - not the provider invoice)',
    `turnOk=${s.turnOk} trialClean=${s.trialClean}`,
  ]
  if (!s.trialClean) lines.push(`NOT CLEAN: this is NOT a complete replay result${s.hostsBlocked.length ? ` - blocked: ${s.hostsBlocked.join(', ')}` : ''}${s.lateBlocked.length ? ` - late requests: ${[...new Set(s.lateBlocked)].join(', ')}` : ''}${s.warnings.length ? ` - warnings: ${s.warnings.join(' | ')}` : ''}${s.problems.length ? ` - problems: ${s.problems.join(' | ')}` : ''}`)
  lines.push(
    `variant=${s.variant} model=${s.model} reasoning_effort=${s.efforts.join(',')} | turns in capture ${s.turnsInCapture}: replayed ${s.replayed}, not replayed ${s.notReplayed}, answered ${s.answered}`,
    `costState=${s.usd === null ? 'unknown' : 'known'} usd(estimate)=${s.usd} | ledger: llm=${s.llmRequests} refusals=${s.refusals} | wrappers sent: ${JSON.stringify(s.hostRequests)}`,
    `answer characters: total ${s.totalChars}${s.evidenceChars ? ` | outside evidence characters sent: ${s.evidenceChars}` : ''}${s.emptyAnswers.length ? ` | EMPTY answers: ${s.emptyAnswers.join(', ')}` : ''}${s.truncated.length ? ` | cut at the output cap (finish=length): ${s.truncated.join(', ')}` : ''}`,
    `caps: turn ${s.budget.turnCapUsd} USD, run ${s.budget.runCapUsd} USD (ESTIMATES) | capture sha256=${s.captureSha256} | result=${s.resultPath ?? '-'}`,
  )
  return lines.join('\n')
}

/**
 * PHASE 8 M0 — AGENT EVAL (WEB). Opt-in, paid: AGENT_EVAL=1. Never against UAT or production.
 *
 *   AGENT_EVAL=1 AGENT_EVAL_MODES=legacy,agent1 npx vitest run scripts/agent-eval/agentEval.test.ts
 *   AGENT_EVAL=1 AGENT_EVAL_MODES=agent1 AGENT_EVAL_ONLY=P-1,L-1 npx vitest run scripts/agent-eval/agentEval.test.ts
 *
 * Modes: `legacy` = TAPPY_AGENT unset (what production runs today — verified 08/10 by env NAME listing), `agent1` = the Phase 7
 * bounded agent, `agent2` = the Phase 8 runtime (once it exists). Every mode runs the SAME scenarios (scenarios.json) through the
 * REAL `POST` of src/app/api/chat/route.ts with the REAL model (Luna, production defaults) and the real tool modules.
 *
 * Reuses the offline replay infrastructure (scripts/consult/replay): Supabase/auth/age/rate-limit mocks, the fetch stub
 * (Serper record/replay into the SHARED recordings folder; OpenAI passes through; every other host gets `{}` locally — so
 * weather / gold / RSS / page fetches return nothing here, which the report states), and the data-stream parser.
 * The pre-guard model text is captured with the golden-capture header (non-production sink) to measure what the guards cut.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { installReplayFetch, netSnapshot, netDelta, setSerperInjection } from '../consult/replay/lib/serperReplay'
import { parseDataStream } from '../consult/replay/lib/stream'
import { evaluateTurn, keptRatio, outputKind, type Scenario } from './lib/checks'
import { summarize, markdown, type EvalRow } from './lib/report'

const ON = process.env.AGENT_EVAL === '1'
const USER_ID = '00000000-0000-4000-8000-0000000a0e01'
const HERE = join('scripts', 'agent-eval')
const RECORDINGS = join('scripts', 'consult', 'replay', 'recordings')
const TURN_TIMEOUT_MS = Number(process.env.AGENT_EVAL_TURN_TIMEOUT_MS) || 150_000
const AUDIT_ENV = process.env.AGENT_EVAL_ENV_FILE || 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/.env.local'
const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'
const OPENAI_KEY_FILE = process.env.AGENT_EVAL_OPENAI_KEY_FILE || 'D:/TappyAI-backups/openai-key.txt'

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b,
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  const evidence = new Map<string, unknown>()
  const rpc = (fn: string, args: { p_id?: string; p_evidence?: unknown }) => {
    if (fn === 'decision_evidence_save' && args?.p_id) { evidence.set(args.p_id, JSON.parse(JSON.stringify(args.p_evidence ?? null))); return Promise.resolve({ data: null, error: null }) }
    if (fn === 'decision_evidence_load' && args?.p_id) return Promise.resolve({ data: evidence.get(args.p_id) ?? null, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  const providers = { rows: [] as unknown[] }
  const providersBuilder = (): any => { const b: any = { select: () => b, then: (r: any) => r({ data: providers.rows, error: null }) }; return b }
  return { client: { from: (table: string) => table === 'commerce_providers' ? providersBuilder() : builder(), rpc }, providers }
})
h.providers.rows = (JSON.parse(readFileSync(join('scripts', 'consult', 'replay', 'fixtures', 'commerceProviders.json'), 'utf8')) as { rows: unknown[] }).rows

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: USER_ID }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

const USER_LOCATION = { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }
type Mode = 'legacy' | 'agent1' | 'agent2'
const MODE_FLAG: Record<Mode, string | undefined> = { legacy: undefined, agent1: '1', agent2: '2' }

/** Production defaults for the AI flags (none of them is set in Vercel production — env NAME listing 08/10), minus the test-setup pins. */
function prepareEnv(): void {
  if (!existsSync(AUDIT_ENV)) throw new Error(`REFUSING: audit env file not found (${AUDIT_ENV})`)
  const env: Record<string, string> = {}
  for (const raw of readFileSync(AUDIT_ENV, 'utf8').split(/\r?\n/)) {
    const l = raw.trim(); const i = l.indexOf('=')
    if (l && !l.startsWith('#') && i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  if (!String(env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(AUDIT_REF)) throw new Error('REFUSING: env file is not the AUDIT env')
  if (!env.SERPER_API_KEY) throw new Error('REFUSING: SERPER_API_KEY missing from the audit env file')
  process.env.SERPER_API_KEY = env.SERPER_API_KEY
  if (!existsSync(OPENAI_KEY_FILE)) throw new Error('REFUSING: OpenAI key file not found')
  process.env.OPENAI_API_KEY = readFileSync(OPENAI_KEY_FILE, 'utf8').trim()
  for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_URL', 'KV_REST_API_READ_ONLY_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'ANTHROPIC_API_KEY']) delete process.env[k]
  for (const k of Object.keys(process.env)) if (/^(LLM_|CONSULT_LUNA|HAIKU_FALLBACK$|SNIPPET_PRICE_GUARD_V2$|MEDIA_PLACEMENT_V2$|SERPER_CACHE_V2$)/.test(k)) delete process.env[k]
  // The vitest setup pins these two OFF for old suites; production default is ON.
  process.env.CONSULT_V2 = '1'
  process.env.CONSULTATIVE_V1 = '1'
  process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'
  process.env.CCP_ATTRIBUTION_SECRET = randomBytes(24).toString('hex')
}

function captureConsole() {
  const events: Array<Record<string, unknown>> = []
  const errors: string[] = []
  const keep = (args: unknown[], isErr: boolean) => {
    const s = args.map(a => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : (() => { try { return JSON.stringify(a) } catch { return String(a) } })())).join(' ')
    if (s.startsWith('{"type":"tappyai_')) { try { events.push(JSON.parse(s)); return } catch { /* fall through */ } }
    if (isErr) errors.push(s.slice(0, 400))
  }
  const spies = (['log', 'info', 'warn', 'error'] as const).map(m => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => keep(a, m === 'error')))
  return { events, errors, restore: () => spies.forEach(s => s.mockRestore()) }
}

function guardChanged(e: Record<string, unknown>): boolean {
  return Object.entries(e).some(([k, v]) => /removed|rewritten|dropped|cut|cleaned|trimmed|replaced|stripped/i.test(k) && k !== 'chars_kept' && ((typeof v === 'number' && v > 0) || (Array.isArray(v) && v.length > 0) || v === true))
}

describe.skipIf(!ON)('Phase 8 agent eval — chat route, real Luna, Serper record/replay', () => {
  let uninstall: (() => void) | null = null
  let POST: (req: never) => Promise<Response>
  let resetQuota: () => void
  let captureDir = ''

  beforeAll(async () => {
    prepareEnv()
    uninstall = installReplayFetch(RECORDINGS)
    ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST })
    ;({ __resetAiQuestionQuotaLocal: resetQuota } = await import('@/lib/ai/quota/aiQuestionQuota'))
    ;({ GOLDEN_CAPTURE_DIR: captureDir } = await import('@/lib/ai/goldenCapture'))
  }, 120_000)
  afterAll(() => { uninstall?.() })

  const post = async (messages: Array<{ role: string; content: string }>, chatSessionId: string, captureId: string) => {
    const req = {
      url: 'http://localhost/api/chat',
      nextUrl: new URL('http://localhost/api/chat'),
      headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', 'accept-language': 'vi', 'x-tappy-golden-capture': captureId }),
      json: () => Promise.resolve({ messages, userLocation: USER_LOCATION, chatSessionId }),
      signal: undefined,
    }
    const t0 = Date.now()
    const res = await POST(req as never)
    let raw = '', ttftMs: number | null = null
    const dec = new TextDecoder()
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        raw += dec.decode(value, { stream: true })
        if (ttftMs === null && /(?:^|\n)0:"(?!")/.test(raw)) ttftMs = Date.now() - t0
      }
      raw += dec.decode()
    }
    return { status: res.status, raw, ttftMs }
  }

  async function runScenario(mode: Mode, s: Scenario, outDir: string, rows: EvalRow[]) {
    const messages: Array<{ role: string; content: string }> = []
    const chatSessionId = randomUUID()
    for (let i = 0; i < s.turns.length; i++) {
      const t = s.turns[i]
      messages.push({ role: 'user', content: t.text })
      resetQuota()
      const net0 = netSnapshot()
      const cap = captureConsole()
      const captureId = `p8eval-${mode}-${s.id}-t${i + 1}-${Date.now()}`
      const t0 = Date.now()
      let raw = '', crash: string | undefined, ttftMs: number | null = null
      try {
        const r = await Promise.race([
          post([...messages], chatSessionId, captureId),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`turn timeout ${TURN_TIMEOUT_MS} ms`)), TURN_TIMEOUT_MS)),
        ])
        raw = r.raw; ttftMs = r.ttftMs
        if (r.status !== 200) crash = `HTTP ${r.status}: ${raw.slice(0, 200)}`
      } catch (e) {
        crash = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      } finally { cap.restore() }
      const ms = Date.now() - t0
      const p = parseDataStream(raw)
      const capFile = join(captureDir, `${captureId}.txt`)
      const rawText = existsSync(capFile) ? readFileSync(capFile, 'utf8') : null
      const tools = p.tools.map(x => ({ name: x.toolName ?? '?', args: x.args }))
      const obs = { text: p.text, rawText, tools, annotations: p.annotations, crashed: !!crash || p.errors.length > 0 }
      const checks = evaluateTurn(t.expect, obs)
      const trace = cap.events.find(e => e.type === 'tappyai_agent_trace') as Record<string, unknown> | undefined
      rows.push({
        mode, scenario: s.id, category: s.category, turn: i + 1, sent: t.text,
        checks, pass: checks.every(c => c.pass),
        output: outputKind(obs), tools: tools.map(x => x.name),
        modelCalls: typeof trace?.model_calls === 'number' ? trace.model_calls : null,
        stop: typeof trace?.stop === 'string' ? trace.stop : null,
        ms, ttftMs,
        usd: p.turn?.usd ?? 0, tokensIn: p.turn?.tokensIn ?? 0, tokensOut: p.turn?.tokensOut ?? 0,
        serperCalls: p.turn?.serperCalls ?? 0, serperReal: netDelta(net0).serperReal,
        fellBack: p.turn?.fellBack ?? false,
        guardsChanged: cap.events.filter(e => e.type === 'tappyai_guard' && guardChanged(e)).map(e => String(e.guard)),
        kept: keptRatio(rawText, p.text),
        reply: p.text, ...(crash ? { crash } : {}),
      })
      writeFileSync(join(outDir, 'raw', `${mode}-${s.id}-t${i + 1}.json`), JSON.stringify({ sent: t.text, rawText, parsed: { ...p, text: undefined }, text: p.text, logEvents: cap.events, logErrors: cap.errors }, null, 1))
      messages.push({ role: 'assistant', content: p.text })
      if (crash && !p.text) break
    }
  }

  const modes = (process.env.AGENT_EVAL_MODES ?? 'legacy,agent1').split(',').map(x => x.trim()).filter((x): x is Mode => x in MODE_FLAG)
  it(`modes: ${modes.join(', ')}`, async () => {
    const all = (JSON.parse(readFileSync(join(HERE, 'scenarios.json'), 'utf8')) as { scenarios: Scenario[] }).scenarios
    const only = (process.env.AGENT_EVAL_ONLY ?? '').split(',').map(x => x.trim()).filter(Boolean)
    const scenarios = only.length ? all.filter(s => only.includes(s.id)) : all
    expect(scenarios.length).toBeGreaterThan(0)
    const outDir = join(HERE, 'out', `eval-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    mkdirSync(join(outDir, 'raw'), { recursive: true })
    const rows: EvalRow[] = []
    const net0 = netSnapshot()
    const flush = () => {
      const s = summarize(rows)
      const meta = { modes, scenarios: scenarios.length, only: only.length ? only : null, net: netDelta(net0), at: new Date().toISOString() }
      writeFileSync(join(outDir, 'results.json'), JSON.stringify({ meta, summary: s, rows }, null, 1))
      writeFileSync(join(outDir, 'summary.md'), markdown(rows, s, meta))
      return s
    }
    for (const mode of modes) {
      if (MODE_FLAG[mode] === undefined) delete process.env.TAPPY_AGENT; else process.env.TAPPY_AGENT = MODE_FLAG[mode]
      for (const s of scenarios) {
        process.env.REPLAY_SERPER_CONV = `${mode}-${s.id}`
        setSerperInjection(s.inject ?? null)
        try { await runScenario(mode, s, outDir, rows) } finally { setSerperInjection(null) }
        flush()
      }
    }
    delete process.env.TAPPY_AGENT
    flush()
    process.stdout.write(`\n[agent-eval] out: ${outDir}\n`)
  }, 6 * 60 * 60 * 1000)
})

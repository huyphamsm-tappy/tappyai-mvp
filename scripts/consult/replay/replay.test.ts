/**
 * OFFLINE REPLAY of the chat route (owner rule 2026-09-29: fix and test by offline replay — never
 * against UAT or production). Opt-in: REPLAY=1. See ./README.md.
 *
 *   REPLAY=1 REPLAY_SUITE=scenarios REPLAY_ONLY=ENT-1,SPA-1 npx vitest run scripts/consult/replay
 *
 * The REAL `POST` from src/app/api/chat/route.ts runs every turn, with the REAL model (Anthropic,
 * key from the AUDIT env file) and the REAL tool modules. Mocked exactly like
 * memoryDrift.route.test.ts / consultativeV1.route.test.ts: Supabase (server + admin), auth
 * (signed-in REPLAY_USER_ID), age (eligible), rate limit. No memory row. Quota is reset before each turn.
 * The network is the fetch stub in lib/serperReplay.ts: Serper record/replay, Anthropic passes
 * through, everything else gets `{}` locally.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** A guard event counts only when it CHANGED the reply (a removal / rewrite / drop), not when it merely ran. */
function guardChanged(e: Record<string, unknown>): boolean {
  return Object.entries(e).some(([k, v]) => /removed|rewritten|dropped|cut|cleaned|trimmed|moved|restored|stripped|replaced/i.test(k) && k !== 'chars_kept' && ((typeof v === 'number' && v > 0) || (Array.isArray(v) && v.length > 0) || v === true))
}
import { prepareReplayEnv, RUN_FLAGS } from './lib/env'
import { installReplayFetch, netSnapshot, netDelta, setSerperInjection } from './lib/serperReplay'
import { parseDataStream, toolRowCount, toolRowNames } from './lib/stream'
import { evaluateTurn, mainPickName, alternativeNames, shownNames } from './lib/criteria'
import { loadSuite, filterOnly, fillPlaceholders, SUITES, type SuiteName, type Conversation } from './lib/suites'
import { summarize, markdown, type TurnRow } from './lib/report'

const ON = process.env.REPLAY === '1'
const REPLAY_USER_ID = '00000000-0000-4000-8000-0000000a0001'
const HERE = join('scripts', 'consult', 'replay')
const RECORDINGS = join(HERE, 'recordings')
const TURN_TIMEOUT_MS = Number(process.env.REPLAY_TURN_TIMEOUT_MS) || 180_000

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      // No memory row, no profile row — a fresh signed-in user.
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b,
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  // Decision evidence (decision_evidence_save / _load) is kept in memory, as the audit DB keeps it: the web
  // client sends the last response's X-Decision-Evidence-Id back, and follow-up turns read the prior search.
  const evidence = new Map<string, unknown>()
  const rpc = (fn: string, args: { p_id?: string; p_evidence?: unknown }) => {
    if (fn === 'decision_evidence_save' && args?.p_id) { evidence.set(args.p_id, JSON.parse(JSON.stringify(args.p_evidence ?? null))); return Promise.resolve({ data: null, error: null }) }
    if (fn === 'decision_evidence_load' && args?.p_id) return Promise.resolve({ data: evidence.get(args.p_id) ?? null, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  // The runtime provider registry (which merchants ACCESSTRADE wraps) is the `commerce_providers` table on UAT /
  // production. An empty table here sent every DB-only campaign (Traveloka, Vietnam Airlines) out DIRECT — a
  // link production never emits (Q10). Its rows come from fixtures/commerceProviders.json (the audit DB copy).
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
vi.mock('@/lib/auth/getRequestUser', () => ({
  // A UUID like every real (or anonymous-guest) user, so commerce links go through /go/at as in production.
  getRequestUser: () => Promise.resolve({ user: { id: REPLAY_USER_ID }, supabase: h.client }),
}))
vi.mock('@/lib/security/rateLimit', () => ({
  rateLimit: () => ({ ok: true, retryAfter: 0 }),
  dailyRateLimit: () => ({ ok: true }),
  clientIp: () => '127.0.0.1',
}))
// NOT mocked: '@/lib/ai/llm' (the real model) and the tool modules (real tools, Serper replayed).

const USER_LOCATION = { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }

function suitesToRun(): SuiteName[] {
  const raw = (process.env.REPLAY_SUITE ?? '').trim()
  if (!raw) return []
  if (raw === 'all') return [...SUITES]
  return raw.split(',').map(s => s.trim()).filter((s): s is SuiteName => ([...SUITES, 'realTyping', 'injection', 'planHard'] as string[]).includes(s))
}

/** Route log lines worth keeping per turn (JSON lines with a tappyai_* type), plus errors. */
function captureConsole() {
  const events: Array<Record<string, unknown>> = []
  const errors: string[] = []
  const keep = (args: unknown[], isErr: boolean) => {
    const s = args.map(a => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : (() => { try { return JSON.stringify(a) } catch { return String(a) } })())).join(' ')
    if (s.startsWith('{"type":"tappyai_')) { try { events.push(JSON.parse(s)); return } catch { /* fall through */ } }
    if (isErr) errors.push(s.slice(0, 400))
  }
  const spies = [
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => keep(a, false)),
    vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => keep(a, false)),
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => keep(a, false)),
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => keep(a, true)),
  ]
  return { events, errors, restore: () => spies.forEach(s => s.mockRestore()) }
}

type Msg = { role: 'user' | 'assistant'; content: string }

describe.skipIf(!ON)('offline replay — chat route, real model, Serper record/replay', () => {
  let uninstall: (() => void) | null = null
  let POST: (req: never) => Promise<Response>
  let resetQuota: () => void

  beforeAll(async () => {
    prepareReplayEnv()
    uninstall = installReplayFetch(RECORDINGS)
    ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST })
    ;({ __resetAiQuestionQuotaLocal: resetQuota } = await import('@/lib/ai/quota/aiQuestionQuota'))
  }, 120_000)
  afterAll(() => { uninstall?.() })

  const post = async (messages: Msg[], chatSessionId: string) => {
    const req = {
      url: 'http://localhost/api/chat',
      nextUrl: new URL('http://localhost/api/chat'),
      headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': process.env.REPLAY_SURFACE || 'web', ...(process.env.REPLAY_CAPS ? { 'x-tappy-caps': process.env.REPLAY_CAPS } : {}), 'accept-language': 'vi' }),
      json: () => Promise.resolve({ messages, userLocation: USER_LOCATION, chatSessionId }),
      signal: undefined,
    }
    const t0 = Date.now()
    const res = await POST(req as never)
    // Time to first VISIBLE text (the first `0:` frame with content) — what the user waits for.
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
    return { status: res.status, raw, evidenceId: res.headers.get('X-Decision-Evidence-Id'), ttftMs }
  }

  async function runConversation(c: Conversation, outDir: string, rows: TurnRow[]) {
    const messages: Msg[] = []
    let lastPick: string | null = null, lastAlt: string | null = null
    const shown: string[] = []
    let evidenceId: string | null = null
    let flightThread = false
    // Like the web client (R14): one chatSessionId per conversation, sent on every turn; no decisionEvidenceId.
    const chatSessionId = randomUUID()
    for (let i = 0; i < c.turns.length; i++) {
      const t = c.turns[i]
      const { text: sent, unresolved } = fillPlaceholders(t.text, lastPick, lastAlt)
      messages.push({ role: 'user', content: sent })
      resetQuota()
      const netBefore = netSnapshot()
      const cap = captureConsole()
      const t0 = Date.now()
      let raw = '', status = 0, crash: string | undefined, ttftMs: number | null = null
      try {
        const r: { status: number; raw: string; evidenceId: string | null; ttftMs: number | null } = await Promise.race([
          post([...messages], chatSessionId),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`turn timeout ${TURN_TIMEOUT_MS} ms`)), TURN_TIMEOUT_MS)),
        ])
        raw = r.raw; status = r.status; ttftMs = r.ttftMs
        if (r.evidenceId) evidenceId = r.evidenceId
        if (status !== 200) crash = `HTTP ${status}: ${raw.slice(0, 300)}`
      } catch (e) {
        crash = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      } finally {
        cap.restore()
      }
      const ms = Date.now() - t0
      const net = netDelta(netBefore)
      const p = parseDataStream(raw)
      const errors = [...(crash ? [crash] : []), ...p.errors]
      const toolRows = toolRowCount(p.tools)
      if (p.tools.some(x => x.toolName === 'get_flight_prices')) flightThread = true
      const ev = evaluateTurn({ expect: t.expect, area: c.area, text: p.text, turn: p.turn, toolRows, shownBefore: [...shown], errors, flight: flightThread })
      const pick = mainPickName(p.text), alts = alternativeNames(p.text)
      rows.push({
        conv: c.id, area: c.area, turnIndex: i + 1, sent, unresolved, expect: t.expect, type: ev.type,
        server: p.turn ? { domain: p.turn.domain, turnType: p.turn.turnType } : null,
        usd: p.turn?.usd ?? 0, tokensIn: p.turn?.tokensIn ?? 0, tokensOut: p.turn?.tokensOut ?? 0, serperCalls: p.turn?.serperCalls ?? 0, cacheHits: p.turn?.cacheHits ?? 0, promptCacheRead: p.turn?.promptCacheRead ?? 0, promptCacheWrite: p.turn?.promptCacheWrite ?? 0, patches: (cap.events as Array<{ type?: string; patches?: string[] }>).filter(e => e.type === 'tappyai_consult_patch').flatMap(e => e.patches ?? []), guards: (cap.events as Array<Record<string, unknown>>).filter(e => e.type === 'tappyai_guard' && guardChanged(e)).map(e => String(e.guard)),
        net, toolRows, tools: p.tools.map(x => x.toolName ?? '?'), mainPick: pick, alternatives: alts, ms, ttftMs, cost: p.turn ? { model: p.turn.model, intent: p.turn.intent ?? null, intentUsd: p.turn.intentUsd ?? null, answerUsd: p.turn.answerUsd ?? null, serperUsd: p.turn.serperUsd ?? null, reasoningTokens: p.turn.reasoningTokens ?? 0, fellBack: p.turn.fellBack ?? false } : null, pass: ev.pass && (unresolved.length === 0 || flightThread), // a flight thread's "chỗ đó" names no place (Q10)
        checks: unresolved.length ? [...ev.checks, { id: 'placeholders', pass: false, detail: `unresolved: ${unresolved.join(',')}` }] : ev.checks,
        reply: p.text, ...(crash ? { crash } : {}),
      })
      writeFileSync(join(outDir, 'raw', `${c.id}-t${i + 1}.json`), JSON.stringify({ sent, status, parsed: { ...p, text: undefined }, logEvents: cap.events, logErrors: cap.errors, raw }, null, 1))
      // The next turn's history: the reply text exactly as the client keeps it.
      messages.push({ role: 'assistant', content: p.text })
      if (pick) { lastPick = pick; lastAlt = alts[0] ?? toolRowNames(p.tools).find(n => !n.toLowerCase().includes(pick.toLowerCase()) && !pick.toLowerCase().includes(n.toLowerCase())) ?? lastAlt }
      shown.push(...shownNames(p.text))
      if (crash && !p.text) break
    }
  }

  const planned = ON ? suitesToRun() : []
  if (ON && planned.length === 0) {
    it('REPLAY_SUITE is required (scenarios | firstTurns | owner59 | all, comma list allowed)', () => {
      throw new Error('Set REPLAY_SUITE — the harness refuses to guess which paid suite to run.')
    })
  }

  for (const suite of planned) {
    it(`suite: ${suite}`, async () => {
      const convs = filterOnly(loadSuite(suite))
      expect(convs.length, `no conversation matched REPLAY_ONLY=${process.env.REPLAY_ONLY ?? ''}`).toBeGreaterThan(0)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outDir = join(HERE, 'out', `${suite}-${stamp}`)
      mkdirSync(join(outDir, 'raw'), { recursive: true })
      process.env.AUDIT_USAGE_LOG_FILE = join(outDir, 'usage.jsonl')
      process.env.REPLAY_SERPER_LOG = join(outDir, 'serper.jsonl')
      const rows: TurnRow[] = []
      const startedAt = new Date().toISOString()
      const net0 = netSnapshot()
      const flush = () => {
        const s = summarize(rows)
        const meta = { suite, startedAt, finishedAt: new Date().toISOString(), conversations: convs.length, only: process.env.REPLAY_ONLY ?? null, flags: RUN_FLAGS, serperMissing: netDelta(net0).serperMissing, net: netDelta(net0) }
        writeFileSync(join(outDir, 'results.json'), JSON.stringify({ meta, summary: s, rows }, null, 1))
        writeFileSync(join(outDir, 'summary.md'), markdown(suite, rows, s, meta))
        return s
      }
      for (const c of convs) { process.env.REPLAY_SERPER_CONV = c.id; setSerperInjection(c.inject ?? null); try { await runConversation(c, outDir, rows) } finally { setSerperInjection(null) }; flush() }
      delete process.env.AUDIT_USAGE_LOG_FILE
      const s = flush()
      process.stdout.write(`\n[replay] ${suite}: ${s.total.pass}/${s.total.turns} turns passed · ${s.crashes.length} crash(es) · mean $${s.cost.meanTurnUsd.toFixed(5)}/turn · out: ${outDir}\n`)
      expect(s.crashes, 'route crashed on a turn — see summary.md').toEqual([])
      if (process.env.REPLAY_STRICT === '1') expect(s.failures).toEqual([])
    }, 6 * 60 * 60 * 1000)
  }
})

// @vitest-environment node
// PROCESS-BOUNDARY PROOF · the CHILD half. This file is NOT a test of its own: it does nothing unless the real launcher started it (the 32-hex nonce BENCH_TRIAL_ISOLATED and the
// confirmation BENCH_LIVE_TRIAL that only liveTrialLauncher.mjs sets, exactly like liveTrial.test.ts), so a normal `vitest run` skips it. liveTrial.procproof.test.ts starts it through
// the REAL launcher (runLauncher: the real spawn, the real allow-listed child environment, the real nonce, the real marker filter), with the SAME command and loader the real trial
// child uses (node vitest.mjs run --project app <file> --reporter=verbose --silent=false); only the test file differs.
//
// It mirrors liveTrial.test.ts: the same mocks, the real chat route imported BEFORE the fetch wrapper, runLiveTrial with afterTrial 'deny' and the same marker block. The ONE difference
// is the network: the OpenAI answers are scripted and injected through the seam runLiveTrial already has (fetchImpl) - the allow-list is not widened. Nothing real is ever sent.
// It records WHERE things run (process ids, worker facts), HOW MANY times the quota module was evaluated, and what the quota counter held at the start and end of every turn.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { __resetAiQuestionQuotaLocal as resetByAlias } from '@/lib/ai/quota/aiQuestionQuota'
import * as quotaByAlias from '@/lib/ai/quota/aiQuestionQuota'
import * as quotaByRelative from '../../../src/lib/ai/quota/aiQuestionQuota'
import { isMainThread } from 'node:worker_threads'
import { basename } from 'node:path'
import { isDistributedStoreConfigured } from '@/lib/security/distributedRateLimit'
import { formatSummary, runLiveTrial } from './liveTrial'
import { SUMMARY_BEGIN, SUMMARY_END, marker } from './liveTrialLauncher.mjs'
import { memFs } from './liveRunner.testkit'
import type { UatTurn } from './questions'

// Runs BEFORE any import is evaluated: the quota module keeps its counter in `globalThis.__tappyAiQuotaLocal` and reads that property once each time it is EVALUATED
// (aiQuestionQuota.ts:122-123). An accessor that counts the reads therefore counts the evaluations - without touching src/.
const probe = vi.hoisted(() => {
  const state: { reads: number; map: Map<string, number[]> | undefined } = { reads: 0, map: undefined }
  Object.defineProperty(globalThis, '__tappyAiQuotaLocal', { configurable: true, get() { state.reads++; return state.map }, set(v: Map<string, number[]>) { state.map = v } })
  return { state, pidAtLoad: process.pid }
})

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b, then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0001' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const fetchPids = new Set<number>()
let fetchCalls = 0
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  fetchPids.add(process.pid); fetchCalls++
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com' && u.pathname === '/v1/chat/completions') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (body.response_format) return jsonCompletion(INTENT, usage(1000, 100))
    return sse([
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'Đây là câu trả lời kiểm thử ngắn.' }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ...(body.stream_options?.include_usage === true ? [{ choices: [], usage: usage(1200, 40) }] : []),
    ])
  }
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

const nonce = process.env.BENCH_TRIAL_ISOLATED ?? ''
const launched = /^[0-9a-f]{32}$/.test(nonce) && process.env.BENCH_LIVE_TRIAL === 'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'
const TURNS: UatTurn[] = Array.from({ length: 13 }, (_, i) => ({ id: `T${i + 1}`, conversation: `T${i + 1}`, turn: 1, text: `Câu hỏi kiểm thử số ${i + 1} về một chủ đề riêng ${'x'.repeat(i + 1)}` }))

describe.skipIf(!launched)('PROCESS-BOUNDARY PROOF child (started by the real launcher only)', () => {
  let POST: (req: never) => Promise<Response>
  beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000) // the route is imported BEFORE the fetch wrapper is installed

  it('13 development turns through the real route in this one process; reports where everything ran and what the quota counter held', async () => {
    // evaluations of the quota module, read BEFORE anything else touches the global
    const evaluations = probe.state.reads
    const map = probe.state.map
    const hits = (): number => { let n = 0; for (const [k, v] of probe.state.map ?? []) if (k.startsWith('ai:q:u:')) n += v.length; return n }
    const startHits: number[] = [], endHits: number[] = [], postPids = new Set<number>()
    const post = async (req: never): Promise<Response> => {
      postPids.add(process.pid); startHits.push(hits())
      const res = await POST(req)
      // the body must be read for the route to finish its work; the transport reads it, so only the counter is sampled once the response object exists
      endHits.push(hits())
      return res
    }
    const outcome = await runLiveTrial({ env: process.env, post, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: process.cwd(), turns: TURNS, afterTrial: 'deny' })
    if (outcome.kind === 'refused') {
      // eslint-disable-next-line no-console
      console.info(`${marker('REFUSED-BEGIN', nonce)}\n${outcome.reasons.join('\n')}\n${marker('REFUSED-END', nonce)}`)
      throw new Error('refused')
    }
    const s = outcome.summary
    const proof = {
      pidAtLoad: probe.pidAtLoad, pidInTest: process.pid, postPids: [...postPids], fetchPids: [...fetchPids], fetchCalls, ppid: process.ppid,
      argv1: basename(process.argv[1] ?? ''), execArgv: process.execArgv, isMainThread, hasIpcChannel: typeof process.send === 'function',
      vitestPoolId: process.env.VITEST_POOL_ID ?? null, vitestWorkerId: process.env.VITEST_WORKER_ID ?? null,
      quotaModuleEvaluations: evaluations, sameFunctionAliasVsRelative: quotaByAlias.consumeAiQuestion === quotaByRelative.consumeAiQuestion && resetByAlias === quotaByRelative.__resetAiQuestionQuotaLocal,
      counterIsAMap: map instanceof Map,
      // the shared store the quota would use INSTEAD of the in-process counter (a reset does not reach it): is one configured in THIS process? (names only, never a value)
      distributedStoreConfigured: isDistributedStoreConfigured(), storeLikeEnvNames: Object.keys(process.env).filter(k => /^(KV|UPSTASH|REDIS)/i.test(k)),
      startHits, endHits,
      summary: { turnsRun: s.turnsRun, stopped: s.stopped, quotaReset: s.quotaReset, problems: s.problems, hostsBlocked: s.hostsBlocked, requestCap: s.requestCap },
    }
    // eslint-disable-next-line no-console
    console.info(`${marker(SUMMARY_BEGIN, nonce)}\n${formatSummary(s)}\nPROCPROOF ${JSON.stringify(proof)}\n${marker(SUMMARY_END, nonce)}`)
    expect(outcome.kind).toBe('ran')
  }, 240_000)
})

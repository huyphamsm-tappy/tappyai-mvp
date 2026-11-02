// @vitest-environment node
// Wave 3 (prefix) - regression for the review of Wave 2J: CONSULT_ABORT_ABANDONED_FIRST_PART=1 with the REAL spend gate. A primary that answered its FIRST part and then failed mid-stream is not a
// fallback matter (the client may already hold its bytes): the metering layer must close the call as "unknown" at once, never leave it "held" (a held reservation made the paid-run gate report NaN).
// MOCK-ONLY: fake models, fetch stubbed to throw.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { meteredModel } from '@/lib/ai/budget/meteredModel'
import { withFallback } from '@/lib/ai/llm/fallback'
import { runWithSpendGate } from '@/lib/ai/budget/spendGate'
import { BudgetGuard } from './harness'
import { GuardSpendGate } from './spendGateAdapter'

const CALL = { inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'xin chào' }] }] } as never

type Break = 'error_part' | 'source_breaks' | 'ends_without_finish'
/** A provider that streams one text part and then fails the stream in the given way. */
function breaking(how: Break): { m: LanguageModelV1; started: () => number } {
  let started = 0
  const m: LanguageModelV1 = {
    specificationVersion: 'v1', provider: 'openai.chat', modelId: 'gpt-6-luna', defaultObjectGenerationMode: undefined,
    async doGenerate() { throw new Error('unused') },
    async doStream() {
      started++
      return {
        stream: new ReadableStream<LanguageModelV1StreamPart>({
          start(c) {
            c.enqueue({ type: 'text-delta', textDelta: 'phần đầu' })
            if (how === 'error_part') { c.enqueue({ type: 'error', error: new Error('upstream died mid-stream') }); c.close() }
            else if (how === 'ends_without_finish') c.close()
            else setTimeout(() => c.error(new Error('connection reset')), 5)
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }
    },
  }
  return { m, started: () => started }
}
const okRetry = (): { m: LanguageModelV1; started: () => number } => {
  let started = 0
  const m: LanguageModelV1 = {
    specificationVersion: 'v1', provider: 'openai.chat', modelId: 'gpt-6-luna', defaultObjectGenerationMode: undefined,
    async doGenerate() { throw new Error('unused') },
    async doStream() {
      started++
      return { stream: new ReadableStream<LanguageModelV1StreamPart>({ start(c) { c.enqueue({ type: 'text-delta', textDelta: 'ok' }); c.close() } }), rawCall: { rawPrompt: null, rawSettings: {} } }
    },
  }
  return { m, started: () => started }
}

const ENV = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'C2_REQUEST_BUDGET', 'CONSULT_ABORT_ABANDONED_FIRST_PART', 'NODE_ENV', 'VERCEL_ENV']
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k] }
  process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65'
  process.env.CONSULT_ABORT_ABANDONED_FIRST_PART = '1'
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED') }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

const turn = () => new GuardSpendGate(new BudgetGuard(0.05))
const states = (g: GuardSpendGate) => g.records.map(r => `${r.label}=${r.state}`)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function drain(m: LanguageModelV1): Promise<{ types: string[]; error: string }> {
  const r = await m.doStream(CALL)
  const rd = r.stream.getReader(); const types: string[] = []; let error = ''
  try { for (;;) { const n = await rd.read(); if (n.done) break; types.push(n.value.type) } } catch (e) { error = e instanceof Error ? e.message : String(e) }
  return { types, error }
}

describe('Wave 3 prefix · first part delivered, then the stream fails: the call is closed as unknown, never left held (flag ON, real spend gate)', () => {
  for (const how of ['error_part', 'source_breaks', 'ends_without_finish'] as const) {
    it(`${how}: one call, unknown (not held), no retry started, fail-closed stays`, async () => {
      const g = turn(); const p = breaking(how); const r = okRetry()
      const m = withFallback(meteredModel(p.m, 'smart'), meteredModel(r.m, 'smart:retry'), { firstPartMs: 500, label: 'smart', fallbackKind: 'luna_retry' })
      const out = await runWithSpendGate(g, () => drain(m))
      await sleep(30)
      expect(out.types[0]).toBe('text-delta') // the user already holds the first part
      expect(r.started()).toBe(0)             // committed to the primary: no retry after its first part
      expect(states(g)).toEqual(['llm:smart=unknown'])
      expect(g.records.some(x => x.state === 'held')).toBe(false)
      expect(g.guard.blockedBy).toBe('cost-unknown')
    })
  }
})

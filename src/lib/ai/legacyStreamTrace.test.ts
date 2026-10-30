// @vitest-environment node
/**
 * LEGACY_STREAM_TRACE (default OFF) — the default stream path records per-stage counts,
 * never reply text. Driven through the real stream filter (Gate-3 fixture B: a quality claim
 * that takes the whole sentence and its VERIFIED price with it).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { createLegacyStreamTrace, legacyStreamTraceEnabled } from './legacyStreamTrace'

const USER_TEXT = 'Tai nghe Sony WH-1000XM5 giá bao nhiêu, có đáng mua không?'
const REPLY = 'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền.'

async function run(reply: string): Promise<{ out: string; logs: string[] }> {
  const collector = createEnrichmentCollector(USER_TEXT)
  const frames = ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
  const logs: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { logs.push(String(a[0])) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER_TEXT, true)
    const body = await new Response(res.body).text()
    const out = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    return { out, logs }
  } finally { console.log = orig }
}

const guardLines = (logs: string[]) => logs.filter(l => l.includes('"type":"tappyai_guard"')).map(l => JSON.parse(l) as Record<string, unknown>)

describe('LEGACY_STREAM_TRACE', () => {
  afterEach(() => { delete process.env.LEGACY_STREAM_TRACE })

  it('reads the flag at call time: only 1 / true are ON, everything else is OFF', () => {
    const env = (v?: string): NodeJS.ProcessEnv => ({ ...process.env, LEGACY_STREAM_TRACE: v })
    expect(legacyStreamTraceEnabled(env('1'))).toBe(true)
    expect(legacyStreamTraceEnabled(env(' true '))).toBe(true)
    expect(legacyStreamTraceEnabled(env('0'))).toBe(false)
    expect(legacyStreamTraceEnabled(env('yes'))).toBe(false)
    expect(legacyStreamTraceEnabled(env(undefined))).toBe(false)
  })

  it('OFF: the reply is unchanged by the trace and no tappyai_guard line is written', async () => {
    delete process.env.LEGACY_STREAM_TRACE
    const { out, logs } = await run(REPLY)
    expect(logs.some(l => l.includes('legacy_'))).toBe(false)
    expect(out).not.toContain('8.000.000')
  })

  it('ON: the reply is identical to OFF, and the trace records the removing stage with counts only', async () => {
    delete process.env.LEGACY_STREAM_TRACE
    const off = await run(REPLY)
    process.env.LEGACY_STREAM_TRACE = '1'
    const on = await run(REPLY)
    expect(on.out).toBe(off.out)
    const lines = guardLines(on.logs)
    const stage = lines.find(l => l.guard === 'legacy_stage' && l.amount_removed === true)
    expect(stage, JSON.stringify(lines)).toBeDefined()
    expect(stage).toMatchObject({ amounts_before: 1, amounts_after: 0 })
    const turn = lines.find(l => l.guard === 'legacy_turn')
    expect(turn).toMatchObject({ stages_changed: expect.any(Number) })
  })

  it('ON: no log line carries reply text or a price', async () => {
    process.env.LEGACY_STREAM_TRACE = '1'
    const { logs } = await run(REPLY)
    const traced = logs.filter(l => l.includes('legacy_'))
    expect(traced.length).toBeGreaterThan(0)
    for (const l of traced) {
      expect(l).not.toContain('Sony')
      expect(l).not.toContain('8.000.000')
      expect(l).not.toContain('rất đáng tiền')
    }
  })
})

describe('createLegacyStreamTrace', () => {
  it('writes nothing for a turn in which no stage changed the text', () => {
    const lines: string[] = []
    const t = createLegacyStreamTrace(l => lines.push(l))
    t.turn()
    expect(lines).toEqual([])
  })

  it('counts sentences and amounts without copying the text', () => {
    const lines: string[] = []
    const t = createLegacyStreamTrace(l => lines.push(l))
    t.stage('demo', 'Giá 8.000.000đ. Khác 3.000.000đ.', 'Giá 8.000.000đ.')
    t.turn()
    const [stage, turn] = lines.map(l => JSON.parse(l) as Record<string, unknown>)
    expect(stage).toMatchObject({ guard: 'legacy_stage', stage: 'demo', sentences_removed: 1, amounts_before: 2, amounts_after: 1, amount_removed: true })
    expect(turn).toMatchObject({ guard: 'legacy_turn', stages_changed: 1, chars_in: 32, chars_out: 15 })
    expect(lines.join('')).not.toContain('Giá')
  })

  // P2-8 (30/10): the TOTAL a turn lost, not just the first and last size - a stage that adds text must not hide one that deleted it
  describe('chars removed per turn', () => {
    const run = (stages: Array<[string, string, string]>, opts?: { always?: boolean }) => {
      const lines: string[] = []
      const t = createLegacyStreamTrace(l => lines.push(l), opts)
      for (const [n, b, a] of stages) t.stage(n, b, a)
      t.turn()
      return lines.map(l => JSON.parse(l) as Record<string, any>).filter(r => r.guard === 'legacy_turn')[0]
    }
    it('sums what every stage that SHORTENED the text removed, by stage', () => {
      const t = run([['money', 'a'.repeat(100), 'a'.repeat(70)], ['format', 'a'.repeat(70), 'a'.repeat(60)]])
      expect(t).toMatchObject({ chars_removed_total: 40, removed_by_stage: { money: 30, format: 10 }, chars_would_remove_total: 0 })
    })
    it('a stage that only ADDED text removes nothing, and does not cancel an earlier removal', () => {
      const t = run([['money', 'a'.repeat(100), 'a'.repeat(80)], ['notice', 'a'.repeat(80), 'a'.repeat(150)]])
      expect(t.chars_removed_total).toBe(20)
      expect(t.removed_by_stage).toEqual({ money: 20 })
    })
    it('a shadow stage (logged, text kept) is counted apart: it is what WOULD have gone', () => {
      const t = run([['shadow:money', 'a'.repeat(100), 'a'.repeat(60)], ['format', 'a'.repeat(100), 'a'.repeat(95)]])
      expect(t).toMatchObject({ chars_removed_total: 5, chars_would_remove_total: 40, would_remove_by_stage: { 'shadow:money': 40 } })
    })
    it('the same stage removing twice in a turn adds up (a stage runs once per sentence block)', () => {
      const t = run([['money', 'a'.repeat(100), 'a'.repeat(90)], ['money', 'a'.repeat(90), 'a'.repeat(85)]])
      expect(t.removed_by_stage).toEqual({ money: 15 })
    })
    it('a shadow stage never moves the size the reader actually received (chars_out is the last REAL stage)', () => {
      const t = run([['format', 'a'.repeat(100), 'a'.repeat(95)], ['shadow:money', 'a'.repeat(95), 'a'.repeat(10)]])
      expect(t).toMatchObject({ chars_in: 100, chars_out: 95 })
    })
    it('a stage that deletes and adds in one pass counts its net removal only', () => {
      expect(run([['rewrite', 'a'.repeat(100), 'a'.repeat(90)]]).chars_removed_total).toBe(10)
    })
    it('always: a turn in which nothing changed still writes the line, with zeros (so "0 removed" is distinct from "no trace")', () => {
      const lines: string[] = []
      const t = createLegacyStreamTrace(l => lines.push(l), { always: true })
      t.turn()
      expect(JSON.parse(lines[0])).toMatchObject({ guard: 'legacy_turn', stages_changed: 0, chars_removed_total: 0, chars_would_remove_total: 0 })
    })
    it('without always, an unchanged turn writes nothing (as before)', () => {
      const lines: string[] = []
      createLegacyStreamTrace(l => lines.push(l)).turn()
      expect(lines).toEqual([])
    })
    it('counts only: no text and no stage content in the line', () => {
      const lines: string[] = []
      const t = createLegacyStreamTrace(l => lines.push(l))
      t.stage('money', 'Giá bí mật 8.000.000đ', 'Giá')
      t.turn()
      expect(lines.join('')).not.toContain('bí mật')
    })
  })

  describe('wiring', () => {
    it('one brain asks for the always-on turn line', async () => {
      const { readFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const src = readFileSync(join(process.cwd(), 'src/lib/ai/streamEnrichment.ts'), 'utf8')
      expect(src).toContain('createLegacyStreamTrace(undefined, { always: collector?.oneBrain === true })')
    })
  })
})

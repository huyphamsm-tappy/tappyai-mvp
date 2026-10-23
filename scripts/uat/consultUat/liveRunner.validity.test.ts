// @vitest-environment node
// Round 2d · M1 (a run that can no longer be valid stops sending), M2 (an invalid run has NO `totalUsd` key - not null, not undefined), M3 (valid needs
// costAccounted) and B1 (a flag that is SET but empty / blank is refused). MOCK-ONLY: fetch throws, the file system is in memory, the transport is fake.
// The environment is injected with vi.stubEnv and restored with vi.unstubAllEnvs() after EVERY test.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { runUat } from './harness'
import { UAT_TURNS, type UatTurn } from './questions'
import {
  __resetBenchProcessGuardForTests, BENCH_FLAG_NAMES, BenchRefusal, createBenchRunner, runBench, type BenchOptions, type ChatTransport,
} from './liveRunner'
import { GOOD_ENV, finalFile, hasKey, jsonlLines, jsonlStarts, options, turnTransport } from './liveRunner.testkit'

const stubBenchEnv = (over: Record<string, string | undefined> = {}) => {
  for (const k of BENCH_FLAG_NAMES) vi.stubEnv(k, undefined) // undefined = UNSET
  for (const [k, v] of Object.entries({ ...GOOD_ENV, ...over })) vi.stubEnv(k, v)
}
beforeEach(() => {
  __resetBenchProcessGuardForTests(); stubBenchEnv()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED — tests must not reach the network') }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

const THREE: readonly UatTurn[] = [
  { id: 'A1', conversation: 'A1', turn: 1, text: 'câu một' },
  { id: 'A2', conversation: 'A2', turn: 1, text: 'câu hai' },
  { id: 'A3', conversation: 'A3', turn: 1, text: 'câu ba' },
]
const refused = (e: unknown) => { try { reserveSpend('llm:consult', null) } catch { /* refused by the gate: this is what degrades the turn */ } void e }

describe('M1 · a run that can no longer be valid stops sending', () => {
  it('turn 1 is degraded (a paid call was refused by the gate): turns 2 and 3 send NOTHING, valid=false, no totalUsd', async () => {
    const base = turnTransport()
    const chat: ChatTransport = async req => { refused(req); return base.chat(req) }
    const { opts, fs } = options({ chat, turns: THREE })
    const r = await runBench(opts)
    expect(r.records[0]).toMatchObject({ degraded: true, refusals: 1 })
    expect(base.requests).toHaveLength(1) // only turn 1 reached the transport
    expect(r.report.turns.map(t => [t.id, t.cost])).toEqual([['A1', 'known'], ['A2', 'none'], ['A3', 'none']]) // refused by the halted runner, never sent
    expect(jsonlStarts(fs).map(l => l.started)).toEqual(['A1']) // not even announced
    expect(r.valid).toBe(false)
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })

  it('turn 1 has an error frame in its stream next to a non-empty answer: the same', async () => {
    const base = turnTransport()
    const chat: ChatTransport = async req => { const ok = await base.chat(req); return { raw: `${ok.raw}3:"boom"\n` } }
    const { opts, fs } = options({ chat, turns: THREE })
    const r = await runBench(opts)
    expect(r.records[0].streamErrors).toEqual(['boom'])
    expect(r.records[0].answer).not.toBe('')
    expect(base.requests).toHaveLength(1)
    expect(r.report.turns.map(t => t.cost)).toEqual(['known', 'none', 'none'])
    expect(r.valid).toBe(false)
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })

  it('photoSkips alone do NOT stop the run (the text answer is unchanged)', async () => {
    const base = turnTransport()
    const chat: ChatTransport = async req => { try { reserveSpend('serper:images', null) } catch { /* a photo lookup skipped */ } return base.chat(req) }
    const { opts } = options({ chat, turns: THREE })
    const r = await runBench(opts)
    expect(base.requests).toHaveLength(3)
    expect(r.records.map(x => [x.photoSkips, x.degraded])).toEqual([[1, false], [1, false], [1, false]])
    expect(r.report.turns.map(t => t.cost)).toEqual(['known', 'known', 'known'])
  })
})

describe('M2 · an invalid run has no `totalUsd` key at all (not null, not undefined), in memory and in the file; the evidence stays', () => {
  const EVIDENCE = ['knownUsd', 'knownSubtotalUsd', 'unknownTurns', 'unresolvedReservedUsd', 'costAccounted'] as const

  it('(i-a) all 13 turns run, turn 13 answers with an HTTP error: the books are complete, the run is NOT valid → the key is absent from result.report.cost and from the file', async () => {
    const base = turnTransport()
    let n = 0
    const chat: ChatTransport = async req => { n++; return n === 13 ? { raw: '', status: 500 } : base.chat(req) }
    const { opts, fs } = options({ chat, turns: UAT_TURNS })
    const r = await runBench(opts)
    expect(r.records).toHaveLength(13)
    expect(r.valid).toBe(false)
    expect(Object.hasOwn(r.report.cost, 'totalUsd')).toBe(false)
    expect(r.report.cost.complete).toBe(false)
    for (const k of EVIDENCE) expect(Object.hasOwn(r.report.cost, k), k).toBe(true) // cost evidence is NOT removed
    expect(r.report.cost.costAccounted).toBe(true)
    expect(r.report.turns).toHaveLength(13)
    expect(r.report.turns.every(t => t.cost === 'known' || t.id === 'Q12')).toBe(true)
    expect(r.records.map(x => x.cost.state)).toEqual(Array(13).fill('known'))
    const f = finalFile(fs)!.json
    expect(hasKey(f, 'totalUsd')).toBe(false)
    for (const k of EVIDENCE) expect(Object.hasOwn(f.report.cost, k), k).toBe(true)
    expect(f.turns).toHaveLength(13)
    expect(Array.isArray(f.openReservations)).toBe(true)
  })

  it('(i-b) a paid call that failed after it was sent (UNKNOWN): no key; the open reservation and the unknown turn are still there', async () => {
    const base = turnTransport()
    let n = 0
    const chat: ChatTransport = async req => { n++; if (n === 4) { reserveSpend('llm:consult', 0.004)!.markUnknown(); return { raw: '0:"x"\nd:{}\n' } } return base.chat(req) }
    const { opts, fs } = options({ chat, turns: UAT_TURNS })
    const r = await runBench(opts)
    expect(r.valid).toBe(false)
    expect(Object.hasOwn(r.report.cost, 'totalUsd')).toBe(false)
    expect(r.report.cost.complete).toBe(false)
    expect(r.report.cost.unknownTurns.length).toBeGreaterThan(0)
    expect(r.report.cost.unresolvedReservedUsd).toBeGreaterThan(0)
    expect(r.report.cost.costAccounted).toBe(false)
    expect(r.records[3].openReservedUsd).toBeGreaterThan(0)
    expect(r.records[3].cost.state).toBe('unknown')
    const f = finalFile(fs)!.json
    expect(hasKey(f, 'totalUsd')).toBe(false)
    expect(f.openReservations.length).toBeGreaterThan(0)
    expect(f.report.cost.unknownTurns.length).toBeGreaterThan(0)
    expect(jsonlLines(fs)).toHaveLength(4)
  })

  it('(ii) a valid run keeps a real total: valid=true, complete=true, the books are full, totalUsd is a number (in memory and in the file)', async () => {
    const t = turnTransport()
    const { opts, fs } = options({ chat: t.chat, turns: UAT_TURNS })
    const r = await runBench(opts)
    expect(r.valid).toBe(true)
    expect(Object.hasOwn(r.report.cost, 'totalUsd')).toBe(true)
    expect(r.report.cost.complete).toBe(true)
    expect(r.report.cost.costAccounted).toBe(true)
    expect(r.report.cost.unknownTurns).toEqual([])
    expect((r.report.cost as { totalUsd: number }).totalUsd).toBeCloseTo(13 * 0.004, 10)
    const f = finalFile(fs)!.json
    expect(f.valid).toBe(true)
    expect(f.report.cost.totalUsd).toBeCloseTo(13 * 0.004, 10)
    expect(f.summary.totalUsd).toBeCloseTo(13 * 0.004, 10)
    expect(f.turns).toHaveLength(13)
  })
})

describe('M3 · valid needs a fully accounted cost book', () => {
  it('a driver whose report says costAccounted=false (but complete=true): valid=false and no totalUsd key', async () => {
    const t = turnTransport()
    const { opts, fs } = options({ chat: t.chat, turns: UAT_TURNS })
    ;(opts as BenchOptions).runUatImpl = async o => { const rep = await runUat(o); return { ...rep, cost: { ...rep.cost, costAccounted: false } } }
    const r = await runBench(opts)
    expect(t.requests).toHaveLength(13)
    expect(r.valid).toBe(false)
    expect(Object.hasOwn(r.report.cost, 'totalUsd')).toBe(false)
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })
})

describe('B1 · a flag that is SET but empty or blank is refused (UNSET is fine)', () => {
  const ZW = (...codes: number[]) => codes.map(c => String.fromCharCode(c)).join('')
  const VALUES: Array<[string, string]> = [['empty string', ''], ['spaces', '   '], ['tab and newline', '\t\n'], ['zero-width space', ZW(0x200b)], ['zero-width mix and BOM', ' ' + ZW(0x200b, 0x200d, 0x2060, 0xfeff) + ' ']]
  for (const name of BENCH_FLAG_NAMES) {
    for (const [label, value] of VALUES) {
      it(`${name} = ${label}: createBenchRunner and runBench refuse before any file-system call and any request`, async () => {
        stubBenchEnv({ [name]: value })
        const a = options({}, process.env)
        expect(() => createBenchRunner(a.opts), name).toThrow(BenchRefusal)
        expect(() => createBenchRunner(a.opts), name).toThrow(new RegExp(`\\b${name}\\b.*(empty|blank)|(empty|blank).*\\b${name}\\b`, 'i'))
        expect(a.fs.ops, 'no file-system call').toEqual([])
        const t = turnTransport()
        const b = options({ chat: t.chat }, process.env)
        await expect(runBench(b.opts)).rejects.toBeInstanceOf(BenchRefusal)
        expect(b.fs.ops).toEqual([])
        expect(t.requests).toHaveLength(0)
        expect(fetch).not.toHaveBeenCalled()
        // the process is not locked by the refusal: with the variable UNSET the same call is accepted
        vi.unstubAllEnvs(); stubBenchEnv({ [name]: undefined })
        if (name.startsWith('BENCH_SPEND_') ) return // these three are required by the gate itself
        expect(() => createBenchRunner(options({}, process.env).opts), `${name} unset`).not.toThrow()
      })
    }
  }

  it('the names that matter most are in the flag set: the model ids and the price per credit', () => {
    expect(BENCH_FLAG_NAMES).toEqual(expect.arrayContaining(['LLM_LUNA_MODEL', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL', 'SERPER_USD_PER_CREDIT']))
  })

  it('the reason names EVERY empty variable, and an UNSET one is not mentioned', () => {
    stubBenchEnv({ LLM_LUNA_MODEL: '', SERPER_USD_PER_CREDIT: '  ' })
    let msg = ''
    try { createBenchRunner(options({}, process.env).opts) } catch (e) { msg = (e as Error).message }
    expect(msg).toMatch(/LLM_LUNA_MODEL/); expect(msg).toMatch(/SERPER_USD_PER_CREDIT/); expect(msg).not.toMatch(/LLM_CONSULT_MODEL/)
  })

  it('a good environment (every optional flag unset) is accepted', () => {
    expect(() => createBenchRunner(options({}, process.env).opts)).not.toThrow()
  })
})

// @vitest-environment node
// Round 2d · M1 (a run that can no longer be valid stops sending), M2 (an invalid run has NO `totalUsd` key - not null, not undefined), M3 (valid needs
// costAccounted) and B1 (a flag that is SET but empty / blank is refused). MOCK-ONLY: fetch throws, the file system is in memory, the transport is fake.
// The environment is injected with vi.stubEnv and restored with vi.unstubAllEnvs() after EVERY test.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { runUat } from './harness'
import { UAT_TURNS, type UatTurn } from './questions'
import {
  __resetBenchProcessGuardForTests, BENCH_FLAG_NAMES, BENCH_MUST_BE_OFF, BenchRefusal, createBenchRunner, runBench, type BenchOptions, type ChatTransport,
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

describe('round 2e · review A1: variables that change what a run MEASURES or RECORDS are part of the flag set and must be OFF', () => {
  for (const [name, value] of [['AUDIT_DRY_RUN', '1'], ['AUDIT_MODEL_REQUEST_FILE', 'D:/audit/requests.jsonl'], ['AUDIT_USAGE_LOG_FILE', 'D:/audit/usage.log']] as const) {
    it(`${name} is in BENCH_FLAG_NAMES and in BENCH_MUST_BE_OFF`, () => {
      expect(BENCH_FLAG_NAMES).toContain(name)
      expect(BENCH_MUST_BE_OFF).toContain(name)
    })
    it(`${name}=${value}: refused by name by createBenchRunner and runBench, before any file-system call and any request (a canned "dry-run" answer must never be benchmarked)`, async () => {
      stubBenchEnv({ [name]: value })
      const a = options({}, process.env)
      expect(() => createBenchRunner(a.opts)).toThrow(BenchRefusal)
      expect(() => createBenchRunner(a.opts)).toThrow(new RegExp(`${name}.*(must be OFF|must be UNSET)`))
      expect(a.fs.ops).toEqual([])
      const t = turnTransport()
      const b = options({ chat: t.chat }, process.env)
      await expect(runBench(b.opts)).rejects.toBeInstanceOf(BenchRefusal)
      expect(t.requests).toHaveLength(0)
    })
  }
})

describe('round 2e · review M4: a key echoed in an error message is redacted before it reaches the JSONL, the result file or a thrown error', () => {
  it('a transport error that quotes the OpenAI key (full, and as a masked "sk-…" prefix) and the Serper key', async () => {
    stubBenchEnv({ OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456' })
    const chat: ChatTransport = async () => { throw new Error('Incorrect API key provided: sk-test-SECRET-123. Also sk-proj-ABCDEF****wxyz and serper-SECRET-456.') }
    const { opts, fs } = options({ chat, turns: THREE }, process.env)
    const r = await runBench(opts)
    const everything = [...fs.files.values()].join('\n') + JSON.stringify(r)
    expect(everything).not.toContain('SECRET')
    expect(everything).not.toMatch(/sk-proj-ABCDEF/)
    expect(r.records[0].error).toMatch(/Incorrect API key provided/) // the useful part of the message stays
  })
})

describe('round 2e · re-review N1/N2: redaction never assigns to the caught error and also covers the answer returned to runUat', () => {
  it('N1: a DOMException (message is a getter-only accessor, e.g. AbortError) still produces a record, closes the gate and is not mutated', async () => {
    const abort = new DOMException('The operation was aborted', 'AbortError')
    const chat: ChatTransport = async () => { throw abort }
    const { opts, fs } = options({ chat, turns: THREE })
    const r = await runBench(opts)
    expect(r.records).toHaveLength(1) // the turn is recorded, not lost to a TypeError raised inside the catch
    expect(r.records[0].error).toMatch(/aborted/)
    expect(jsonlLines(fs)).toHaveLength(1)
    expect(abort.message).toBe('The operation was aborted') // the caller's error object is left alone
    expect(r.valid).toBe(false)
  })
  it('N1: a shared Error object is not mutated either (its message keeps the original text)', async () => {
    stubBenchEnv({ OPENAI_API_KEY: 'sk-test-SECRET-123' })
    const shared = new Error('bad key sk-test-SECRET-123')
    const chat: ChatTransport = async () => { throw shared }
    const { opts } = options({ chat, turns: THREE }, process.env)
    const r = await runBench(opts)
    expect(shared.message).toBe('bad key sk-test-SECRET-123')
    expect(JSON.stringify(r)).not.toContain('SECRET')
  })
  it('N2: a key echoed inside the ANSWER text is redacted in the result file and the report (not only in the JSONL record)', async () => {
    stubBenchEnv({ OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456' })
    const base = turnTransport()
    const chat: ChatTransport = async req => {
      const ok = await base.chat(req)
      return { raw: `${ok.raw.split('\n')[0].slice(0, 2)}${JSON.stringify('the key is sk-test-SECRET-123 and serper-SECRET-456')}\nd:{"finishReason":"stop"}\n` }
    }
    const { opts, fs } = options({ chat, turns: THREE }, process.env)
    const r = await runBench(opts)
    const everything = [...fs.files.values()].join('\n') + JSON.stringify(r)
    expect(everything).not.toContain('SECRET')
  })
  it('N2: a non-Error thrown value that quotes a key is redacted too', async () => {
    stubBenchEnv({ OPENAI_API_KEY: 'sk-test-SECRET-123' })
    const chat: ChatTransport = async () => { throw 'plain string with sk-test-SECRET-123' } // eslint-disable-line no-throw-literal
    const { opts, fs } = options({ chat, turns: THREE }, process.env)
    const r = await runBench(opts)
    expect([...fs.files.values()].join('\n') + JSON.stringify(r)).not.toContain('SECRET')
  })
})

describe('round 2e · review I2: the two audit FILE variables must be UNSET (the route treats ANY value, "off" and "0" included, as a file path to append to)', () => {
  for (const name of ['AUDIT_MODEL_REQUEST_FILE', 'AUDIT_USAGE_LOG_FILE']) {
    for (const value of ['off', '0', 'false', 'no', 'NO']) {
      it(`${name}=${value}: refused ("must be UNSET"), before any file-system call`, () => {
        stubBenchEnv({ [name]: value })
        const a = options({}, process.env)
        expect(() => createBenchRunner(a.opts)).toThrow(new RegExp(`${name}.*UNSET`))
        expect(a.fs.ops).toEqual([])
      })
    }
  }
  it('AUDIT_DRY_RUN keeps the usual "off" spellings (the route compares it to "1" only)', () => {
    for (const v of ['0', 'false', 'off', 'no']) {
      __resetBenchProcessGuardForTests()
      stubBenchEnv({ AUDIT_DRY_RUN: v })
      expect(() => createBenchRunner(options({}, process.env).opts), v).not.toThrow()
    }
  })
})

describe('round 2e · review A2: a model id is accepted only if it is EXACTLY a priced id (the price table matches by prefix)', () => {
  for (const name of ['LLM_LUNA_MODEL', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL']) {
    it(`${name}: "gpt-6-luna" and unset are accepted; a longer, shorter, other-case or padded id is refused by name before any file-system call`, async () => {
      stubBenchEnv({ [name]: 'gpt-6-luna' })
      expect(() => createBenchRunner(options({}, process.env).opts), 'exact id').not.toThrow()
      __resetBenchProcessGuardForTests()
      for (const bad of ['gpt-6-luna-pro', 'gpt-6-lunar', 'GPT-6-LUNA', ' gpt-6-luna', 'gpt-6-luna ', 'gpt-4o', 'gpt-6']) {
        stubBenchEnv({ [name]: bad })
        const a = options({}, process.env)
        expect(() => createBenchRunner(a.opts), bad).toThrow(new RegExp(`${name}.*(priced|exact)`, 'i'))
        expect(a.fs.ops, bad).toEqual([])
        const t = turnTransport()
        await expect(runBench(options({ chat: t.chat }, process.env).opts), bad).rejects.toBeInstanceOf(BenchRefusal)
        expect(t.requests, bad).toHaveLength(0)
      }
    })
  }
})

describe('round 2e · review A8: more characters count as blank (whitespace, control, format and default-ignorable characters)', () => {
  const cp = (...codes: number[]) => codes.map(c => String.fromCodePoint(c)).join('')
  const BLANKS: Array<[string, string]> = [
    ['no-break space', cp(0xa0)], ['line separator', cp(0x2028)], ['ideographic space', cp(0x3000)], ['left-to-right mark', cp(0x200e)],
    ['bidi controls', cp(0x202a, 0x202b, 0x202c, 0x202d, 0x202e)], ['control character', cp(0x01)], ['variation selector', cp(0xfe0f)],
    ['tag character', cp(0xe0001)], ['combining grapheme joiner', cp(0x34f)], ['hangul filler', cp(0x3164)], ['invisible operators', cp(0x2061, 0x2062, 0x2063, 0x2064)],
  ]
  for (const [label, value] of BLANKS) {
    it(`LLM_LUNA_MODEL = ${label}: refused as blank, before any file-system call`, () => {
      stubBenchEnv({ LLM_LUNA_MODEL: value })
      const a = options({}, process.env)
      expect(() => createBenchRunner(a.opts)).toThrow(/LLM_LUNA_MODEL.*(empty|blank)|(empty|blank).*LLM_LUNA_MODEL/i)
      expect(a.fs.ops).toEqual([])
    })
  }
  it('a normal visible value is NOT blank (so a real model id is judged by the exact-id rule, not as blank)', () => {
    stubBenchEnv({ LLM_LUNA_MODEL: 'gpt-6-luna' })
    expect(() => createBenchRunner(options({}, process.env).opts)).not.toThrow()
  })
})

describe('round 2e · review A10: `valid` needs a FINITE total', () => {
  it('a driver whose report carries totalUsd = NaN: valid=false and no totalUsd key', async () => {
    const t = turnTransport()
    const { opts, fs } = options({ chat: t.chat, turns: UAT_TURNS })
    ;(opts as BenchOptions).runUatImpl = async o => { const rep = await runUat(o); return { ...rep, cost: { ...rep.cost, totalUsd: Number.NaN } } }
    const r = await runBench(opts)
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

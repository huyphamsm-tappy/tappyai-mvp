// @vitest-environment node
// Round 2b · P0-1 (caps above the maximum), P1-1 (where results may go) and P1-2 (evidence survives a failed turn) for the benchmark runner.
// MOCK-ONLY: fetch is stubbed to throw, the file system is in memory, the "chat" is a fake transport that spends through the spend gate.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { UAT_TURNS } from './questions'
import { __resetBenchProcessGuardForTests, BenchRefusal, createBenchRunner, runBench, type BenchOptions, type ChatTransport } from './liveRunner'
import { runUat } from './harness'
import { GOOD_ENV, OUT_DIR, applyEnv, declare, finalFile, hasKey, jsonlLines, jsonlStarts, memFs, options, resultFiles, turnTransport } from './liveRunner.testkit'

beforeEach(() => { __resetBenchProcessGuardForTests() /* C-1: one runner per process - isolate the tests from each other */; applyEnv(GOOD_ENV); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED — tests must not reach the network') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); applyEnv({}) })

/** An environment whose caps are exactly `turn` / `run`, listed and declared consistently, so ONLY the size of the caps can be the reason to refuse. */
function withCaps(turn: number, run: number, over: Partial<BenchOptions> = {}) {
  const env = { ...GOOD_ENV, BENCH_SPEND_TURN_CAP_USD: String(turn), BENCH_SPEND_RUN_CAP_USD: String(run) }
  applyEnv(env)
  const t = turnTransport()
  const o = options({ chat: t.chat, turnCapUsd: turn, runCapUsd: run, confirmSpend: { capUsd: run }, ...over }, env)
  return { ...o, t }
}

describe('P0-1 · a cap above $0.10 per turn (Wave 3-FIX R3-06; it was $0.05) / $0.65 per run is refused before any paid request, whichever way the runner is entered', () => {
  const tooBig: Array<[number, number]> = [[0.11, 0.65], [0.10, 0.70], [1, 10], [1e9, 1e9], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], [0.10000001, 0.65], [0.10, 0.650001], [0.10, 0.6500000000001]]
  for (const [turn, run] of tooBig) {
    it(`runBench: turn ${turn} run ${run}`, async () => {
      const { opts, t, fs } = withCaps(turn, run)
      await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
      await expect(runBench(opts)).rejects.toThrow(/0\.1|0\.65|maximum/i)
      expect(t.requests).toHaveLength(0)
      expect(fetch).not.toHaveBeenCalled()
      expect(resultFiles(fs)).toHaveLength(0)
    })
    it(`createBenchRunner called directly: turn ${turn} run ${run}`, () => {
      const { opts, t } = withCaps(turn, run)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
      expect(t.requests).toHaveLength(0)
      expect(fetch).not.toHaveBeenCalled()
    })
  }
  for (const [turn, run] of [[-0.05, 0.65], [Number.NaN, 0.65], [0.05, Number.POSITIVE_INFINITY], [0, 0], [5e-8, 0.65]] as Array<[number, number]>) {
    it(`unusable caps are refused by both entries: turn ${turn} run ${run}`, async () => {
      const { opts, t } = withCaps(turn, run)
      await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
      expect(t.requests).toHaveLength(0)
    })
  }
  it('the environment saying 5e-2 / 1e-2 (exponent form) is refused even when the options carry the same value as a number', async () => {
    for (const bad of ['5e-2', '1e-2']) {
      const env = { ...GOOD_ENV, BENCH_SPEND_TURN_CAP_USD: bad }
      applyEnv(env)
      const t = turnTransport()
      const { opts } = options({ chat: t.chat, turnCapUsd: Number(bad), confirmSpend: { capUsd: 0.65 } }, env)
      await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
      expect(t.requests).toHaveLength(0)
    }
  })
  it('(0.05, 0.65) is accepted and the 13 turns run', async () => {
    const { opts, t } = withCaps(0.05, 0.65)
    const r = await runBench(opts)
    expect(t.requests).toHaveLength(13)
    expect(r.valid).toBe(true)
  })
  it('(0.10, 0.65) is accepted (Wave 3-FIX R3-06: the per-turn maximum) and the 13 turns run', async () => {
    const { opts, t } = withCaps(0.10, 0.65)
    const r = await runBench(opts)
    expect(t.requests).toHaveLength(13)
    expect(r.valid).toBe(true)
  })
  it('(0.02, 0.02) is accepted: a lower cap is valid (one turn fits, the run cap then stops the next)', async () => {
    const { opts } = withCaps(0.02, 0.02)
    const r = await runBench(opts)
    expect(r.report.turns.length).toBeGreaterThanOrEqual(1)
    expect(r.report.cost.knownUsd).toBeLessThanOrEqual(0.02 + 1e-9)
  })
  it('the runner holds the RUN cap itself: driven turn by turn without runUat it still cannot book more than the run cap', async () => {
    const { opts, t } = withCaps(0.05, 0.05)
    const { runner } = createBenchRunner(opts)
    await runner({ turn: UAT_TURNS[0], history: [] })
    await expect(runner({ turn: UAT_TURNS[1], history: [] })).rejects.toThrow()
    expect(t.requests).toHaveLength(1) // the second turn never reached the transport
  })
})

describe('P1-1 · the result folder: required, on drive D, outside the repository and the backups folder, and writable — all checked before a paid request', () => {
  const refusedBefore = async (outDir: unknown, fsFail?: (op: string, p: string) => boolean) => {
    const { opts, t, fs } = withCaps(0.05, 0.65, { outDir: outDir as string })
    if (fsFail) fs.failOn = fsFail as never
    await expect(runBench(opts), String(outDir)).rejects.toBeInstanceOf(BenchRefusal)
    expect(() => createBenchRunner(opts), String(outDir)).toThrow(BenchRefusal)
    expect(t.requests, String(outDir)).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
    expect(finalFile(fs), String(outDir)).toBeNull()
  }
  it('missing outDir (no temp-folder default any more)', async () => { await refusedBefore(undefined); await refusedBefore('') })
  it('drive C and other drives', async () => { for (const d of ['C:/Users/Admin/AppData/Local/Temp/x', 'c:\\tmp\\x', 'E:/bench', 'Z:/x']) await refusedBefore(d) })
  it('relative paths, drive-relative paths, `..` that could leave drive D, UNC and device paths', async () => {
    for (const d of ['bench-out', './bench-out', '../bench-out', 'D:bench', 'D:/ok/../../C:/x', 'D:/a/../../../Users', '\\\\server\\share\\x', '\\\\?\\D:\\x', '//server/share/x', 'D:/x/file.txt:stream']) await refusedBefore(d)
  })
  it('inside the repository (also through a symlink-looking `..`) and inside the backups folder', async () => {
    for (const d of ['D:/TappyAI-wt/wt-integration', 'D:/TappyAI-wt/wt-integration/docs/bench', 'd:\\tappyai-wt\\wt-integration\\out', 'D:/Claude/TappyAI-backups/x', 'D:\\Claude\\TappyAI-backups']) await refusedBefore(d)
  })
  it('a folder that cannot be created, or a probe file that cannot be written or removed, is refused before any request', async () => {
    await refusedBefore(OUT_DIR, op => op === 'mkdirp')
    await refusedBefore(OUT_DIR, op => op === 'write')
    await refusedBefore(OUT_DIR, op => op === 'remove')
  })
  it('the probe is created and deleted BEFORE the first request, and nothing else is left behind by it', async () => {
    const order: string[] = []
    const { opts, fs, t } = withCaps(0.05, 0.65)
    const chat = opts.chat
    opts.chat = async req => { order.push(`chat:${fs.ops.length}`); return chat(req) }
    await runBench(opts)
    const firstChat = Number(order[0].split(':')[1])
    const before = fs.ops.slice(0, firstChat)
    expect(before.some(o => o.startsWith('mkdirp:'))).toBe(true)
    const probeWrite = before.find(o => /^write:.*\.probe-/.test(o))
    expect(probeWrite).toBeDefined()
    expect(before).toContain(`remove:${probeWrite!.slice('write:'.length)}`)
    expect(t.requests).toHaveLength(13)
    expect([...fs.files.keys()].some(p => /\.probe-/.test(p))).toBe(false)
  })
  it('a good folder on D is accepted (either slash, either case)', async () => {
    for (const d of ['D:/TappyAI-review-artifacts/x', 'd:\\TappyAI-review-artifacts\\x']) {
      __resetBenchProcessGuardForTests() // C-1: one runner per process; each iteration is a separate run
      const { opts, t } = withCaps(0.05, 0.65, { outDir: d })
      const r = await runBench(opts)
      expect(r.valid).toBe(true)
      expect(t.requests).toHaveLength(13)
    }
  })
})

describe('P1-2 · evidence is kept turn by turn, and a failed run still leaves a file that says so', () => {
  it('each turn is appended to a JSONL file in outDir as soon as it finishes — before the next turn starts', async () => {
    const seen: number[] = []
    const holder: { fs?: ReturnType<typeof memFs> } = {}
    const t = turnTransport({ onTurn: n => { seen.push(jsonlLines(holder.fs!).length - (n - 1)) } })
    const { opts, fs } = options({ chat: t.chat })
    holder.fs = fs
    const r = await runBench(opts)
    expect(r.valid).toBe(true)
    expect(seen.every(x => x === 0)).toBe(true) // when turn n starts, exactly n-1 lines are already on disk
    const lines = jsonlLines(fs)
    expect(lines.map(l => l.id)).toEqual(UAT_TURNS.map(x => x.id))
    expect([...fs.files.keys()].some(p => /\.jsonl$/.test(p) && p.startsWith(OUT_DIR))).toBe(true)
  })
  it('valid run: totalUsd is present (report and summary) and all 13 turns are in the file', async () => {
    const { opts, fs } = options()
    await runBench(opts)
    const f = finalFile(fs)!
    expect(f.json.valid).toBe(true)
    expect(f.json.turns).toHaveLength(13)
    expect(f.json.report.cost.totalUsd).toBeCloseTo(13 * 0.004, 10)
    expect(f.json.summary.totalUsd).toBeCloseTo(13 * 0.004, 10)
  })
  it('a transport that throws at turn 3: turns 1–3 are on disk, valid=false, totalUsd is ABSENT at every level, and nothing runs after it', async () => {
    let n = 0
    const base = turnTransport()
    const chat: ChatTransport = async req => { n++; if (n === 3) throw new Error('provider reset the connection'); return base.chat(req) }
    const { opts, fs } = options({ chat })
    const r = await runBench(opts)
    expect(r.valid).toBe(false)
    expect(n).toBe(3) // runUat did not go on
    expect(jsonlLines(fs).map(l => l.id)).toEqual(UAT_TURNS.slice(0, 3).map(x => x.id))
    const f = finalFile(fs)!
    expect(f.json.valid).toBe(false)
    expect(f.json.turns).toHaveLength(3)
    expect(f.json.turns[2].error).toMatch(/connection/)
    expect(f.json.cost?.state ?? f.json.costState).toBe('unknown')
    expect(hasKey(f.json, 'totalUsd')).toBe(false)
  })
  it('an unknown cost (a paid call failed after it was sent) at turn 4: same — evidence kept, no totalUsd anywhere', async () => {
    let n = 0
    const base = turnTransport()
    const chat: ChatTransport = async req => { n++; if (n === 4) { reserveSpend('llm:consult', 0.004)!.markUnknown(); return { raw: '0:"x"\nd:{}\n' } } return base.chat(req) }
    const { opts, fs } = options({ chat })
    const r = await runBench(opts)
    expect(r.valid).toBe(false)
    const f = finalFile(fs)!
    expect(f.json.turns).toHaveLength(4)
    expect(f.json.turns[3].cost.state).toBe('unknown')
    expect(hasKey(f.json, 'totalUsd')).toBe(false)
    expect(f.json.openReservations?.length ?? f.json.turns[3].openReservedUsd).toBeTruthy()
  })
  it('a valid-books run that is invalid for another reason (a refused call) also carries no totalUsd', async () => {
    let n = 0
    const base = turnTransport()
    const chat: ChatTransport = async req => { n++; if (n === 2) { try { reserveSpend('llm:consult', 0.06) } catch { /* refused by the cap */ } return { raw: '0:"x"\nd:{}\n' } } return base.chat(req) }
    const { opts, fs } = options({ chat })
    const r = await runBench(opts)
    expect(r.valid).toBe(false)
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })
  it('runUat itself THROWS at turn 3: the file is still written (valid=false, the error, turns 1–2, no totalUsd) and runBench rethrows', async () => {
    const t = turnTransport()
    const { opts, fs } = options({ chat: t.chat })
    ;(opts as BenchOptions & { runUatImpl?: typeof runUat }).runUatImpl = async o => {
      for (const turn of UAT_TURNS.slice(0, 2)) await o.runner({ turn, history: [] })
      throw new Error('boom inside runUat')
    }
    await expect(runBench(opts)).rejects.toThrow(/boom inside runUat/)
    expect(t.requests).toHaveLength(2)
    const f = finalFile(fs)!
    expect(f.json.valid).toBe(false)
    expect(f.json.error).toMatch(/boom inside runUat/)
    expect(f.json.turns).toHaveLength(2)
    expect(f.json.report ?? null).toBeNull()
    expect(hasKey(f.json, 'totalUsd')).toBe(false)
  })
  it('a write that fails while saving a turn STOPS the run and says so: no turn after it, a clear error, no silent continue', async () => {
    const { opts, fs, t } = (() => { const x = options(); return { ...x, t: turnTransport() } })()
    opts.chat = t.chat
    fs.failOn = (op, p) => op === 'append' && jsonlLines(fs).length >= 1 && /\.jsonl$/.test(p)
    await expect(runBench(opts)).rejects.toThrow(/could not be (saved|announced)/i)
    expect(t.requests.length).toBeLessThanOrEqual(2) // turn 2 was already running when its record could not be saved; turn 3 never started
  })
  it('a final file that cannot be written is an error, not a silent success', async () => {
    const { opts, fs } = options()
    fs.failOn = (op, p) => op === 'write' && /\/bench-\d+\.json$/.test(p.replace(/\\/g, '/'))
    await expect(runBench(opts)).rejects.toThrow(/bench-\d+\.json|write|saved/i)
  })
  it('after a stop the same runner will not send another request (no automatic re-run)', async () => {
    let n = 0
    const base = turnTransport()
    const chat: ChatTransport = async req => { n++; if (n === 1) throw new Error('reset'); return base.chat(req) }
    const { opts } = options({ chat })
    const { runner } = createBenchRunner(opts)
    await expect(runner({ turn: UAT_TURNS[0], history: [] })).rejects.toThrow()
    await expect(runner({ turn: UAT_TURNS[0], history: [] })).rejects.toThrow()
    expect(n).toBe(1)
  })
})

// ── findings of the independent review (written AFTER the fixes; see the report) ──────────────────────────────────────────────
describe('review 1 · the REAL location of the folder is checked, not only its name (junctions, symlinks, 8.3 short names)', () => {
  const refusedReal = async (real: (p: string) => string) => {
    const { opts, t, fs } = withCaps(0.05, 0.65)
    fs.real = real
    await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
    expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
    expect(t.requests).toHaveLength(0)
    expect(fs.ops.some(o => o.startsWith('write:'))).toBe(false) // not even the probe was written there
  }
  it('a junction to drive C', async () => { await refusedReal(() => 'C:\\Users\\Admin\\AppData\\Local\\Temp\\x') })
  it('a junction into the repository (this one and the one the module lives in)', async () => {
    await refusedReal(() => 'D:\\TappyAI-wt\\wt-integration\\docs\\bench')
    await refusedReal(() => 'D:\\TappyAI-wt\\wt-integration')
  })
  it('a junction into the backups folder', async () => { await refusedReal(() => 'D:\\Claude\\TappyAI-backups\\x') })
  it('a UNC target and an unresolvable path', async () => {
    await refusedReal(() => '\\\\server\\share\\x')
    await refusedReal(() => { throw new Error('ENOENT') })
  })
  it('review F4 · the repository itself reached through a junction: its real location counts, an output folder inside it is refused', async () => {
    await refusedReal(p => (/wt-integration$/i.test(p.replace(/\\/g, '/')) ? 'D:\\Elsewhere\\real-repo' : 'D:\\Elsewhere\\real-repo\\out'))
  })
  it('a real location on D outside the repo is accepted', async () => {
    const { opts, t, fs } = withCaps(0.05, 0.65)
    fs.real = p => (/TappyAI-review-artifacts/i.test(p) ? 'D:\\TappyAI-review-artifacts\\real' : p)
    expect((await runBench(opts)).valid).toBe(true)
    expect(t.requests).toHaveLength(13)
  })
})

describe('review 3 · a turn is announced on disk before its first request', () => {
  it('a "started" line with the turn id and the reserved amount precedes each turn; the run stops before sending when it cannot be written', async () => {
    const holder: { fs?: ReturnType<typeof memFs> } = {}
    const seen: number[] = []
    const t = turnTransport({ onTurn: n => { seen.push(jsonlStarts(holder.fs!).length - n) } })
    const { opts, fs } = options({ chat: t.chat })
    holder.fs = fs
    await runBench(opts)
    expect(seen.every(x => x === 0)).toBe(true) // when request n is sent, n start lines exist
    expect(jsonlStarts(fs)[0]).toMatchObject({ started: 'Q1', reservedUsd: 0.05 })

    __resetBenchProcessGuardForTests() // C-1: the second run below is a separate run
    const t2 = turnTransport()
    const o2 = options({ chat: t2.chat })
    o2.fs.failOn = (op, p) => op === 'append' && /\.jsonl$/.test(p)
    await expect(runBench(o2.opts)).rejects.toThrow(/could not be announced/)
    expect(t2.requests).toHaveLength(0)
  })
})

describe('review 4 · an answer stream the parser cannot read does not lose the turn', () => {
  it('"9:null" (a tool frame that is not an object): the turn is recorded, saved, the run stops, and the runner sends nothing more', async () => {
    const chat: ChatTransport = async req => { void req; reserveSpend('llm:consult', 0.004)!.settle(0.003); return { raw: '0:"x"\n9:null\n' } }
    const { opts, fs } = options({ chat })
    const { runner } = createBenchRunner(opts)
    await expect(runner({ turn: UAT_TURNS[0], history: [] })).rejects.toThrow(/could not be parsed/)
    expect(jsonlLines(fs)).toHaveLength(1)
    expect(jsonlLines(fs)[0].answer).toContain('9:null') // the raw text is kept
    await expect(runner({ turn: UAT_TURNS[1], history: [] })).rejects.toThrow(/stopped/)
  })
})

describe('review 2 · a call refused because it cannot be bounded (no_bound) is counted: the turn is degraded and the run is not valid', () => {
  it('a media part / unpriceable LLM call refused inside reserveSpend shows up in refusals / degraded; the run is not valid', async () => {
    let n = 0
    const base = turnTransport()
    const chat: ChatTransport = async req => {
      n++
      if (n === 2) { try { reserveSpend('llm:consult', null) } catch (e) { expect((e as Error).name).toBe('SpendRefusal') } }
      return base.chat(req)
    }
    const { opts, fs } = options({ chat })
    const r = await runBench(opts)
    expect(r.records[1]).toMatchObject({ refusals: 1, photoSkips: 0, degraded: true })
    expect(r.valid).toBe(false)
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })
  it('a skipped photo lookup (serper:images) is counted apart as photoSkips: visible in the record, the text answer is not degraded and the run stays valid', async () => {
    let n = 0
    const base = turnTransport()
    const chat: ChatTransport = async req => {
      n++
      if (n === 2) { try { reserveSpend('serper:images', null) } catch (e) { expect((e as Error).name).toBe('SpendRefusal') } }
      return base.chat(req)
    }
    const { opts, fs } = options({ chat })
    const r = await runBench(opts)
    expect(r.records[1]).toMatchObject({ refusals: 0, photoSkips: 1, degraded: false })
    expect(r.valid).toBe(true)
    expect(finalFile(fs)!.json.turns[1].photoSkips).toBe(1)
  })
  it('review F2 · HTTP errors and empty answers are not benchmark answers: 13 × 401 with a non-stream body, or an empty 200, is not a valid run', async () => {
    for (const reply of [{ raw: '{"error":"unauthorized"}', status: 401 }, { raw: '{"error":"x"}', status: 500 }, { raw: '', status: 200 }, { raw: 'd:{"finishReason":"stop"}\n', status: 200 }]) {
      __resetBenchProcessGuardForTests() // C-1: each reply is a separate run
      let sent = 0
      const { opts, fs } = options({ chat: async () => { sent++; return reply } })
      const r = await runBench(opts)
      expect(r.valid, JSON.stringify(reply)).toBe(false)
      expect(sent, 'the run stops at the first bad answer: nothing more is sent').toBe(1)
      expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
      expect(r.records[0].error).toMatch(/HTTP|empty/)
    }
  })
  it('after the turn ended it is a late refusal, not a degraded answer', async () => {
    const chat: ChatTransport = async req => {
      const ok = await turnTransport().chat(req)
      setTimeout(() => { try { reserveSpend('serper:images', null) } catch { /* refused */ } }, 0)
      return ok
    }
    const { opts } = options({ chat })
    const r = await runBench(opts)
    await new Promise(res => setTimeout(res, 5))
    expect(r.records[0]).toMatchObject({ refusals: 0, lateRefusals: 1, degraded: false })
  })
})

describe('review 6 + 8 · valid needs every turn; a failing final write is retried and said plainly', () => {
  it('a driver that returns a "complete" report without running the turns is not a valid run', async () => {
    const { opts } = options()
    ;(opts as BenchOptions & { runUatImpl?: typeof runUat }).runUatImpl = async () => ({ turns: [], notRun: [], stopped: null, cost: { knownUsd: 0, knownSubtotalUsd: 0, unknownTurns: [], unresolvedReservedUsd: 0, costAccounted: true, complete: true, totalUsd: 0 } })
    const r = await runBench(opts)
    expect(r.valid).toBe(false)
  })
  it('the final file cannot be written: a second copy is tried under another name and the error names both and the JSONL', async () => {
    const { opts, fs } = options()
    fs.failOn = (op, p) => op === 'write' && /\/bench-\d+\.json$/.test(p.replace(/\\/g, '/'))
    await expect(runBench(opts)).rejects.toThrow(/\.retry/)
    expect([...fs.files.keys()].some(p => /bench-\d+\.json\.retry$/.test(p))).toBe(true)
  })
})

// keep the helper imports used when a case above is trimmed
void declare

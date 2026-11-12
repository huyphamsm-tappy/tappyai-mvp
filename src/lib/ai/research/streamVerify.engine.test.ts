// RESEARCH_STREAM_VERIFY (R13 9.5) in the engine: a finished section of a thesis report is shown while the next is still being written; flag off = the text is released once, as before.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { runDeepResearch, type DeepResearchDeps, type Evidence, type ResearchPlan } from './deepResearch'
import type { Outline } from './thesisReport'

afterEach(() => { vi.unstubAllEnvs() })
vi.spyOn(console, 'log').mockImplementation(() => {})

const PAGE = 'Theo khảo sát của iPOS.vn, nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026. Có 700 cửa hàng.'
const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Chi tiêu', queries: ['q'] }] }
const outline: Outline = { thesis: 'Dòng tiền dịch lên nhóm giá cao', sections: [{ title: 'Giá tăng', points: [{ claim: 'p', cards: ['C1'] }] }, { title: 'Còn lại', points: [{ claim: 'q', cards: ['C1'] }] }], doubts: [] }
const CHUNKS = [
  '# Báo cáo\n\nMở đầu.\n\n## 1. Giá tăng\nNhóm giá cao tăng lên 61,78% [1]. Nhóm giá cao đạt 99,99% [1].\n\n',
  '## 2. Còn lại\nCó 700 cửa hàng [1]. Có 888 cửa hàng [1].\n',
]

function mk(write: DeepResearchDeps['write'], trace?: Array<Record<string, unknown>>): DeepResearchDeps {
  return {
    async plan() { return structuredClone(plan) },
    async gather() { return [{ title: 'iPOS', url: 'https://ipos.vn/bao-cao', snippet: 's', text: PAGE }] },
    async notes(_s: string, _q: string, e: readonly Evidence[]) { return [{ text: 'Nhóm 36–70k tăng lên 61,78%', source: e[0]!.id, quote: 'nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%' }] as never },
    analyze: async () => outline,
    write,
    ...(trace ? { trace: (e: Record<string, unknown>) => { trace.push(e) } } : {}),
  }
}
async function run(write: DeepResearchDeps['write'], trace?: Array<Record<string, unknown>>) {
  const pieces: string[] = []
  const out = await runDeepResearch('câu hỏi', '', 'vi', mk(write, trace), { status() {}, text(x) { pieces.push(x) } })
  return { out, pieces, emitted: pieces.join('') }
}
const chunked = (seen?: { atSecond: number }, pieces?: () => number): DeepResearchDeps['write'] => async function* () {
  yield CHUNKS[0]!
  if (seen && pieces) seen.atSecond = pieces()
  yield CHUNKS[1]!
}

describe('flag off: the text is held and released once', () => {
  it('nothing is shown at the second chunk, and the verifier removed the refuted figures', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const seen = { atSecond: -1 }
    const pieces: string[] = []
    const deps = mk(async function* () { yield CHUNKS[0]!; seen.atSecond = pieces.length; yield CHUNKS[1]! })
    const out = await runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text(x) { pieces.push(x) } })
    expect(seen.atSecond).toBe(0)
    expect(out.thesis?.dropped).toBe(2)
    expect(pieces.join('')).not.toContain('99,99')
  })
})

describe('flag on: a finished section is shown before the report is finished', () => {
  it('section 1 is out (clean) by the time the writer starts section 2; the total text equals the flag-off text', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const off = await run(chunked())
    vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const seen = { atSecond: -1 }
    const live: string[] = []
    let atSecond = ''
    const deps = mk(async function* () { yield CHUNKS[0]!; yield CHUNKS[1]!.slice(0, 14); atSecond = live.join(''); yield CHUNKS[1]!.slice(14) })
    const out = await runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text(x) { live.push(x) } })
    expect(seen.atSecond).toBe(-1)
    expect(atSecond).toContain('61,78%')
    expect(atSecond).not.toContain('99,99')
    expect(atSecond).not.toContain('700 cửa hàng')
    expect(live.join('')).toBe(off.emitted)
    expect(out.thesis).toEqual({ dropped: 2, charsBefore: expect.any(Number) })
  })
  it('never shows a figure the verifier refuted, in any piece', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1'); vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const { pieces } = await run(chunked())
    for (const p of pieces) { expect(p).not.toContain('99,99'); expect(p).not.toContain('888') }
  })
  it('logs one section event per section (counts, never the text)', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1'); vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const trace: Array<Record<string, unknown>> = []
    await run(chunked(), trace)
    const secs = trace.filter(e => e.ev === 'section')
    expect(secs.map(e => e.status)).toEqual(['PASS', 'PARTIAL', 'PARTIAL'])
    expect(JSON.stringify(secs)).not.toContain('99,99')
  })
  it('without the thesis flag it does nothing: the report streams as before', async () => {
    vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const { emitted, out } = await run(chunked())
    expect(emitted).toContain('99,99')
    expect(out.thesis).toBeUndefined()
  })
})

describe('flag on: an interrupted write', () => {
  it('after a section was shown: the shown section stays, the half-written one never appears, and the report is NOT written a second time from the findings', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1'); vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const calls: Array<string | undefined> = []
    const { out, emitted } = await run(async function* (i) {
      calls.push(i.thesisNotes)
      yield CHUNKS[0]!
      yield '## 2. Còn lại\nCó 700 cửa hàng [1]. Có 888 cửa'
      throw new Error('provider overloaded')
    })
    expect(calls).toHaveLength(1)
    expect(out.failed).toBeNull()
    expect(out.cut).toBe(true)
    expect(emitted).toContain('61,78%')
    expect(emitted).not.toContain('99,99')
    expect(emitted).not.toContain('Còn lại')
    expect(emitted).toContain('iPOS') // the sources block of what was shown
  })
  it('before any section was complete: as before, the report is written from the findings', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1'); vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const calls: Array<string | undefined> = []
    const { out, emitted } = await run(async function* (i) {
      calls.push(i.thesisNotes)
      if (i.thesisNotes !== undefined) { yield '## 1. Giá tăng\nNhóm giá cao tăng lên 61,78% [1]. Có'; throw new Error('provider overloaded') }
      yield '# Báo cáo cũ\n\n## 1. Giá tăng\nNhóm giá cao tăng lên 61,78% [1].\n'
    })
    expect(calls).toHaveLength(2)
    expect(out.failed).toBeNull()
    expect(emitted).toContain('Báo cáo cũ')
  })
  it('both writes fail with nothing shown: the run fails as before', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1'); vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    // eslint-disable-next-line require-yield
    const { out } = await run(async function* () { throw new Error('down') })
    expect(out.failed).toBe('write_failed')
  })
  it('a text with nothing left after the check is an empty report: the same way out as with the flag off (the older write from the findings)', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const w: DeepResearchDeps['write'] = async function* () { yield 'Có 888 cửa hàng [1].' }
    const off = await run(w)
    vi.stubEnv('RESEARCH_STREAM_VERIFY', '1')
    const on = await run(w)
    expect(on.out.failed).toBe(off.out.failed)
    expect(on.emitted).toBe(off.emitted)
  })
})

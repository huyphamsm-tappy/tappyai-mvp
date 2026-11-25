// R13 9.5 inside the held-text design: a finished section is read by the verifier and shown while the next one is still being written.
import { describe, it, expect } from 'vitest'
import { releaseText } from './thesisReport'
import { createSectionRelease, sectionEventOf } from './sectionRelease'
import { researchStreamVerifyOn, researchContractsOn } from './deepResearchState'

const sources = [
  { id: 1, title: 'S1', snippet: '', text: 'Doanh thu năm 2025 đạt 12.500 tỷ đồng.' },
  { id: 2, title: 'S2', snippet: '', text: 'Có 700 cửa hàng.' },
  { id: 3, title: 'S3', snippet: '', text: 'Giá trung bình 45.000 đồng.' },
]
const REPORT = [
  '# Tiêu đề', '', 'Mở đầu không có số.', '',
  '## 1. A', 'Có 700 cửa hàng [2]. Chuỗi mở thêm 800 cửa hàng [2].', '',
  '## 2. B', 'Doanh thu đạt 12.500 tỷ đồng [1]. Doanh thu đạt 99.999 tỷ đồng [1].', '| Kịch bản | 2027 |', '| thấp | 120 |', '',
  '### nhỏ', 'Giá trung bình 45.000 đồng [3]. Tăng 35% mỗi năm.', '',
  '## 3. C', 'Chỉ có câu sai 777 cửa hàng [9].', '',
].join('\n')

/** feed the text in small pieces, the way a model streams it */
function feed(text: string, size: number, trusted = '') {
  const rel = createSectionRelease(sources, trusted)
  const out: ReturnType<typeof rel.push> = []
  for (let i = 0; i < text.length; i += size) out.push(...rel.push(text.slice(i, i + size)))
  return { rel, out, end: rel.end() }
}

describe('the flags', () => {
  it('are off unless exactly 1 and locked in a production runtime', () => {
    for (const [on, name] of [[researchStreamVerifyOn, 'RESEARCH_STREAM_VERIFY'], [researchContractsOn, 'RESEARCH_CONTRACTS']] as const) {
      expect(on({})).toBe(false)
      expect(on({ [name]: 'true' })).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      expect(on({ [name]: '1', VERCEL_ENV: 'production' })).toBe(false)
      expect(on({ [name]: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: name })).toBe(true)
    }
  })
})

describe('section by section equals the whole text released at once', () => {
  for (const size of [1, 3, 7, 50, 10_000]) {
    it(`pieces of ${size} characters: same text, same sources, same numbers`, () => {
      const whole = releaseText(REPORT, sources)
      const { out, end } = feed(REPORT, size)
      const shownText = [...out.map(s => s.text), end.last?.text ?? ''].join('')
      expect(shownText).toBe(whole.text)
      expect(end.text).toBe(whole.text)
      expect(end.dropped).toBe(whole.dropped)
      expect(end.used).toEqual(whole.used)
      expect([...end.renumbered]).toEqual([...whole.renumbered])
    })
  }
  it('the scenario-model text is trusted section by section too', () => {
    const model = 'Growth: base 9,3.'
    const r = 'Mở.\n\n## A\nTăng 9,3% mỗi năm.\n\n## B\nTăng 7,7% mỗi năm.\n'
    expect(feed(r, 4, model).end.text).toBe(releaseText(r, sources, model).text)
    expect(feed(r, 4, model).end.text).toContain('9,3')
    expect(feed(r, 4, model).end.text).not.toContain('7,7')
  })
})

describe('a section is shown as soon as the next heading starts, and not before', () => {
  it('nothing is shown while a section is still being written', () => {
    const rel = createSectionRelease(sources)
    expect(rel.push('# T\n\nMở đầu.\n\n## 1. A\nCó 700 cửa hàng [2].')).toHaveLength(1) // the title block is complete: "## 1." has started
    expect(rel.push(' Thêm một câu.')).toHaveLength(0)
    expect(rel.push('\n\n#')).toHaveLength(0) // a lone # is not a heading yet
    expect(rel.push('# 2. B\nCâu.')).toHaveLength(1) // now section A is complete
  })
  it('a ### sub-heading does not end a section', () => {
    const rel = createSectionRelease(sources)
    expect(rel.push('## A\nx.\n\n### nhỏ\ny.\n\n')).toHaveLength(0)
    expect(rel.end().text).toContain('### nhỏ')
  })
  it('the first section is released before the text is finished', () => {
    const { out } = feed(REPORT, 5)
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out[0]!.text).toContain('Tiêu đề')
  })
})

describe('nothing a verifier refuted is ever shown', () => {
  it('every piece handed out is already clean; the refused sentences appear in no piece', () => {
    const { out, end } = feed(REPORT, 6)
    const all = [...out.map(s => s.text), end.last?.text ?? ''].join('\n')
    for (const bad of ['800 cửa hàng', '99.999', '35%', '777']) expect(all).not.toContain(bad)
    for (const good of ['700 cửa hàng', '12.500', '45.000', '| thấp | 120 |']) expect(all).toContain(good)
  })
  it('citations are numbered across sections in order of first use, and an earlier piece is never renumbered afterwards', () => {
    const { out, end } = feed('## A\nCó 700 cửa hàng [2].\n\n## B\nDoanh thu 12.500 tỷ đồng [1]. Có 700 cửa hàng [2].\n', 9)
    expect(out[0]!.text).toContain('700 cửa hàng [1]')
    expect(end.last!.text).toContain('12.500 tỷ đồng [2]')
    expect(end.last!.text).toContain('700 cửa hàng [1]')
    expect(end.used.map(s => s.title)).toEqual(['S2', 'S1'])
  })
  it('a status per section: PASS when nothing was dropped, PARTIAL when something was, REJECTED when every sentence of its body was', () => {
    const { out, end } = feed(REPORT, 8)
    const all = [...out, ...(end.last ? [end.last] : [])]
    expect(all.map(s => s.status)).toEqual(['PASS', 'PARTIAL', 'PARTIAL', 'REJECTED'])
    expect(all.map(s => s.dropped)).toEqual([0, 1, 2, 1])
  })
})

describe('an interruption keeps what was verified and shows nothing from the unfinished section', () => {
  it('abandon() returns the sections already shown, never the half-written one', () => {
    const rel = createSectionRelease(sources)
    const shown = rel.push('## A\nCó 700 cửa hàng [2].\n\n## B\nDoanh thu đạt 12.500 tỷ đồng [1]. Doanh thu đạt 99')
    expect(shown).toHaveLength(1)
    const r = rel.abandon()
    expect(r.text).toContain('700 cửa hàng [1]')
    expect(r.text).not.toContain('12.500')
    expect(r.shown).toBe(1)
    expect(r.used.map(s => s.title)).toEqual(['S2'])
  })
  it('end() after nothing was pushed gives an empty text and shows nothing', () => {
    const e = createSectionRelease(sources).end()
    expect(e.text).toBe('')
    expect(e.last).toBeNull()
  })
})

describe('the event of a section (R13 9.5 names, without claim ids this engine does not have)', () => {
  it('SECTION_VERIFIED for a clean or partly dropped section, SECTION_REJECTED when no body is left', () => {
    const { out, end } = feed(REPORT, 8)
    const evs = [...out, ...(end.last ? [end.last] : [])].map(s => sectionEventOf('r1', s))
    expect(evs.map(e => e.type)).toEqual(['SECTION_VERIFIED', 'SECTION_VERIFIED', 'SECTION_VERIFIED', 'SECTION_REJECTED'])
    const first = evs[0]!
    expect(first).toMatchObject({ reportId: 'r1', sectionId: 's1', verificationStatus: 'PASS' })
    expect(JSON.stringify(evs[3])).not.toContain('777')
  })
})

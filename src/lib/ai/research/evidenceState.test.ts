// 15/11: the shared state of a run's facts, tested on what the chip report's trace really contained (uat-3000.log, lines 45603-46504): the Deloitte finding that wrote "0,2%" beside 20 million of
// 1.05 trillion chips; McKinsey's 1.6 trillion (late 2025) beside its 2.3 trillion (autumn 2026); WSTS, SIA, TSMC and the company's newsroom that the host list did not know.
import { describe, it, expect } from 'vitest'
import { whenOf, resolveVintages, ratioMismatch, readNumber, SUPERSEDE_MIN_DAYS } from './evidenceState'
import { buildCards, classifySource, factFamily, authorityFor, pickForAnalyst, forAnalyst, cardSummary } from './evidenceCards'
import { analystCards } from './thesisReport'
import { groundForecast } from './forecastModel'
import { numberInText, checkedFigure } from './deepResearch'
import type { Evidence, Finding } from './deepResearch'

describe('whenOf', () => {
  it('reads a year, a month or a day; anything else is unknown', () => {
    expect(whenOf('2026-09-18')).toBe(Date.UTC(2026, 8, 18))
    expect(whenOf('2026-06')).toBe(Date.UTC(2026, 5, 1))
    expect(whenOf('2026')).toBe(Date.UTC(2026, 0, 1))
    expect(whenOf('2026-09-18T10:00:00Z')).toBe(Date.UTC(2026, 8, 18))
    for (const bad of ['', 'yesterday', '1850-01-01', '2026-13-01', undefined, null]) expect(whenOf(bad as never)).toBeNull()
  })
})

describe('readNumber', () => {
  it('Vietnamese and English decimals and thousands', () => {
    expect(readNumber('1,05')).toBe(1.05)
    expect(readNumber('1.05')).toBe(1.05)
    expect(readNumber('0,2')).toBe(0.2)
    expect(readNumber('1.655')).toBe(1655)
    expect(readNumber('1,655')).toBe(1655)
    expect(readNumber('1.234.567')).toBe(1234567)
    expect(readNumber('1,234.5')).toBe(1234.5)
    expect(readNumber('1.234,5')).toBe(1234.5)
  })
})

describe('ratioMismatch: the code computes a share, the model never does', () => {
  const DELOITTE = 'Năm 2025 khoảng 1,05 nghìn tỷ chip được bán với giá trung bình 0,74 USD mỗi chip; chip AI tạo sinh được dự kiến chiếm khoảng 50% doanh thu ngành năm 2026 nhưng chỉ chưa tới 20 triệu chip, khoảng 0,2% '
  it('the real finding: 20 million of 1.05 trillion chips is 0.0019%, not 0.2%', () => {
    const r = ratioMismatch(DELOITTE)!
    expect(r).not.toBeNull()
    expect(r.claimedPercent).toBe(0.2)
    expect(r.computedPercent).toBeCloseTo(0.0019, 4)
    expect(r.note).toMatch(/ARITHMETIC CHECK/)
    expect(r.note).toMatch(/says 0,2%/)
    expect(r.note).toMatch(/20 million of 1\.05 trillion is 0\.0019%/)
  })
  it('a share that is right passes, and so does a rounding-sized difference', () => {
    expect(ratioMismatch('Có 20 triệu chip AI trên tổng 1,05 nghìn tỷ chip, khoảng 0,0019%')).toBeNull()
    expect(ratioMismatch('Chi phí 5 tỷ USD, tức khoảng 5% của tổng 100 tỷ USD')).toBeNull()
  })
  it('growth is not a share: a percentage after "tăng" or "so với" is never checked against the quantities', () => {
    expect(ratioMismatch('Doanh thu quý 3 đạt 46,7 tỷ USD, quý trước là 96,2 tỷ USD, tăng 0,5%')).toBeNull()
    expect(ratioMismatch('Đạt 100 tỷ USD so với 200 tỷ USD cùng kỳ, khoảng 0,5% cao hơn dự báo')).toBeNull()
  })
  it('different units are not compared, a text with one quantity is not checked, and nothing is guessed', () => {
    expect(ratioMismatch('Có 20 triệu chip, khoảng 0,2% và 1,05 nghìn tỷ USD doanh thu')).toBeNull()
    expect(ratioMismatch('Chỉ 20 triệu chip, khoảng 0,2%')).toBeNull()
    expect(ratioMismatch('')).toBeNull()
  })
})

describe('resolveVintages: a newer statement of the same fact replaces the older one', () => {
  const day = 86_400_000
  const base = Date.UTC(2026, 10, 1)
  const item = (id: string, value: number, daysAgo: number | null, rank = 2, key = 'k') => ({ id, key, value, when: daysAgo === null ? null : base - daysAgo * day, rank })
  it('McKinsey: 1.6 trillion (late 2025) is replaced by 2.3 trillion (autumn 2026)', () => {
    const m = resolveVintages([item('C1', 1.6, 330), item('C2', 2.3, 60)], 0.02)
    expect(m.get('C1')).toBe('C2')
    expect(m.has('C2')).toBe(false)
  })
  it('the same value is not replaced; a missing date never decides; a gap under the minimum is not a replacement', () => {
    expect(resolveVintages([item('C1', 2.3, 330), item('C2', 2.3, 60)], 0.02).size).toBe(0)
    expect(resolveVintages([item('C1', 1.6, null), item('C2', 2.3, 60)], 0.02).size).toBe(0)
    expect(resolveVintages([item('C1', 1.6, 60 + SUPERSEDE_MIN_DAYS - 1), item('C2', 2.3, 60)], 0.02).size).toBe(0)
  })
  it('a newer but LESS authoritative statement does not replace an older official one (the conflict stays)', () => {
    expect(resolveVintages([item('C1', 1.51, 150, 3), item('C2', 1.655, 40, 1)], 0.02).size).toBe(0)
    expect(resolveVintages([item('C1', 1.51, 150, 2), item('C2', 1.655, 40, 3)], 0.02).get('C1')).toBe('C2')
  })
  it('other facts are untouched', () => {
    expect(resolveVintages([item('C1', 1.6, 330, 2, 'a'), item('C2', 2.3, 60, 2, 'b')], 0.02).size).toBe(0)
  })
})

describe('the publishers the host list did not know (the chip report: 354 of 441 cards were OTHER)', () => {
  it('statistics and industry bodies, regulators and intergovernmental bodies are OFFICIAL', () => {
    for (const u of ['https://www.wsts.org/76/Global-Semiconductor-Market-records', 'https://www.semiconductors.org/global-semiconductor-sales/', 'https://www.sec.gov/Archives/edgar/data/1045810/x.htm',
      'https://www.census.gov/x', 'https://www.gov.uk/x', 'https://www.meti.go.jp/x', 'https://www.bundesbank.de/x'.replace('bundesbank.de', 'europa.eu'), 'https://www.who.int/x', 'https://www.iea.org/reports/x']) {
      expect(classifySource(u)).toBe('OFFICIAL')
    }
  })
  it('a company\'s investor or newsroom page is the company\'s own; "go.com" is not a government', () => {
    for (const u of ['https://nvidianews.nvidia.com/news/nvidia-announces', 'https://investor.asml.com/x', 'https://ir.tsmc.com/x', 'https://newsroom.intel.com/x', 'https://pr.tsmc.com/english/news/3000']) expect(classifySource(u)).toBe('COMPANY')
    expect(classifySource('https://www.gartner.com/en/newsroom/press-releases/2026-08-24-gartner-forecasts-worldwide-semiconductor')).toBe('RESEARCH_FIRM') // an analyst's newsroom is the analyst, not a company
    expect(classifySource('https://www.acme.com/newsroom/results-q3')).toBe('COMPANY')
    expect(classifySource('https://abcnews.go.com/x')).not.toBe('OFFICIAL')
    expect(classifySource('https://news.google.com/x')).not.toBe('COMPANY')
  })
  it('research firms and the world press are known; a university is a reference; an unknown host is still OTHER', () => {
    for (const u of ['https://www.gartner.com/x', 'https://www.mckinsey.com/x', 'https://www.trendforce.com/x', 'https://www.idc.com/x']) expect(classifySource(u)).toBe('RESEARCH_FIRM')
    for (const u of ['https://www.reuters.com/x', 'https://www.cnbc.com/x', 'https://finance.yahoo.com/x', 'https://www.koreatimes.co.kr/x']) expect(classifySource(u)).toBe('PRESS')
    expect(classifySource('https://cs.stanford.edu/x')).toBe('REFERENCE')
    expect(classifySource('https://vlsi.kr/en/sia-q3-2026')).toBe('OTHER')
  })
  it('a sector\'s sales series with no company is a statistic: the industry body is HIGH, a press site MEDIUM', () => {
    const fig = { series: 'Doanh số chip toàn cầu', label: 'Q3', value: 517.7, unit: 'tỷ USD', scope: 'toàn cầu', period: '2026-Q3' }
    expect(factFamily(fig)).toBe('statistic')
    expect(authorityFor('statistic', 'OFFICIAL')).toBe('HIGH')
    expect(authorityFor('statistic', 'PRESS')).toBe('MEDIUM')
    expect(factFamily({ ...fig, series: 'Dự báo thị trường bán dẫn 2030', label: '2030', value: 2300, unit: 'tỷ USD' })).toBe('market_estimate')
  })
})

// ── the whole run on the chip report's own figures ────────────────────────────────────────────────────────────────────

const ev = (id: number, url: string, text: string, published?: string): Evidence => ({ id, title: `t${id}`, url, snippet: '', text, ...(published ? { published } : {}) })
const F = (step: number, source: number, text: string, figure?: Finding['figure'], quote?: string): Finding & { quote?: string } => ({ step, source, text, ...(figure ? { figure } : {}), ...(quote ? { quote } : {}) })

describe('buildCards with the vintage, the arithmetic and the authority in place', () => {
  const evidence = [
    ev(1, 'https://www.mckinsey.com/industries/semiconductors/our-insights/the-underestimated-size', 'McKinsey projects the semiconductor market could reach 1.6 trillion by 2030.', '2025-12-10'),
    ev(2, 'https://www.mckinsey.com/industries/semiconductors/our-insights/new-forecast', 'McKinsey now projects 2.3 trillion by 2030.', '2026-09-18'),
    ev(3, 'https://www.deloitte.com/insights/outlook', 'About 1.05 trillion chips were sold in 2025; generative AI chips are under 20 million, about 0.2%.', '2025-11-20'),
    ev(4, 'https://www.wsts.org/76/Global-Semiconductor-Market-records', 'Spring 2026 forecast largely confirmed; 1.51 trillion; first half 702 billion.', '2026-08-06'),
  ]
  const fig = (value: number, stated?: string) => ({ series: 'Dự báo thị trường bán dẫn', label: '2030', value, unit: 'nghìn tỷ USD', subject: 'thị trường bán dẫn toàn cầu', scope: 'toàn cầu', period: '2030', ...(stated ? { stated } : {}) })
  const findings = [
    F(7, 1, 'McKinsey dự báo thị trường bán dẫn đạt 1,6 nghìn tỷ USD năm 2030.', fig(1.6), 'could reach 1.6 trillion by 2030'),
    F(7, 2, 'McKinsey dự báo thị trường bán dẫn đạt 2,3 nghìn tỷ USD năm 2030.', fig(2.3), 'now projects 2.3 trillion by 2030'),
    F(5, 3, 'Năm 2025 khoảng 1,05 nghìn tỷ chip được bán; chip AI tạo sinh chưa tới 20 triệu chip, khoảng 0,2%', undefined, 'About 1.05 trillion chips were sold in 2025'),
    F(1, 4, 'WSTS xác nhận dự báo mùa xuân: 1,51 nghìn tỷ USD năm 2026.', { series: 'Doanh số bán dẫn', label: '2026', value: 1.51, unit: 'nghìn tỷ USD', scope: 'toàn cầu', period: '2026' }, 'largely confirmed; 1.51 trillion'),
  ]
  const cards = buildCards(findings, evidence, numberInText)
  it('the page date is the vintage: McKinsey 1.6 is replaced by 2.3, and only 2.3 goes to the analyst', () => {
    expect(cards[0].vintage).toBe('2025-12-10')
    expect(cards[0].supersededBy).toBe('C2')
    expect(cards[1].supersededBy).toBeUndefined()
    const picked = pickForAnalyst(cards, 90, Date.UTC(2026, 10, 15)).map(c => c.id)
    expect(picked).toContain('C2')
    expect(picked).not.toContain('C1')
    expect(forAnalyst(cards, 90, Date.UTC(2026, 10, 15)).map(c => c.id)).not.toContain('C1')
  })
  it('the 0.2% card is LOW, carries the code\'s note, and the analyst is shown it', () => {
    expect(cards[2].confidence).toBe('LOW')
    expect(cards[2].ratioNote).toMatch(/says 0,2%.*0\.0019%/)
    const text = analystCards(cards, new Map(), 90, Date.UTC(2026, 10, 15))
    expect(text).toContain('ARITHMETIC CHECK')
    expect(text).not.toMatch(/^C1 /m)
  })
  it('WSTS is OFFICIAL and McKinsey a research firm now, so the sector figure is HIGH/MEDIUM, not LOW', () => {
    expect(cards[3].sourceKind).toBe('OFFICIAL')
    expect(cards[3].authority).toBe('HIGH')
    expect(cards[3].confidence).not.toBe('LOW')
    expect(cards[1].sourceKind).toBe('RESEARCH_FIRM')
  })
  it('the summary counts what was resolved', () => {
    const s = cardSummary(cards)
    expect(s.superseded).toBe(1)
    expect(s.ratioFlagged).toBe(1)
    expect(s.dated).toBe(4)
  })
  it('a figure with an explicit "stated" date uses it before the page date', () => {
    const c = buildCards([F(7, 2, 'McKinsey dự báo 2,3 nghìn tỷ USD năm 2030.', fig(2.3, '2026-10'), 'now projects 2.3 trillion by 2030')], evidence, numberInText)
    expect(c[0].vintage).toBe('2026-10')
  })
})

describe('the analyst keeps a quarter of its places for the newest dated cards', () => {
  it('a fresh MEDIUM card is not crowded out by older better-ranked ones', () => {
    const now = Date.UTC(2026, 10, 15)
    const evidence: Evidence[] = []
    const findings: Array<Finding & { quote?: string }> = []
    for (let i = 1; i <= 40; i++) { evidence.push(ev(i, `https://www.wsts.org/p${i}`, `page ${i} figure ${1000 + i} billion`, '2025-03-01')); findings.push(F(1, i, `figure ${1000 + i} billion`, { series: 's', label: `l${i}`, value: 1000 + i, unit: 'billion', subject: `sub${i}`, period: '2025' }, `figure ${1000 + i} billion`)) }
    evidence.push(ev(41, 'https://www.reuters.com/fresh', 'fresh 777 billion', '2026-11-12'))
    findings.push(F(1, 41, 'fresh 777 billion', undefined, 'fresh 777 billion'))
    const cards = buildCards(findings, evidence, numberInText)
    const old = pickForAnalyst(cards, 10, Date.UTC(2030, 0, 1)).map(c => c.id) // a clock far ahead: nothing counts as recent, so the plain ranking decides
    expect(old).not.toContain('C41')
    const withFresh = pickForAnalyst(cards, 10, now).map(c => c.id)
    expect(withFresh).toContain('C41')
    expect(withFresh).toHaveLength(10)
  })
})

describe('every part of the question (research step) keeps places with the analyst', () => {
  it('a small step (the hot news) is not crowded out by a bigger step whose cards all rank higher', () => {
    const evidence: Evidence[] = []
    const findings: Array<Finding & { quote?: string }> = []
    for (let i = 1; i <= 60; i++) { evidence.push(ev(i, `https://www.wsts.org/p${i}`, `page ${i} figure ${2000 + i} billion`)); findings.push(F(1, i, `figure ${2000 + i} billion`, { series: 's', label: `l${i}`, value: 2000 + i, unit: 'billion', subject: `sub${i}`, period: '2025' }, `figure ${2000 + i} billion`)) }
    evidence.push(ev(61, 'https://www.reuters.com/ceo', 'The CEO resigned on 12 November', '2026-11-12'))
    findings.push(F(4, 61, 'Ngày 12/11 CEO từ chức', undefined, 'The CEO resigned on 12 November'))
    const cards = buildCards(findings, evidence, numberInText)
    const picked = pickForAnalyst(cards, 20, Date.UTC(2030, 0, 1)) // far-ahead clock: the recency tier is out of play, so only the step tier can bring it in
    expect(picked).toHaveLength(20)
    expect(picked.map(c => c.id)).toContain('C61')
    // and the step with many cards still fills the rest
    expect(picked.filter(c => c.step === 1).length).toBe(19)
  })
  it('with no more cards than places, everything goes, best first', () => {
    const cards = buildCards([F(1, 1, 'a fact about 100', undefined), F(2, 1, 'another about 200', undefined)], [ev(1, 'https://www.reuters.com/x', 'a fact about 100 another about 200')], numberInText)
    expect(pickForAnalyst(cards, 50, Date.now())).toHaveLength(2)
  })
})

describe('the scenario model\'s base level must be on the source\'s own page', () => {
  const spec = (value: number, source: number) => ({
    unit: 'tỷ USD', baseYear: 2026, base: { value, source, scope: 'toàn cầu' }, years: [2027, 2028],
    volume: { low: 0, base: 3, high: 6, basis: 'assumption' as const, note: 'x' }, price: { low: -3, base: 5, high: 10, basis: 'assumption' as const, note: 'x' },
  })
  const notes: Finding[] = [{ step: 1, source: 1, text: 'WSTS cập nhật tháng 6/2026: thị trường đạt 1.655 tỷ USD' }, { step: 1, source: 2, text: 'WSTS xác nhận dự báo: 1.510 tỷ USD', figure: { series: 'a', label: 'b', value: 1510, unit: 'tỷ USD' } }]
  it('without the page check the note alone satisfied it (the chip report\'s 1,655); with it, the note is refused', () => {
    expect(groundForecast(spec(1655, 1) as never, notes, numberInText)).toMatchObject({ ok: true })
    expect(groundForecast(spec(1655, 1) as never, notes, numberInText, () => false)).toEqual({ ok: false, reason: 'base_not_on_page' })
  })
  it('a base the page states is accepted', () => {
    const onPage = (s: number, v: number) => s === 2 && v === 1510
    expect(groundForecast(spec(1510, 2) as never, notes, numberInText, onPage)).toMatchObject({ ok: true })
  })
})

describe('checkedFigure keeps a well-formed "stated" date and drops a malformed one', () => {
  const src = 'McKinsey projects 2.3 trillion by 2030'
  const base = { series: 's', label: 'l', value: 2.3, unit: 'trillion' }
  it('YYYY, YYYY-MM and YYYY-MM-DD are kept', () => {
    for (const s of ['2026', '2026-09', '2026-09-18']) expect(checkedFigure({ ...base, stated: s }, src)?.stated).toBe(s)
  })
  it('anything else is dropped; the figure itself stays', () => {
    for (const s of ['September 2026', '18/09/2026', '', undefined]) { const f = checkedFigure({ ...base, stated: s }, src); expect(f).toBeDefined(); expect(f?.stated).toBeUndefined() }
  })
})

import { describe, it, expect, afterEach, vi } from 'vitest'
import { classifySource, factFamily, authorityFor, quoteInText, buildCards, cardSummary, factSupport, forAnalyst, hostOf } from './evidenceCards'
import { researchEvidenceCardsOn } from './deepResearchState'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { NotesSchemaCards } from './deepResearchDeps'
import { numberInText, runDeepResearch, type DeepResearchDeps, type Evidence, type Finding, type ResearchPlan } from './deepResearch'

// M2 of Report Engine V2.1: the evidence card. A card keeps the finding's EXACT words from the source (checked by code against the page text), what it is about (subject, measure, scope, period, unit), where it
// comes from (kind of source, independence group) and how far to trust it (authority per KIND OF FACT, never one tier for a domain: R13). The place-fact gate of R13 (evidenceGate.ts: opening hours, address,
// ticket price) has no row for a market figure, so research facts get their own authority table here.

const ev = (id: number, url: string, text: string, over: Partial<Evidence> = {}): Evidence => ({ id, title: 'Tiêu đề ' + id, url, snippet: '', text, ...over })
const fnd = (source: number, text: string, over: Partial<Finding> & { quote?: string } = {}): Finding & { quote?: string } => ({ step: 1, source, text, ...over })
const PAGE = 'Theo khảo sát của iPOS.vn, nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026, trong khi nhóm dưới 20.000 đồng giảm.'

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchEvidenceCardsOn({})).toBe(false)
    expect(researchEvidenceCardsOn({ RESEARCH_EVIDENCE_CARDS: '1' })).toBe(true)
    expect(researchEvidenceCardsOn({ RESEARCH_EVIDENCE_CARDS: 'yes' })).toBe(false)
    expect(researchEvidenceCardsOn({ RESEARCH_EVIDENCE_CARDS: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchEvidenceCardsOn({ RESEARCH_EVIDENCE_CARDS: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_EVIDENCE_CARDS' })).toBe(true)
  })
})

describe('classifySource', () => {
  it('knows the government, the press, the research firms, the social networks and the copy-and-paste sites', () => {
    expect(classifySource('https://www.nso.gov.vn/x')).toBe('OFFICIAL')
    expect(classifySource('https://vbpl.vn/a')).toBe('OFFICIAL')
    expect(classifySource('https://vnexpress.net/x')).toBe('PRESS')
    expect(classifySource('https://kinhtedothi.vn/x')).toBe('PRESS')
    expect(classifySource('https://ipos.vn/bao-cao')).toBe('RESEARCH_FIRM')
    expect(classifySource('https://www.momentumworks.com/x')).toBe('RESEARCH_FIRM')
    expect(classifySource('https://www.facebook.com/p/1')).toBe('SOCIAL')
    expect(classifySource('https://www.studocu.vn/doc')).toBe('AGGREGATOR')
    expect(classifySource('https://thuvienphapluat.vn/van-ban')).toBe('REFERENCE')
  })
  it('a subdomain counts as its parent; www is ignored; an unknown host is OTHER; a bad address is OTHER', () => {
    expect(classifySource('https://static2.vietstock.vn/doc.pdf')).toBe('PRESS')
    expect(classifySource('https://news.vnexpress.net/a')).toBe('PRESS')
    expect(classifySource('https://some-unknown-blog.example/p')).toBe('OTHER')
    expect(classifySource('not a url')).toBe('OTHER')
  })
  // Measured 11/11 (M2): a third of the cards came from hosts the lists did not know (vietnam.vn, vcci.com.vn, masangroup.com, vinalink.vn, vda.org.vn, posapp.vn…)
  it('knows the hosts the first measurement met most, and the suffixes that say what a site is', () => {
    expect(classifySource('https://vietnam.vn/a')).toBe('PRESS')
    expect(classifySource('https://vcci.com.vn/a')).toBe('PRESS')
    expect(classifySource('https://tapchikinhtetaichinh.vn/a')).toBe('PRESS')
    expect(classifySource('https://masangroup.com/a')).toBe('COMPANY')
    expect(classifySource('https://www.masanconsumer.com/a')).toBe('COMPANY')
    expect(classifySource('https://vda.org.vn/a')).toBe('RESEARCH_FIRM')
    expect(classifySource('https://vietnam-briefing.com/a')).toBe('RESEARCH_FIRM')
    expect(classifySource('https://posapp.vn/a')).toBe('AGGREGATOR')
    expect(classifySource('https://vcs.edu.vn/a')).toBe('REFERENCE')
    expect(classifySource('https://dulieuphapluat.vn/a')).toBe('REFERENCE')
    expect(classifySource('https://some-association.org.vn/a')).toBe('RESEARCH_FIRM')
    expect(classifySource('https://some-university.edu.vn/a')).toBe('REFERENCE')
  })
  it('an investor-relations address is the company\'s own', () => {
    expect(classifySource('https://ir.phuclong.example/annual-report')).toBe('COMPANY')
    expect(classifySource('https://x.example/investor/bao-cao-thuong-nien-2025.pdf')).toBe('COMPANY')
  })
  it('hostOf drops www and keeps the registrable part', () => {
    expect(hostOf('https://www.ipos.vn/a')).toBe('ipos.vn')
    expect(hostOf('https://static2.vietstock.vn/a')).toBe('vietstock.vn')
    expect(hostOf('x')).toBe('')
  })
})

describe('authority is per kind of fact', () => {
  it('the same news source is MEDIUM for a regulation and LOW for a social post; a statistics office is HIGH', () => {
    expect(authorityFor('regulation', 'OFFICIAL')).toBe('HIGH')
    expect(authorityFor('regulation', 'PRESS')).toBe('MEDIUM')
    expect(authorityFor('regulation', 'SOCIAL')).toBe('LOW')
  })
  it('a survey\'s own publisher is HIGH for the survey; a company\'s own report is HIGH for its revenue; an aggregator is LOW for everything', () => {
    expect(authorityFor('survey', 'RESEARCH_FIRM')).toBe('HIGH')
    expect(authorityFor('company', 'COMPANY')).toBe('HIGH')
    for (const f of ['regulation', 'statistic', 'company', 'market_estimate', 'survey', 'price', 'other'] as const) expect(authorityFor(f, 'AGGREGATOR')).toBe('LOW')
  })
  it('the family is read from what the figure measures', () => {
    expect(factFamily({ series: 'Thuế tiêu thụ đặc biệt nước giải khát', label: '2027', value: 8, unit: '%' })).toBe('regulation')
    expect(factFamily({ series: 'Tỷ lệ người chi 36.000–70.000 đồng', label: '2026', value: 61.78, unit: '%' })).toBe('survey')
    expect(factFamily({ series: 'Quy mô thị trường trà sữa', label: '2025', value: 500, unit: 'triệu USD' })).toBe('market_estimate')
    expect(factFamily({ series: 'Doanh thu', label: 'Phúc Long', subject: 'Phúc Long', value: 1891, unit: 'tỷ đồng' })).toBe('company')
    expect(factFamily({ series: 'GDP tăng trưởng', label: '2026', value: 8.4, unit: '%' })).toBe('statistic')
    expect(factFamily(undefined)).toBe('other')
  })
})

describe('quoteInText: the quote must be in the page', () => {
  it('an exact quote is found; case, diacritics, spaces and dash kinds do not matter', () => {
    expect(quoteInText('nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%', PAGE)).toBe(true)
    expect(quoteInText('NHOM CHI 36.000-70.000 DONG MOT LY   TANG TU 48,29% LEN 61,78%', PAGE)).toBe(true)
  })
  it('words that are not on the page are not found, however plausible', () => {
    expect(quoteInText('nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 75,10%', PAGE)).toBe(false)
  })
  it('"…" skips words: every piece must be on the page, in that order', () => {
    expect(quoteInText('theo khảo sát của iPOS.vn … tăng từ 48,29% lên 61,78%', PAGE)).toBe(true)
    expect(quoteInText('tăng từ 48,29% lên 61,78% … theo khảo sát của iPOS.vn', PAGE)).toBe(false)
  })
  it('a quote with fewer than 10 letters and digits, or an empty one, proves nothing', () => {
    expect(quoteInText('61,78%', PAGE)).toBe(false)
    expect(quoteInText('Gong Cha (9%)', 'Gong Cha (9%) đến thường xuyên')).toBe(false)
    expect(quoteInText('', PAGE)).toBe(false)
  })
  // Measured 11/11 (M2, 1821 cards): 124 quotes were refused, and the ones looked at were real: a table cell row, spaces before a full stop, punctuation set differently. Only the words and numbers decide.
  it('punctuation, table bars, line breaks and stray spaces do not decide: only the letters and digits do', () => {
    expect(quoteInText('Bia các loại | 65% | 90%', 'Bảng thuế suất\nBia các loại\n65%\n90%\nRượu')).toBe(true)
    expect(quoteInText('Market value stands at USD 420 Million in 2026 . It is forecast to reach USD 780 Million', 'Market value stands at USD 420 Million in 2026. It is forecast to reach USD 780 Million by 2032')).toBe(true)
    expect(quoteInText('nước giải khát có hàm lượng đường trên 5g/100ml', 'nước giải khát có hàm lượng đường trên 5 g / 100 ml thuộc diện')).toBe(true)
  })
  it('a different number is still a different quote, however alike the rest', () => {
    expect(quoteInText('Market value stands at USD 420 Million in 2026', 'Market value stands at USD 430 Million in 2026')).toBe(false)
    expect(quoteInText('tăng từ 48,29% lên 61,78% trong nửa đầu', 'tăng từ 48,29% lên 61,87% trong nửa đầu')).toBe(false)
  })
})

describe('buildCards', () => {
  const evidence = [ev(1, 'https://ipos.vn/bao-cao', PAGE), ev(2, 'https://www.facebook.com/p/1', 'Bài đăng nói nhóm này lên 61,78% trong nửa đầu năm 2026.'), ev(3, 'https://vnexpress.net/a', PAGE)]
  const figure = { series: 'Tỷ lệ chi 36.000–70.000 đồng', label: '2026-H1', value: 61.78, unit: '%', subject: 'chi 36.000–70.000', scope: 'khảo sát', period: '2026-H1' }
  it('a quote found in the page is VERIFIED; one that is not is UNVERIFIED; none at all is ABSENT', () => {
    const cards = buildCards([
      fnd(1, 'f1', { quote: 'nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%' }),
      fnd(2, 'f2', { quote: 'một câu mà trang này không hề có chữ nào' }),
      fnd(3, 'f3'),
    ], evidence, numberInText)
    expect(cards.map(c => c.quoteStatus)).toEqual(['VERIFIED', 'UNVERIFIED', 'ABSENT'])
  })
  it('knows whether the figure\'s own number is inside the verified quote', () => {
    const [yes, no] = buildCards([
      fnd(1, 'f', { figure, quote: 'tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026' }),
      fnd(1, 'f', { figure: { ...figure, value: 55 }, quote: 'tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026' }),
    ], evidence, numberInText)
    expect(yes.figureInQuote).toBe(true)
    expect(no.figureInQuote).toBe(false)
  })
  it('confidence: a statistics-grade source with a verified quote holding the number is HIGH; a social post is never above LOW; an unquoted press card is LOW', () => {
    const cards = buildCards([
      fnd(1, 'f', { figure, quote: 'tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026' }),
      fnd(3, 'f', { figure, quote: 'tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026' }),
      fnd(2, 'f', { figure, quote: 'nhóm này lên 61,78% trong nửa đầu năm 2026' }),
      fnd(3, 'f'),
    ], evidence, numberInText)
    expect(cards[0].confidence).toBe('HIGH')
    expect(cards[1].confidence).toBe('MEDIUM')
    expect(cards[2].confidence).toBe('LOW')
    expect(cards[3].confidence).toBe('LOW')
  })
  it('each card has an id, its source kind and host, and the step it came from', () => {
    const [c] = buildCards([fnd(1, 'f', { step: 4 })], evidence, numberInText)
    expect(c.id).toBe('C1')
    expect(c.sourceKind).toBe('RESEARCH_FIRM')
    expect(c.host).toBe('ipos.vn')
    expect(c.step).toBe(4)
  })
  it('two cards from one host are one independence group; a copy of the same page on another host joins it', () => {
    const copy = [ev(1, 'https://ipos.vn/a', PAGE), ev(2, 'https://ipos.vn/b', 'Nội dung khác.'), ev(3, 'https://vnexpress.net/c', PAGE)]
    const cards = buildCards([fnd(1, 'a'), fnd(2, 'b'), fnd(3, 'c')], copy, numberInText)
    expect(cards[0].independenceGroup).toBe(cards[1].independenceGroup)
    expect(cards[0].independenceGroup).toBe(cards[2].independenceGroup)
  })
  it('a finding whose source is not in the evidence still makes a card (kind OTHER), never a crash', () => {
    const [c] = buildCards([fnd(99, 'f', { quote: 'một trích dẫn đủ dài để kiểm tra' })], evidence, numberInText)
    expect(c.sourceKind).toBe('OTHER')
    expect(c.quoteStatus).toBe('UNVERIFIED')
  })
})

describe('fact support', () => {
  const evidence = [ev(1, 'https://ipos.vn/a', 'a'), ev(2, 'https://vnexpress.net/b', 'b'), ev(3, 'https://tuoitre.vn/c', 'c'), ev(4, 'https://ipos.vn/d', 'd')]
  const f = (source: number, value: number) => fnd(source, 't', { figure: { series: 'Tỷ lệ', label: '2026', unit: '%', subject: 'x', scope: 'toàn quốc', period: '2026', value } })
  it('two independent sources with the same value: STRONG; one: SINGLE; different values from two independent sources: CONFLICT', () => {
    const strong = factSupport(buildCards([f(1, 10), f(2, 10)], evidence, numberInText))
    expect(strong).toHaveLength(1)
    expect(strong[0].status).toBe('STRONG')
    expect(factSupport(buildCards([f(1, 10)], evidence, numberInText))[0].status).toBe('SINGLE')
    expect(factSupport(buildCards([f(1, 10), f(2, 20)], evidence, numberInText))[0].status).toBe('CONFLICT')
  })
  it('the same publisher twice is one source, not two', () => {
    expect(factSupport(buildCards([f(1, 10), f(4, 10)], evidence, numberInText))[0].status).toBe('SINGLE')
  })
  it('a card with no figure is not a fact group', () => {
    expect(factSupport(buildCards([fnd(1, 'no figure')], evidence, numberInText))).toEqual([])
  })
})

describe('what goes to the analyst, and the summary', () => {
  const evidence = [ev(1, 'https://nso.gov.vn/a', PAGE), ev(2, 'https://www.facebook.com/p', 'Bài đăng.'), ev(3, 'https://vnexpress.net/a', PAGE)]
  const cards = buildCards([
    fnd(1, 'official verified', { quote: 'nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%' }),
    fnd(3, 'press verified', { quote: 'nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%' }),
    fnd(2, 'social unverified', { quote: 'một câu mà trang này không hề có chữ nào' }),
    fnd(3, 'press no quote'),
  ], evidence, numberInText)
  it('cards whose quote is not on the page are kept in the dossier but never go to the analyst; the best come first; the limit holds', () => {
    const a = forAnalyst(cards, 10)
    expect(a.map(c => c.text)).toEqual(['official verified', 'press verified', 'press no quote'])
    expect(forAnalyst(cards, 1).map(c => c.text)).toEqual(['official verified'])
  })
  it('the summary counts, never the text', () => {
    const s = cardSummary(cards)
    expect(s.total).toBe(4)
    expect(s.quote).toEqual({ verified: 2, unverified: 1, absent: 1 })
    expect(s.byKind.PRESS).toBe(2)
    expect(s.forAnalyst).toBe(3)
    expect(JSON.stringify(s)).not.toContain('official verified')
  })
})

describe('the notes schema with quotes', () => {
  const finding = { text: 't', source: 1, figure: null }
  it('a finding may come with a quote or without one', () => {
    expect(NotesSchemaCards.safeParse({ findings: [finding, { ...finding, quote: 'trích nguyên văn đủ dài' }] }).success).toBe(true)
  })
  it('the quote is optional in what the model is told, and the figure still carries subject, scope and period', () => {
    const js = zodToJsonSchema(NotesSchemaCards, { $refStrategy: 'none' }) as { properties: { findings: { items: { required: string[]; properties: Record<string, unknown> } } } }
    expect(js.properties.findings.items.required).not.toContain('quote')
    expect(Object.keys(js.properties.findings.items.properties)).toContain('quote')
    expect(JSON.stringify(js)).toContain('"scope"')
  })
})

describe('the engine', () => {
  afterEach(() => vi.unstubAllEnvs())
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Chi tiêu', queries: ['q'] }] }
  function run() {
    const deps: DeepResearchDeps = {
      async plan() { return structuredClone(plan) },
      async gather() { return [{ title: 'iPOS', url: 'https://ipos.vn/bao-cao', snippet: 's', text: PAGE }] },
      async notes(_s: string, _q: string, e: readonly Evidence[]) {
        return [
          { text: 'Nhóm 36–70k tăng', source: e[0]!.id, quote: 'nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%' },
          { text: 'Một câu bịa', source: e[0]!.id, quote: 'câu này không có trong trang nguồn đâu nhé' },
        ] as never
      },
      async *write() { yield '# B\n\n## Chi tiêu\nNội dung [1]\n' },
    }
    return runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text() {} })
  }
  it('flag on: each finding carries its quote and its check, and the run reports the cards', async () => {
    vi.stubEnv('RESEARCH_EVIDENCE_CARDS', '1')
    const out = await run()
    expect((out.findings[0] as { quoteStatus?: string }).quoteStatus).toBe('VERIFIED')
    expect((out.findings[1] as { quoteStatus?: string }).quoteStatus).toBe('UNVERIFIED')
    expect(out.cards!.summary.total).toBe(2)
    expect(out.cards!.summary.quote).toEqual({ verified: 1, unverified: 1, absent: 0 })
  })
  it('flag off: findings are exactly as before (no quote keys) and there are no cards', async () => {
    const out = await run()
    expect('quote' in out.findings[0]).toBe(false)
    expect('quoteStatus' in out.findings[0]).toBe(false)
    expect(out.cards).toBeUndefined()
  })
})

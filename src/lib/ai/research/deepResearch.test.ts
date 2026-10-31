// 31/10 Deep Research orchestration (deepResearch.ts) with fake dependencies: plan, parallel steps, findings tied to handed-in sources,
// the deadline, the writer's links removed, the sources list built by code, and the failure paths.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runDeepResearch, sectionImages, MAX_SECTION_IMAGES, GAP_STEPS, canonicalSourceUrl, normalisePlan, linkStripper, sourcesBlock, readResearchStatus, DEEP_RESEARCH_LIMITS, type DeepResearchDeps, type ResearchStatus } from './deepResearch'

const PLAN = { title: 'Thị trường xe điện', steps: [{ title: 'Doanh số', queries: ['doanh so xe dien 2026'] }, { title: 'Giá', queries: ['gia xe dien', 'bang gia xe dien'] }] }
const page = (u: string) => ({ title: `Trang ${u}`, url: `https://${u}.example/a`, snippet: 's', text: `nội dung ${u}` })

function deps(over: Partial<DeepResearchDeps> = {}): DeepResearchDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    plan: async () => PLAN,
    gather: async q => { calls.push(`gather:${q}`); return q.includes('doanh') ? [page('a'), page('b')] : [page('b'), page('c')] },
    notes: async (step, _q, ev) => { calls.push(`notes:${step}`); return ev.map(e => ({ text: `${step} từ ${e.title}`, source: e.id })) },
    write: async function* () { calls.push('write'); yield 'Báo cáo [1] '; yield '[2].' },
    ...over,
  }
}
function collect() {
  const statuses: ResearchStatus[] = []
  let text = ''
  return { statuses, get text() { return text }, emit: { status: (s: ResearchStatus) => statuses.push(s), text: (t: string) => { text += t } } }
}
afterEach(() => { vi.useRealTimers() })

describe('runDeepResearch', () => {
  it('plans, runs every step, keeps findings tied to sources, writes once, lists only the cited sources', async () => {
    const d = deps(), c = collect()
    const out = await runDeepResearch('xe điện', '', 'vi', d, c.emit)
    expect(out.failed).toBeNull()
    expect(d.calls.filter(x => x.startsWith('gather:'))).toHaveLength(3)
    expect(d.calls.filter(x => x === 'write')).toHaveLength(1)
    // the same page found by two steps is one source with one number
    expect(out.evidence.map(e => e.url)).toEqual(['https://a.example/a', 'https://b.example/a', 'https://c.example/a'])
    expect(out.findings.every(f => out.evidence.some(e => e.id === f.source))).toBe(true)
    expect(c.text).toContain('Báo cáo [1] [2].')
    // the report names its sources as text (no link); the card links them, https only
    expect(c.text).toContain('### Nguồn\n1. Trang a — a.example\n2. Trang b — b.example\n3. Trang c — c.example')
    expect(c.text).not.toContain('](')
    expect(c.statuses[0]).toMatchObject({ phase: 'planning', steps: [] })
    expect(c.statuses.at(-1)).toMatchObject({ phase: 'done', sources: 3, steps: [{ title: 'Doanh số', status: 'done' }, { title: 'Giá', status: 'done' }] })
    expect(c.statuses.at(-1)?.links).toEqual([{ id: 1, title: 'Trang a', url: 'https://a.example/a' }, { id: 2, title: 'Trang b', url: 'https://b.example/a' }, { id: 3, title: 'Trang c', url: 'https://c.example/a' }])
    expect(c.statuses.slice(0, -1).every(s => !s.links)).toBe(true)
    expect(c.statuses.some(s => s.phase === 'writing')).toBe(true)
  })
  it('a source no finding cites is in neither the sources list nor the card', async () => {
    const d = deps({ notes: async (_s, _q, ev) => ev.filter(e => e.url.startsWith('https://a.')).map(e => ({ text: 'chỉ a', source: e.id })) })
    const c = collect()
    await runDeepResearch('q', '', 'vi', d, c.emit)
    expect(c.statuses.at(-1)?.links?.map(l => l.url)).toEqual(['https://a.example/a'])
    expect(c.text).not.toContain('b.example')
  })
  it('the writer, the sources list and the card number the cited sources 1..n', async () => {
    let seen: { evidence: readonly { id: number; url: string }[]; findings: readonly { source: number }[] } | null = null
    const d = deps({
      notes: async (_s, _q, ev) => ev.filter(e => !e.url.startsWith('https://a.')).map(e => ({ text: 'x', source: e.id })),
      write: async function* (input) { seen = input; yield 'Báo cáo [1][2].' },
    })
    const c = collect()
    await runDeepResearch('q', '', 'vi', d, c.emit)
    expect(seen!.evidence.map(e => [e.id, e.url])).toEqual([[1, 'https://b.example/a'], [2, 'https://c.example/a']])
    expect(new Set(seen!.findings.map(f => f.source))).toEqual(new Set([1, 2]))
    expect(c.text).toContain('### Nguồn\n1. Trang b — b.example\n2. Trang c — c.example')
    expect(c.statuses.at(-1)?.links?.map(l => [l.id, l.url])).toEqual([[1, 'https://b.example/a'], [2, 'https://c.example/a']])
  })
  it('a page found through a Google redirect or translate proxy is that page; the same page twice is one source', async () => {
    const d = deps({ gather: async () => [
      { ...page('x'), url: 'https://www.google.com/url?q=https://vnexpress.net/bai-1.html&sa=U' },
      { ...page('y'), url: 'https://vnexpress.net/bai-1.html' },
      { ...page('z'), url: 'https://www.google.com/search?q=xe+dien' },
    ] })
    const out = await runDeepResearch('q', '', 'vi', d, collect().emit)
    expect(out.evidence.map(e => e.url)).toEqual(['https://vnexpress.net/bai-1.html'])
  })
  it('steps run at the same time (the second starts before the first ends)', async () => {
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const d = deps({ gather: async q => { order.push(`start ${q}`); if (q.includes('doanh')) await gate; order.push(`end ${q}`); return [page('a')] } })
    const run = runDeepResearch('q', '', 'vi', d, collect().emit)
    await new Promise(r => setTimeout(r, 5))
    expect(order).toContain('start gia xe dien')
    release()
    await run
    expect(order.indexOf('start gia xe dien')).toBeLessThan(order.indexOf('end doanh so xe dien 2026'))
  })
  it('a finding naming a source the step was not given is dropped; findings per step are capped', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ text: `f${i}`, source: 1 }))
    const d = deps({ notes: async (step) => (step === 'Doanh số' ? [{ text: 'bịa', source: 42 }, ...many] : []) })
    const out = await runDeepResearch('q', '', 'vi', d, collect().emit)
    expect(out.findings.some(f => f.source === 42)).toBe(false)
    expect(out.findings).toHaveLength(DEEP_RESEARCH_LIMITS.findingsPerStep)
  })
  it('only https links are kept as sources', async () => {
    const d = deps({ gather: async () => [{ ...page('a'), url: 'http://plain.example/x' }, { ...page('j'), url: 'javascript:alert(1)' }, page('ok')] })
    const out = await runDeepResearch('q', '', 'vi', d, collect().emit)
    expect(out.evidence.map(e => e.url)).toEqual(['https://ok.example/a'])
  })
  it('a step still running at the deadline is dropped and the report is written from the rest', async () => {
    const d = deps({ gather: async q => (q.includes('doanh') ? new Promise(() => undefined) : [page('c')]) })
    vi.useFakeTimers()
    const c = collect()
    const run = runDeepResearch('q', '', 'vi', d, c.emit)
    await vi.advanceTimersByTimeAsync(DEEP_RESEARCH_LIMITS.researchDeadlineMs + 1)
    const out = await run
    expect(out.failed).toBeNull()
    expect(c.statuses.at(-1)?.steps).toEqual([{ title: 'Doanh số', status: 'failed' }, { title: 'Giá', status: 'done' }])
  })
  it('the writer stops at the run deadline: what was written stays, with its sources', async () => {
    let t = 0
    const d = deps({ now: () => t, write: async function* () { for (let i = 0; i < 1000; i++) { t += 1000; yield `câu ${i} ` } } })
    const c = collect()
    const out = await runDeepResearch('q', '', 'vi', d, c.emit)
    expect(out.failed).toBeNull()
    expect(out.cut).toBe(true)
    expect(c.text).toContain('câu 0 ')
    expect(c.text).not.toContain('câu 999')
    expect(c.text).toContain('### Nguồn')
    expect(c.statuses.at(-1)?.phase).toBe('done')
  })
  it('no plan, no findings, a failed writer: each ends with a failed card and a reason', async () => {
    for (const [over, why] of [
      [{ plan: async () => ({ title: 'x', steps: [] }) }, 'no_plan'],
      [{ plan: async () => { throw new Error('down') } }, 'no_plan'],
      [{ gather: async () => [] }, 'no_findings'],
      [{ notes: async () => [] }, 'no_findings'],
      [{ write: async function* () { yield 'Một phần '; throw new Error('cut') } }, 'write_failed'],
    ] as Array<[Partial<DeepResearchDeps>, string]>) {
      const c = collect()
      const out = await runDeepResearch('q', '', 'vi', deps(over), c.emit)
      expect(out.failed).toBe(why)
      expect(c.statuses.at(-1)?.phase).toBe('failed')
      expect(c.text).not.toContain('### Nguồn')
    }
  })
  it('English questions get an English sources heading', async () => {
    const c = collect()
    await runDeepResearch('ev market', '', 'en', deps(), c.emit)
    expect(c.text).toContain('### Sources\n')
  })
  it('the sources heading is the plan\'s, in the question\'s language (measured: a Portuguese report ended with "Nguồn"); markup in it is blanked', async () => {
    const c = collect()
    await runDeepResearch('fabricantes de VEs', '', 'vi', deps({ plan: async () => ({ ...PLAN, sources_label: 'Fontes' }) }), c.emit)
    expect(c.text).toContain('### Fontes\n1. ')
    expect(normalisePlan({ ...PLAN, sources_label: '[Źródła](javascript:x)' }, 'q')?.sources_label).toBe('Źródła javascript:x')
  })
})

describe('the follow-up round (measured T22: one round found no count and the report could only say "not found")', () => {
  it('what the findings do not answer yet becomes follow-up steps, researched before writing and shown on the card', async () => {
    let seen: string[] = []
    const asked: string[] = []
    const d = deps({
      gather: async q => { asked.push(q); return [page(q.includes('so luong') ? 'n' : 'a')] },
      gaps: async (_q, _p, found) => { seen = [...found]; return [{ title: 'Số hãng xe điện', queries: ['so luong hang xe dien 2026'] }, { title: 'x', queries: [] }, { title: 'thứ ba', queries: ['a'] }, { title: 'thứ tư', queries: ['b'] }] },
    })
    const c = collect()
    const out = await runDeepResearch('q', '', 'vi', d, c.emit)
    expect(seen.length).toBeGreaterThan(0) // the check reads the findings of the first round
    expect(asked).toContain('so luong hang xe dien 2026')
    expect(out.followUps).toBe(GAP_STEPS) // an empty step is dropped, the rest capped
    expect(out.findings.some(f => f.step === 3)).toBe(true)
    expect(c.statuses.at(-1)?.steps.map(s => s.title)).toEqual(['Doanh số', 'Giá', 'Số hãng xe điện', 'thứ ba'])
  })
  it('no follow-up when nothing is missing, when the check fails, or when too little time is left', async () => {
    for (const gaps of [async () => [], async () => { throw new Error('x') }, async () => undefined as never]) {
      const out = await runDeepResearch('q', '', 'vi', deps({ gaps }), collect().emit)
      expect(out.followUps).toBe(0)
      expect(out.failed).toBeNull()
    }
    let t = 0
    let called = false
    const late = deps({ now: () => t, gather: async () => { t = DEEP_RESEARCH_LIMITS.researchDeadlineMs - 5_000; return [page('a')] }, gaps: async () => { called = true; return [{ title: 'y', queries: ['y'] }] } })
    await runDeepResearch('q', '', 'vi', late, collect().emit)
    expect(called).toBe(false)
  })
})

describe('section pictures (owner 31/10: pictures that fit each section of the report)', () => {
  const plan = { title: 'T', steps: [{ title: 'Doanh số', queries: ['q'] }, { title: 'Giá', queries: ['q'] }, { title: 'Triển vọng', queries: ['q'] }] }
  it('a heading that is a step\'s own title takes that step\'s picture, whatever its place; a step without one takes the k-th heading if free', () => {
    // headings: "Giá" (step 2's own, first), "Doanh số toàn cầu" (nobody's), "Triển vọng" (step 3's own), "Kết luận"
    const report = '# T\n- tóm tắt\n## 1. Giá\nx\n## Doanh số toàn cầu\ny\n## Triển vọng\nz\n## Kết luận\nw'
    const pics = ['https://i.example/a.jpg', 'https://i.example/b.jpg', 'https://i.example/c.jpg']
    expect(sectionImages(report, plan, pics)).toEqual([
      { title: 'Giá', src: 'https://i.example/b.jpg' },
      { title: 'Triển vọng', src: 'https://i.example/c.jpg' },
    ]) // step 1's k-th heading (the first) is step 2's: step 1 gets none rather than a wrong section
    expect(sectionImages('## Doanh số toàn cầu\n## Giá\n## Triển vọng', plan, pics)).toEqual([
      { title: 'Doanh số toàn cầu', src: 'https://i.example/a.jpg' },
      { title: 'Giá', src: 'https://i.example/b.jpg' },
      { title: 'Triển vọng', src: 'https://i.example/c.jpg' },
    ])
  })
  it('no picture: a step without one, a non-https address, a heading too long to be a title, beyond the cap', () => {
    const long = '## ' + 'một hai ba bốn năm sáu bảy tám chín mười'
    expect(sectionImages(`${long}\n## Giá\n## Triển vọng`, plan, [null, 'http://i.example/b.jpg', 'https://i.example/c.jpg'])).toEqual([{ title: 'Triển vọng', src: 'https://i.example/c.jpg' }])
    expect(sectionImages(`${long}\nx`, plan, ['https://i.example/a.jpg', null, null])).toEqual([])
    const many = { title: 'T', steps: Array.from({ length: 5 }, (_, i) => ({ title: `Mục ${i}`, queries: ['q'] })) }
    expect(sectionImages(many.steps.map(s => `## ${s.title}`).join('\n'), many, many.steps.map((_, i) => `https://i.example/${i}.jpg`))).toHaveLength(MAX_SECTION_IMAGES)
  })
  it('the run looks pictures up for the steps that have an image query, and sends them under the written sections', async () => {
    const asked: string[] = []
    const d = deps({
      plan: async () => ({ title: 'T', steps: [{ title: 'Doanh số', queries: ['doanh so'], image_query: 'xe điện VinFast' }, { title: 'Giá', queries: ['gia'] }] }),
      images: async q => { asked.push(q); return ['javascript:x', 'https://i.example/vf.jpg'] },
      write: async function* () { yield '# T\n## Doanh số\nBán chạy [1].\n## Giá\nRẻ [2].' },
    })
    const c = collect()
    const sent: unknown[] = []
    await runDeepResearch('q', '', 'vi', d, { ...c.emit, images: items => sent.push(items) })
    expect(asked).toEqual(['xe điện VinFast'])
    expect(sent).toEqual([[{ title: 'Doanh số', src: 'https://i.example/vf.jpg' }]])
  })
  it('the plan keeps a step\'s image query (cleaned), and none when it is empty', () => {
    const p = normalisePlan({ title: 't', steps: [{ title: 'a', queries: ['q'], image_query: '  xe\nđiện  ' }, { title: 'b', queries: ['q'], image_query: null }] }, 'q')
    expect(p?.steps.map(s => s.image_query)).toEqual(['xe điện', undefined])
  })
})

describe('canonicalSourceUrl', () => {
  it('unwraps Google redirects and translate proxies, drops other Google pages and non-https', () => {
    expect(canonicalSourceUrl('https://www.google.com/url?q=https://a.example/p%3Fx%3D1&sa=U')).toBe('https://a.example/p?x=1')
    expect(canonicalSourceUrl('https://www.google.com/url?url=https://a.example/p')).toBe('https://a.example/p')
    expect(canonicalSourceUrl('https://translate.google.com/translate?u=https://en.wikipedia.org/wiki/Big_Bang&hl=vi')).toBe('https://en.wikipedia.org/wiki/Big_Bang')
    expect(canonicalSourceUrl('https://en-m-wikipedia-org.translate.goog/wiki/Big_Bang?_x_tr_sl=en&_x_tr_tl=vi&x=1')).toBe('https://en.m.wikipedia.org/wiki/Big_Bang?x=1')
    expect(canonicalSourceUrl('https://my--site-com.translate.goog/a?_x_tr_sl=en')).toBe('https://my-site.com/a')
    expect(canonicalSourceUrl('https://www.google.com/search?q=x')).toBeNull()
    expect(canonicalSourceUrl('https://www.google.com.vn/url?q=javascript:alert(1)')).toBeNull()
    expect(canonicalSourceUrl('http://a.example/')).toBeNull()
    expect(canonicalSourceUrl('not a url')).toBeNull()
    expect(canonicalSourceUrl('https://about.bnef.com/x')).toBe('https://about.bnef.com/x')
  })
})

describe('normalisePlan', () => {
  it('caps steps and queries, drops empty ones, falls back to the question as the title', () => {
    const p = normalisePlan({ steps: Array.from({ length: 9 }, (_, i) => ({ title: `b${i}`, queries: ['q1', ' ', 'q2', 'q3'] })).concat([{ title: '', queries: ['x'] }, { title: 'no queries', queries: [] }] as never) }, 'câu hỏi')
    expect(p?.title).toBe('câu hỏi')
    expect(p?.steps).toHaveLength(DEEP_RESEARCH_LIMITS.planSteps)
    expect(p?.steps[0].queries).toEqual(['q1', 'q2'])
  })
  it('nothing usable is null', () => {
    expect(normalisePlan(null, 'q')).toBeNull()
    expect(normalisePlan({ title: 't', steps: [{ title: 'a', queries: [] }] }, 'q')).toBeNull()
  })
})

describe('linkStripper', () => {
  const run = (parts: string[]) => { const s = linkStripper(); return parts.map(p => s.push(p)).join('') + s.end() }
  it('keeps a link\'s label, removes bare URLs, also when they arrive split across deltas', () => {
    expect(run(['Xem [báo cáo](https://x.example/a) và https://y.example/b nhé.'])).toBe('Xem báo cáo và  nhé.')
    expect(run(['Xem [báo', ' cáo](htt', 'ps://x.example/a) và www.y', '.example/b nhé.'])).toBe('Xem báo cáo và  nhé.')
  })
  it('keeps citation numbers and plain brackets', () => {
    expect(run(['Tăng 5% [2][3], (ước tính).'])).toBe('Tăng 5% [2][3], (ước tính).')
  })
  it('a long text without spaces is still released', () => {
    const s = linkStripper()
    expect(s.push('x'.repeat(700)).length).toBe(700)
  })
})

describe('sourcesBlock', () => {
  it('lists only the cited sources, as text: title and site', () => {
    const ev = [{ id: 1, title: 'A [x]', url: 'https://www.a.example/p', snippet: '', text: '' }, { id: 2, title: 'B', url: 'https://b.example/', snippet: '', text: '' }]
    expect(sourcesBlock(ev, [{ step: 1, text: 't', source: 2 }], 'vi')).toBe('\n\n### Nguồn\n2. B — b.example\n')
    expect(sourcesBlock(ev, [], 'vi')).toBe('')
    expect(sourcesBlock(ev, [{ step: 1, text: 't', source: 1 }], 'vi')).toContain('1. A x — a.example')
  })
  it('a search result title cannot become markup', () => {
    const ev = [{ id: 1, title: '[bấm](javascript:alert(1)) <img src=x onerror=y> `code` **đậm** # h | t', url: 'https://a.example/', snippet: '', text: '' }]
    const out = sourcesBlock(ev, [{ step: 1, text: 't', source: 1 }], 'vi')
    expect(out.split('\n').slice(3).join('\n')).not.toMatch(/[[\]()<>`*#|]/)
  })
})

describe('readResearchStatus', () => {
  it('the latest valid card wins; malformed frames and unknown phases are ignored', () => {
    const ok = { type: 'tappy.research.v1', title: 'T', phase: 'researching', steps: [{ title: 'a', status: 'running' }, { title: 'b', status: 'weird' }], sources: 3 }
    expect(readResearchStatus([ok, { type: 'tappy.research.v1', phase: 'hacked' }, null, 'x'])).toEqual({ ...ok, steps: [{ title: 'a', status: 'running' }] })
    expect(readResearchStatus([ok, { ...ok, phase: 'done', sources: -1 }])).toMatchObject({ phase: 'done', sources: 0 })
    expect(readResearchStatus(undefined)).toBeNull()
    expect(readResearchStatus([{ kind: 'tappy.progress' }])).toBeNull()
  })
  it('the card links https sources only', () => {
    const links = [{ id: 1, title: 'ok', url: 'https://a.example/x' }, { id: 2, title: 'js', url: 'javascript:alert(1)' }, { id: 3, title: 'plain', url: 'http://b.example/' }, { id: 4, title: 'data', url: 'data:text/html,x' }, { id: 5, title: 'rel', url: '/x' }]
    expect(readResearchStatus([{ type: 'tappy.research.v1', title: 'T', phase: 'done', steps: [], sources: 5, links }])?.links).toEqual([{ id: 1, title: 'ok', url: 'https://a.example/x' }])
  })
})

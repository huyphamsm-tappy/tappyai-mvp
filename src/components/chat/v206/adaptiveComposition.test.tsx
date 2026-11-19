// @vitest-environment jsdom
// T01-T18 of the adaptive presentation brief, run on FIXTURES through the product's REAL chat (ChatInterface) and REAL project overview.
//
// WHAT THIS PROVES: given an answer (text + the product's markers + the places annotation), the renderer composes the components that answer needs and no others, degrades
// on bad data, and keeps one conversation's content out of another. WHAT IT DOES NOT PROVE: that the MODEL understands a question, resolves "ông ấy", keeps a budget across
// turns or writes the right answer. Those cases (T04, T06, T09 as a conversation, the context-resolution part of T15) need the model and are marked below; they belong to the
// separate UAT that needs an approved account and API budget. Nothing here calls a model, a search service or the network.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { render, cleanup, screen, within, fireEvent } from '@testing-library/react'

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

type Msg = { id: string; role: 'user' | 'assistant'; content: string }
let current: Msg[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat/c',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }))
vi.mock('ai/react', () => ({
  useChat: () => ({
    messages: current, input: '', handleInputChange: vi.fn(), handleSubmit: vi.fn(), isLoading: false,
    setInput: vi.fn(), append: vi.fn(), reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages: vi.fn(),
  }),
}))
vi.mock('@/components/share/ShareMenu', () => ({ default: () => null }))

let ChatInterface: typeof import('@/components/ChatInterface').default
let rememberPlacesView: typeof import('@/lib/recommendation/liveViewCache').rememberPlacesView
let __resetPlacesViewCache: typeof import('@/lib/recommendation/liveViewCache').__resetPlacesViewCache
let v206Store: typeof import('@/lib/chat/v206Store').v206Store
let fx: typeof import('@/lib/dev/v206Harness/fixtures')
let ProjectOverview: typeof import('@/components/chat/workspace/ProjectOverview').default
let ConversationStoreProvider: typeof import('@/components/chat/workspace/ChatWorkspaceContext').ConversationStoreProvider
let projectViewStore: typeof import('@/lib/chat/workspace/projectView').projectViewStore
type PlacesView = import('@/lib/recommendation/liveView').PlacesLiveView

beforeAll(async () => {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_WORKSPACE_V206', '1')
  vi.stubEnv('NEXT_PUBLIC_RESPONSE_PRESENTATION', '1')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
  ;({ default: ChatInterface } = await import('@/components/ChatInterface'))
  ;({ rememberPlacesView, __resetPlacesViewCache } = await import('@/lib/recommendation/liveViewCache'))
  ;({ v206Store } = await import('@/lib/chat/v206Store'))
  fx = await import('@/lib/dev/v206Harness/fixtures')
  ;({ default: ProjectOverview } = await import('@/components/chat/workspace/ProjectOverview'))
  ;({ ConversationStoreProvider } = await import('@/components/chat/workspace/ChatWorkspaceContext'))
  ;({ projectViewStore } = await import('@/lib/chat/workspace/projectView'))
}, 60_000)

afterEach(() => { cleanup(); __resetPlacesViewCache(); v206Store.reset(); projectViewStore.set(null) })

const msgs = (...pairs: Array<[string, string]>): Msg[] => pairs.flatMap(([q, a], i) => [{ id: `u${i}`, role: 'user' as const, content: q }, { id: `a${i}`, role: 'assistant' as const, content: a }])
const open = (cid: string, m: Msg[]) => {
  current = m
  return render(<ChatInterface conversationId={cid} savedMessages={m.map(x => ({ role: x.role, content: x.content }))} />)
}
/** what the answer was drawn with: the product's own components, found by their markup */
const parts = (c: HTMLElement) => ({
  databox: c.querySelectorAll('[data-testid="v206-databox"]').length,
  timeline: c.querySelectorAll('[data-testid="v206-trip"]').length,
  placeCards: c.querySelectorAll('[data-testid="place-card"]').length,
  reportCard: c.querySelectorAll('[data-testid="report-summary-card"]').length,
  entityRow: c.querySelectorAll('[data-media="entities"]').length,
  callout: c.querySelectorAll('.tappy-callout').length,
})
const NONE = { databox: 0, timeline: 0, placeCards: 0, reportCard: 0, entityRow: 0, callout: 0 }

const place = (id: string, name: string, domain: PlacesView['domain'], rank: number, over: Record<string, unknown> = {}) => ({
  id, domain, kind: 'place' as const, name, rank,
  actions: [{ kind: 'maps' as const, urlKind: 'direct' as const, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`, labelKey: 'v3.action.maps', priority: 1 }],
  ...over,
})
const view = (domain: PlacesView['domain'], items: ReturnType<typeof place>[]): PlacesView => ({ kind: 'tappy.places.v1', v: 1, domain, ranked: true, items: items as never })
const withCards = (answer: string, v: PlacesView) => { rememberPlacesView(answer, v); return answer }

const bySn = (n: number) => fx.HARNESS_SCENARIOS.find(s => s.n === n)!

describe('T01 / T03 / T05 / T08 / T10: the six reference answers draw what each needs', () => {
  it('T01 Elon vs Sam: two subject cards, a comparison table (data box) and the verdict callout; no itinerary, cards or report', () => {
    const s = bySn(1)
    const { container } = open(s.conversationId, s.messages.map((m, i) => ({ id: String(i), ...m })))
    expect(parts(container)).toMatchObject({ entityRow: 1, databox: 1, callout: 1, timeline: 0, placeCards: 0, reportCard: 0 })
    expect(container.querySelector('[data-media="entities"]')!.textContent).toMatch(/Elon Musk[\s\S]*Sam Altman/)
  })

  it('T03 Tesla: the dated facts, the callout and the data table; no subject cards, no itinerary', () => {
    const s = bySn(2)
    const { container } = open(s.conversationId, s.messages.map((m, i) => ({ id: String(i), ...m })))
    expect(parts(container)).toMatchObject({ databox: 1, callout: 1, entityRow: 0, timeline: 0, placeCards: 0, reportCard: 0 })
    expect(container.textContent).toMatch(/2003/)
  })

  it('T05 Thảo Điền: the place cards the turn carries, with their own names', () => {
    const s = bySn(3)
    const last = s.messages[s.messages.length - 1]
    rememberPlacesView(last.content, s.placesView!)
    const { container } = open(s.conversationId, s.messages.map((m, i) => ({ id: String(i), ...m })))
    const p = parts(container)
    expect(p.placeCards).toBe(2)
    expect(p.timeline + p.databox + p.reportCard + p.entityRow).toBe(0)
    const names = Array.from(container.querySelectorAll('[data-testid="place-card"]')).map(c => c.textContent ?? '')
    expect(names[0]).toContain('La Villa French Restaurant')
    expect(names[1]).toContain('The Deck Saigon')
  })

  it('T08 Đà Lạt: the itinerary timeline with days, stops, tips and the budget; no place cards or tables', () => {
    const s = bySn(4)
    const { container } = open(s.conversationId, s.messages.map((m, i) => ({ id: String(i), ...m })))
    expect(parts(container)).toMatchObject({ timeline: 1, placeCards: 0, reportCard: 0, entityRow: 0 })
    expect(screen.getAllByTestId('v206-stop')).toHaveLength(7)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Tất cả 3 ngày', 'Ngày 1', 'Ngày 2', 'Ngày 3', 'Dự toán'])
    expect(v206Store.getSnapshot().tips.length).toBe(5)
  })

  it('T10 (as a long research): a report is one summary card with the key points and the SOURCE COUNT, and the full text opens on a button (nothing of it in the chat)', () => {
    const s = bySn(5)
    const { container } = open(s.conversationId, s.messages.map((m, i) => ({ id: String(i), ...m })))
    expect(parts(container)).toMatchObject({ reportCard: 1, timeline: 0, placeCards: 0, databox: 0 })
    expect(screen.getByTestId('report-sources-count').textContent).toMatch(/2/)
    expect(screen.getByTestId('report-open')).toBeTruthy()
    // the full sections are not in the chat until the button is pressed
    expect(container.textContent).not.toContain('Hạ tầng và di chuyển')
    // no download buttons in the chat card; the export of an opened report is the owner's decision and is not touched here
    expect(container.textContent).not.toMatch(/PDF|Word/)
  })
})

describe('the same component for different content (variation), and a different layout when the need differs', () => {
  it('T05 / T07 / T13: three place searches (a restaurant, a late-night rice shop, a spa) draw the same card component with their OWN names and no other\'s', () => {
    const cases: Array<[string, PlacesView['domain'], string]> = [
      ['Tìm nhà hàng cao cấp ở Thảo Điền cho 2 người', 'food', 'Nhà hàng Sông Xanh Mẫu'],
      ['Tìm cơm tấm mở khuya ở Bình Thạnh', 'food', 'Cơm Tấm Đêm Mẫu'],
      ['Tìm spa thư giãn cuối tuần', 'spa', 'Spa Lá Sen Mẫu'],
    ]
    const names = cases.map(c => c[2])
    cases.forEach(([q, domain, name], i) => {
      const answer = withCards(`Gợi ý số ${i + 1}: **${name}** hợp nhu cầu của bạn.`, view(domain, [place(`id-${i}`, name, domain, 0, { address: `${i + 1} Đường Mẫu`, rating: 4.5, ratingCount: 100 })]))
      const { container } = open(`c-${i}`, msgs([q, answer]))
      expect(parts(container).placeCards).toBe(1)
      const card = container.querySelector('[data-testid="place-card"]')!.textContent ?? ''
      expect(card).toContain(name)
      for (const other of names.filter(n => n !== name)) expect(card).not.toContain(other)
      cleanup(); __resetPlacesViewCache()
    })
  })

  it('T12 two phones: a comparison table, no place cards, no itinerary', () => {
    const answer = 'So sánh nhanh hai mẫu theo camera, pin và giá:\n\n| Tiêu chí | Máy A | Máy B |\n| --- | --- | --- |\n| Camera | 50 MP | 48 MP |\n| Pin | 5000 mAh | 4800 mAh |\n| Giá | 12 triệu | 11 triệu |\n\nNếu chụp ảnh nhiều thì chọn Máy A.'
    const { container } = open('c12', msgs(['So sánh hai mẫu điện thoại về camera, pin và giá', answer]))
    expect(parts(container)).toMatchObject({ databox: 1, placeCards: 0, timeline: 0, reportCard: 0 })
  })

  it('T14 a café business plan: headed sections (and a table if the answer has one), never place cards or an itinerary', () => {
    const answer = '## Mô hình kinh doanh\n\nQuán cà phê nhỏ tập trung vào khách văn phòng.\n\n## Chi phí ban đầu\n\n| Hạng mục | Ước tính |\n| --- | --- |\n| Mặt bằng | 30 triệu |\n| Thiết bị | 80 triệu |\n\n## Rủi ro\n\nMặt bằng và nhân sự.'
    const { container } = open('c14', msgs(['Lập kế hoạch kinh doanh cho một quán cafe', answer]))
    const p = parts(container)
    expect(p.placeCards + p.timeline + p.reportCard + p.entityRow).toBe(0)
    expect(container.querySelectorAll('h2').length).toBe(3)
    expect(p.databox).toBe(1)
  })

  it('T16 a simple short answer: plain text, none of the components', () => {
    const { container } = open('c16', msgs(['Thủ đô của Việt Nam là gì?', 'Thủ đô của Việt Nam là Hà Nội.']))
    expect(parts(container)).toEqual(NONE)
    expect(container.textContent).toContain('Hà Nội')
  })

  it('T11 a market-research report on a different subject than resorts: a report card too, built from its OWN headings', () => {
    const sections = ['Quy mô thị trường', 'Đối thủ', 'Phân khúc khách hàng', 'Cơ hội và rủi ro', 'Kết luận']
    const body = sections.map(h => `## ${h}\n\n${'Nội dung mẫu về thị trường AI Agent tại Việt Nam, dùng để kiểm tra bố cục báo cáo. '.repeat(20)}`).join('\n\n')
    const report = `# Nghiên cứu thị trường AI Agent tại Việt Nam\n\n${body}\n\n## Nguồn\n\n1. Nguồn mẫu — harness.local`
    expect(report.length).toBeGreaterThan(8000)
    const { container } = open('c11', msgs(['Nghiên cứu thị trường AI Agent tại Việt Nam', report]))
    expect(parts(container)).toMatchObject({ reportCard: 1, placeCards: 0, timeline: 0 })
    expect(container.textContent).toContain('AI Agent')
    expect(container.textContent).not.toMatch(/Phú Quốc|resort/i)
  })

  it('T15 a mixed request (resorts, then a 4N3Đ plan with a budget): the place cards AND the itinerary in the same answer, nothing dropped', () => {
    const plan = { type: 'trip', title: 'Phú Quốc 4N3Đ', people: 4, budget_total: '40.000.000đ', days: [{ label: 'Ngày 1', items: [{ time: '10:00', emoji: '✈️', category: 'transport', name: 'Hạ cánh Phú Quốc' }] }, { label: 'Ngày 2', items: [{ time: '09:00', emoji: '🏝️', category: 'entertainment', name: 'Bãi Sao' }] }], cost_breakdown: { 'Lưu trú': '20.000.000đ', 'Ăn uống': '8.000.000đ' } }
    const answer = withCards(`Hai resort hợp gia đình: **Resort Mẫu Một** và **Resort Mẫu Hai**.\n\n[TAPPY_PLAN]${JSON.stringify(plan)}[/TAPPY_PLAN]`, view('travel', [place('r1', 'Resort Mẫu Một', 'travel', 0), place('r2', 'Resort Mẫu Hai', 'travel', 1)]))
    const { container } = open('c15', msgs(['Tìm resort Phú Quốc rồi lập lịch trình 4N3Đ, ngân sách 40 triệu', answer]))
    expect(parts(container)).toMatchObject({ timeline: 1 })
    expect(parts(container).placeCards).toBe(2)
    expect(screen.getByRole('tab', { name: 'Dự toán' })).toBeTruthy()
  })
})

describe('variations: five intent families, three different answers each; the layout follows the DATA (counts are not fixed anywhere)', () => {
  const plan = (days: number, perDay: number, budget: boolean) => ({
    type: 'trip', title: `Chuyến ${days} ngày`, people: 2,
    days: Array.from({ length: days }, (_, d) => ({ label: `Ngày ${d + 1}: Mẫu ${d + 1}`, items: Array.from({ length: perDay }, (_, i) => ({ time: `${8 + i * 3}:00`, emoji: '📍', category: 'entertainment', name: `Điểm ${d + 1}.${i + 1}` })) })),
    ...(budget ? { cost_breakdown: { 'Lưu trú': '1.000.000đ' } } : {}),
  })
  it.each([[1, 2, false], [2, 3, true], [5, 1, true]] as const)('itinerary of %i day(s) x %i stop(s), budget %s: tabs, stops and the budget tab follow the plan', (days, per, budget) => {
    const { container } = open(`v-plan-${days}`, msgs(['Lên lịch', `Lịch:\n\n[TAPPY_PLAN]${JSON.stringify(plan(days, per, budget))}[/TAPPY_PLAN]`]))
    expect(screen.getAllByTestId('v206-stop')).toHaveLength(days * per)
    // a one-day plan with no budget has nothing to switch between: the product draws no tab strip at all
    expect(screen.queryAllByRole('tab')).toHaveLength(days === 1 && !budget ? 0 : 1 + days + (budget ? 1 : 0))
    expect(parts(container).timeline).toBe(1)
  })

  it.each([[2, 'Camera', 'Pin'], [3, 'Giá', 'Bảo hành'], [4, 'Vị trí', 'Mức giá']])('a comparison of %i column(s): one data box with exactly those columns', (cols, a, b) => {
    const head = ['Tiêu chí', ...Array.from({ length: cols - 1 }, (_, i) => `Lựa chọn ${i + 1}`)]
    const row = (x: string) => [x, ...Array.from({ length: cols - 1 }, (_, i) => `${x} ${i + 1}`)]
    const table = [head, row(a), row(b)].map(r => `| ${r.join(' | ')} |`)
    table.splice(1, 0, `| ${head.map(() => '---').join(' | ')} |`)
    const { container } = open(`v-tab-${cols}`, msgs(['So sánh', `So sánh theo ${a} và ${b}:\n\n${table.join('\n')}\n\nKết luận ngắn.`]))
    expect(parts(container).databox).toBe(1)
    expect(container.querySelectorAll('[data-testid="v206-databox"] th')).toHaveLength(cols)
    expect(container.querySelectorAll('[data-testid="v206-databox"] tbody tr')).toHaveLength(2)
  })

  it.each([[1], [3], [5]])('a research report citing %i source(s): the card counts exactly that many', (n) => {
    const sources = Array.from({ length: n }, (_, i) => `${i + 1}. Nguồn mẫu ${i + 1} — site${i + 1}.vn`).join('\n')
    const body = ['Bối cảnh', 'Phân tích', 'So sánh', 'Rủi ro'].map(h => `## ${h}\n\n${'Đoạn mẫu cho bố cục báo cáo nghiên cứu. '.repeat(70)}`).join('\n\n')
    const report = `# Báo cáo mẫu ${n}\n\n${body}\n\n## Nguồn\n\n${sources}`
    expect(report.length).toBeGreaterThan(8000)
    open(`v-rep-${n}`, msgs(['Nghiên cứu', report]))
    expect(screen.getByTestId('report-sources-count').textContent).toContain(String(n))
  })

  it.each(['Một câu rất ngắn.', 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?', 'Có. Vì trời mưa nên mang theo ô.'])('a plain answer %# stays plain text', (a) => {
    const { container } = open('v-plain', msgs(['Hỏi nhanh', a]))
    expect(parts(container)).toEqual(NONE)
    expect(container.textContent).toContain(a)
  })

  it.each([[0], [1], [4]])('a project with %i linked conversation(s): that many rows, or the empty state', (n) => {
    const items = Array.from({ length: n }, (_, i) => ({ id: `lc${i}`, title: `Cuộc ${i}`, updated_at: new Date().toISOString(), project_id: 'px', messages: [{ role: 'assistant', content: `Nội dung ${i}` }] }))
    projectViewStore.set('px')
    render(<ConversationStoreProvider value={{ items, setItems: () => {}, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false, reload: async () => {}, loadMore: async () => {}, projects: [{ id: 'px', title: 'Dự án X', description: null, conversationCount: n }], setProjects: () => {}, reloadProjects: async () => {} } as never}><ProjectOverview /></ConversationStoreProvider>)
    expect(screen.queryAllByTestId('project-overview-row')).toHaveLength(n)
    expect(!!screen.queryByTestId('project-overview-empty')).toBe(n === 0)
  })
})

describe('place cards sit under the text that names them (one rule for every answer: the text and the place names decide, not the question, a keyword or the kind of venue)', () => {
  const kids = (c: HTMLElement) => Array.from(c.querySelector('[data-answer="article"]')!.children).map(el => {
    const e = el as HTMLElement
    if (e.dataset.embed === undefined) return (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24)
    const card = e.querySelector('[data-testid="place-decision"]')
    return `${card?.getAttribute('data-layout') === 'solo' ? 'SOLO' : 'GROUP'}:${Array.from(e.querySelectorAll('.v206-pc-name')).map(n => n.textContent).join('+')}`
  })
  const setup = (cid: string, q: string, answer: string, v: PlacesView) => { rememberPlacesView(answer, v); return open(cid, msgs([q, answer])) }
  const rows = (names: string[], domain: PlacesView['domain'] = 'food') => view(domain, names.map((n, i) => place(`id${i}`, n, domain, i, { address: `${i + 1} Đường Mẫu`, rating: 4.4 + i / 20, ratingCount: 50 + i })))

  it('sections that name each place: each card right after its own section\'s text', () => {
    const answer = '## Quán Gió Mẫu\n\nKhông gian thoáng, hợp buổi tối.\n\n## Quán Mưa Mẫu\n\nẤm cúng, hợp ngày lạnh.\n\nChúc bạn ngon miệng.'
    const { container } = setup('pc1', 'Tìm chỗ ăn tối', answer, rows(['Quán Gió Mẫu', 'Quán Mưa Mẫu']))
    const k = kids(container)
    expect(k.indexOf('SOLO:Quán Gió Mẫu')).toBe(k.findIndex(x => x.startsWith('Không gian thoáng')) + 1)
    expect(k.indexOf('SOLO:Quán Mưa Mẫu')).toBe(k.findIndex(x => x.startsWith('Ấm cúng')) + 1)
    expect(k.some(x => x.startsWith('GROUP'))).toBe(false)
  })

  it('names written inside ordinary paragraphs (no headings): the same rule', () => {
    const answer = 'Mở đầu ngắn.\n\nVề **Quán Gió Mẫu**: nên đặt trước.\n\nVề **Quán Mưa Mẫu**: đông vào cuối tuần.\n\nKết.'
    const { container } = setup('pc2', 'Gợi ý chỗ', answer, rows(['Quán Gió Mẫu', 'Quán Mưa Mẫu']))
    const k = kids(container)
    expect(k.indexOf('SOLO:Quán Gió Mẫu')).toBe(k.findIndex(x => x.startsWith('Về Quán Gió Mẫu')) + 1)
    expect(k.indexOf('SOLO:Quán Mưa Mẫu')).toBe(k.findIndex(x => x.startsWith('Về Quán Mưa Mẫu')) + 1)
  })

  // 18/11 (layout S5a): the places the text does not name no longer stand beside the single cards as a second list (the blind eval flagged such cards as contradicting the advice): the group is collapsed
  // behind "Xem thêm N chỗ" and opens on tap, so nothing is dropped and nothing competes with the pick.
  it('one place named, one not: the named one stands alone under its text, the other waits behind "Xem thêm 1 chỗ" at the end (nothing dropped)', () => {
    const answer = '## Quán Gió Mẫu\n\nKhông gian thoáng.\n\nChúc bạn vui.'
    const { container } = setup('pc3', 'Gợi ý chỗ', answer, rows(['Quán Gió Mẫu', 'Quán Nắng Mẫu']))
    const k = kids(container)
    expect(k.indexOf('SOLO:Quán Gió Mẫu')).toBe(k.findIndex(x => x.startsWith('Không gian thoáng')) + 1)
    expect(k.some(x => x === 'GROUP:')).toBe(true) // the group is there, collapsed: no card of its own yet
    expect(parts(container).placeCards).toBe(1)
    const more = within(container).getByTestId('place-show-more')
    expect(more.textContent).toBe('Xem thêm 1 chỗ')
    fireEvent.click(more)
    expect(parts(container).placeCards).toBe(2)
    expect(Array.from(container.querySelectorAll('.v206-pc-name')).map(n => n.textContent)).toContain('Quán Nắng Mẫu')
  })

  it('no place named in the text: the single group exactly as before', () => {
    const answer = 'Mình gợi ý vài chỗ hợp ngân sách của bạn.\n\nBạn xem thẻ bên dưới nhé.'
    const { container } = setup('pc4', 'Gợi ý', answer, rows(['Quán Gió Mẫu', 'Quán Mưa Mẫu']))
    const k = kids(container)
    expect(k.filter(x => x.startsWith('SOLO'))).toEqual([])
    expect(k.filter(x => x.startsWith('GROUP'))).toHaveLength(1)
    expect(k.find(x => x.startsWith('GROUP'))).toBe('GROUP:Quán Gió Mẫu+Quán Mưa Mẫu')
  })

  it('the same rule for other kinds of venue and other questions: a hotel and a repair shop', () => {
    const answer = '## Khách sạn Biển Xanh Mẫu\n\nPhòng hướng biển, gần bãi tắm.\n\n## Tiệm sửa xe Thành Mẫu\n\nSửa nhanh, bảo hành 6 tháng.'
    const v = view('travel', [place('h', 'Khách sạn Biển Xanh Mẫu', 'travel', 0), place('s', 'Tiệm sửa xe Thành Mẫu', 'travel', 1)])
    const { container } = setup('pc5', 'Chỗ ở và sửa xe', answer, v)
    const k = kids(container)
    expect(k.indexOf('SOLO:Khách sạn Biển Xanh Mẫu')).toBe(k.findIndex(x => x.startsWith('Phòng hướng biển')) + 1)
    expect(k.indexOf('SOLO:Tiệm sửa xe Thành Mẫu')).toBe(k.findIndex(x => x.startsWith('Sửa nhanh')) + 1)
  })

  it('a card is never put between a heading and its text', () => {
    const answer = '## Quán Gió Mẫu\n\nKhông gian thoáng.\n\n## Quán Mưa Mẫu\n\nẤm cúng.'
    const { container } = setup('pc6', 'Chỗ', answer, rows(['Quán Gió Mẫu', 'Quán Mưa Mẫu']))
    const els = Array.from(container.querySelector('[data-answer="article"]')!.children) as HTMLElement[]
    els.forEach((el, i) => { if (/^H[1-6]$/.test(el.tagName)) expect(els[i + 1]?.dataset.embed).toBeUndefined() })
  })

  it('the model may name the places in a different order than the engine ranked them: the text order wins for placement, every card still appears once', () => {
    const answer = '## Quán Mưa Mẫu\n\nẤm cúng.\n\n## Quán Gió Mẫu\n\nThoáng.'
    const { container } = setup('pc7', 'Chỗ', answer, rows(['Quán Gió Mẫu', 'Quán Mưa Mẫu']))
    const k = kids(container).filter(x => x.startsWith('SOLO'))
    expect(k).toEqual(['SOLO:Quán Mưa Mẫu', 'SOLO:Quán Gió Mẫu'])
    expect(parts(container).placeCards).toBe(2)
  })
})

describe('T09 (the renderer half): a revised itinerary replaces day 2 and keeps the rest', () => {
  it('day 2\'s stop changes to the indoor one; days 1 and 3 and the tabs are as before', () => {
    const base = JSON.parse(JSON.stringify({ ...JSON.parse(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/.exec(bySn(4).messages[1].content)![1]) }))
    const revised = JSON.parse(JSON.stringify(base))
    // a real revision changes the day's label and drops the tip that belonged to the removed stop; days 1 and 3 stay byte-for-byte
    revised.days[1] = { label: 'Ngày 2: Bảo tàng trong nhà', items: [{ time: '09:00', emoji: '🏛️', category: 'entertainment', name: 'Bảo tàng trong nhà (đổi vì mưa)' }] }
    revised.local_tips = revised.local_tips.filter((t: { place?: string }) => !/Puppy Farm/.test(t.place ?? ''))
    const render1 = (plan: unknown) => open('c9', msgs(['Lịch Đà Lạt', `Lịch trình:\n\n[TAPPY_PLAN]${JSON.stringify(plan)}[/TAPPY_PLAN]`]))
    const a = render1(base); const before = a.container.textContent ?? ''; cleanup(); v206Store.reset()
    const b = render1(revised); const after = b.container.textContent ?? ''
    expect(before).toContain('Puppy Farm')
    expect(after).not.toContain('Puppy Farm')
    expect(after).toContain('Bảo tàng trong nhà')
    for (const keep of ['Lẩu gà lá é Tao Ngộ', 'Cáp treo đồi Robin', 'Ngày 1', 'Ngày 3']) expect(after).toContain(keep)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Tất cả 3 ngày', 'Ngày 1', 'Ngày 2', 'Ngày 3', 'Dự toán'])
  })
})

describe('T17 / T18 project overview and the linked conversations', () => {
  const store = () => ({
    items: fx.harnessStoreItems(Date.now()), setItems: () => {}, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false, reload: async () => {}, loadMore: async () => {},
    projects: [...fx.HARNESS_PROJECTS], setProjects: () => {}, reloadProjects: async () => {},
  }) as never

  it('T17 opening the project draws the PROJECT overview (its title, its two linked conversations), not a chat answer', () => {
    projectViewStore.set('p1')
    const { container } = render(<ConversationStoreProvider value={store()}><ProjectOverview /></ConversationStoreProvider>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dự án Du lịch Phú Quốc 2026')
    const rows = screen.getAllByTestId('project-overview-row')
    expect(rows.map(r => r.getAttribute('href')).sort()).toEqual(['/chat/h-dossier', '/chat/h-pq-plan'])
    expect(parts(container)).toEqual(NONE)
    // what the product has no data for is not drawn (budget, status, saved places, notes)
    expect(container.textContent).not.toMatch(/45\.000\.000|Đang lên kế hoạch|Regent|Claims Verified/)
  })

  it('T18 a linked conversation opens with ITS OWN transcript (the research), and nothing of another conversation', () => {
    const s = bySn(5)
    const { container } = open('h-dossier', s.messages.map((m, i) => ({ id: String(i), ...m })))
    expect(screen.getAllByText(/Khảo sát giúp tôi 3 cụm resort/).length).toBeGreaterThan(0)
    expect(parts(container).reportCard).toBe(1)
    expect(container.textContent).not.toMatch(/Elon|Tesla|Đà Lạt|Thảo Điền/)
  })
})

describe('contract validation: bad data never breaks the conversation or leaks raw markers', () => {
  it('a malformed [TAPPY_PLAN]: no itinerary, no raw JSON in the page, the text around it still shown', () => {
    const { container } = open('cv1', msgs(['Lịch?', 'Mở đầu còn đọc được.\n\n[TAPPY_PLAN]{"type":"trip","days":[{"label":"x" BROKEN[/TAPPY_PLAN]\n\nKết thúc còn đọc được.']))
    expect(parts(container).timeline).toBe(0)
    expect(container.textContent).toContain('Mở đầu còn đọc được.')
    expect(container.textContent).toContain('Kết thúc còn đọc được.')
    expect(container.textContent).not.toMatch(/TAPPY_PLAN|BROKEN|"type"/)
  })

  it('a [TAPPY_MEDIA] subject card whose link is not an allowed page (javascript:, a random host) is dropped, with no raw JSON shown', () => {
    const bad = '[TAPPY_MEDIA]' + JSON.stringify({ v: 1, kind: 'entities', entities: [{ name: 'A', summary: 'a', href: 'javascript:alert(1)', source: 'Wikipedia' }, { name: 'B', summary: 'b', href: 'https://evil.example/x', source: 'Wikipedia' }] }) + '[/TAPPY_MEDIA]'
    const { container } = open('cv2', msgs(['Ai?', `Hai người.\n\n${bad}`]))
    expect(parts(container).entityRow).toBe(0)
    expect(container.textContent).not.toMatch(/TAPPY_MEDIA|javascript:|evil\.example/)
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  })

  it('a places annotation with no usable item draws no cards (and does not throw)', () => {
    const answer = withCards('Có vài chỗ.', { kind: 'tappy.places.v1', v: 1, domain: 'food', items: [] } as never)
    const { container } = open('cv3', msgs(['Quán?', answer]))
    // the in-memory hand-off accepts the view as given; with no items the decision draws nothing
    expect(parts(container).placeCards).toBe(0)
    expect(container.textContent).toContain('Có vài chỗ.')
  })
})

describe('context isolation (what the renderer can guarantee)', () => {
  it('tips of conversation A are gone when conversation B (with no itinerary) is opened', () => {
    const s = bySn(4)
    const a = open('conv-a', s.messages.map((m, i) => ({ id: String(i), ...m })))
    expect(v206Store.getSnapshot().tips.length).toBe(5)
    a.unmount()
    const b = open('conv-b', msgs(['Chào', 'Xin chào, tôi giúp được gì?']))
    expect(v206Store.getSnapshot().tips.length).toBe(0)
    expect(b.container.textContent).not.toMatch(/Đà Lạt|Puppy/)
  })

  it('an opened tips/entity drawer of A does not stay open for B', () => {
    const s = bySn(4)
    const a = open('conv-a', s.messages.map((m, i) => ({ id: String(i), ...m })))
    v206Store.openTips()
    expect(v206Store.getSnapshot().drawer?.kind).toBe('tips')
    a.unmount()
    open('conv-b', msgs(['Chào', 'Xin chào']))
    expect(v206Store.getSnapshot().drawer).toBeNull()
  })

  // KNOWN LIMITATION, found while writing this suite and NOT fixed here (it needs a design decision, see the report): the place cards a tab remembers are keyed by the first
  // 160 characters of the answer text only, so a DIFFERENT conversation whose answer starts with the same 160 characters shows the first conversation's cards.
  // `it.fails` passes while the limitation exists and turns red the day it is fixed, so the fix cannot go unnoticed.
  it.fails('KNOWN LIMITATION: two conversations whose answers share their first 160 characters share place cards', () => {
    const opening = 'Dưới đây là một số gợi ý phù hợp với nhu cầu của bạn, được chọn theo vị trí, mức giá và đánh giá của khách đã từng ghé thăm trong thời gian gần đây, xếp theo thứ tự ưu tiên.'
    rememberPlacesView(`${opening} A`, view('food', [place('x', 'Quán Của Cuộc Trò Chuyện A', 'food', 0)]))
    const { container } = open('conv-b', msgs(['Tìm quán khác', `${opening} B`]))
    expect(parts(container).placeCards).toBe(0)
  })
})

describe('what these fixtures cannot show (model behaviour; not tested here)', () => {
  it.todo('T02 a focused comparison answer chosen by the model for "Elon có giỏi kỹ thuật hơn Sam không?"')
  it.todo('T04 "Ông ấy có thực sự cứu Tesla khỏi phá sản không?" resolves the pronoun to Elon/Tesla from the previous turn')
  it.todo('T06 "Quán nào có bàn ngoài trời gần sông?" keeps the budget and party size of T05')
  it.todo('T09 the model changes only day 2 of the itinerary and recomputes the budget')
  it.todo('T15 the model answers BOTH parts of a mixed request')
})

void within

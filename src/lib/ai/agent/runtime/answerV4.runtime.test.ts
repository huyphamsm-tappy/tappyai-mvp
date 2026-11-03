// TAPPY_ANSWER_V4 (owner 19/10/2026) as wired in a real runtime turn (index.ts): the model understanding runs beside the loop, every retrieval tool
// is offered (no word-list gate / hints), the server's pictures leave as the tappy.doc_media.v1 annotation and the [TAPPY_MEDIA] block, and a
// failed understanding keeps the V3 behaviour. AI.step is mocked; the understanding call and the picture lookups use their seams. No network.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({
  calls: [] as Array<Record<string, any>>,
  script: [] as Array<{ text: string; calls?: Array<[string, Record<string, unknown>]> }>,
}))
vi.mock('@/lib/ai/llm', async orig => {
  const m = await orig<typeof import('@/lib/ai/llm')>()
  return {
    ...m,
    AI: {
      ...m.AI,
      step: vi.fn(async (o: Record<string, any>) => {
        H.calls.push(o)
        const s = o.maxTokens === 700 ? { text: '' } : H.script.shift() ?? { text: 'Mặc định.' }
        return {
          text: s.text, finishReason: s.calls?.length ? 'tool-calls' : 'stop',
          toolCalls: (s.calls ?? []).map(([toolName, args], k) => ({ toolCallId: `t${H.calls.length}_${k}`, toolName, args })),
          usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0 } } }, response: { modelId: 'mock' },
        }
      }),
      extract: vi.fn(async () => { throw new Error('no real model call in tests') }),
    },
  }
})

import { startAgentRuntimeTurn } from './index'
import { AgentRunTrace } from './trace'
import { __resetPageCache } from './readPage'
import { DOC_MEDIA_KIND } from '@/lib/answerDoc/media'
import type { TurnUnderstanding } from '@/lib/ai/answerV4/understand'
import type { MediaBlock, MediaEntity } from '@/lib/media/mediaHosts'

const FLAGS = ['C2_TOOL_GATE', 'TAPPY_ANSWER_V4', 'CONSULT_V3', 'CONSULTATIVE_IN_AGENT', 'TAPPY_AGENT']
beforeEach(() => { H.calls.length = 0; H.script.length = 0; for (const k of FLAGS) delete process.env[k] })
afterEach(() => { __resetPageCache(); vi.restoreAllMocks(); for (const k of FLAGS) delete process.env[k] })

const U = (o: Partial<TurnUnderstanding> = {}): TurnUnderstanding => ({
  reply_language: 'vi', intent: 'recommendation', needs_fresh_data: false, wants_figures: false, sensitivity: 'none', answer_shape: 'list', item_kind: 'dish', entities: [], ...o,
})
const wikiEnt = (name: string): MediaEntity => ({ name, summary: `${name} là …`, href: `https://vi.wikipedia.org/wiki/${name.replace(/ /g, '_')}`, image: `https://upload.wikimedia.org/${name.replace(/ /g, '_')}.jpg`, source: 'Wikipedia' })

async function turn(userText: string, o: { v4?: boolean; understand?: (p: string) => Promise<TurnUnderstanding>; wiki?: (s: string) => Promise<MediaEntity | null>; web?: (q: string) => Promise<string[]>; places?: boolean; page?: string; hosted?: (o: { input: string }) => Promise<unknown>; serperRuns?: string[] } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const prompts: string[] = []
  const media: MediaBlock[] = []
  const understood: TurnUnderstanding[] = []
  const r = startAgentRuntimeTurn({
    routeTools: {
      web_search: { description: 'web', parameters: undefined, execute: async () => { o.serperRuns?.push('web_search'); return { results: [{ title: 'kết quả', link: 'https://x.example/a', snippet: 's' }] } } },
      get_news: { description: 'news', parameters: undefined, execute: async () => { o.serperRuns?.push('get_news'); return { articles: [{ title: 'Bài RSS không liên quan', url: 'https://vnexpress.net/x.html', summary: 's', source: 'VnExpress' }] } } },
      get_weather: { description: 'weather', parameters: undefined, execute: async () => ({ temp: 20 }) },
      get_gold_price: { description: 'gold', parameters: undefined, execute: async () => ({ price: 1 }) },
      ...(o.places ? { search_places: { description: 'places', parameters: undefined, execute: async () => ({ results: [{ name: 'Quán A' }] }) } } : {}),
    },
    promptVersion: 'consult_v3', consultative: true, answerV4: o.v4 ?? true,
    understandExtract: async (x: { prompt: string }) => { prompts.push(x.prompt); return (o.understand ?? (async () => U()))(x.prompt) },
    docMediaDeps: { wiki: o.wiki ?? (async () => null), webImages: o.web ?? (async (q: string) => [`https://img.example/${encodeURIComponent(q)}.jpg`]) },
    onMedia: (b: MediaBlock) => media.push(b),
    onUnderstanding: (u: TurnUnderstanding) => understood.push(u),
    ...(o.hosted ? { hostedSearch: true, hostedSearchFn: o.hosted } : { hostedSearch: false }),
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: userText }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: (q: string) => ({ query: q, cut: [] }), trace,
    research: { fetchPage: async (u: string) => (o.page
      ? { ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: o.page, bytes: o.page.length, truncated: false, redirects: 0, ms: 1 }
      : { ok: false, url: u, reason: 'http_error', status: 404, redirects: 0, ms: 1 }) as never },
  } as never)
  const body = await r.toDataStreamResponse().text()
  const lines = body.split('\n').filter(Boolean)
  const ann = lines.filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as Array<Record<string, any>>)
  const docMedia = ann.filter(a => a.kind === DOC_MEDIA_KIND)
  const scripted = H.calls.filter(c => c.maxTokens !== 700)
  return { trace, docMedia, media, prompts, understood, scripted, body }
}
const toolNames = (c: Record<string, any>) => Object.keys(c.tools ?? {}).sort()

describe('V4-1 · the question is understood by the model, beside the loop, in any language', () => {
  it('one understanding call per turn with the message in the data fence; the trace holds enums only', async () => {
    H.script.push({ text: 'Trời mưa ăn lẩu nhé.' })
    const t = await turn('nay trời mưa ăn gì cho ngon pa', { understand: async () => U({ item_kind: 'none', answer_shape: 'chat', intent: 'chat' }) })
    expect(t.prompts).toHaveLength(1)
    expect(t.prompts[0]).toContain('nay trời mưa ăn gì cho ngon pa')
    expect(t.understood).toHaveLength(1)
    const ev = t.trace.events.find(e => e.kind === 'task' && (e as any).decision === 'understood') as Record<string, any>
    expect(ev).toBeTruthy()
    expect(JSON.stringify(ev)).not.toContain('trời mưa')
  })

  it('OFF (V3): no understanding call, nothing new in the stream', async () => {
    H.script.push({ text: 'Đáp.' })
    const t = await turn('biết elon không', { v4: false })
    expect(t.prompts).toHaveLength(0)
    expect(t.docMedia).toHaveLength(0)
  })
})

describe('V4-2 · every retrieval tool is offered; the word-list gate and hints do not decide', () => {
  it('a writing request in Vietnamese ("viết") that the V3 gate strips of tools keeps them under V4', async () => {
    process.env.C2_TOOL_GATE = '1'
    // (the V3 word list reads "mùa" as "mua" = buy and KEEPS tools for "bài thơ về mùa thu" — the kind of accident V4 removes; the control
    // below is a message the list does strip)
    H.script.push({ text: 'Bài thơ…' })
    const off = await turn('Viết cho mình bài thơ về tình bạn', { v4: false })
    expect(Object.keys(off.scripted[0].tools ?? {})).toHaveLength(0)
    H.calls.length = 0
    H.script.push({ text: 'Bài thơ…' })
    const on = await turn('Viết cho mình bài thơ về tình bạn')
    expect(toolNames(on.scripted[0])).toEqual(expect.arrayContaining(['get_gold_price', 'get_weather', 'web_search']))
    expect(on.trace.events.some(e => e.kind === 'budget' && (e as any).decision === 'c2_tool_gate')).toBe(false)
  })

  it('a deferred tool with no hint word in the message (Thai) is offered directly, not behind use_tool', async () => {
    H.script.push({ text: 'ราคาทอง…' })
    const t = await turn('ราคาทองวันนี้เท่าไหร่')
    expect(toolNames(t.scripted[0])).toContain('get_gold_price')
    expect(toolNames(t.scripted[0])).not.toContain('use_tool')
  })
})

describe('V4 lookup part 1 · the turn reads pages with the structure-preserving reader', () => {
  const ROW = (c: string, t: string) => `<tr><td><div><div>${c}</div></div></td><td><div><div>${t}</div><div>Ga Đà Nẵng</div></div></td><td><div>92.000đ</div></td></tr>`
  const PAGE = `<html><head><title>Vé tàu</title></head><body>${Array.from({ length: 30 }, (_, k) => `<p>Chuyến tàu Đà Nẵng - Huế là trải nghiệm du lịch đẹp qua đèo Hải Vân, đoạn ${k}.</p>`).join('')}<h2>Lịch tàu</h2><table>${ROW('HĐ2', '07:50')}${ROW('SE10', '08:59')}${ROW('SE4', '12:28')}</table></body></html>`
  const readTurn = async (v4: boolean) => {
    H.script.push({ text: '', calls: [['read_page', { urls: ['https://x.example/a'], focus: 'giờ khởi hành tàu Đà Nẵng Huế', kind: 'hours' }]] }, { text: 'Đáp.' })
    // the page must come from this research: the user's own message carries the link
    const t = await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ? https://x.example/a', { v4, page: PAGE })
    const toolMsg = JSON.stringify(t.scripted[1]?.messages ?? [])
    H.calls.length = 0
    return toolMsg
  }
  it('V4: the whole timetable reaches the model; V3: it does not (the measured defect)', async () => {
    const on = await readTurn(true)
    for (const x of ['07:50', '08:59', '12:28']) expect(on).toContain(x)
    const off = await readTurn(false)
    expect(off).not.toContain('08:59')
  })
})

describe('V4 lookup engine · web_search is served by the hosted web search', () => {
  const HOSTED = { text: '- SE10 khởi hành 08:59 {{SRC:0}}\n- Mua vé tại dsvn.vn {{SRC:1}}', sources: [{ url: 'https://vexere.com/tau', title: 'Vé tàu', quotes: ['SE10 khởi hành 08:59'] }, { url: 'https://dsvn.vn/', title: 'ĐSVN', quotes: ['Mua vé tại dsvn.vn'] }], searches: 2, usd: 0.03, incomplete: null }
  it('the model\'s web_search reaches the hosted search (not Serper); the tool result holds the facts with [S#] and the sources', async () => {
    const asked: string[] = []
    const serperRuns: string[] = []
    H.script.push({ text: '', calls: [['web_search', { queries: ['giờ tàu Đà Nẵng Huế ngày mai'] }]] }, { text: 'SE10 khởi hành 08:59 [S1].' })
    const t = await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?', { hosted: async o => { asked.push(o.input); return HOSTED }, serperRuns })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('giờ tàu Đà Nẵng Huế ngày mai')
    expect(serperRuns).toHaveLength(0)
    const toolMsg = JSON.stringify(t.scripted[1]?.messages ?? [])
    expect(toolMsg).toContain('SE10 khởi hành 08:59 [S1]')
    expect(toolMsg).toContain('https://dsvn.vn/')
    expect(t.trace.events.some(e => (e as Record<string, unknown>).decision === 'hosted_search')).toBe(true)
  })
  it('the reply language the understanding read reaches the hosted search (acceptance 19/10: an English loan question got a Vietnamese brief)', async () => {
    const asked: string[] = []
    H.script.push({ text: '', calls: [['web_search', { queries: ['lãi suất vay doanh nghiệp nhỏ'] }]] }, { text: 'Rates [S1].' })
    // the understanding settles AFTER the first round asked for the search (in the acceptance log it took 1.6–3.4 s): the search waits for it
    const t = await turn('Best small-business loan rates today?', { hosted: async o => { asked.push(o.input); return HOSTED }, understand: async () => { await new Promise(r => setTimeout(r, 400)); return U({ reply_language: 'en', needs_fresh_data: true }) } })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('Reply language (write the brief in it): en')
    const order = (t.trace.events as unknown as Array<Record<string, unknown>>).filter(e => e.decision === 'understood' || (e.kind === 'evidence' && e.decision === 'hosted_search')).map(e => e.decision)
    expect(order).toEqual(['understood', 'hosted_search'])
  })
  it('a failed understanding: the search runs at once, with no reply-language line', async () => {
    const asked: string[] = []
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp [S1].' })
    const t0 = Date.now()
    await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?', { hosted: async o => { asked.push(o.input); return HOSTED }, understand: async () => { throw new Error('model down') } })
    expect(asked).toHaveLength(1)
    expect(asked[0]).not.toContain('Reply language')
    expect(Date.now() - t0).toBeLessThan(2_500)
  })
  it('the hosted search runs on its own time budget (> the 15 s tool default) and receives the cancellation signal (UAT 19/10 u29: cut at 15 s)', async () => {
    const { HOSTED_TOOL_TIMEOUT_MS } = await import('@/lib/ai/answerV4/hostedResearch')
    const { RUNTIME_LIMITS } = await import('./limits')
    expect(HOSTED_TOOL_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * RUNTIME_LIMITS.toolTimeoutMs)
    const signals: Array<AbortSignal | undefined> = []
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp [S1].' })
    await turn('Lãi suất vay doanh nghiệp nhỏ hôm nay?', { hosted: async (o: { input: string; signal?: AbortSignal }) => { signals.push(o.signal); return HOSTED } })
    expect(signals).toHaveLength(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })
  it('a news request (get_news) is served by the hosted search too — the RSS matcher never runs', async () => {
    const asked: string[] = []
    const serperRuns: string[] = []
    H.script.push({ text: '', calls: [['get_news', { query: 'Cần Thơ tin nóng' }]] }, { text: 'Đáp.' })
    const t = await turn('Ở Cần Thơ mới có vụ chi nóng chi rứa?', { hosted: async o => { asked.push(o.input); return HOSTED }, serperRuns })
    expect(serperRuns).toEqual([])
    expect(asked[0]).toMatch(/latest relevant events/)
    expect(JSON.stringify(t.scripted[1]?.messages ?? [])).not.toContain('Bài RSS không liên quan')
  })
  it('switch off (or V3): the former web search runs, the hosted search is never called', async () => {
    const serperRuns: string[] = []
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp.' })
    await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?', { serperRuns })
    expect(serperRuns).toEqual(['web_search'])
    H.calls.length = 0
    const asked: string[] = []
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp.' })
    await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?', { v4: false, hosted: async o => { asked.push(o.input); return HOSTED } })
    expect(asked).toHaveLength(0)
  })
})

describe('V4-3 · the answer\'s pictures leave the server', () => {
  it('a list of dishes: the doc media annotation with one picture per item (cap 6)', async () => {
    H.script.push({ text: 'Trời mưa thử mấy món này:\n\n- **Lẩu Thái** – cay\n- **Phở bò** – thơm\n- **Cháo lòng** – nóng' })
    const t = await turn('nay trời mưa ăn gì cho ngon pa')
    expect(t.docMedia).toHaveLength(1)
    expect(t.docMedia[0].items.map((i: { title: string }) => i.title)).toEqual(['Lẩu Thái', 'Phở bò', 'Cháo lòng'])
    const ev = t.trace.events.find(e => (e as any).decision === 'media_v4') as Record<string, any>
    expect(ev.item_images).toBe(3)
  })

  it('a comparison of two people: the [TAPPY_MEDIA] entities block (Wikipedia cards), no item pictures', async () => {
    H.script.push({ text: 'Mỗi người giỏi một kiểu…' })
    const t = await turn('Elon Musk với Mark Zuckerberg ai giỏi hơn', {
      understand: async () => U({ intent: 'comparison', answer_shape: 'comparison', item_kind: 'person', entities: [{ name: 'Elon Musk', type: 'person', wiki_title: 'Elon Musk' }, { name: 'Mark Zuckerberg', type: 'person', wiki_title: 'Mark Zuckerberg' }] }),
      wiki: async s => wikiEnt(s),
    })
    expect(t.media.map(b => b.kind)).toEqual(['entities'])
    expect((t.media[0] as Extract<MediaBlock, { kind: 'entities' }>).entities.map(e => e.name)).toEqual(['Elon Musk', 'Mark Zuckerberg'])
  })

  it('a phonetic name ("hít le") is recognised by the understanding, not by the words of the reply', async () => {
    H.script.push({ text: 'Đó là nhà độc tài của Đức Quốc xã…' })
    const t = await turn('ông biết hít le không', {
      understand: async () => U({ intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Adolf Hitler', type: 'person', wiki_title: 'Adolf Hitler' }] }),
      wiki: async s => (s === 'Adolf Hitler' ? wikiEnt('Adolf Hitler') : null),
    })
    expect(t.media).toEqual([{ v: 1, kind: 'entity', entity: wikiEnt('Adolf Hitler') }])
  })

  it('a turn whose places have their own cards gets no item pictures', async () => {
    H.script.push({ text: '', calls: [['search_places', { query: 'quán lẩu' }]] }, { text: '- **Quán A** – ngon\n- **Quán B** – rẻ' })
    const t = await turn('quán lẩu gần đây', { places: true, understand: async () => U({ item_kind: 'place' }) })
    expect(t.docMedia).toHaveLength(0)
  })

  it('a failed understanding: no crash, no V4 media; the V3 knowledge card path still runs', async () => {
    H.script.push({ text: '**Elon Musk** là doanh nhân…' })
    const t = await turn('biết elon musk không', { understand: async () => { throw new Error('model down') } })
    expect(t.docMedia).toHaveLength(0)
    expect(t.trace.events.some(e => e.kind === 'error' && (e as any).scope === 'understand')).toBe(true)
    expect(t.body).toContain('Elon Musk')
  })
})

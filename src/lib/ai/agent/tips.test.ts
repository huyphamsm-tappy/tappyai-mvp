// @vitest-environment node
// Local practical tips (owner 2026-10-04, final patch): a CAPABILITY of the agent, not a template. The instructions ask for 1–3 short, general
// tips when they help the decision, phrased as general advice, never as verified facts, with no extra tool call. The stream guards still remove
// anything a tip states as a fact without evidence (a price, a showtime). Driven through the real stream filter and the real agent loop.
import { describe, it, expect, vi } from 'vitest'
import { AGENT_SYSTEM } from './prompt'
import { runBoundedAgent, type AgentStep } from './loop'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'

const END = 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}'
const textOf = (raw: string) => raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
/** One agent turn through the real filter: tool frames + the reply, as a place turn (the guards run). */
async function filtered(userText: string, toolName: string, args: Record<string, unknown>, result: unknown, reply: string) {
  const c = createEnrichmentCollector(userText, []); c.agentMode = true
  const lines = [`9:${JSON.stringify({ toolCallId: 't1', toolName, args })}`, `a:${JSON.stringify({ toolCallId: 't1', result })}`, `0:${JSON.stringify(reply)}`, END]
  const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, userText, true).body).text()
  return textOf(raw)
}
const PHO = { results: [{ name: 'Phở Lệ Nguyễn Trãi', rating_value: 4.4, rating_count: 1850, google_rating: '4.4⭐ (1.850 đánh giá)', address: '413 Nguyễn Trãi, Quận 5', maps_link: 'https://maps.google.com/?cid=1', type: 'restaurant' }] }

describe('tips are a capability in the instructions — not a mandatory section', () => {
  it('asks for practical advice per domain, only when it helps, as general advice, with no extra tool call', () => {
    expect(AGENT_SYSTEM).toContain('MẸO THỰC TẾ (năng lực, KHÔNG phải mục bắt buộc)')
    for (const domain of ['Ăn uống:', 'Du lịch:', 'Vui chơi / phim:', 'Spa:', 'Mua sắm:']) expect(AGENT_SYSTEM).toContain(domain)
    expect(AGENT_SYSTEM).toMatch(/món địa phương nên thử/)
    expect(AGENT_SYSTEM).toMatch(/Không gọi thêm công cụ chỉ để có mẹo/)
    expect(AGENT_SYSTEM).toMatch(/Không viết "người địa phương đều\/luôn…"/)
    expect(AGENT_SYSTEM).toMatch(/không có mục "Mẹo & cạm bẫy" cố định/)
  })
  it('the travel plan summary carries local food + practical tips', () => {
    expect(AGENT_SYSTEM).toMatch(/tóm tắt và món địa phương nên thử; mẹo thực tế \(thời điểm\/thời tiết, di chuyển, nên đặt trước gì\) để trong local_tips/)
  })
})

describe('general tips reach the user; unsourced facts inside a tip do not', () => {
  it('food: a general ordering / timing tip survives the place guards', async () => {
    const reply = '**Phở Lệ Nguyễn Trãi** là lựa chọn chắc tay, 4.4⭐ từ 1.850 đánh giá. Một mẹo thực tế là gọi tô đặc biệt nếu muốn thử đủ loại thịt, và nên đến sớm vì buổi tối thường đông.'
    const out = await filtered('tối nay ăn gì ngon', 'search_places', { query: 'phở' }, PHO, reply)
    expect(out).toContain('Một mẹo thực tế là gọi tô đặc biệt')
    expect(out).toContain('nên đến sớm')
  })
  it('entertainment: booking / arrival timing advice survives', async () => {
    const rows = { results: [{ name: 'CGV Vincom Center Đồng Khởi', rating_value: 4.3, rating_count: 4514, address: '72 Lê Thánh Tôn', maps_link: 'https://maps.google.com/?cid=2', type: 'cinema' }] }
    const reply = '**CGV Vincom Center Đồng Khởi** ở 72 Lê Thánh Tôn. Cuối tuần buổi tối thường đông, nên chọn suất và chỗ trước khi đi.'
    const out = await filtered('rạp gần Q1', 'search_places', { query: 'rạp chiếu phim', placeType: 'cinema' }, rows, reply)
    expect(out).toContain('thường đông, nên chọn suất và chỗ trước khi đi')
    // A tip that asserts an online ticket channel without evidence is a ticket claim — the existing guard removes it.
    const sale = await filtered('rạp gần Q1', 'search_places', { query: 'rạp chiếu phim', placeType: 'cinema' }, rows, '**CGV Vincom Center Đồng Khởi** ở 72 Lê Thánh Tôn. Bạn nên đặt vé trước trên trang của rạp.')
    expect(sale).not.toMatch(/đặt vé trước trên trang/)
  })
  it('a tip may not carry a price the data does not have: the unsupported number is removed', async () => {
    const reply = '**Phở Lệ Nguyễn Trãi** là lựa chọn chắc tay. Một mẹo thực tế: một tô ở đây giá 95.000đ nên mang đủ tiền mặt.'
    const out = await filtered('tối nay ăn gì ngon', 'search_places', { query: 'phở' }, PHO, reply)
    expect(out).not.toContain('95.000')
  })
})

describe('tips never add a tool call', () => {
  it('a tip-rich answer after one search is still one tool call, two model calls', async () => {
    const steps: AgentStep[] = [
      { text: '', toolCalls: [{ toolCallId: 'a', toolName: 'search_places', args: { query: 'đặc sản Đà Nẵng', why: 'quán đặc sản' } }], finishReason: 'tool-calls' },
      { text: 'Ở Đà Nẵng nên thử mì Quảng và bánh tráng cuốn thịt heo. Một mẹo thực tế là đi Bà Nà hoặc Ngũ Hành Sơn từ sáng sớm cho đỡ nắng.', toolCalls: [], finishReason: 'stop' },
    ]
    let i = 0
    const callModel = vi.fn(async () => steps[Math.min(i++, steps.length - 1)])
    const exec = vi.fn(async () => ({ results: [] }))
    const r = await runBoundedAgent({ system: 'SYS', messages: [{ role: 'user', content: 'ăn món gì ở Đà Nẵng?' }], schemas: {}, lang: 'vi', deadlineAt: Date.now() + 100_000, tools: { search_places: { execute: exec } }, callModel } as Parameters<typeof runBoundedAgent>[0])
    expect(r).toMatchObject({ status: 'answered', toolCalls: 1, modelCalls: 2 })
    expect(exec).toHaveBeenCalledTimes(1)
    expect(r.text).toContain('mì Quảng')
  })
})

describe('trip plan local_tips (restored from the old consultative plan, same deterministic guard)', () => {
  it('the agent plan schema carries local_tips with the guard rules', () => {
    expect(AGENT_SYSTEM).toMatch(/"local_tips":\[\{"text":"[^"]+","basis":"tool","place":"[^"]+"\},\{"text":"[^"]+","basis":"general"\}\]/)
    expect(AGENT_SYSTEM).toMatch(/local_tips: 2–4 mẹo, KHÔNG chứa chữ số/)
  })
  it('a general tip and a tip about a retrieved stop survive; a tip with a number or a named venue is dropped', async () => {
    const plan = { type: 'trip', title: 'Đà Nẵng 3 ngày 2 đêm', people: 2, days: [{ label: 'Ngày 1', items: [{ time: '19:00', emoji: '🍽️', category: 'food', name: 'Phở Lệ Nguyễn Trãi', description: 'Quán phở', price: 'chưa có giá', address: '', maps_link: '', booking_link: '', place_id: '' }] }],
      local_tips: [
        { text: 'Nên đi biển hoặc Ngũ Hành Sơn từ sáng sớm cho đỡ nắng, mang theo mũ và kem chống nắng.', basis: 'general' },
        { text: 'Gọi tô đặc biệt nếu muốn thử đủ các loại thịt.', basis: 'tool', place: 'Phở Lệ Nguyễn Trãi' },
        { text: 'Vé Bà Nà khoảng 900 nghìn, nên mua trước.', basis: 'general' },
        { text: 'Ghé quán Bà Ba Hải Sản để ăn tối.', basis: 'general' },
      ], share_text: '#TappyAI' }
    const reply = `[TAPPY_PLAN]${JSON.stringify(plan)}[/TAPPY_PLAN]\n\nLịch nhẹ nhàng, nên thử mì Quảng và bánh tráng cuốn thịt heo.`
    const out = await filtered('lập kế hoạch đi Đà Nẵng 3 ngày 2 đêm cho 2 người', 'search_places', { query: 'phở' }, PHO, reply)
    const body = JSON.parse(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/.exec(out)![1]) as { local_tips: Array<{ text: string }> }
    const texts = body.local_tips.map(t => t.text)
    expect(texts.some(t => t.startsWith('Nên đi biển'))).toBe(true)
    expect(texts.some(t => t.startsWith('Gọi tô đặc biệt'))).toBe(true)
    expect(texts.some(t => /900|Bà Ba/.test(t))).toBe(false)
    expect(out).toContain('nên thử mì Quảng')
  })
  it('every agent step gets the turn\'s full output ceiling (a plan written in a non-final step is not cut at 1500 tokens)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/ai/agent/index.ts', 'utf8')
    expect(src).toContain('      maxTokens: i.maxTokens,')
    expect(src).not.toMatch(/Math\.min\(i\.maxTokens, 1500\)/)
  })
})

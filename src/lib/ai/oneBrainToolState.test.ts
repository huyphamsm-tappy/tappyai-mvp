// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { detectTravelIntent } from './intent'
import { requestedProviderOf } from './tools/commerceIntent'

// P0-3 (29/10 audit): in the one-brain route what the model DID decides which guard family runs — not a keyword reading of the user's words.
// "Tư vấn nồi chiên … dễ vệ sinh. Shopee hay Điện Máy Xanh mua chỗ nào lợi hơn?" reads as a TRAVEL turn (route pattern "tư … vệ"), and a named merchant read from the
// words (the first of two) unmade the other merchant's links. A shopping tool call makes it a shopping turn; a travel tool call makes it a travel turn even with no
// travel word; the keyword reading stays only as the fallback when the model called no domain tool (a fare asked of web_search alone).

interface Run { text: string; logs: Array<Record<string, any>> }
async function run(user: string, frames: string[], o: { oneBrain: boolean; travel?: boolean; placeIntent?: boolean }): Promise<Run> {
  const collector = createEnrichmentCollector(user)
  if (o.oneBrain) collector.oneBrain = true
  const lines: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { lines.push(String(a[0])) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, o.travel ?? false, user, o.placeIntent ?? false)
    const body = await new Response(res.body).text()
    const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    return { text, logs: lines.map(l => { try { return JSON.parse(l) as Record<string, any> } catch { return null } }).filter((x): x is Record<string, any> => !!x) }
  } finally { console.log = orig }
}
const call = (name: string, args: Record<string, unknown>, result: Record<string, unknown>): string[] => [
  '9:' + JSON.stringify({ toolCallId: 't1', toolName: name, args }),
  'a:' + JSON.stringify({ toolCallId: 't1', result }),
]
const done = (reply: string): string[] => ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']

const FRYER_USER = 'Tư vấn nồi chiên không dầu cho gia đình 4 người, dưới 3 triệu, dễ vệ sinh. Shopee hay Điện Máy Xanh mua chỗ nào lợi hơn?'
const FRYER_ROWS = { query: 'x', source: 'Google Shopping (Serper)', search_results: [{ title: 'Nồi chiên không dầu B.COOK 6 lít', link: 'https://www.google.com/search?ibp=oshop&q=1', price: 690000, price_vnd: 690000, source: 'Shopee', rating: 4.9, rating_count: 148, product_id: '1', has_purchase: true }] }
const FRYER_REPLY = 'Mình ưu tiên nồi 5–6 lít.\n\n- **Mẫu đáng cân nhắc:** Nồi chiên không dầu **B.COOK 6 lít** giá **690.000 đồng** trên Shopee.\n- **Mã giảm:** Shopee thường có voucher khoảng **50.000 đồng** cho đơn đầu, nhưng mức này đổi theo ngày.\n\nShopee giao nhanh nội thành, đơn đặt buổi tối sẽ khởi hành lúc 8h sáng hôm sau.'

describe('one brain: the tools the model called decide the turn, the user\'s words only fall back', () => {
  it('precondition: the keyword reading really calls the fryer question a travel turn', () => {
    expect(detectTravelIntent(FRYER_USER)).toBe(true)
  })
  it('a shopping tool was called: a figure about a coupon is a shopping claim, not a "travel fact" — no "đặt chỗ" notice, the sentence stays; the coupon amount no tool carried is LABELLED by the shopping step (30/10), not cut', async () => {
    const on = await run(FRYER_USER, [...call('search_products', { query: 'nồi chiên không dầu 6 lít' }, FRYER_ROWS), ...done(FRYER_REPLY)], { oneBrain: true, travel: true })
    expect(on.text).toContain('voucher khoảng **chưa xác minh** cho đơn đầu') // the sentence stays; only the unbacked figure is replaced (a "khoảng" that the bold markers separate from it stays)
    expect(on.text).not.toContain('50.000')
    expect(on.text).toContain('giá **690.000 đồng**') // a listing price the tool carried stays to the figure
    expect(on.text).toContain('khởi hành lúc 8h sáng hôm sau') // a "departure time" the travel guard would cut: this is a shopping turn
    expect(on.text).not.toContain('trang đặt')
    expect(on.text.match(/chưa xác minh/g)?.length).toBe(1) // the shopping label only; no second, travel-style notice
  })
  it('the same turn without one brain keeps the old reading (labelled/cut by the travel guard)', async () => {
    const off = await run(FRYER_USER, [...call('search_products', { query: 'nồi chiên không dầu 6 lít' }, FRYER_ROWS), ...done(FRYER_REPLY)], { oneBrain: false, travel: true })
    expect(off.text).not.toContain('50.000 đồng')
    expect(off.text).not.toContain('8h sáng hôm sau')
  })
  const NO_WORD = '5/11 HN sang DAD cho 2 người lớn, giá sao?'
  const FLIGHT_REPLY = 'Mình tìm vé cho bạn.\n\nVé bay một chiều khoảng **987.000đ** mỗi người, hãng nào cũng gần như vậy.'
  it('a travel tool was called with no travel word in the question: the travel guard runs (state decides)', async () => {
    expect(detectTravelIntent(NO_WORD)).toBe(false)
    const on = await run(NO_WORD, [...call('get_flight_prices', { origin: 'HAN', destination: 'DAD' }, { results: [] }), ...done(FLIGHT_REPLY)], { oneBrain: true, travel: false })
    expect(on.text).not.toContain('987.000')
    expect(on.text).toContain('chưa xác minh')
  })
  it('the same turn without one brain is not guarded (the keyword reading found nothing)', async () => {
    const off = await run(NO_WORD, [...call('get_flight_prices', { origin: 'HAN', destination: 'DAD' }, { results: [] }), ...done(FLIGHT_REPLY)], { oneBrain: false, travel: false })
    expect(off.text).toContain('987.000')
  })
  it('train / coach / flight asked of web_search alone: the keyword reading is still the fallback, an invented fare is still cut', async () => {
    const user = 've tau sai gon di nha trang ngay 16/11 gia bao nhieu'
    expect(detectTravelIntent(user)).toBe(true)
    const reply = 'Mình đã tra giá vé tàu.\n\nGiường nằm khoang 4 giá **987.000đ** theo một trang.'
    const on = await run(user, [...call('web_search', { query: 'vé tàu sài gòn nha trang' }, { results: [] }), ...done(reply)], { oneBrain: true, travel: true })
    expect(on.text).not.toContain('987.000')
  })
  it('a hotel / transport tool plus a shopping tool in one turn stays a travel turn', async () => {
    const frames = [...call('search_products', { query: 'ốp lưng' }, FRYER_ROWS), ...call('get_transport_options', { origin: 'SGN', destination: 'NHA' }, { results: [] }), ...done('Mình đã tra.\n\nVé tàu khoảng **987.000đ** một người.')]
    const on = await run('ốp lưng và vé từ Sài Gòn đến Nha Trang', frames, { oneBrain: true, travel: true })
    expect(on.text).not.toContain('987.000')
  })
})

describe('one brain: a place keyword no longer switches the place guards on by itself', () => {
  it('no place tool, the question reads as a place turn: the place price stages do not run (no shadow:snippet_price record), unchanged elsewhere', async () => {
    const reply = 'Phở gần đó thường khoảng **50.000đ** một tô.'
    const on = await run('quán phở ngon ở Quận 3', done(reply), { oneBrain: true, placeIntent: false })
    expect(on.logs.some(l => l.guard === 'legacy_stage' && l.stage === 'shadow:snippet_price')).toBe(false)
    // elsewhere the same flag still runs them (the route passes the keyword reading there)
    const off = await run('quán phở ngon ở Quận 3', done(reply), { oneBrain: false, placeIntent: true })
    expect(off.text).not.toContain('50.000đ')
  })
})

describe('one brain: a question that names two merchants does not unmake the product link of the second', () => {
  const SHOPEE = 'https://shopee.vn/Noi-Chien-Khong-Dau-Philips-NA231-i.1392484304.29866176104'
  const LAZADA = 'https://www.lazada.vn/products/noi-chien-khong-dau-philips-na231-i1234567-s7654321.html'
  const rows = { query: 'x', source: 'Google Shopping (Serper)', search_results: [
    { title: 'Nồi chiên Philips NA231 Shopee', link: SHOPEE, price: 2090000, price_vnd: 2090000, source: 'Shopee', rating: 4.8, rating_count: 100, product_id: '1', has_purchase: true },
    { title: 'Nồi chiên Philips NA231 Lazada', link: LAZADA, price: 2150000, price_vnd: 2150000, source: 'Lazada', rating: 4.7, rating_count: 90, product_id: '2', has_purchase: true },
  ] }
  const reply = `Mình chọn **Philips NA231**.\n\n- Trên Shopee: [Philips NA231 – Shopee](${SHOPEE}) giá **2.090.000đ**.\n- Trên Lazada: [Philips NA231 – Lazada](${LAZADA}) giá **2.150.000đ**.`
  it('both links stay in one brain; without it one of them is unmade, as before', async () => {
    const user = 'Mình định mua nồi chiên Philips NA231, Shopee hay Lazada rẻ hơn?'
    const frames = [...call('search_products', { query: 'Philips NA231' }, rows), ...done(reply)]
    const on = await run(user, frames, { oneBrain: true })
    expect(on.text).toContain(`](${SHOPEE})`)
    expect(on.text).toContain(`](${LAZADA})`)
    const off = await run(user, frames, { oneBrain: false })
    expect([off.text.includes(`](${SHOPEE})`), off.text.includes(`](${LAZADA})`)].filter(Boolean)).toHaveLength(1)
  })
})

// the tool layer: the merchant the user named narrows which marketplaces are searched for links; two named merchants must not narrow to the first
describe('commerce links (tool layer): "Shopee hay Lazada" searches every marketplace in one brain, as a request for one merchant narrows it', () => {
  const NOW = new Date('2026-09-14T08:00:00Z')
  const hits = [
    { title: 'iPhone 16 Pro 128GB Chính Hãng VN/A | Shopee Việt Nam', link: 'https://shopee.vn/iPhone-16-Pro-128GB-i.288286284.24185993819' },
    { title: 'iPhone 16 Pro 128GB Chính Hãng (VN/A) - Lazada', link: 'https://www.lazada.vn/products/iphone-16-pro-128gb-i2806208680.html' },
  ]
  const attach = async (userText: string, extra: Record<string, unknown>) => {
    const calls: string[] = []
    const search = async (q: string) => { calls.push(q); return hits.map(h => ({ ...h, snippet: '' })) }
    const row = { title: 'Điện thoại Apple iPhone 16 Pro 128GB', link: 'https://www.dienmayxanh.com/dien-thoai/iphone-16-pro', price_vnd: 25990000, source: 'Điện Máy Xanh' }
    const { attachCommerceLinks } = await import('./tools/commerce')
    await attachCommerceLinks('search_products', { search_results: [row], source: 'Google Shopping (Serper)' }, { enabled: true, now: NOW, search, userTexts: [userText], ...extra } as never)
    return calls
  }
  it('one merchant named: the search is narrowed to it (unchanged); two named: only with the one-brain flag every marketplace is searched', async () => {
    const one = await attach('Mua iPhone 16 Pro trên Shopee giúp mình', {})
    const twoDefault = await attach('Mua iPhone 16 Pro, Shopee hay Lazada rẻ hơn?', {})
    const twoOneBrain = await attach('Mua iPhone 16 Pro, Shopee hay Lazada rẻ hơn?', { unambiguousMerchantOnly: true })
    expect(one.length).toBeLessThan(twoOneBrain.length)
    expect(twoDefault.length).toBeLessThan(twoOneBrain.length)
    expect(twoOneBrain.some(q => q.includes('site:lazada.vn'))).toBe(true)
    expect(twoOneBrain.some(q => q.includes('site:shopee.vn'))).toBe(true)
    const oneWithFlag = await attach('Mua iPhone 16 Pro trên Shopee giúp mình', { unambiguousMerchantOnly: true })
    expect(oneWithFlag).toEqual(one)
  })
})

describe('requestedProviderOf: two merchants named in one turn name none', () => {
  it('default unchanged: the keyword reading picks one', () => {
    expect(requestedProviderOf('Shopee hay Lazada mua chỗ nào lợi hơn?')).not.toBeNull()
  })
  it('unambiguousOnly: a comparison of two merchants is not a request for one; one merchant still is', () => {
    expect(requestedProviderOf('Shopee hay Lazada mua chỗ nào lợi hơn?', { unambiguousOnly: true })).toBeNull()
    expect(requestedProviderOf('mua trên Shopee giúp mình', { unambiguousOnly: true })).toBe('shopee')
    expect(requestedProviderOf(['cho mình xem Lazada', 'hay Shopee cũng được'], { unambiguousOnly: true })).toBe('shopee') // the newest turn names one
    expect(requestedProviderOf(['mua trên Shopee', 'so với Lazada và Shopee thì sao'], { unambiguousOnly: true })).toBeNull() // the newest turn names two
    expect(requestedProviderOf(['mua trên Shopee', 'à thôi, chỉ Lazada'], { unambiguousOnly: true })).toBe('lazada')
    expect(requestedProviderOf('không nhắc sàn nào', { unambiguousOnly: true })).toBeNull()
  })
})

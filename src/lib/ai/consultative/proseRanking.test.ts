// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rankingFromProse } from './proseRanking'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import { parseShoppingMarker, renderShoppingMarker } from './synthesisView'

// 29/10 (25-question run, one brain): the cards were the engine's — the text recommended Philips NA231/00 and the crowned card was another fryer (a 5 L one at
// 499.000đ), the air-purifier answer crowned a FILTER (listing "Xiaomi Smart Air Purifier 4 Compact Filter") while the text recommended the 4 Lite. The titles
// below are the listings of that run; the sentences are the answers'.

const FRYERS = ['Nồi Chiên Không Dầu 5L', 'Nồi chiên không dầu Philips NA231/00 6.2L Cửa sổ kính', 'Nồi chiên không dầu Sunhouse SHD4030 6.5 lít']
const PURIFIERS = ['Xiaomi Smart Air Purifier 4 Compact Filter', 'Máy lọc không khí Xiaomi Mi Air Purifier 4 lite', 'Máy lọc không khí Xiaomi Mi Air Purifier 4', 'Philips Air Purifier 600i Series AC0650/20']
const cand = (xs: string[], prices: Array<number | null> = []) => xs.map((name, i) => ({ name, price: prices[i] ?? null }))
const names = (c: ReturnType<typeof rankingFromProse>) => c?.picks.map(p => p.name)

describe('rankingFromProse: the items the answer names, in the order it names them', () => {
  it('a model code names its listing, whatever else the title carries', () => {
    const c = rankingFromProse('**Mình khuyên Philips NA231/00 6.2 lít mua ở Điện Máy Xanh** nếu ưu tiên dễ vệ sinh.\n\n- **Muốn tiết kiệm:** Sunhouse SHD4030 6,5 lít.', cand(FRYERS))
    expect(names(c)).toEqual(['Nồi chiên không dầu Philips NA231/00 6.2L Cửa sổ kính'])
    expect(c?.none).toBe(false)
    expect(c?.confidence).toBe('medium')
  })
  it('a capacity or size is a variant, not a model code: it never names a listing by itself (30/10: "Pro Max 256GB" crowned "Pro 256GB")', () => {
    const phones = [{ name: 'iPhone 15 Pro 256GB', price: 16700000 }, { name: 'Apple iPhone 15 Pro Max 256GB', price: 18590000 }, { name: 'iPhone 15 Plus 256GB', price: 16090000 }]
    expect(rankingFromProse('Mình chọn **iPhone 15 Pro Max 256GB cũ 99%** vì pin tốt.', phones)).toBeNull()
    for (const [name, p] of [['Máy giặt Samsung 9kg', 'Máy giặt LG 9kg'], ['Tủ lạnh 300L Hitachi', 'Tủ lạnh 300L Toshiba'], ['Laptop 16GB 512GB Dell', 'Laptop 16GB 512GB Asus']]) {
      expect(rankingFromProse(`**${name.split(' ').slice(0, 2).join(' ')} ${name.match(/\d+\s?(kg|L|GB)/)?.[0] ?? ''}**`, [{ name }, { name: p }]), name).toBeNull()
    }
  })
  it('a real model code still names its listing, with or without a capacity beside it', () => {
    const fridges = [{ name: 'Tủ lạnh Hitachi R-FVX510PGV9 510L' }, { name: 'Tủ lạnh Toshiba GR-RF610WE 510L' }]
    expect(names(rankingFromProse('**Hitachi R-FVX510PGV9 510L** là lựa chọn mình nghiêng về.', fridges))).toEqual(['Tủ lạnh Hitachi R-FVX510PGV9 510L'])
  })
  it('the first pick is a model code no single listing matches, a later one matched: not crowned (low confidence)', () => {
    const acs = [{ name: 'Điều Hòa Inverter FTKB25XVMV', price: 7350000 }, { name: 'Máy lạnh Daikin 1.0HP 2025 (FTKB25ZVMV/RKB25ZVMV)' }, { name: 'FTKB25ZVMV Máy lạnh Daikin 1 HP' }]
    const c = rankingFromProse('Êm nhất mình chọn **FTKB25ZVMV**, còn muốn tiết kiệm thì **FTKB25XVMV** giá **7,35 triệu**.', acs)
    expect(c?.confidence).toBe('low')
  })
  it('a renamed product is the listing it overlaps most, not its accessory', () => {
    const c = rankingFromProse('Mình nghiêng về **Xiaomi Smart Air Purifier 4 Lite** cho phòng 20 m².\n\n| Mẫu | Giá |\n|---|---|\n| **Xiaomi Smart Air Purifier 4 Lite** | **2.550.000₫** |\n| **Xiaomi Smart Air Purifier 4** | **3.450.000₫** |', cand(PURIFIERS, [509000, 2550000, 3450000, 2304038]))
    expect(names(c)).toEqual(['Máy lọc không khí Xiaomi Mi Air Purifier 4 lite', 'Máy lọc không khí Xiaomi Mi Air Purifier 4'])
  })
  it('order of naming, not order of the listings; a name written in another order is the same venue', () => {
    const venues = ['Bún Chả Duy Diễm', 'Bún Chả Que Tre Bình Chung', 'Bà Thành - Bún chả & Bún Hải Sản']
    const c = rankingFromProse('- **Bún chả Bà Thành** — số 6.\n- **Bún chả Duy Diễm** — 140 Ngọc Khánh.', cand(venues))
    expect(names(c)).toEqual(['Bà Thành - Bún chả & Bún Hải Sản', 'Bún Chả Duy Diễm'])
  })
  it('a label, a lone common word, a name two listings share equally, and a name in a link or a machine block name nothing', () => {
    expect(rankingFromProse('**Lưu ý:** nên kiểm tra. **Giá** thay đổi. **Nồi chiên** tốt.', cand(FRYERS))).toBeNull()
    expect(rankingFromProse('**Philips Air Purifier**', cand(['Philips Air Purifier AC0650', 'Philips Air Purifier AC1715']))).toBeNull()
    expect(rankingFromProse('Xem thêm. [TAPPY_SHOPPING]{"n":"**Philips NA231/00**"}[/TAPPY_SHOPPING]', cand(FRYERS))).toBeNull()
  })
  it('"**Name:** facts" names the listing (the colon is not part of the name); a bold label that is no listing names nothing', () => {
    expect(names(rankingFromProse('- **Xiaomi Mi Air Purifier 4 lite:** 2.550.000₫, lọc tốt.\n- **Lưu ý khi nhà có trẻ nhỏ:** kiểm tra độ ồn.', cand(PURIFIERS)))).toEqual(['Máy lọc không khí Xiaomi Mi Air Purifier 4 lite'])
  })
  it('a span that shares only some of its words with a listing is not that listing; one word alone is not a name', () => {
    expect(rankingFromProse('**Philips Air Purifier Max Pro** rất êm.', cand(['Máy lọc không khí Xiaomi Mi Air Purifier 4 lite']))).toBeNull()
    expect(rankingFromProse('**Philips** có nhiều dòng.', cand(['Philips Air Purifier 600i Series']))).toBeNull()
  })
  it('nothing bold, or nothing the tools returned: null, so the cards stay as they were', () => {
    expect(rankingFromProse('Mình khuyên Philips NA231/00.', cand(FRYERS))).toBeNull()
    expect(rankingFromProse('**Máy sấy tóc Dyson Supersonic**', cand(FRYERS))).toBeNull()
  })
})

describe('one brain: the shopping card is the answer\'s item, crowned', () => {
  const USER = 'Mình muốn mua máy lọc không khí cho phòng ngủ khoảng 20m², ngân sách dưới 4 triệu, nhà có trẻ nhỏ. Tư vấn giúp 3 mẫu, so sánh và cho link mua.'
  // the card marker of two searches of one turn: the first query found the accessory, the second the model the answer settled on
  const entity = (key: string, name: string, price: number, recommended: boolean) => ({ key, name, config: '', specs: [], condition: null, matchesRequest: 'chua_ro', recommended, priceLow: price, priceHigh: price, image: null, offers: [] })
  const marker = (entities: ReturnType<typeof entity>[]) => renderShoppingMarker({ v: 1, entities, recommendation: null } as never)
  const FIRST = marker([entity('uncertain:0', PURIFIERS[0], 509000, true)])
  const SECOND = marker([entity('uncertain:0', PURIFIERS[1], 2550000, true), entity('uncertain:1', PURIFIERS[2], 3450000, false)])
  const row = (title: string, price: number, id: string) => ({ title, link: 'https://www.google.com/search?ibp=oshop&q=' + id, price, price_vnd: price, source: 'KingHome.vn', rating: 4.6, rating_count: 600, product_id: id, has_purchase: true, has_photo: true })
  const frames = (reply: string) => [
    '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'search_products', args: { query: 'Xiaomi Smart Air Purifier 4 Lite chính hãng giá Việt Nam mua máy lọc không khí' } }),
    'a:' + JSON.stringify({ toolCallId: 't1', result: { query: 'x', source: 'Google Shopping (Serper)', search_results: [row(PURIFIERS[0], 509000, '1'), row(PURIFIERS[1], 2550000, '2'), row(PURIFIERS[2], 3450000, '3')] } }),
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const REPLY = 'Mình nghiêng về **Xiaomi Smart Air Purifier 4 Lite**: giá được ghi nhận là **2.550.000₫**, thấp hơn ngân sách.\n\nNếu cần máy lớn hơn, **Xiaomi Smart Air Purifier 4** giá **3.450.000₫** vẫn vừa ngân sách. Bạn xem độ ồn ở chế độ ngủ trước khi chốt.'
  const settle = async (oneBrain: boolean, reply = REPLY) => {
    const collector = createEnrichmentCollector(USER)
    if (oneBrain) collector.oneBrain = true
    collector.setShoppingMarker(FIRST)
    collector.setShoppingMarker(SECOND)
    const orig = console.log
    console.log = () => {}
    try {
      const res = applyPlaceEnrichmentStreamFilter(new Response(frames(reply).join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER, false)
      const text = (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
      const marker = text.match(/\[TAPPY_SHOPPING\][\s\S]*?\[\/TAPPY_SHOPPING\]/)?.[0]
      return (marker ? parseShoppingMarker(marker).view?.entities ?? [] : []).map(e => `${e.recommended ? '*' : ''}${e.name}`)
    } finally { console.log = orig }
  }
  it('one brain: only the two items the answer names, the first crowned, the accessory not shown', async () => {
    expect(await settle(true)).toEqual(['*Máy lọc không khí Xiaomi Mi Air Purifier 4 lite', 'Máy lọc không khí Xiaomi Mi Air Purifier 4'])
  })
  it('one brain: an answer that names no listing crowns none of them (the engine\'s own pick is not the answer\'s)', async () => {
    const out = await settle(true, 'Mình thấy hai mẫu khá ổn, bạn xem độ ồn ở chế độ ngủ trước khi chốt.')
    expect(out.length).toBeGreaterThan(0)
    expect(out.some(n => n.startsWith('*'))).toBe(false)
  })
  it('one brain: the answer\'s first pick is a model code that cannot be told apart, a later pick matched → nothing is crowned', async () => {
    const out = await settle(true, 'Êm nhất mình chọn **MZ-1000X**, còn muốn tiết kiệm thì **Xiaomi Smart Air Purifier 4 Lite** giá **2.550.000₫**.')
    expect(out.some(n => n.startsWith('*'))).toBe(false)
  })
  it('without one brain the card is the first search\'s, as before (the second search adds nothing)', async () => {
    expect((await settle(false)).join('|')).not.toContain('4 lite')
  })
})

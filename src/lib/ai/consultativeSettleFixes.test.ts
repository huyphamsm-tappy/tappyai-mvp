// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlanItems, destinationKey, addressInDestination, type PlanPlace } from './planItemGuard'
import { noFabricationGate } from './noFabricationGate'
import { groundEntityNames, isAmountPhrase } from './entityNameGuard'
import { suppressUngroundedVenues } from './groundingGate'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'

// CONSULTATIVE_IN_AGENT — four settle-path precision fixes found in the 2026-10-10 UAT. Each block pins BOTH directions: the old behaviour
// (the defect, reproduced with the option off) and the fix (option on), plus the case the fix must NOT loosen.

// ── 1. a plan card holds only places of the plan's destination ─────────────────────────────────────────────────────────────
const HOTEL: PlanPlace & { address: string } = { name: 'Cát Bà Garden Resort', place_id: 'g-1', address: 'Đường 1/4, Cát Bà, Hải Phòng', place_types: ['hotel'] }
const BELGO: PlanPlace & { address: string } = { name: 'BELGO LE NGO CAT - BELGIAN CRAFT BEER & RESTAURANT', place_id: 'g-2', address: '2 Lê Ngô Cát, Xuân Hòa, Hồ Chí Minh 70000, Việt Nam', place_types: ['restaurant'] }
const TICOS: PlanPlace & { address: string } = { name: 'Ticos Coffee Bàu Cát', place_id: 'g-3', address: '145 - 147 Đ. Bàu Cát, Tân Bình, Hồ Chí Minh 700000, Việt Nam', place_types: ['cafe'] }
const SEAFOOD: PlanPlace & { address: string } = { name: 'Quán Hải Sản Cát Bà Xanh', place_id: 'g-4', address: 'Thị trấn Cát Bà, Cát Hải, Hải Phòng', place_types: ['restaurant'] }
const NOADDR: PlanPlace = { name: 'Thác Không Địa Chỉ', place_id: 'g-5', place_types: ['attraction'] }
const planOf = (items: Array<{ category: string; name: string; place_id?: string }>) =>
  `Mình xếp lịch gọn.\n[TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Cát Bà 3 ngày', people: 2, days: [{ label: 'Ngày 1', items: items.map((i, k) => ({ time: `${9 + k}:00`, emoji: '📍', price: 'chưa có giá', ...i })) }] })}[/TAPPY_PLAN]`
const namesIn = (text: string): string[] => {
  const m = text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
  return (JSON.parse(m![1]) as { days: Array<{ items: Array<{ name: string }> }> }).days.flatMap(d => d.items.map(i => i.name))
}

describe('1 · plan card area (planItemGuard)', () => {
  const plan = planOf([{ category: 'hotel', name: HOTEL.name!, place_id: 'g-1' }, { category: 'food', name: BELGO.name!, place_id: 'g-2' }, { category: 'cafe', name: TICOS.name!, place_id: 'g-3' }])

  it('the address helper reads whole words and cannot judge a place with no address', () => {
    expect(destinationKey('Đảo Cát Bà')).toBe('cat ba')
    expect(destinationKey('TP. Hồ Chí Minh')).toBe('ho chi minh')
    expect(destinationKey('ab')).toBe('')
    expect(addressInDestination(HOTEL.address, 'cat ba')).toBe(true)
    expect(addressInDestination(BELGO.address, 'cat ba')).toBe(false) // "Cát" alone is not "Cát Bà"
    expect(addressInDestination(undefined, 'cat ba')).toBe(false)
  })

  it('OLD (no destination): a retrieved Hồ Chí Minh venue passes as a Cát Bà plan stop — the defect', () => {
    const r = guardPlanItems(plan, [HOTEL, BELGO, TICOS])
    expect(namesIn(r.text)).toEqual([HOTEL.name, BELGO.name, TICOS.name])
    expect(r.outOfArea).toBeUndefined()
  })

  it('FIX (destination Cát Bà): out-of-area venues leave the card; with a same-kind in-area place retrieved it stands in, else the stop is dropped', () => {
    const dropped = guardPlanItems(plan, [HOTEL, BELGO, TICOS], { destination: 'Cát Bà' })
    expect(namesIn(dropped.text)).toEqual([HOTEL.name])
    expect(dropped.dropped).toBe(2)
    expect(dropped.outOfArea).toBe(2)
    const replaced = guardPlanItems(plan, [HOTEL, BELGO, TICOS, SEAFOOD], { destination: 'Cát Bà' })
    expect(namesIn(replaced.text)).toContain(SEAFOOD.name)
    expect(namesIn(replaced.text)).not.toContain(BELGO.name)
    expect(namesIn(replaced.text)).not.toContain(TICOS.name)
  })

  it('FIX: a place with no address is left out, not guessed; a place whose address names the destination stays', () => {
    const p = planOf([{ category: 'attraction', name: NOADDR.name!, place_id: 'g-5' }, { category: 'hotel', name: HOTEL.name!, place_id: 'g-1' }])
    expect(namesIn(guardPlanItems(p, [NOADDR, HOTEL]).text)).toEqual([NOADDR.name, HOTEL.name])
    expect(namesIn(guardPlanItems(p, [NOADDR, HOTEL], { destination: 'Cát Bà' }).text)).toEqual([HOTEL.name])
  })

  it('non-venue stops (transport) are untouched by the area filter', () => {
    const p = planOf([{ category: 'transport', name: 'Di chuyển đến Cát Bà' }, { category: 'hotel', name: HOTEL.name!, place_id: 'g-1' }])
    expect(namesIn(guardPlanItems(p, [HOTEL], { destination: 'Cát Bà' }).text)).toEqual(['Di chuyển đến Cát Bà', HOTEL.name])
  })
})

// ── 2. a worked example is not a fact; a real unsourced figure still is ────────────────────────────────────────────────────
const EV = { corpus: [] as string[], userTexts: ['Giải thích giúp mình lãi đơn và lãi kép khác nhau thế nào?'], tools: [] as string[] }
const EXAMPLE = 'Lãi đơn chỉ tính trên vốn gốc ban đầu; lãi kép tính cả lãi đã cộng dồn.\n\nVí dụ gửi 10 triệu với lãi suất 10%/năm:\n- Lãi đơn: mỗi năm nhận 1 triệu tiền lãi; sau 3 năm có 13 triệu.\n- Lãi kép: lãi nhập vào vốn mỗi năm; sau 3 năm có 13,31 triệu.\n\nGửi dài hạn thì lãi kép có lợi hơn.'

describe('2 · no-fabrication gate: worked examples', () => {
  it('OLD: the example\'s own figures are cut and the "chưa xác minh … nên không nêu con số" line is added — the defect', () => {
    const r = noFabricationGate(EXAMPLE, EV, { lang: 'vi' })
    expect(r.removedSentences).toBeGreaterThan(0)
    expect(r.noteAdded).toBe(true)
    expect(r.text).toContain('Mình chưa xác minh được')
  })

  it('FIX (illustrations): the example stays whole and no line is added', () => {
    const r = noFabricationGate(EXAMPLE, EV, { lang: 'vi', illustrations: true })
    expect(r.removedSentences).toBe(0)
    expect(r.noteAdded).toBe(false)
    expect(r.text).toBe(EXAMPLE)
  })

  it('FIX: the exact shape the model wrote in the UAT (bold labels, a list under the lead-in) is kept whole too', () => {
    const real = 'Lãi đơn chỉ tính trên vốn gốc.\n\nVí dụ gửi 10 triệu với lãi suất 10%/năm:\n- **Lãi đơn:** mỗi năm nhận 1 triệu tiền lãi; sau 3 năm có 13 triệu.\n- **Lãi kép:** lãi nhập vào vốn mỗi năm; sau 3 năm có 13,31 triệu.\n\nChọn theo thời gian gửi.'
    expect(noFabricationGate(real, EV, { lang: 'vi' }).removedSentences).toBeGreaterThan(0)
    const r = noFabricationGate(real, EV, { lang: 'vi', illustrations: true })
    expect(r.text).toBe(real)
    expect(r.noteAdded).toBe(false)
  })

  it('NOT loosened: a real price stated without a source is still cut and still noted, with the option on', () => {
    for (const reply of [
      'Vé vào Bà Nà Hills hôm nay là 900.000đ cho người lớn.',
      'Giá phở ở quán này khoảng 50.000đ một tô.',
      'Ví dụ vé Bà Nà Hills hôm nay là 900.000đ cho người lớn.', // "ví dụ" does not launder a current price of a named place
      'Ví dụ giá phở là 50.000đ một tô.', // an illustration that is not a calculation frame
    ]) {
      const r = noFabricationGate(reply, EV, { lang: 'vi', illustrations: true })
      expect(r.removedSentences, reply).toBeGreaterThan(0)
      expect(r.noteAdded, reply).toBe(true)
      expect(r.text, reply).toContain('Mình chưa xác minh được')
    }
  })

  it('NOT loosened: a current rate stated as fact inside a calculation-looking sentence is still judged', () => {
    const r = noFabricationGate('Ví dụ lãi suất tiết kiệm hiện nay là 6,5%/năm ở mọi ngân hàng.', EV, { lang: 'vi', illustrations: true })
    expect(r.removedSentences).toBeGreaterThan(0)
  })
})

// ── 3. the "not found in the sources" label goes on names, not on amounts ──────────────────────────────────────────────────
const NAME_EV = { corpus: ['kết quả tra cứu: giá vàng SJC và vài khách sạn'], userTexts: ['giá vàng hôm nay?'] }
const NAME_TEXT = 'Với **4 triệu cho hai người** thì vừa; vàng đang quanh **3 triệu đồng/lượng** theo nguồn, còn **Galaxy S26 Ultra** thì đắt hơn nhiều.'

describe('3 · entity-name guard: amounts are not names', () => {
  it('the helper: amounts and quantities yes, names no', () => {
    for (const a of ['4 triệu cho hai người', '3 triệu đồng/lượng', '2 ngày 1 đêm', '10 triệu']) expect(isAmountPhrase(a), a).toBe(true)
    for (const n of ['Galaxy S26 Ultra', 'iPhone 18 Pro Max', 'WH-1000XM5']) expect(isAmountPhrase(n), n).toBe(false)
  })

  it('OLD: the amount phrases are labelled "(mình chưa thấy tên này trong nguồn đã tra)" — the defect', () => {
    const r = groundEntityNames(NAME_TEXT, NAME_EV, 'vi')
    expect(r.ungrounded).toEqual(expect.arrayContaining(['4 triệu cho hai người', '3 triệu đồng/lượng']))
  })

  it('FIX (skipAmounts): amounts are left alone; the product name the evidence lacks is STILL labelled', () => {
    const r = groundEntityNames(NAME_TEXT, NAME_EV, 'vi', { skipAmounts: true })
    expect(r.ungrounded).toEqual(['Galaxy S26 Ultra'])
    expect(r.text).toContain('**4 triệu cho hai người**')
    expect(r.text).toContain('**3 triệu đồng/lượng**')
    expect(r.text).toContain('Galaxy S26 Ultra (mình chưa thấy tên này trong nguồn đã tra)')
  })
})

// ── 4. no "the options are on the card below" without a card ───────────────────────────────────────────────────────────────
describe('4 · grounding gate: the "card below" line needs a card', () => {
  const KNOWN = ['Quán Lẩu Thông']
  const TEXT = '**Quán Bịa Đặt** — 5⭐.\n\n**Lưu ý:** gọi trước.'

  it('OLD: with rows retrieved the line points at a card that a text plan never has — the defect', () => {
    expect(suppressUngroundedVenues(TEXT, KNOWN, 'vi', { placeSearch: 'has_results' }).text).toContain('nằm ở thẻ bên dưới')
  })

  it('FIX (noCardLine): the line is not written; with a card (option absent) it is kept', () => {
    const none = suppressUngroundedVenues(TEXT, KNOWN, 'vi', { placeSearch: 'has_results', noCardLine: true })
    expect(none.text).not.toContain('thẻ bên dưới')
    expect(none.text).not.toContain('Quán Bịa Đặt')
    expect(suppressUngroundedVenues(TEXT, KNOWN, 'vi', { placeSearch: 'has_results', cardRenders: true }).text).toContain('nằm ở thẻ bên dưới')
  })

  it('an EMPTY retrieval keeps its own honest not-found line (it points at nothing)', () => {
    expect(suppressUngroundedVenues(TEXT, [], 'vi', { placeSearch: 'empty', noCardLine: true }).text).toContain('chưa tìm thấy địa điểm nào')
  })
})

// ── end to end through the stream filter: the settle path reads the destination off the tool frames ───────────────────────
const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const ASK = 'Lên kế hoạch đi Cát Bà 3 ngày 2 đêm cho 2 người, ngân sách 4 triệu'
const rowOf = (p: PlanPlace & { address?: string }, i: number) => ({ place_id: p.place_id, name: p.name, address: p.address, place_types: p.place_types, rating_value: 4 + i / 10, rating_count: 100 + i, maps_link: `https://www.google.com/maps?q=${encodeURIComponent(p.name!)}` })

async function settle(o: { prose: string; flag: boolean }) {
  const rows = [HOTEL, BELGO, TICOS].map(rowOf)
  const result = { source: 'serper_maps', count: rows.length, results: rows, _tappy_place_domain: 'travel' }
  const collector = createEnrichmentCollector(ASK)
  collector.add(rows as never)
  collector.setPlacesRecommendations(placeRecommendations(result, 'Cát Bà', { name: HOTEL.name!, reasons: [{ attribute: 'rating', evidence: 'rated 4.0' }] }), producerSubject('search_places', 'travel'))
  collector.agentMode = true; collector.semanticRanking = true
  if (o.flag) { collector.planTurn = true; collector.consultative = true }
  const frames = [
    '9:{"toolCallId":"t0","toolName":"get_trip_data","args":{"destination":"Cát Bà","interests":"biển"}}',
    '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"điểm tham quan nổi tiếng Cát Bà","location":"Cát Bà","type":"attraction"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result }), line0(o.prose), END,
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, ASK, true, (async () => ({ perPlace: new Map(), batch: null })) as never, 'Cát Bà')
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('end to end (stream filter): destination read from the tool calls', () => {
  const prose = planOf([{ category: 'hotel', name: HOTEL.name!, place_id: 'g-1' }, { category: 'food', name: BELGO.name!, place_id: 'g-2' }])
  it('flag on, trip-plan turn: the Hồ Chí Minh venue is not on the plan card', async () => {
    const out = await settle({ prose, flag: true })
    expect(namesIn(out)).toContain(HOTEL.name)
    expect(namesIn(out)).not.toContain(BELGO.name)
  })
  it('CONTROL — flag off: the same turn keeps both stops, as before', async () => {
    const out = await settle({ prose, flag: false })
    expect(namesIn(out)).toEqual([HOTEL.name, BELGO.name])
  })
})

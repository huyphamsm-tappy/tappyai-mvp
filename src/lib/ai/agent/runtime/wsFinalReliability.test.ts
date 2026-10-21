// @vitest-environment node
// Phase 8 WS2 FINAL — reliability + no-fabrication closure. Pure / scripted: no network, no model.
import { describe, it, expect } from 'vitest'
import { noFabricationGate, claimsIn, numbersOf, type GateEvidence } from '@/lib/ai/noFabricationGate'
import { claimsDisagree, clockTimes, availabilityPolarity, durationsDays, hedged } from './claimConflict'
import { toolStateOf, withToolState, withProductFallback } from './toolState'
import { EvidenceLedger, candidateClaims } from './evidence'
import { extractPage } from './pageExtract'
import { travelCutNotice, travelCutTopic, guardTravelClaimsInText } from '@/lib/ai/travelGuard'
import { dropBareListMarkers } from '@/lib/ai/citationIntegrity'
import { cannedChitchat } from '@/lib/ai/cannedReply'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'

const ev = (o: Partial<GateEvidence> = {}): GateEvidence => ({ corpus: [], userTexts: [], tools: [], ...o })
const gate = (text: string, o: Partial<GateEvidence> = {}) => noFabricationGate(text, ev(o), { lang: 'vi' })
const states = (text: string, o: Partial<GateEvidence> = {}) => gate(text, o).claims.map(c => `${c.category}:${c.state}`)

describe('WS2 final · No-Fabrication Gate — stays out of the way of ordinary knowledge (not "safe but dumb")', () => {
  it.each([
    'Python là một ngôn ngữ lập trình bậc cao, ra đời năm 1991, dễ đọc và có thư viện phong phú.',
    'Trời có màu xanh vì ánh sáng xanh bị tán xạ trong khí quyển mạnh hơn các màu khác (tán xạ Rayleigh).',
    '1 inch bằng 2,54 cm.',
    'Đau bụng có thể do rối loạn tiêu hoá, ngộ độc thực phẩm hay viêm dạ dày; nếu đau dữ dội, sốt trên 38,5 độ hoặc nôn ra máu thì nên đi khám ngay.',
    'Lãi kép nghĩa là tiền lãi được cộng vào gốc để tiếp tục sinh lãi ở kỳ sau.',
  ])('untouched: %s', t => {
    const r = gate(t)
    expect(r.text).toBe(t)
    expect(r.counts.FABRICATED).toBe(0)
  })
})

describe('WS2 final · No-Fabrication Gate — claim states', () => {
  it('a current price from memory (no evidence) is FABRICATED: removed, and the reply says the price is not verified', () => {
    const r = gate('iPhone 17 Pro Max hiện có giá khoảng 34.990.000đ ở Việt Nam. Máy có camera tốt và pin bền.')
    expect(states('iPhone 17 Pro Max hiện có giá khoảng 34.990.000đ ở Việt Nam.')).toEqual(['price:FABRICATED'])
    expect(r.text).not.toContain('34.990.000')
    expect(r.text).toContain('Máy có camera tốt và pin bền.')
    expect(r.text).toMatch(/chưa xác minh được giá hiện tại/)
  })
  it('FACT: a price, rating, review count, hours and distance the tool results state', () => {
    const corpus = [JSON.stringify({ results: [{ name: 'Tám Riêu', price: 34990000, rating_value: 4.8, rating_count: 1291, opening_hours: '10:30–21:30', distance_km: 1.2 }] })]
    expect(states('Giá 34.990.000đ. Quán đạt 4.8⭐ với 1.291 đánh giá, mở cửa đến 21:30 và cách bạn 1,2 km.', { corpus })).toEqual(['price:FACT', 'hours:FACT', 'rating:FACT', 'review_count:FACT', 'distance:FACT'])
  })
  it('FABRICATED rating / review count / hours / distance that the evidence does not state', () => {
    const corpus = [JSON.stringify({ results: [{ name: 'Tám Riêu', rating_value: 4.6, rating_count: 900, opening_hours: '10:30–21:30', distance_km: 1.2 }] })]
    const r = gate('Quán đạt 4.9⭐.\nCó hơn 5.000 đánh giá.\nQuán mở cửa đến 23:00.\nQuán cách bạn 4 km.', { corpus })
    expect(r.counts.FABRICATED).toBe(4)
    expect(r.text).not.toMatch(/4\.9|5\.000|23:00|4 km/)
  })
  it('the user\'s own numbers are theirs', () => {
    expect(gate('Với ngân sách 20 triệu cho 2 người, mình gợi ý ở gần biển.', { userTexts: ['Đà Nẵng 3 ngày 2 đêm cho 2 người, 20 triệu'] }).counts.FABRICATED).toBe(0)
  })
  it('INFERENCE: the reply\'s own arithmetic over supported or user values (difference, per person, percent of)', () => {
    const corpus = [JSON.stringify({ a: { price: 39990000 }, b: { price: 45990000 } })]
    expect(states('Shop B đắt hơn 6.000.000đ.', { corpus })).toEqual(['price:INFERENCE'])
    expect(states('Mỗi người khoảng 10.000.000đ.', { userTexts: ['ngân sách 20 triệu cho 2 người'] })).toEqual(['price:INFERENCE'])
    expect(states('Sau một năm bạn nhận khoảng 6.000.000đ tiền lãi.', { userTexts: ['gửi 100 triệu, lãi 6%/năm thì được bao nhiêu?'] })).toEqual(['price:INFERENCE'])
  })
  it('INFERENCE: a clearly labelled planning estimate; the same figure as an entity\'s price is not', () => {
    expect(states('Bạn nên dự trù khoảng 300.000đ mỗi người cho bữa tối.')).toEqual(['price:INFERENCE'])
    expect(states('Phở ở quán này khoảng 50.000đ một tô.')).toEqual(['price:FABRICATED'])
  })
  it('UNKNOWN: a figure the sentence itself says is not verified is kept (honest)', () => {
    const r = gate('Giá phòng có thể quanh 1.200.000đ/đêm nhưng mình chưa xác minh được cho ngày bạn đi.')
    expect(r.claims.map(c => c.state)).toEqual(['UNKNOWN'])
    expect(r.text).toContain('1.200.000')
  })
  it('CONFLICT: a value that is one side of a ledger conflict, the other side unsaid → kept with one note naming both', () => {
    const conflicts = [{ attribute: 'gia', sides: [{ value: '39.990.000đ', sourceId: 'S1' }, { value: '45.990.000đ', sourceId: 'S2' }] }]
    const corpus = ['39.990.000đ', '45.990.000đ']
    const one = gate('MacBook Pro M4 16GB giá 39.990.000đ.', { corpus, conflicts })
    expect(one.claims.map(c => c.state)).toEqual(['CONFLICT'])
    expect(one.text).toMatch(/các nguồn ghi khác nhau .*45\.990\.000đ/)
    const both = gate('Shop A báo 39.990.000đ, Shop B báo 45.990.000đ.', { corpus, conflicts })
    expect(both.claims.map(c => c.state)).toEqual(['FACT', 'FACT'])
    expect(both.noteAdded).toBe(false)
  })
  it('one supported claim does not carry an unsupported one in the same sentence', () => {
    const corpus = [JSON.stringify({ price: 39990000 })]
    const r = gate('Shop A giá 39.990.000đ và đang còn hàng.', { corpus })
    expect(r.claims.map(c => `${c.category}:${c.state}`)).toEqual(['price:FACT', 'availability:FABRICATED'])
    expect(r.removedSentences).toBe(1)
  })
  it('questions assert nothing; machine blocks and M4-supported tokens are skipped', () => {
    expect(gate('Bạn muốn tầm 200.000đ hay 300.000đ?').claims).toEqual([])
    expect(gate('[TAPPY_PLAN]{"days":[{"cost":"999.000đ"}]}[/TAPPY_PLAN]').claims).toEqual([])
    expect(gate('\u2063TAPPYEVIDENCEa\u2063 Giá vé 80.000đ').claims.length).toBe(0)
  })
  it('the disclosure line goes BEFORE the machine blocks', () => {
    const r = gate('Giá vàng SJC hôm nay 120.000.000đ/lượng.\n\n[FOLLOWUPS]Xem thêm|Tỷ giá[/FOLLOWUPS]')
    expect(r.text.indexOf('chưa xác minh')).toBeLessThan(r.text.indexOf('[FOLLOWUPS]'))
  })
})

describe('WS2 final · high-risk categories', () => {
  it('HEALTH: a dosage with no checked source is removed and the reply points to the label / a pharmacist; general guidance stays', () => {
    const r = gate('Paracetamol thường giúp hạ sốt. Người lớn uống 500mg mỗi 4–6 giờ. Nếu sốt kéo dài quá 3 ngày, hãy đi khám.')
    expect(r.text).not.toContain('500mg')
    expect(r.text).toContain('Paracetamol thường giúp hạ sốt.')
    expect(r.text).toContain('hãy đi khám')
    expect(r.text).toMatch(/liều dùng cụ thể .*nhãn .*dược sĩ/)
  })
  it('HEALTH: a dose in a sentence that names no drug is still a dosage (measured NF-H2)', () => {
    expect(states('Không vượt quá 4.000 mg trong 24 giờ.')).toEqual(['dosage:FABRICATED'])
  })
  it('HEALTH: a dosage the page read states is kept', () => {
    expect(states('Theo hướng dẫn trên trang, người lớn uống 500 mg mỗi lần.', { corpus: ['Liều dùng: người lớn 500 mg mỗi lần, tối đa 4 g mỗi ngày.'] })).toEqual(['dosage:FACT'])
  })
  it('FINANCE: an exchange rate / gold price / interest rate from memory is FABRICATED; with a tool result it is a FACT', () => {
    expect(states('Tỷ giá USD hôm nay là 25.420 đồng.')).toEqual(['market:FABRICATED'])
    expect(states('Lãi suất tiết kiệm 12 tháng hiện khoảng 4,8%.')).toEqual(['market:FABRICATED'])
    expect(states('Lãi suất tiết kiệm 12 tháng hiện là 4,8%.', { corpus: [JSON.stringify({ rows: [{ term: '12 tháng', rate: '4,8%' }] })] })).toEqual(['market:FACT'])
  })
  it('BUSINESS: a fee / regulation figure from memory is FABRICATED', () => {
    expect(states('Lệ phí đăng ký thành lập công ty TNHH hiện là 100.000 đồng.')).toEqual(['market:FABRICATED'])
  })
  it('COMMERCE / LOCAL: availability and booking status need evidence; "probably open late" in a review is not official hours', () => {
    expect(states('Khách sạn vẫn còn phòng cho tối nay.')).toEqual(['availability:FABRICATED'])
    expect(states('Khách sạn vẫn còn phòng cho tối nay.', { corpus: ['Phòng Deluxe: còn phòng, giá 1.200.000đ'] })).toEqual(['availability:FACT'])
    expect(states('Mình đã đặt bàn thành công cho bạn lúc 19:00.', { corpus: [] })).toContain('booking_status:FABRICATED')
    expect(states('Quán mở cửa đến 2 giờ sáng.', { corpus: ['Review: quán này chắc mở khuya lắm, đông vui.'] })).toEqual(['hours:FABRICATED'])
  })
  it('TRAVEL: breakfast / free cancellation not on the page is FABRICATED; stated on the page it is a FACT', () => {
    const page = 'Phòng Superior hướng phố, giường đôi, 25 m². Giá từ 900.000đ/đêm.'
    expect(states('Phòng Superior đã bao gồm bữa sáng.', { corpus: [page] })).toEqual(['policy:FABRICATED'])
    expect(states('Phòng Superior đã bao gồm bữa sáng.', { corpus: [page + ' Giá đã bao gồm bữa sáng cho 2 người.'] })).toEqual(['policy:FACT'])
    expect(states('Đặt phòng này được hủy miễn phí.', { corpus: [page] })).toEqual(['policy:FABRICATED'])
  })
  it('a price only an OLD page states is not presented as current (unless the sentence dates it)', () => {
    const corpus = ['MacBook Pro M3 giá 39.990.000đ (cập nhật 11/2023)']
    expect(states('MacBook Pro hiện giá 39.990.000đ.', { corpus, stalePrices: [39990000], freshPrices: [] })).toEqual(['price:FABRICATED'])
    expect(states('Bài năm 2023 ghi MacBook Pro M3 giá 39.990.000đ.', { corpus, stalePrices: [39990000], freshPrices: [] })).toEqual(['price:FACT'])
    expect(states('MacBook Pro hiện giá 39.990.000đ.', { corpus, stalePrices: [39990000], freshPrices: [39990000] })).toEqual(['price:FACT'])
  })
  it('claim extraction knows the categories (deterministic, context-aware)', () => {
    expect(claimsIn('Giá vàng SJC 120 triệu/lượng').map(c => c.category)).toEqual(['market'])
    expect(claimsIn('Uống 2 viên thuốc mỗi ngày').map(c => c.category)).toEqual(['dosage'])
    expect(claimsIn('Mình mất 2 giờ để đọc xong cuốn sách').map(c => c.category)).toEqual([])
    expect(numbersOf('1.291 đánh giá · 4,8 · 39.990.000')).toEqual([1291, 4.8, 39990000])
  })
})

describe('WS2 final · tool states: a failure is never evidence', () => {
  it('SUCCESS / EMPTY / TIMEOUT / ERROR / UNAVAILABLE are kept apart', () => {
    expect(toolStateOf('ok', { results: [{ name: 'a' }] })).toBe('SUCCESS')
    expect(toolStateOf('ok', { results: [] })).toBe('EMPTY')
    expect(toolStateOf('ok', { temperature: 30 })).toBe('SUCCESS')
    expect(toolStateOf('timeout', null)).toBe('TIMEOUT')
    expect(toolStateOf('error', null)).toBe('ERROR')
    expect(toolStateOf('ok', { error: 'budget_exhausted' })).toBe('UNAVAILABLE')
    expect(toolStateOf('ok', { error: 'provider_timeout' })).toBe('TIMEOUT')
    expect(toolStateOf('ok', { error: 'upstream 502' })).toBe('ERROR')
    expect(toolStateOf('ok', { place_search_status: 'budget_exhausted', results: [] })).toBe('UNAVAILABLE')
    // Measured: an exhausted Serper account came back as `results: []` and read as EMPTY. A failed provider is an ERROR.
    expect(toolStateOf('ok', { results: [], provider_status: 'error' })).toBe('ERROR')
    expect(toolStateOf('ok', { results: [{ title: 'x' }], provider_status: 'error' })).toBe('SUCCESS')
  })
  it('the model reads the state and, for a failure, that it is not "none / closed / sold out"', () => {
    expect(withToolState({ results: [] }, 'EMPTY', 'vi')).toMatchObject({ tool_state: 'EMPTY', state_note: expect.stringMatching(/không chứng minh là không tồn tại/) })
    expect(withToolState({ error: 'x' }, 'TIMEOUT', 'vi')).toMatchObject({ tool_state: 'TIMEOUT', state_note: expect.stringMatching(/không điền từ trí nhớ/) })
    expect(withToolState({ results: [1] }, 'SUCCESS', 'vi')).toEqual({ results: [1], tool_state: 'SUCCESS' })
  })
})

describe('WS2 final · search_products provider failure → bounded public-web fallback (Bug 4)', () => {
  const ctx = { toolCallId: 't', messages: [] }
  it('provider TIMEOUT → ONE web price search; the result carries both states and the fallback evidence', async () => {
    const calls: unknown[] = []
    const exec = withProductFallback(() => new Promise(() => { /* never answers */ }), async a => { calls.push(a); return { results: [{ title: 'MacBook Pro M4', link: 'https://shop.example/p' }] } }, { lang: 'vi', timeoutMs: 20 })
    const r = await exec({ query: 'MacBook Pro M4 16GB' }, ctx) as Record<string, any>
    expect(r.tool_state).toBe('TIMEOUT')
    expect(r.fallback).toMatchObject({ tool: 'web_search', tool_state: 'SUCCESS' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ queries: ['MacBook Pro M4 16GB giá'], read: 1, kind: 'price' })
  })
  it('provider ERROR and fallback failing → the price is UNKNOWN, said explicitly; never a retry loop', async () => {
    let n = 0
    const exec = withProductFallback(async () => { throw new Error('502') }, async () => { n++; throw new Error('serper down') }, { lang: 'vi', timeoutMs: 50 })
    const r = await exec({ query: 'AirPods Pro 2' }, ctx) as Record<string, any>
    expect(r.tool_state).toBe('ERROR')
    expect(r.fallback.tool_state).toBe('ERROR')
    expect(r.note).toMatch(/CHƯA XÁC MINH/)
    expect(n).toBe(1)
  })
  it('a provider SUCCESS or EMPTY never triggers the fallback (EMPTY is a real "no result")', async () => {
    let n = 0
    const fb = async () => { n++; return {} }
    expect(await withProductFallback(async () => ({ search_results: [{ title: 'x', price: 1 }] }), fb, { lang: 'vi' })({ query: 'x' }, ctx)).toMatchObject({ tool_state: 'SUCCESS' })
    expect(await withProductFallback(async () => ({ search_results: [] }), fb, { lang: 'vi' })({ query: 'x' }, ctx)).toMatchObject({ tool_state: 'EMPTY' })
    expect(n).toBe(0)
  })
  it('a timeout cannot become a price: Luna\'s remembered price after a failed lookup is removed by the gate', () => {
    const corpus = [JSON.stringify({ tool_state: 'TIMEOUT', provider: 'search_products', fallback: { tool: 'web_search', tool_state: 'ERROR' } })]
    const r = gate('MacBook Pro M4 16GB hiện có giá khoảng 39.990.000đ.', { corpus, tools: ['search_products'] })
    expect(r.counts.FABRICATED).toBe(1)
    expect(r.text).not.toContain('39.990.000')
  })
})

describe('WS2 final · text-vs-text conflicts (Bug 3)', () => {
  it('hours: 22:00 vs 23:00 conflict; equivalent forms do not; a hedged claim never does', () => {
    expect(claimsDisagree('hours', { value: '', quote: 'Mở cửa đến 22:00' }, { value: '', quote: 'Open until 23:00' })).toBe(true)
    expect(claimsDisagree('hours', { value: '', quote: 'Mở cửa 10h-22h' }, { value: '', quote: 'Giờ mở cửa: 10:00 – 22:00' })).toBe(false)
    expect(claimsDisagree('hours', { value: '', quote: 'Mở đến 10 giờ tối' }, { value: '', quote: 'đóng cửa lúc 22:00' })).toBe(false)
    expect(claimsDisagree('hours', { value: '', quote: 'Thường mở đến khoảng 22h' }, { value: '', quote: 'Mở đến 23:00' })).toBe(false)
  })
  it('availability: in stock vs out of stock / open vs closed conflict; same polarity does not', () => {
    expect(claimsDisagree('availability', { value: 'còn hàng' }, { value: 'Hết hàng' })).toBe(true)
    expect(claimsDisagree('availability', { value: 'InStock' }, { value: 'còn hàng tại cửa hàng' })).toBe(false)
    expect(claimsDisagree('availability', { value: 'đang mở cửa' }, { value: 'đã đóng cửa vĩnh viễn' })).toBe(true)
    expect(availabilityPolarity('Tạm hết hàng')).toBe('negative')
  })
  it('warranty / policy: "1 năm" = "12 tháng"; 12 vs 24 months conflict; refund vs no refund conflict', () => {
    expect(claimsDisagree('policy', { value: '', quote: 'Bảo hành 12 tháng' }, { value: '', quote: 'Bảo hành chính hãng 1 năm' })).toBe(false)
    expect(claimsDisagree('policy', { value: '', quote: 'Bảo hành 12 tháng' }, { value: '', quote: 'Bảo hành 24 tháng' })).toBe(true)
    expect(claimsDisagree('policy', { value: '', quote: 'Được hoàn tiền nếu hủy trước 24h' }, { value: '', quote: 'Không hoàn tiền khi hủy' })).toBe(true)
    expect(durationsDays('1 năm, 6 tháng, 2 tuần')).toEqual([365, 180, 14])
  })
  it('specs / health / finance numbers: same unit > 10 % apart conflict; different units never', () => {
    expect(claimsDisagree('spec', { value: '6 giờ' }, { value: '4 giờ' })).toBe(true)
    expect(claimsDisagree('spec', { value: '6 giờ' }, { value: '6 hours' })).toBe(false)
    expect(claimsDisagree('other', { value: '500 mg' }, { value: '1000 mg' })).toBe(true)
    expect(claimsDisagree('other', { value: '4,8%' }, { value: '6,2%' })).toBe(true)
    expect(claimsDisagree('other', { value: '4,8%' }, { value: '4,8 %' })).toBe(false)
  })
  it('travel schedules: departures 22:00 vs 23:30 conflict', () => {
    expect(claimsDisagree('hours', { value: '', quote: 'Xe khởi hành 22:00' }, { value: '', quote: 'Chuyến khởi hành lúc 23:30' })).toBe(true)
  })
  it('subjective / text-only claims never conflict (no forced conflicts from wording)', () => {
    expect(claimsDisagree('experience', { value: 'rất ngon' }, { value: 'không ngon lắm' })).toBe(false)
    expect(claimsDisagree('other', { value: 'Quán nằm trên đường Lê Lợi, gần chợ' }, { value: 'Địa chỉ: Lê Lợi, Quận 1' })).toBe(false)
    expect(hedged('Máy zin 100%')).toBe(false)
    expect(hedged('Có thể mở đến 23h')).toBe(true)
    expect(clockTimes('mở 10h30 đến 22h')).toEqual([630, 1320])
  })
  it('the ledger: two pages disagreeing on hours → CONFLICT; agreeing in different wording → none', () => {
    const page = (host: string, p: string) => extractPage(`<html><head><title>Quán X</title></head><body><main><p>${p}</p><p>${'Quán phục vụ món Việt, có chỗ đậu xe máy. '.repeat(8)}</p></main></body></html>`, { url: `https://${host}/x`, contentType: 'text/html' })
    const run = (a: string, b: string) => {
      const L = new EvidenceLedger()
      const d1 = page('quan-x.example', a), d2 = page('review.example', b)
      L.addClaims(L.addSource(d1, '2026-10-08T10:00:00Z', 'vi'), candidateClaims(d1, 'giờ mở cửa', 'hours'), d1.passages.join('\n'))
      return L.addClaims(L.addSource(d2, '2026-10-08T10:00:00Z', 'vi'), candidateClaims(d2, 'giờ mở cửa', 'hours'), d2.passages.join('\n')).conflicts.length
    }
    expect(run('Giờ mở cửa: 10:00 – 22:00 hằng ngày.', 'Giờ mở cửa: 10:00 – 23:00 mỗi ngày.')).toBe(1)
    expect(run('Giờ mở cửa: 10:00 – 22:00 hằng ngày.', 'Giờ mở cửa từ 10h đến 22h mỗi ngày.')).toBe(0)
  })
})

describe('WS2 final · travel guard wording follows what was cut (Bug 1)', () => {
  it('topic: hotel / transport / mixed', () => {
    expect(travelCutTopic(['Khách sạn Mường Thanh khoảng 1.200.000đ/đêm.'])).toBe('lodging')
    expect(travelCutTopic(['Vé máy bay Vietjet khoảng 1.500.000đ.'])).toBe('transport')
    expect(travelCutTopic(['Tàu SE1 khởi hành 19:00.'])).toBe('transport')
    expect(travelCutTopic(['Xe khách giường nằm 300.000đ, ở khách sạn 500.000đ/đêm.'])).toBe('mixed')
  })
  it('hotel-only turn: the notice is about room prices, never "giờ chạy và giá vé"', () => {
    const out = guardTravelClaimsInText('Khách sạn Novotel gần biển. Phòng đôi khoảng 2.400.000đ/đêm.', [], 'khách sạn đà nẵng cuối tuần', { lang: 'vi' })
    expect(out.text).not.toContain('2.400.000')
    expect(out.text).not.toMatch(/giờ chạy|giá vé/i)
    expect(out.text).toMatch(/Giá phòng theo ngày mình chưa xác nhận được/)
  })
  it('flight / train / bus: fares and times', () => {
    expect(guardTravelClaimsInText('Vé máy bay HCM – Đà Nẵng khoảng 1.500.000đ.', [], 'vé máy bay', { lang: 'vi' }).text).toMatch(/Giá vé cụ thể mình chưa xác nhận được/)
    expect(guardTravelClaimsInText('Tàu SE1 chạy tuyến Bắc – Nam, có toa giường nằm. Tàu SE1 khởi hành 19:00, vé 900.000đ.', [], 'tàu sài gòn đà nẵng', { lang: 'vi' }).text).toMatch(/Giờ chạy và giá vé cụ thể mình chưa xác nhận được/)
    expect(guardTravelClaimsInText('Xe Phương Trang có xe giường nằm đi Đà Lạt. Xe Phương Trang khởi hành 22:00.', [], 'xe khách', { lang: 'vi' }).text).toMatch(/Giờ chạy và tình trạng chỗ cụ thể/)
  })
  it('mixed itinerary: one neutral notice', () => {
    expect(guardTravelClaimsInText('Bay Vietjet khoảng 1.500.000đ, khách sạn khoảng 800.000đ/đêm.', [], 'đà nẵng 3 ngày', { lang: 'vi' }).text).toMatch(/Giá, giờ và tình trạng chỗ cụ thể/)
  })
  it('follow-up where Luna already said it is unverified: no second, code-written notice', () => {
    const out = guardTravelClaimsInText('Phòng đôi khoảng 2.400.000đ/đêm. Giá phòng theo ngày bạn đi mình chưa xác minh được.', [], 'giá phòng tối thứ 7', { lang: 'vi' })
    expect(out.text).not.toContain('2.400.000')
    expect(out.text.match(/chưa (xác minh|xác nhận)/g)).toHaveLength(1)
  })
  it('notice helper: disclosure detection is topic-aware', () => {
    expect(travelCutNotice({ topic: 'lodging', money: true, schedule: false, lang: 'vi', remaining: 'Giờ chạy tàu mình chưa xác nhận.' })).toMatch(/Giá phòng/)
    expect(travelCutNotice({ topic: 'lodging', money: true, schedule: false, lang: 'vi', remaining: 'Giá phòng mình chưa xác minh được.' })).toBeNull()
  })
})

describe('WS2 final · bare list numbers (Bug 2)', () => {
  it('a lone "2." left by a guard goes; valid numbered and bulleted lists stay', () => {
    expect(dropBareListMarkers('1. **Mỹ Khê 2** — gần biển.\n2.\n3. **Bella Merry** — tiện đi biển.').text).toBe('1. **Mỹ Khê 2** — gần biển.\n3. **Bella Merry** — tiện đi biển.')
    const list = '1. Đặt vé sớm\n2. Mang áo mưa\n- Lưu ý: giữ vé\n* Đi bộ phố cổ'
    expect(dropBareListMarkers(list)).toEqual({ text: list, removed: 0 })
    expect(dropBareListMarkers('Các bước:\n1.\n2. Mở app\n-\n3. Đặt').text).toBe('Các bước:\n2. Mở app\n3. Đặt')
  })
  it('citations, numbers inside sentences and machine blocks are untouched', () => {
    const t = 'Giá 39.990.000đ ([shop.vn](https://shop.vn/a)).\n2. Còn hàng tại 3 chi nhánh.\n[TAPPY_PLAN]\n{"days":[\n1.\n]}\n[/TAPPY_PLAN]'
    expect(dropBareListMarkers(t).text).toBe(t)
  })
  it('multi-paragraph answer: only the orphan line goes', () => {
    expect(dropBareListMarkers('Đây là lựa chọn.\n\n2.\n\nBạn muốn xem thêm không?').text).toBe('Đây là lựa chọn.\n\nBạn muốn xem thêm không?')
  })
})

describe('WS2 final · chitchat shortcut boundary', () => {
  it.each(['chào bạn', 'hello', 'cảm ơn', 'ok nha', 'bye bye'])('canned: %s', t => expect(cannedChitchat(t, 'vi')).not.toBeNull())
  it.each([
    'chào bạn, giá vàng hôm nay bao nhiêu?',
    'cảm ơn, còn tỷ giá USD thì sao?',
    'ok, tìm giúp quán phở gần đây',
    'hi, paracetamol uống mấy viên?',
    'chào, khách sạn Novotel còn phòng không',
    'thanks, what is the weather tomorrow?',
  ])('NOT canned (real request): %s', t => expect(cannedChitchat(t, 'vi')).toBeNull())
  it('the canned copy carries no figure, no fact, no link', () => {
    for (const t of ['chào bạn', 'cảm ơn', 'ok', 'bye']) expect(cannedChitchat(t, 'vi') ?? '').not.toMatch(/\d{2,}|https?:|\d\s?(?:đ|vnd)|%/i)
  })
})

describe('WS2 final · the gate on the real settle path (TAPPY_AGENT=2 only)', () => {
  async function settle(reply: string, runtimeV2: boolean, frames: string[] = []): Promise<string> {
    const c = createEnrichmentCollector('iPhone 17 Pro Max hiện giá bao nhiêu?', [])
    c.agentMode = true
    if (runtimeV2) c.semanticRanking = true
    const lines = [...frames, `0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
    const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c).body).text()
    return raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  }
  const REPLY = 'iPhone 17 Pro Max hiện có giá khoảng 34.990.000đ. Máy có màn hình lớn và pin tốt.'
  it('a remembered current price (no tool, no evidence) never reaches the user on TAPPY_AGENT=2', async () => {
    const out = await settle(REPLY, true)
    expect(out).not.toContain('34.990.000')
    expect(out).toMatch(/chưa xác minh được giá hiện tại/)
    expect(out).toContain('Máy có màn hình lớn và pin tốt.')
  })
  it('the same price stated by a tool result this turn passes', async () => {
    const out = await settle(REPLY, true, [`9:${JSON.stringify({ toolCallId: 'w', toolName: 'web_search', args: { queries: ['iphone 17 pro max giá'] } })}`, `a:${JSON.stringify({ toolCallId: 'w', result: { results: [{ title: 'iPhone 17 Pro Max', snippet: 'Giá 34.990.000đ', link: 'https://shop.example/ip17' }] } })}`])
    expect(out).toContain('34.990.000')
  })
  it('contrast — the Phase 7 agent path is unchanged (no gate)', async () => {
    expect(await settle(REPLY, false)).toContain('34.990.000')
  })
})

describe('WS2 final · measured in the No-Fabrication eval (NF-H2 / NF-M1 / NF-F3)', () => {
  it('a dosage RANGE is two claims ("500–1.000 mg" is not "1 mg")', () => {
    expect(claimsIn('Người lớn thường dùng 500–1.000 mg paracetamol mỗi lần.').find(c => c.category === 'dosage')?.nums).toEqual([500, 1000])
    const r = gate('Người lớn thường dùng **500–1.000 mg paracetamol mỗi lần**, cách nhau ít nhất 4–6 giờ.', { corpus: ['{"n":1}'] })
    expect(r.text).not.toContain('1.000 mg')
  })
  it('"hơn 3.000 lượt đánh giá" is a bound: supported by an actual 3.041; a bare wrong count is not', () => {
    const corpus = [JSON.stringify({ results: [{ name: 'Phở Phú Vương', rating_count: 3041 }] })]
    expect(states('Phở Phú Vương có hơn 3.000 lượt đánh giá.', { corpus })).toEqual(['review_count:FACT'])
    expect(states('Phở Phú Vương có khoảng 3.000 lượt đánh giá.', { corpus })).toEqual(['review_count:FACT'])
    expect(states('Phở Phú Vương có 3.000 lượt đánh giá.', { corpus })).toEqual(['review_count:FABRICATED'])
    expect(states('Phở Phú Vương có hơn 5.000 lượt đánh giá.', { corpus })).toEqual(['review_count:FABRICATED'])
  })
  it('"lãi suất 5,5%" is not a cinema ticket turn; "có suất 19h" still is', async () => {
    const { mentionsTickets } = await import('@/lib/ai/placeClaimGuard')
    expect(mentionsTickets('Gửi tiết kiệm 200 triệu, lãi suất 5,5%/năm thì sau 1 năm được bao nhiêu tiền lãi?')).toBe(false)
    expect(mentionsTickets('Máy lạnh công suất 9000 BTU')).toBe(false)
    expect(mentionsTickets('Tối nay CGV còn suất 19h không?')).toBe(true)
    expect(mentionsTickets('có suất 21h không')).toBe(true)
  })
})

describe('WS2 final · bare list markers on the real settle path (agent turns)', () => {
  it('a list item a guard left empty does not reach the user', async () => {
    const c = createEnrichmentCollector('Khách sạn gần biển Mỹ Khê', [])
    c.agentMode = true; c.semanticRanking = true
    const reply = 'Các khách sạn đáng cân nhắc:\n\n1. **Mỹ Khê 2** — ở ngay Võ Nguyên Giáp, đi bộ ra biển.\n2.\n3. **Bella Merry** — ở đường Hà Bổng, tiện đi biển.'
    const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(`0:${JSON.stringify(reply)}\nd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}\n`), 'vi', c).body).text()
    const out = raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(out).not.toMatch(/(^|\n)\s*2\.\s*(\n|$)/)
    expect(out).toContain('1. **Mỹ Khê 2**')
    expect(out).toContain('3. **Bella Merry**')
  })
})

describe('WS2 final · precision fixes found by the full eval (WS-A1 / WS-L2)', () => {
  it('the user\'s budget inside an honest "cannot tell" sentence is not cut by the travel guard', () => {
    const t = 'Các khách sạn mình tìm được chưa có giá xác nhận cho tối thứ Bảy; dữ liệu hiện tại không đủ để biết chỗ nào nằm trong tầm 1 triệu. Hanami Hotel gần biển.'
    expect(guardTravelClaimsInText(t, [], 'Khách sạn gần biển Đà Nẵng cho 2 người tối thứ 7 này, tầm 1 triệu', { lang: 'vi' }).text).toContain('tầm 1 triệu')
    // A real price claim echoing the user's figure is still judged.
    expect(guardTravelClaimsInText('Phòng ở đây có giá 1 triệu/đêm.', [], 'khách sạn tầm 1 triệu', { lang: 'vi' }).text).not.toContain('1 triệu/đêm')
  })
  it('advice to check ahead ("gọi hỏi trước về độ yên tĩnh") is not an atmosphere claim on TAPPY_AGENT=2; a real claim still is', async () => {
    const { guardAtmosphereClaims } = await import('@/lib/ai/consultative/reviewAttributes')
    const advice = 'Bạn thử ưu tiên quán có khu vực làm việc riêng và gọi hỏi trước về độ yên tĩnh, ổ cắm, Wi-Fi.'
    expect(guardAtmosphereClaims(advice, { attrs: new Map(), names: [], gapAttributes: ['quiet'], agentHedges: true }).text).toContain('gọi hỏi trước về độ yên tĩnh')
    const claim = 'Thử **The Workshop Coffee**. Quán rất yên tĩnh, hợp ngồi làm việc lâu.'
    expect(guardAtmosphereClaims(claim, { attrs: new Map(), names: ['The Workshop Coffee'], gapAttributes: ['quiet'], agentHedges: true }).removed).toBeGreaterThan(0)
  })
})

describe('WS2 final · a failed search provider is ERROR end to end (measured: exhausted Serper credits read as "no results")', () => {
  it('webSearch marks a provider failure and does not cache it; a genuine zero-result answer stays EMPTY', async () => {
    const { webSearch } = await import('@/lib/ai/tools/common')
    const realFetch = globalThis.fetch
    const prevKey = process.env.SERPER_API_KEY
    process.env.SERPER_API_KEY = 'test-key'
    let serperStatus = 400
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('serper.dev')) return new Response(serperStatus === 200 ? JSON.stringify({ organic: [] }) : '{"message":"Not enough credits"}', { status: serperStatus })
      return new Response('', { status: 200 }) // the HTML fallback finds nothing
    }) as typeof fetch
    try {
      const failed = await webSearch(`ws2-final-probe-${Date.now()}`, 'vi') as Record<string, unknown>
      expect(failed.provider_status).toBe('error')
      expect(toolStateOf('ok', failed)).toBe('ERROR')
      serperStatus = 200
      const empty = await webSearch(`ws2-final-probe-empty-${Date.now()}`, 'vi') as Record<string, unknown>
      expect(empty.provider_status).toBeUndefined()
      expect(toolStateOf('ok', empty)).toBe('EMPTY')
    } finally {
      globalThis.fetch = realFetch
      if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
    }
  })
})

import { describe, it, expect } from 'vitest'
import { deriveDecisionFrame, qualifiesFor, missingFor, evidenceGap, evidenceSummary, buildDecisionFrameBlock } from './decisionFrame'
import { deriveNeedProfile } from './needProfile'
import { rankCandidates } from './rank'
import { shortlistCandidates } from './shortlist'
import { normalizePlaces, normalizeHotels, normalizeShopping } from './candidate'
import { detectPlanningIntent, detectForcedTool } from '../intent'
import { guardClarifications } from '../clarificationGuard'
import { suppressUngroundedVenues, isGrounded, normalizeHeading } from '../groundingGate'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'
import { createEnrichmentCollector } from '../toolResultSplit'

// ─────────────────────────────────────────────────────────────────────────────
// FIVE DOMAINS, ONE CORE. Every case runs the route's own sequence on rows
// shaped exactly as the providers emit them (Google Places / Serper /maps /
// Booking snippets / Shopping rows), because production credentials are not
// available in this environment — the OpenStreetMap fallback is the only live
// path here, and it carries none of the evidence a recommendation needs.
//
//   conversation → need → frame → tool rows → ranked → qualified shortlist →
//   evidence gap → clarification policy → what the model is told
// ─────────────────────────────────────────────────────────────────────────────

const NOON = new Date('2026-09-15T05:30:00Z') // 12:30 Asia/Ho_Chi_Minh

function frameFor(turns: string[], opts: { gps?: boolean; prefs?: { cuisine_likes?: string[] }; now?: Date } = {}) {
  const messages = turns.map(content => ({ role: 'user', content }))
  const gps = opts.gps ? { lat: 10.77, lng: 106.7 } : null
  const need = deriveNeedProfile(messages, { storedPreferences: opts.prefs ?? null, gps })
  const last = turns[turns.length - 1]
  const frame = deriveDecisionFrame({ messages, need, planningIntent: detectPlanningIntent(last), forcedTool: detectForcedTool(last), hasGps: !!gps, storedPreferences: opts.prefs ?? null, now: opts.now ?? NOON })
  return { frame, need }
}

/** Google Places row as `searchPlaces` emits it. */
const google = (name: string, o: { rating?: number; count?: number; open_now?: boolean; hours?: string; low?: number; high?: number; km?: number; cuisine?: string } = {}) => ({
  name, address: 'Quận 1, TP HCM', maps_link: `https://maps.google.com/?cid=${encodeURIComponent(name)}`, place_id: `ChIJ${name}`,
  ...(o.rating !== undefined ? { google_rating: `${o.rating}⭐ (${o.count ?? 0} đánh giá)`, rating_value: o.rating, rating_count: o.count ?? 0 } : {}),
  ...(o.open_now !== undefined ? { open_now: o.open_now } : {}),
  ...(o.hours ? { opening_hours: o.hours } : {}),
  ...(o.high !== undefined ? { price_range: { low: o.low ?? 0, high: o.high, currency: 'VND' } } : {}),
  ...(o.km !== undefined ? { distance_km: o.km } : {}),
  ...(o.cuisine ? { cuisine: o.cuisine } : {}),
})
/** Serper /maps row: the band is a verbatim string. */
const serper = (name: string, rating: number, count: number, band: string, open_now?: boolean) => ({
  name, address: 'Quận 1, TP HCM', maps_link: `https://maps.google.com/?cid=1${count}`, google_rating: `${rating}⭐ (${count} đánh giá)`, rating_value: rating, rating_count: count, price_range_text: band,
  ...(open_now !== undefined ? { open_now } : {}),
})
const osm = (name: string, extra: Record<string, unknown> = {}) => ({ name, maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}`, lat: 10.77, lng: 106.7, ...extra })

function placesRun(rows: Array<Record<string, unknown>>, turns: string[], source = 'Google Maps', opts: Parameters<typeof frameFor>[1] = {}) {
  const { frame, need } = frameFor(turns, opts)
  const ranked = rankCandidates(normalizePlaces({ results: rows }), need)
  const shortlist = shortlistCandidates(ranked.ranked, 3, e => qualifiesFor(frame, e))
  const gap = evidenceGap(frame, ranked.ranked, !/openstreetmap/i.test(source))
  const policy = gap.action === 'search_again' ? 'allow' : 'no_reflex'
  return { frame, need, ranked, shortlist, gap, policy, names: shortlist.selected.map(s => s.entry.candidate.name) }
}

describe('FOOD', () => {
  const TURNS = ['trưa nay ăn gì cho ngon', 'quận 1']

  it('goal → criteria → evidence needed → qualification → recommendation, on Google-shaped rows', () => {
    const rows = [
      google('Cơm Tấm Ba Ghiền', { rating: 4.6, count: 1800, open_now: true, hours: '07:00–21:00' }),
      google('Bún Chả Hà Nội', { rating: 4.3, count: 220, open_now: false, hours: '17:00–22:00' }),
      google('Quán Không Tên', {}),
      google('Phở Lệ', { rating: 4.5, count: 900, open_now: true }),
    ]
    const r = placesRun(rows, TURNS)
    expect(r.frame.goal).toBe('recommend')
    expect(r.frame.occasion.meal).toBe('lunch')
    expect(r.frame.criteria.map(c => c.key)).toEqual(['quality', 'openNow'])
    expect(r.need.priorities.map(p => p.key)).toEqual(expect.arrayContaining(['rating', 'openNow']))
    expect(r.gap.action).toBe('recommend')
    // The nameless-evidence row never takes a slot; the closed-for-lunch row ranks last of the three.
    expect(r.names).toEqual(['Cơm Tấm Ba Ghiền', 'Phở Lệ', 'Bún Chả Hà Nội'])
    expect(r.names).not.toContain('Quán Không Tên')
    const top = r.shortlist.selected[0].entry
    expect(evidenceSummary(top.candidate.attrs)).toMatchObject({ rating: 4.6, reviews: 1800, open_now: true, opening_hours: '07:00–21:00' })
    expect(top.reasons.map(x => x.key)).toEqual(expect.arrayContaining(['rating', 'reviewCount', 'openNow']))
    expect(missingFor(r.frame, top)).toEqual([])
    expect(r.policy).toBe('no_reflex')
  })

  it('a lunch request prefers the place that is OPEN when rating is level', () => {
    const rows = [google('A', { rating: 4.5, count: 500, open_now: false }), google('B', { rating: 4.5, count: 500, open_now: true })]
    expect(placesRun(rows, TURNS).names).toEqual(['B', 'A'])
  })

  it('the same rows without any time-bound wording: open_now is recorded, not scored', () => {
    const rows = [google('A', { rating: 4.5, count: 500, open_now: false }), google('B', { rating: 4.5, count: 500, open_now: true })]
    const r = placesRun(rows, ['quán ăn ngon ở quận 1'])
    expect(r.ranked.ranked[0].reasons.some(x => x.key === 'openNow')).toBe(false)
  })

  it('missing evidence is recorded, never invented: a row with no open_now gets no open reason', () => {
    const rows = [google('A', { rating: 4.5, count: 500 })]
    const { frame, need } = frameFor(TURNS)
    const ranked = rankCandidates(normalizePlaces({ results: rows }), need)
    expect(ranked.ranked[0].reasons.map(x => x.key)).not.toContain('openNow')
    expect(ranked.ranked[0].missing).toContain('openNow')
    expect(missingFor(frame, ranked.ranked[0])).toEqual(['openingHours'])
  })

  it('OSM fallback: nothing qualifies, action is insufficient, and the reflex question is not allowed', () => {
    const r = placesRun([osm('Nhà Hàng Jaspas', { wifi: true }), osm('Nhà Hàng Au Tresor')], TURNS, 'OpenStreetMap')
    expect(r.names).toEqual([])
    expect(r.gap.action).toBe('insufficient')
    expect(r.policy).toBe('no_reflex')
  })

  it('a stored cuisine preference is a criterion and a counted reason — a low-weight prior, not a veto over a much better-rated place', () => {
    // The need profile maps a stored like onto its cuisine TYPE lexicon ("pizza" → italian).
    const rows = [google('Pizza 4P', { rating: 4.4, count: 300, cuisine: 'italian' }), google('Phở Lệ', { rating: 4.7, count: 5000, cuisine: 'vietnamese' })]
    const r = placesRun(rows, ['ăn gì ở quận 1 giờ'], 'Google Maps', { prefs: { cuisine_likes: ['pizza'] } })
    expect(r.frame.criteria).toContainEqual({ key: 'cuisine', source: 'preference' })
    expect(r.names).toEqual(expect.arrayContaining(['Pizza 4P', 'Phở Lệ']))
    const pizza = r.shortlist.selected.find(s => s.entry.candidate.name === 'Pizza 4P')!.entry
    expect(pizza.reasons.some(x => x.key === 'cuisine:italian' && x.contribution > 0)).toBe(true)
    // With level ratings the preference decides.
    const level = placesRun([google('Pizza 4P', { rating: 4.5, count: 500, cuisine: 'italian' }), google('Phở Lệ', { rating: 4.5, count: 500, cuisine: 'vietnamese' })], ['ăn gì ở quận 1 giờ'], 'Google Maps', { prefs: { cuisine_likes: ['pizza'] } })
    expect(level.names[0]).toBe('Pizza 4P')
  })
})

describe('SHOPPING', () => {
  const rows = [
    { title: 'Laptop Dell Inspiron 15 i5', price: 15_990_000, source: 'Shopee', link: 'https://shopee.vn/a', rating: 4.8 },
    { title: 'Laptop HP 14 i3', price: 11_490_000, source: 'Tiki', link: 'https://tiki.vn/b', rating: 4.5 },
    { title: 'Laptop Asus Vivobook i5', price: 22_900_000, source: 'Lazada', link: 'https://lazada.vn/c', rating: 4.6 },
  ]
  it('budget request: frame is shopping + price, the ranker filters on REAL prices, over-budget is out', () => {
    const { frame, need } = frameFor(['mua laptop dưới 20 triệu để code'])
    expect(frame.domains).toEqual(['shopping'])
    expect(frame.placeDecision).toBe(false)
    expect(frame.clarify).toBeNull()
    expect(need.budget?.max).toBe(20_000_000)
    const ranked = rankCandidates(normalizeShopping({ shopping_results: rows }), need)
    expect(ranked.filtered.map(f => f.candidate.name)).toEqual(['Laptop Asus Vivobook i5'])
    expect(ranked.ranked.map(e => e.candidate.name)).toHaveLength(2)
    expect(ranked.ranked.every(e => e.reasons.some(r => r.key === 'price'))).toBe(true)
  })

  it('no subject: one question — what — and nothing is searched for', () => {
    const { frame, need } = frameFor(['mua gì làm quà sinh nhật cho bạn gái'])
    expect(frame.clarify).toEqual({ about: 'subject' })
    expect(buildDecisionFrameBlock(frame, need)).toContain('KHONG tim kiem truoc khi biet')
  })

  it('comparison request is a compare goal', () => {
    expect(frameFor(['so sánh Dell Inspiron 15 với HP 14, cái nào tốt hơn']).frame.goal).toBe('compare')
  })
})

describe('ENTERTAINMENT', () => {
  const TURNS = ['tối nay đi bar nào ở quận 1, chọn giúp mình']

  it('decide goal, tonight, open-now inferred; only the rows with evidence are recommended, open beats closed', () => {
    const rows = [serper('Chill Skybar', 4.4, 3200, '200.000-500.000 ₫', true), serper('Bar Đóng Cửa', 4.6, 900, '100.000-300.000 ₫', false), osm('Bar Vô Danh')]
    const r = placesRun(rows, TURNS)
    expect(r.frame.goal).toBe('decide')
    expect(r.frame.domains).toEqual(['entertainment'])
    expect(r.names).toEqual(['Chill Skybar', 'Bar Đóng Cửa'])
    expect(r.gap).toMatchObject({ qualified: 2, total: 3, action: 'recommend' })
    expect(evidenceSummary(r.shortlist.selected[0].entry.candidate.attrs)).toMatchObject({ open_now: true, price_up_to_vnd: 500000 })
  })

  it('cinema request with no location asks where, once', () => {
    expect(frameFor(['tối nay xem phim ở rạp nào']).frame.clarify).toEqual({ about: 'location' })
  })
})

describe('TRAVEL', () => {
  it('hotel under budget: Booking-shaped rows, the band and stars are evidence, an over-budget band counts against', () => {
    const hotels = [
      { title: 'Sea Hotel Đà Nẵng - Booking.com', snippet: 'Khách sạn 4 sao, giá từ 850.000đ/đêm, cách biển 200 m', link: 'https://www.booking.com/hotel/vn/sea.html', rating: 8.6 },
      { title: 'Lux Resort - Agoda', snippet: 'Resort 5 sao, giá từ 3.200.000đ/đêm', link: 'https://www.agoda.com/lux', rating: 9.1 },
    ]
    const { frame, need } = frameFor(['khách sạn Đà Nẵng gần biển dưới 1 triệu'])
    expect(frame.domains).toContain('travel')
    expect(frame.criteria.map(c => c.key)).toContain('price')
    const ranked = rankCandidates(normalizeHotels({ search_results: hotels }), need)
    expect(ranked.ranked.length + ranked.filtered.length).toBe(2)
    // A hotel's price lives only in its snippet — never a structured field — so the
    // budget cannot filter and no price term fires: the gap is recorded, not filled.
    for (const e of ranked.ranked) {
      expect(e.candidate.attrs.priceVnd).toBeUndefined()
      expect(e.reasons.map(x => x.key)).not.toContain('price')
      expect(missingFor(frame, e)).toContain('price')
    }
  })

  it('a trip plan spans domains and needs no clarification when the destination is named', () => {
    const { frame } = frameFor(['lập kế hoạch du lịch Huế 2 ngày: khách sạn, ăn uống và tham quan'])
    expect(frame.goal).toBe('plan')
    expect(frame.domains).toEqual(expect.arrayContaining(['travel', 'food']))
    expect(frame.clarify).toBeNull()
  })

  it('attraction rows: rating evidence qualifies, a bare OSM pin does not', () => {
    const r = placesRun([google('Bà Nà Hills', { rating: 4.5, count: 40000 }), osm('Điểm lạ')], ['đi đâu chơi ở Đà Nẵng'])
    expect(r.names).toEqual(['Bà Nà Hills'])
  })
})

describe('SPA', () => {
  it('near me with GPS: distance is the stated criterion; the closer spa wins; a spa with no distance cannot be recommended on distance', () => {
    const rows = [google('Sen Spa', { rating: 4.7, count: 600, km: 2.4 }), google('Miu Miu Spa', { rating: 4.5, count: 900, km: 0.6 }), google('Spa Xa Xôi', { rating: 4.9, count: 100 })]
    const r = placesRun(rows, ['spa massage gần đây'], 'Google Maps', { gps: true })
    expect(r.frame.domains).toEqual(['spa'])
    expect(r.frame.criteria[0].key).toBe('distance')
    expect(r.names).toEqual(['Miu Miu Spa', 'Sen Spa'])
    expect(r.names).not.toContain('Spa Xa Xôi')
  })

  it('without a location: one question — where', () => {
    expect(frameFor(['spa massage thư giãn']).frame.clarify).toEqual({ about: 'location' })
  })
})

describe('MAIN CHAT — universal and multi-domain', () => {
  it('utility questions are not decisions: no criteria, no question, no frame block', () => {
    for (const q of ['thời tiết Đà Nẵng hôm nay', 'giá vàng hôm nay', 'tỷ giá USD hôm nay bao nhiêu']) {
      const { frame, need } = frameFor([q])
      expect(frame.goal).toBe('inform')
      expect(frame.clarify).toBeNull()
      expect(buildDecisionFrameBlock(frame, need)).toBe('')
    }
  })

  it('one request, two domains: dinner + bar in one frame, one situation', () => {
    const { frame } = frameFor(['ăn tối rồi đi bar ở quận 1'])
    expect(frame.domains).toEqual(expect.arrayContaining(['food', 'entertainment']))
    expect(frame.occasion.meal).toBe('dinner')
    expect(frame.clarify).toBeNull()
  })

  it('a planning request across food + entertainment keeps the plan goal and the total-budget semantics', () => {
    const { frame, need } = frameFor(['lập kế hoạch ăn chơi nhảy múa tối nay cho 2 người, budget 3 triệu, ở Quận 1'])
    expect(frame.goal).toBe('plan')
    expect(frame.occasion.partySize).toBe(2)
    expect(need.budget?.max).toBe(3_000_000)
  })

  it('a follow-up refinement keeps the situation and adds the new criterion', () => {
    const { frame } = frameFor(['trưa nay ăn gì cho ngon', 'quận 1', 'rẻ hơn chút được không'])
    expect(frame.occasion.meal).toBe('lunch')
    expect(frame.criteria.map(c => c.key)).toEqual(expect.arrayContaining(['quality', 'price']))
  })
})

describe('CLARIFICATION BACKSTOP — reflex questions go, decision-critical ones stay, one at most', () => {
  it('recommendation possible: the cuisine reflex is removed, the recommendation stays', () => {
    const text = 'Mình nghiêng về **Cơm Tấm Ba Ghiền** vì 4.6⭐ từ 1800 đánh giá và đang mở cửa.\n\nBạn thích ăn gì — Việt, Âu, hay các món khác nhỉ? 🍽️\n\n[FOLLOWUPS]ăn phở|ăn cơm[/FOLLOWUPS]'
    const out = guardClarifications(text, 'no_reflex')
    expect(out.removed).toBe(1)
    expect(out.text).toContain('Mình nghiêng về **Cơm Tấm Ba Ghiền**')
    expect(out.text).not.toContain('Bạn thích ăn gì')
    expect(out.text).toContain('[FOLLOWUPS]ăn phở|ăn cơm[/FOLLOWUPS]')
  })

  it('insufficient evidence: both reflex phrasings measured on the probe are removed', () => {
    const text = 'Hiện chưa có đủ đánh giá cho các quán này. Hoặc bạn có thích ăn loại gì cụ thể không? Như phở, cơm tấm, bánh mì, hay đồ Á Âu gì đó? Mình sẽ tìm kỹ hơn.'
    const out = guardClarifications(text, 'no_reflex')
    expect(out.text).not.toMatch(/thích ăn loại gì|hay đồ Á Âu/)
    expect(out.text).toContain('Hiện chưa có đủ đánh giá')
    expect(out.text).toContain('Mình sẽ tìm kỹ hơn')
  })

  it('decision-critical questions survive: where, budget, how many, which item', () => {
    for (const q of ['Bạn đang ở khu vực nào để mình tìm gần bạn?', 'Ngân sách của bạn khoảng bao nhiêu?', 'Đi mấy người vậy?', 'Bạn muốn mua gì để mình tìm đúng?']) {
      expect(guardClarifications('Mình cần thêm một chút thôi. ' + q, 'no_reflex').text).toContain(q)
    }
  })

  it('never more than one question, whichever policy', () => {
    const text = 'Bạn ở quận nào? Ngân sách bao nhiêu? Đi mấy người?'
    const out = guardClarifications(text, 'allow')
    expect((out.text.match(/\?/g) ?? []).length).toBe(1)
    expect(out.text).toContain('Bạn ở quận nào?')
  })

  it('allow: a reflex question is left alone (the frame said asking is fine)', () => {
    const text = 'Bạn thích ăn loại gì?'
    expect(guardClarifications(text, 'allow').text).toBe(text)
  })

  it('end to end: the policy set on the collector reaches the delivered bytes', async () => {
    const collector = createEnrichmentCollector('trưa nay ăn gì cho ngon quận 1')
    collector.setClarificationPolicy('no_reflex')
    const reply = 'Mình nghiêng về **Cơm Tấm Ba Ghiền** vì có 4.6⭐ từ 1800 đánh giá.\n\nBạn thích ăn loại gì cụ thể không?'
    const frames = [
      'f:{"messageId":"m1"}', '0:"Tìm nhé."',
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"quán ăn trưa quận 1","location":"Quận 1","type":"restaurant"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: { location: 'Quận 1', source: 'Google Maps', results: [google('Cơm Tấm Ba Ghiền', { rating: 4.6, count: 1800 })] } }),
      'e:{"finishReason":"tool-calls","usage":{"promptTokens":1,"completionTokens":1},"isContinued":false}',
      'f:{"messageId":"m2"}', '0:' + JSON.stringify(reply),
      'e:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1},"isContinued":false}',
      'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'trưa nay ăn gì cho ngon quận 1', true)
    const body = await new Response(res.body).text()
    const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(text).toContain('Cơm Tấm Ba Ghiền')
    expect(text).not.toContain('thích ăn loại gì')
  })
})

describe('GROUNDING GATE — name variants ground, unknown names do not', () => {
  const known = ['Nhà Hàng Au Tresor', 'Quán Bún Bò Huế Đông Ba', 'Cafe Sài Gòn Ơi', 'Miu Miu Spa', 'Bà Nà Hills']
  const knownNorm = known.map(normalizeHeading)

  it.each([
    ['Au Tresor', true], ['Restaurant Au Tresor', true], ['Nhà hàng Au Tresor', true], ['Au Tresor:', true], ['Au Tresor,', true],
    ['Bún Bò Huế Đông Ba', true], ['Quán Bún Bò Huế Đông Ba', true], ['bun bo hue dong ba', true],
    ['Sài Gòn Ơi', true], ['Cafe Sài Gòn Ơi', true], ['Coffee Sài Gòn Ơi', true],
    ['Miu Miu', true], ['Spa Miu Miu', true], ['Bà Nà Hills', true], ['Ba Na Hills', true],
    ['Quán Lạ Hoắc', false], ['Nhà Hàng Không Tồn Tại', false], ['Bistro Deluxe Grand', false], ['Miu Nails', false],
  ])('%s → grounded %s', (shown, expected) => {
    expect(isGrounded(normalizeHeading(shown), knownNorm)).toBe(expected)
  })

  it('a list of prefix-variant headings is kept whole; the invented one is cut', () => {
    const text = 'Mình tìm được:\n\n**Restaurant Au Tresor** — món Pháp\n\n**Bún Bò Huế Đông Ba** (chuyên bún bò)\n\n**Quán Lạ Hoắc** — cũng ổn\n\nBạn xem thêm trên Maps nhé.'
    const out = suppressUngroundedVenues(text, known, 'vi')
    expect(out.suppressed).toEqual(['Quán Lạ Hoắc'])
    expect(out.text).toContain('Restaurant Au Tresor')
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toContain('chưa tìm thấy địa điểm nào đủ dữ liệu')
  })
})

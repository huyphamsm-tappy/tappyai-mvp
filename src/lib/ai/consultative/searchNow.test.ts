import { describe, it, expect } from 'vitest'
import { deriveSearchNow } from './searchNow'
import { deriveSituation } from './situationFrame'
import { deriveNeedProfile } from './needProfile'
import { deriveDecisionFrame } from './decisionFrame'
import { detectForcedTool, detectMovieRecommendationIntent } from '../intent'

// Measured 2026-09-18: "ăn gì ngon giờ" / "đi chơi ở đâu" (GPS on) were answered with a question
// and no tool call under three prompt rules saying otherwise; with a large legacy memory the same
// happened on specified requests ("Karaoke cho 10 người…", "Sinh nhật sếp…"). The vague first
// turn gets the exact first call; a specified one a suggested query; follow-ups, shopping, movie
// and hotel turns get nothing.

const GPS = { lat: 10.7769, lng: 106.7009 }
function derive(text: string, opts: { gps?: boolean; isFirstReply?: boolean; now?: Date; afterClarify?: boolean; consultationText?: string } = {}) {
  const hasGps = opts.gps !== false
  const need = deriveNeedProfile([{ role: 'user', content: text }], hasGps ? { gps: GPS as never } : {})
  const situation = deriveSituation([text], need, { hasGps })
  const frame = deriveDecisionFrame({ messages: [{ role: 'user', content: text }], need, planningIntent: null, forcedTool: detectForcedTool(text), hasGps, storedPreferences: null, now: opts.now ?? new Date('2026-09-18T12:30:00+07:00') } as never)
  return deriveSearchNow({ text, situation, frame, need, forcedTool: detectForcedTool(text), isFirstReply: opts.isFirstReply ?? true, movieRecommend: detectMovieRecommendationIntent(text), afterClarify: opts.afterClarify, consultationText: opts.consultationText })
}

// A1 (2026-09-20), measured on the web: a café request is food-domain, but its call is a CAFE search
// (the model's own step made it `cafe yên tĩnh Quận 3`); with the pre-search running the directive,
// a restaurant call here would fetch the wrong venues and buy a second step to fix them.
describe('the venue kind names the call', () => {
  it('a café request → quán cà phê / cafe, with the hard constraint; a bar → quán bar / bar', () => {
    expect(derive('quán cà phê yên tĩnh ở Quận 3 để làm việc, tầm 50-80k, đi 1 mình')).toEqual({ query: 'quán cà phê yên tĩnh', type: 'cafe', exact: false })
    expect(derive('bar nào chill ở Quận 1 cho 4 người tối nay')).toEqual({ query: 'quán bar', type: 'bar', exact: false })
  })
  it('the kind stated turns ago still decides a "more" turn (consultationText; the situation is the whole consultation, as in the route)', () => {
    const texts = ['quán cà phê yên tĩnh ở Quận 3 để làm việc, tầm 50-80k, đi 1 mình', 'gợi ý thêm']
    const need = deriveNeedProfile(texts.map(t => ({ role: 'user', content: t })), { gps: GPS as never })
    const situation = deriveSituation(texts, need, { hasGps: true })
    const frame = deriveDecisionFrame({ messages: texts.map(t => ({ role: 'user', content: t })), need, planningIntent: null, forcedTool: null, hasGps: true, storedPreferences: null, now: new Date('2026-09-18T12:30:00+07:00') } as never)
    expect(deriveSearchNow({ text: 'gợi ý thêm', situation, frame, need, forcedTool: null, isFirstReply: true, movieRecommend: false, consultationText: texts.join(' ') })).toEqual({ query: 'quán cà phê yên tĩnh', type: 'cafe', exact: false })
  })
})

describe('deriveSearchNow — the concrete first call for a place request', () => {
  it('"ăn gì ngon giờ" at lunchtime → the EXACT call quán ăn trưa ngon / restaurant', () => {
    expect(derive('ăn gì ngon giờ')).toEqual({ query: 'quán ăn trưa ngon', type: 'restaurant', exact: true })
  })
  it('"đi chơi ở đâu" → địa điểm vui chơi giải trí / attraction; "massage" → spa (exact)', () => {
    expect(derive('đi chơi ở đâu')).toEqual({ query: 'địa điểm vui chơi giải trí', type: 'attraction', exact: true })
    expect(derive('massage')).toEqual({ query: 'spa massage', type: 'spa', exact: true })
  })
  it('a specified request gets a SUGGESTED query the model may sharpen', () => {
    expect(derive('Tìm quán ăn tối ngon gần Quận 1 cho 2 người')).toEqual({ query: 'quán ăn tối ngon', type: 'restaurant', exact: false })
    expect(derive('Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1')).toEqual({ query: 'nhà hàng ngon phòng riêng', type: 'restaurant', exact: false })
    // Phase D (2026-09-20) superseded the generic "địa điểm vui chơi giải trí" call: the kind is the query.
    expect(derive('Karaoke cho 10 người tầm 100k/người Gò Vấp')).toEqual({ query: 'quán karaoke', type: 'attraction', exact: false })
  })
  it('a follow-up, a movie turn, no GPS (clarify), a hotel turn → get_hotel_prices; a family outing → entertainment (suggested)', () => {
    expect(derive('ăn gì ngon giờ', { isFirstReply: false })).toBeNull()
    expect(derive('Xem phim gì hay tối nay')).toBeNull()
    expect(derive('ăn gì ngon giờ', { gps: false })).toBeNull()
    expect(derive('Resort Phú Quốc cho kỷ niệm 1 năm, sang chút')).toEqual({ query: 'phu quoc', type: 'hotel', exact: false })
    expect(derive('Cuối tuần này gia đình 4 người đi đâu gần Sài Gòn?')).toEqual({ query: 'địa điểm vui chơi giải trí', type: 'attraction', exact: false })
  })
  it("shopping without a product is the model's question, not a search", () => {
    expect(derive('mua gì bây giờ')).toBeNull()
  })
  // Item 1, measured GATE A: after the clarify the model asked a second question (T5b "bạn muốn chơi
  // gì?", S5b "hương gì?"). The answer turn's arguments are the call, and shopping gets one too.
  it('after a clarify the call is EXACT, and a shopping answer becomes a search_products call', () => {
    expect(derive('đi chơi ở đâu — 3–5 người', { afterClarify: true })).toEqual({ query: 'địa điểm vui chơi giải trí', type: 'attraction', exact: true })
    expect(derive('đi chơi ở đâu — 3–5 người')).toMatchObject({ exact: false })
    expect(derive('quà sinh nhật cho bạn gái tầm 1tr — nước hoa', { afterClarify: true })).toEqual({ query: 'nước hoa', type: 'product', exact: true })
    expect(derive('quà sinh nhật cho bạn gái tầm 1tr — nước hoa')).toBeNull()
  })
})

// C1 (2026-09-20, live run 16): a coach request was pre-searched as restaurants.
describe('a transport request is never a place directive', () => {
  it('coach / flight / rail requests get no search_places call', () => {
    expect(derive('xe khách Sài Gòn đi Đà Lạt tối mai, vé bao nhiêu và mấy giờ chạy?')).toBeNull()
    expect(derive('vé máy bay Sài Gòn Hà Nội 10/10 cho 2 người')).toBeNull()
    expect(derive('tàu hỏa Hà Nội đi Sa Pa tối nay')).toBeNull()
  })
})

// ── Phase D (2026-09-20): karaoke, cinemas, water parks, aquariums resolve to VENUE calls ──
// Measured live (run 19): "tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì…" matched no venue noun,
// went to web_search and produced no card. A named cinema is its own place; a kind is a kind.
describe('Phase D — entertainment venue kinds name their own call', () => {
  it('a NAMED cinema is searched exactly, even with no district and no GPS', () => {
    expect(derive('tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao nhiêu?', { gps: false }))
      .toEqual({ query: 'cgv vincom dong khoi', type: 'cinema', exact: true })
    expect(derive('rạp Galaxy Nguyễn Du có suất nào tối nay?', { gps: false })).toEqual({ query: 'galaxy nguyen du', type: 'cinema', exact: true })
  })

  it('a cinema kind is a cinema search; karaoke / water park / aquarium are attraction searches of that kind', () => {
    expect(derive('rạp chiếu phim nào gần đây?')).toMatchObject({ type: 'cinema', query: 'rạp chiếu phim' })
    expect(derive('karaoke gần đây cho 10 người')).toMatchObject({ type: 'attraction', query: expect.stringContaining('quán karaoke') })
    expect(derive('công viên nước nào gần Sài Gòn cho trẻ em?')).toEqual({ type: 'attraction', query: 'công viên nước', exact: false }) // no 'có khu trẻ em' — measured run 25
    expect(derive('thủy cung ở đâu gần đây?')).toMatchObject({ type: 'attraction', query: expect.stringContaining('thủy cung') })
  })

  it('a phone is still a phone — "Galaxy" without "rạp" names no cinema', () => {
    expect(derive('mua điện thoại Galaxy S24 ở đâu rẻ?')).toBeNull()
  })

  it('a what-to-watch ask is still not a place call', () => {
    expect(derive('tối nay xem phim gì hay?')).toBeNull()
  })
})

describe('E3 — a NAMED venue of any kind is searched exactly', () => {
  it('a named restaurant / spa is the call, typed by its noun, with no district or GPS', () => {
    expect(derive('quán Cơm Tấm Ba Ghiền Đặng Văn Ngữ mở đến mấy giờ?', { gps: false })).toEqual({ query: 'Cơm Tấm Ba Ghiền Đặng Văn Ngữ', type: 'restaurant', exact: true })
    expect(derive('Sả Spa Quận 1 mở cửa đến mấy giờ, có cần đặt lịch không?', { gps: false })).toEqual({ query: 'Sả Spa', type: 'spa', exact: true })
  })
})

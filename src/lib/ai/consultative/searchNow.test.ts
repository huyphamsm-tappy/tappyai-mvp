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
function derive(text: string, opts: { gps?: boolean; isFirstReply?: boolean; now?: Date } = {}) {
  const hasGps = opts.gps !== false
  const need = deriveNeedProfile([{ role: 'user', content: text }], hasGps ? { gps: GPS as never } : {})
  const situation = deriveSituation([text], need, { hasGps })
  const frame = deriveDecisionFrame({ messages: [{ role: 'user', content: text }], need, planningIntent: null, forcedTool: detectForcedTool(text), hasGps, storedPreferences: null, now: opts.now ?? new Date('2026-09-18T12:30:00+07:00') } as never)
  return deriveSearchNow({ text, situation, frame, need, forcedTool: detectForcedTool(text), isFirstReply: opts.isFirstReply ?? true, movieRecommend: detectMovieRecommendationIntent(text) })
}

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
    expect(derive('Karaoke cho 10 người tầm 100k/người Gò Vấp')).toEqual({ query: 'địa điểm vui chơi giải trí', type: 'attraction', exact: false })
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
})

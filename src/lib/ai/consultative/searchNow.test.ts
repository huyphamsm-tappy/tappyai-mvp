import { describe, it, expect } from 'vitest'
import { deriveSearchNow } from './searchNow'
import { deriveSituation } from './situationFrame'
import { deriveNeedProfile } from './needProfile'
import { deriveDecisionFrame } from './decisionFrame'
import { detectForcedTool, detectMovieRecommendationIntent } from '../intent'

// Measured 2026-09-18: "ăn gì ngon giờ" / "đi chơi ở đâu" (GPS on) were answered with a question
// and no tool call under three prompt rules saying otherwise. The vague first turn gets the exact
// first call; a specified request, a follow-up, a shopping turn or a movie turn gets nothing.

const GPS = { lat: 10.7769, lng: 106.7009 }
function derive(text: string, opts: { gps?: boolean; isFirstReply?: boolean; now?: Date } = {}) {
  const hasGps = opts.gps !== false
  const need = deriveNeedProfile([{ role: 'user', content: text }], hasGps ? { gps: GPS as never } : {})
  const situation = deriveSituation([text], need, { hasGps })
  const frame = deriveDecisionFrame({ messages: [{ role: 'user', content: text }], need, planningIntent: null, forcedTool: detectForcedTool(text), hasGps, storedPreferences: null, now: opts.now ?? new Date('2026-09-18T12:30:00+07:00') } as never)
  return deriveSearchNow({ text, situation, frame, forcedTool: detectForcedTool(text), isFirstReply: opts.isFirstReply ?? true, movieRecommend: detectMovieRecommendationIntent(text) })
}

describe('deriveSearchNow — the concrete first call for a vague place request', () => {
  it('"ăn gì ngon giờ" at lunchtime → quán ăn trưa ngon / restaurant', () => {
    expect(derive('ăn gì ngon giờ')).toEqual({ query: 'quán ăn trưa ngon', type: 'restaurant' })
  })
  it('"đi chơi ở đâu" → địa điểm vui chơi giải trí / attraction; "massage" → spa', () => {
    expect(derive('đi chơi ở đâu')).toEqual({ query: 'địa điểm vui chơi giải trí', type: 'attraction' })
    expect(derive('massage')).toEqual({ query: 'spa massage', type: 'spa' })
  })
  it('a specified request, a follow-up, a movie turn, no GPS (clarify) → null', () => {
    expect(derive('Tìm quán ăn tối ngon gần Quận 1 cho 2 người')).toBeNull()
    expect(derive('ăn gì ngon giờ', { isFirstReply: false })).toBeNull()
    expect(derive('Xem phim gì hay tối nay')).toBeNull()
    expect(derive('ăn gì ngon giờ', { gps: false })).toBeNull()
  })
  it('shopping without a product is the model\'s question, not a search', () => {
    expect(derive('mua gì bây giờ')).toBeNull()
  })
})

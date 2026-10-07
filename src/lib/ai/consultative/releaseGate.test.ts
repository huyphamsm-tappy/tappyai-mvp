// Release-gate regression tests for the four defects confirmed by the final UAT (docs/audit/CONSULTATIVE-FINAL-UAT.md).
import { describe, it, expect } from 'vitest'
import { deriveNeedProfile } from './needProfile'
import { rankCandidates } from './rank'
import { routeConsult } from './consultRouter'
import type { Candidate, CandidateAttrs } from './candidate'

const conv = (...u: string[]) => u.map(content => ({ role: 'user', content }))
const P = (name: string, attrs: CandidateAttrs): Candidate => ({ id: `id-${name}`, name, domain: 'places', attrs, link: null, raw: {} })
const ASSIST = 'Mình hiểu bạn cần quán ăn trưa ở Quận 1.\n\n**Mình chọn: Quán Rẻ**.\n\nMình còn 1 lựa chọn nữa, muốn xem thêm không?'
const thread = (...later: string[]) => {
  const m: Array<{ role: string; content: string }> = [{ role: 'user', content: 'Tìm quán ăn trưa ở Quận 1, ưu tiên rẻ.' }, { role: 'assistant', content: ASSIST }]
  for (const t of later) m.push({ role: 'user', content: t })
  return m
}
const route = (...later: string[]) => routeConsult(thread(...later), { lang: 'vi', hasGps: false }).decision

describe('BUG 1 — a changed priority is re-decided', () => {
  it('router: "Thôi giá không quan trọng, ưu tiên chất lượng." is a re-decision, not a follow-up question', () => {
    const d = route('Thôi giá không quan trọng, ưu tiên chất lượng.')
    expect(d.turn).toBe('reject')
    expect(d.reprioritize).toBe(true)
    expect(d.domains).toEqual(['food'])
  })
  it('router: quality → cheap and a dismissal alone are re-decisions too', () => {
    expect(route('Thôi ưu tiên giá rẻ nhé.').reprioritize).toBe(true)
    expect(route('Giá không quan trọng.').reprioritize).toBe(true)
  })
  it('router: a question about a shown pick is still a follow-up', () => {
    expect(route('Quán này có mở cửa không?').turn).toBe('followup')
  })
  it('profile: latest priority wins and the dismissed one is not retained', () => {
    const p = deriveNeedProfile(conv('Tìm quán ăn trưa ở Quận 1, ưu tiên rẻ.', 'Thôi giá không quan trọng, ưu tiên chất lượng.'))
    expect(p.priorities.map(x => x.key)).toContain('rating')
    expect(p.priorities.map(x => x.key)).not.toContain('price')
    expect(p.dismissed?.map(x => x.key)).toContain('price')
  })
  const set = () => [
    P('Quán Rẻ', { rating: 3.9, reviewCount: 120, priceHighVnd: 60_000 }),
    P('Quán Ngon', { rating: 4.8, reviewCount: 900, priceHighVnd: 250_000 }),
    P('Quán Vừa', { rating: 4.3, reviewCount: 300, priceHighVnd: 120_000 }),
  ]
  it('ranking actually changes: cheap → quality', () => {
    const cheap = rankCandidates(set(), deriveNeedProfile(conv('Tìm quán ăn trưa ở Quận 1, ưu tiên rẻ.')))
    const quality = rankCandidates(set(), deriveNeedProfile(conv('Tìm quán ăn trưa ở Quận 1, ưu tiên rẻ.', 'Thôi giá không quan trọng, ưu tiên chất lượng.')))
    expect(cheap.ranked[0].candidate.name).toBe('Quán Rẻ')
    expect(quality.ranked[0].candidate.name).toBe('Quán Ngon')
  })
  it('ranking actually changes: quality → cheap', () => {
    const q = rankCandidates(set(), deriveNeedProfile(conv('Tìm quán ăn trưa ở Quận 1, ưu tiên chất lượng.')))
    const c = rankCandidates(set(), deriveNeedProfile(conv('Tìm quán ăn trưa ở Quận 1, ưu tiên chất lượng.', 'Thôi chất lượng không quan trọng, ưu tiên rẻ.')))
    expect(q.ranked[0].candidate.name).toBe('Quán Ngon')
    expect(c.ranked[0].candidate.name).toBe('Quán Rẻ')
  })
})

// ── BUG 2 — Serper price bands written with a unit ("100-200 N ₫") ───────────────────────────────────────────────────────────
import { normalizePlaces } from './candidate'
import { derivePickOrState } from './pick'

const rows = (bands: Record<string, string>) => ({ results: Object.entries(bands).map(([name, price_range_text]) => ({ name, price_range_text, google_rating: '4.4 (200)' })) })
const high = (text: string) => normalizePlaces(rows({ X: text })).find(c => c.name === 'X')?.attrs.priceHighVnd

describe('BUG 2 — the band is read in the unit the provider wrote it in', () => {
  it('reads the realistic Serper variants', () => {
    expect(high('100-200 N ₫')).toBe(200_000)
    expect(high('200-700 N ₫')).toBe(700_000)
    expect(high('100-500 N ₫')).toBe(500_000)
    expect(high('100-200 K ₫')).toBe(200_000)
    expect(high('200-300 nghìn ₫')).toBe(300_000)
    expect(high('1-2 Tr ₫')).toBe(2_000_000)
    expect(high('1-1,5 Tr ₫')).toBe(1_500_000)
    expect(high('500 N ₫')).toBe(500_000)
  })
  it('keeps reading the existing full-dong shapes', () => {
    expect(high('1-100.000 ₫')).toBe(100_000)
    expect(high('100.000-200.000 ₫')).toBe(200_000)
    expect(high('1-45.000 ₫')).toBe(45_000)
  })
  it('an open-ended band is a floor, never a ceiling; a non-VND or unit-less small number is no band', () => {
    expect(high('Trên 1 Tr ₫')).toBeUndefined()
    expect(high('$10-20')).toBeUndefined()
    expect(high('1-100 ₫')).toBeUndefined()
  })
  const cands = () => normalizePlaces(rows({ 'Quán A': '100-200 N ₫', 'Quán B': '200-700 N ₫', 'Quán C': '1-100.000 ₫' }))
  it('a hard ceiling eliminates by the unit-bearing band', () => {
    const n = deriveNeedProfile(conv('Ăn tối ở Quận 1, ngân sách dưới 300k một người.'))
    const r = rankCandidates(cands(), n)
    expect(r.ranked.map(e => e.candidate.name).sort()).toEqual(['Quán A', 'Quán C'])
    expect(r.filtered.map(e => e.candidate.name)).toEqual(['Quán B'])
  })
  it('cheapest priority picks the lowest band across both representations', () => {
    const n = deriveNeedProfile(conv('Ăn tối ở Quận 1, ưu tiên rẻ nhất.'))
    const r = rankCandidates(cands(), n)
    expect(r.ranked[0].candidate.name).toBe('Quán C')
    expect(derivePickOrState(r, n).pick?.candidate.name).toBe('Quán C')
  })
  it('all bands above the ceiling → all_eliminated (no invented winner)', () => {
    const n = deriveNeedProfile(conv('Ăn tối ở Quận 1, ngân sách dưới 150k một người.'))
    const r = rankCandidates(normalizePlaces(rows({ 'Quán B': '200-700 N ₫', 'Quán D': '300-800 N ₫' })), n)
    expect(derivePickOrState(r, n)).toEqual({ pick: null, state: 'all_eliminated' })
  })
})

// ── BUG 3 — an unbacked proximity comparison about the pick ────────────────────────────────────────────────────────────────────
import { dropUnsupportedProximityClaim, pickedNameIn } from './proximityClaim'

// The rows of UAT-15 (real Serper data): the pick is 1.3 km away, a row the model was handed is 0.7 km away, another is 0.1 km.
const UAT15 = [
  { name: 'Quán Ngon - Bún Chả Hà Nội', distanceKm: 1.3 }, { name: 'Ẩm Thực Ăn Ngon', distanceKm: 0.7 }, { name: 'NHÀ HÀNG NGON', distanceKm: 0.1 },
  { name: 'Hanoi Ngon - 143/8 An Bình, Q5', distanceKm: 4.2 },
]
const UAT15_REPLY = '**Mình chọn: Quán Ngon - Bún Chả Hà Nội**. Quán đang mở vào buổi tối và gần vị trí của bạn hơn các lựa chọn khác.\nMở cửa **09:30–22:30**, cách bạn **1,3 km**; chưa có thông tin về giá.'

describe('BUG 3 — "gần … hơn / nhất" about the pick needs the distances to say so', () => {
  it('removes the observed false comparison and keeps everything the evidence supports', () => {
    const r = dropUnsupportedProximityClaim(UAT15_REPLY, pickedNameIn(UAT15_REPLY, null), UAT15)
    expect(r.removed).toBe(1)
    expect(r.text).not.toMatch(/gần vị trí của bạn hơn/)
    expect(r.text).toContain('**Mình chọn: Quán Ngon - Bún Chả Hà Nội**')
    expect(r.text).toContain('Quán đang mở vào buổi tối.')
    expect(r.text).toContain('cách bạn **1,3 km**')
  })
  it('keeps the claim when the pick really is the nearest row (a tie included)', () => {
    const rows = UAT15.map(x => x.name === 'NHÀ HÀNG NGON' ? { ...x, distanceKm: 1.3 } : x).map(x => x.name === 'Ẩm Thực Ăn Ngon' ? { ...x, distanceKm: 1.5 } : x)
    const t = '**Mình chọn: Quán Ngon - Bún Chả Hà Nội**. Đây là quán gần nhất trong các lựa chọn.'
    expect(dropUnsupportedProximityClaim(t, 'Quán Ngon - Bún Chả Hà Nội', rows)).toEqual({ text: t, removed: 0 })
  })
  it('removes "gần nhất" when the pick has no distance but other rows do', () => {
    const rows = [{ name: 'Quán Ngon', distanceKm: null }, { name: 'Tiệm Cơm Mới', distanceKm: 0.5 }]
    const r = dropUnsupportedProximityClaim('**Mình chọn: Quán Ngon**. Quán gần nhất bạn.', 'Quán Ngon', rows)
    expect(r.removed).toBe(1)
    expect(r.text).not.toMatch(/gần nhất/)
  })
  it('does not touch a non-comparative "gần", a true statement about another venue, or a reply with no proximity wording', () => {
    const a = '**Mình chọn: Quán Ngon - Bún Chả Hà Nội**. Quán gần trung tâm, ăn ngon hơn mức giá.'
    expect(dropUnsupportedProximityClaim(a, 'Quán Ngon - Bún Chả Hà Nội', UAT15).removed).toBe(0)
    const b = '**Mình chọn: Quán Ngon - Bún Chả Hà Nội**. Ẩm Thực Ăn Ngon gần hơn nhưng ít đánh giá hơn.'
    expect(dropUnsupportedProximityClaim(b, 'Quán Ngon - Bún Chả Hà Nội', UAT15).removed).toBe(0)
  })
  it('English comparatives are held to the same evidence', () => {
    const r = dropUnsupportedProximityClaim('**Mình chọn: Quán Ngon - Bún Chả Hà Nội**. It is the closest option to you.', 'Quán Ngon - Bún Chả Hà Nội', UAT15)
    expect(r.removed).toBe(1)
  })
})

// ── BUG 4 — "quán thứ hai" resolves against the cards the user was shown ────────────────────────────────────────────────────────
import { ordinalVenuesFromContext } from './referenceResolver'
import { nextChatSessionState } from './chatSessionState'

const CARDS = ['Cơm Tấm Ba Ghiền', 'Nhà hàng Ngon', 'Phở Lệ Nguyễn Trãi']

describe('BUG 4 — an explicit ordinal is resolved from the stored result context', () => {
  it('thứ nhất / thứ hai / thứ ba pick the candidate at that position of the cards shown', () => {
    expect(ordinalVenuesFromContext('Quán thứ nhất có mở cửa không?', CARDS)).toEqual(['Cơm Tấm Ba Ghiền'])
    expect(ordinalVenuesFromContext('Quán thứ hai thì sao?', CARDS)).toEqual(['Nhà hàng Ngon'])
    expect(ordinalVenuesFromContext('Quán thứ ba giá khoảng bao nhiêu?', CARDS)).toEqual(['Phở Lệ Nguyễn Trãi'])
  })
  it('numeric and "đầu" forms, and a pair', () => {
    expect(ordinalVenuesFromContext('Quán số 2 ở đâu?', CARDS)).toEqual(['Nhà hàng Ngon'])
    expect(ordinalVenuesFromContext('Quán thứ hai khác quán đầu ở điểm nào?', CARDS).sort()).toEqual(['Cơm Tấm Ba Ghiền', 'Nhà hàng Ngon'])
  })
  it('only a candidate that is actually there: nothing is invented beyond the cards', () => {
    expect(ordinalVenuesFromContext('Quán thứ ba giá khoảng bao nhiêu?', CARDS.slice(0, 2))).toEqual([])
    expect(ordinalVenuesFromContext('Quán thứ hai thì sao?', [])).toEqual([])
    expect(ordinalVenuesFromContext('Quán này có mở cửa không?', CARDS)).toEqual([])
  })
  it('the router keeps an ordinal question a follow-up (not a new search) and the state keeps the card order of the LATEST reply', () => {
    const d = route('Quán thứ hai khác quán đầu ở điểm nào?')
    expect(d.turn).toBe('followup')
    const s1 = nextChatSessionState(null, { cardOrder: CARDS, presentedNames: ['Phở Lệ Nguyễn Trãi', 'Nhà hàng Ngon'] })
    expect(s1.cards).toEqual(CARDS)
    const s2 = nextChatSessionState(s1, {})
    expect(s2.cards).toEqual(CARDS) // a turn with no cards keeps what the user last saw
    expect(nextChatSessionState(s2, { cardOrder: ['A Quán', 'B Quán'] }).cards).toEqual(['A Quán', 'B Quán'])
  })
})

// ── AI-Hay pass: relative weekday dates ──────────────────────────────────────────────────────────────────────────────────────
import { relativeDateIso } from './consultTravel'
describe('relative weekday dates are resolved by code (Vietnamese week = Monday → Sunday)', () => {
  const sunday = new Date('2026-10-04T05:00:00Z') // Sunday 04/10/2026 12:00 GMT+7
  const wednesday = new Date('2026-10-07T05:00:00Z')
  it('"thứ 3 tuần sau" on Sunday 04/10 is Tuesday 06/10 (the model said 11/10, a Sunday)', () => {
    expect(relativeDateIso('bay từ Sài Gòn đi Đà Nẵng vào thứ 3 tuần sau', sunday)).toBe('2026-10-06')
    expect(relativeDateIso('thứ ba tuần tới', sunday)).toBe('2026-10-06')
    expect(relativeDateIso('chủ nhật tuần sau', sunday)).toBe('2026-10-11')
  })
  it('from a Wednesday: next week = the week that starts Monday 12/10', () => {
    expect(relativeDateIso('thứ 3 tuần sau', wednesday)).toBe('2026-10-13')
    expect(relativeDateIso('thứ 6 tuần này', wednesday)).toBe('2026-10-09')
    expect(relativeDateIso('thứ 2 tuần này', wednesday)).toBeUndefined() // already past
  })
  it('a bare weekday is its next occurrence after today; the older forms still work', () => {
    expect(relativeDateIso('thứ 5', wednesday)).toBe('2026-10-08')
    expect(relativeDateIso('thứ 4', wednesday)).toBe('2026-10-14')
    expect(relativeDateIso('ngày mai', sunday)).toBe('2026-10-05')
    expect(relativeDateIso('tuần sau', sunday)).toBeUndefined() // no weekday, no guess
  })
})

describe('AI-Hay pass: "không cần rẻ, ưu tiên ngon" is a priority dismissal, not a rejected pick', () => {
  it('re-decides the same thread (reprioritize), keeping already-shown places eligible', () => {
    const d = route('không cần rẻ, ưu tiên ngon')
    expect(d.turn).toBe('reject')
    expect(d.reprioritize).toBe(true)
  })
  it('"không thích quán này, ưu tiên rẻ" still rejects the pick (no reprioritize flag)', () => {
    const d = route('không thích quán này, ưu tiên rẻ')
    expect(d.reprioritize).toBeFalsy()
  })
})

import { describe, it, expect } from 'vitest'
import { deriveSituation, UPSCALE_RE } from './situationFrame'
import { admitsForUpscale, isBudgetLodging } from './upscale'
import { normalizeHotels } from './candidate'
import { rankCandidates } from './rank'
import { shortlistCandidates } from './shortlist'
import { classifyHardGaps, HARD_GROUP, HARD_TO_ATTR } from './hardConstraints'
import { extractAttributes } from './reviewAttributes'
import { trimPlacesForModel } from './modelPayload'
import type { NeedProfile } from './needProfile'

// ── 1.4 (owner 2026-09-19, T8 "Resort Phú Quốc cho kỷ niệm 1 năm, sang chút") ───────────────
//
// Three runs picked "Rio Guest House" (5⭐/138): the engine's shortlist is rating-first, the model
// read it as "row 0 = best_overall", and nothing knew a guest house is the wrong CLASS of place.
// Now: (1) "sang chút / xịn hơn / sang trọng / đẹp hơn" is a HARD constraint `upscale`;
// (2) the shortlist never admits budget lodging under it; (3) the model's copy carries the rows in
// PROVIDER order with no shortlist and no ranking; (4) "sang trọng" with no fancy evidence is a gap.

const need = () => ({ budget: null as never, location: { text: null, gps: null } })

describe('the upscale intent is read as a hard constraint (and the fancy mood)', () => {
  it.each([
    'Resort Phú Quốc cho kỷ niệm 1 năm, sang chút',
    'khách sạn Đà Nẵng xịn hơn chút',
    'nhà hàng sang trọng cho tiệc công ty',
    'chỗ nào đẹp hơn cho kỷ niệm',
    'resort phu quoc sang chut',
    'a fancy dinner place for our anniversary',
  ])('"%s"', (text) => {
    const frame = deriveSituation([text], need())
    expect(frame.hard).toContain('upscale')
    expect(frame.mood).toBe('fancy')
  })
  it('"sang" as a verb is not the intent', () => {
    expect(UPSCALE_RE.test('toi nay sang quan 1 an gi ngon')).toBe(false)
    expect(deriveSituation(['tối nay sang Quận 1 ăn gì ngon'], need()).hard).not.toContain('upscale')
  })
  it('is EVIDENCE_REQUIRED and reads the `fancy` review attribute', () => {
    expect(HARD_GROUP.upscale).toBe('EVIDENCE_REQUIRED')
    expect(HARD_TO_ATTR.upscale).toBe('fancy')
  })
  it('"sang trọng" with no fancy evidence is a gap; a fancy review supports it', () => {
    const none = classifyHardGaps(['upscale'], extractAttributes(new Map([['Rio Guest House', ['phòng sạch, chủ thân thiện']]])))
    expect(none.gaps).toEqual(['upscale'])
    const some = classifyHardGaps(['upscale'], extractAttributes(new Map([['The Poplar Resort', ['resort sang trọng, cao cấp, view biển']]])))
    expect(some.gaps).toEqual([])
  })
})

describe('budget lodging is excluded from the shortlist only under the upscale constraint', () => {
  it.each([
    ['Rio Guest House Phú Quốc', []],
    ['Nhà nghỉ Bình Dân', []],
    ['Phú Quốc Backpackers Hostel', []],
    ['Sunny Homestay giá rẻ', []],
    ['Khách sạn ABC', ['Nhà nghỉ']],
  ])('%s is budget lodging', (name, types) => {
    expect(isBudgetLodging(name, types)).toBe(true)
    expect(admitsForUpscale(['upscale'], { name, raw: { place_types: types } })).toBe(false)
    expect(admitsForUpscale([], { name, raw: { place_types: types } })).toBe(true)
  })
  it.each(['The Poplar Resort', 'Ocean Bay Resort & Spa Phu Quoc', 'InterContinental Phu Quoc', 'Sunset Beach Resort & Spa'])('%s is admitted', (name) => {
    expect(admitsForUpscale(['upscale'], { name, raw: { place_types: ['Khách sạn'] } })).toBe(true)
  })
})

// The exact T8 rows (GATE B 2026-09-19): Rio first with the highest rating, the resorts below it.
const HOTEL_LIST = [
  { name: 'Rio Guest House Phú Quốc', place_id: 'r1', google_rating: '5⭐ (138 đánh giá Google Maps)', rating_value: 5, rating_count: 138, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=1' },
  { name: 'The Poplar Resort', place_id: 'r2', google_rating: '4.9⭐ (320 đánh giá Google Maps)', rating_value: 4.9, rating_count: 320, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=2' },
  { name: 'Ocean Bay Resort & Spa Phu Quoc', place_id: 'r3', google_rating: '4.7⭐ (3.174 đánh giá Google Maps)', rating_value: 4.7, rating_count: 3174, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=3' },
  { name: 'Thiên Thanh Phú Quốc Resort', place_id: 'r4', google_rating: '4.7⭐ (1.758 đánh giá Google Maps)', rating_value: 4.7, rating_count: 1758, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=4' },
  { name: 'AVS HOTEL PHU QUOC', place_id: 'r5', google_rating: '4.7⭐ (689 đánh giá Google Maps)', rating_value: 4.7, rating_count: 689, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=5' },
  { name: 'LUXOR BOUTIQUE HOTEL PHU QUOC', place_id: 'r6', google_rating: '4.8⭐ (139 đánh giá Google Maps)', rating_value: 4.8, rating_count: 139, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=6' },
  { name: 'Sunset Beach Resort & Spa', place_id: 'r7', google_rating: '4.5⭐ (1.892 đánh giá Google Maps)', rating_value: 4.5, rating_count: 1892, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=7' },
  { name: "L'Azure Resort and Spa Phu Quoc", place_id: 'r8', google_rating: '4.5⭐ (786 đánh giá Google Maps)', rating_value: 4.5, rating_count: 786, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=8' },
  { name: 'Sea Star resort Phu Quoc', place_id: 'r9', google_rating: '4.3⭐ (1.024 đánh giá Google Maps)', rating_value: 4.3, rating_count: 1024, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=9' },
  { name: 'Tahiti Beach Hotel Phú Quốc', place_id: 'r10', google_rating: '4.3⭐ (657 đánh giá Google Maps)', rating_value: 4.3, rating_count: 657, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=10' },
]
const hotelNeed = (): NeedProfile => ({
  domain: 'hotel', subject: 'resort', budget: null, budgetStated: null, location: { text: 'Phú Quốc', gps: null },
  useCases: [], priorities: [{ key: 'rating', weight: 2, source: 'stated' }], mustHave: [], avoid: [], turnsObserved: 1, changedAtTurn: {},
})

describe('T8: the top-rated guest house is never shortlisted for an upscale request', () => {
  const frame = deriveSituation(['Resort Phú Quốc cho kỷ niệm 1 năm, sang chút'], need())
  const ranked = rankCandidates(normalizeHotels({ hotel_list: HOTEL_LIST }), hotelNeed())

  it('the ranker itself still puts the guest house first (rating-first) — that is why the exclusion exists', () => {
    expect(ranked.ranked[0].candidate.name).toBe('Rio Guest House Phú Quốc')
  })
  it('with the route\'s admission predicate the shortlist has no guest house and an upscale option leads', () => {
    const sl = shortlistCandidates(ranked.ranked, undefined, e => admitsForUpscale(frame.hard, e.candidate))
    const names = sl.selected.map(s => s.entry.candidate.name)
    expect(names).not.toContain('Rio Guest House Phú Quốc')
    expect(names[0]).toBe('The Poplar Resort')
    expect(sl.selected[0].role).toBe('best_overall')
  })
  it('without the upscale intent the same rows shortlist as before (the guest house may lead)', () => {
    const plain = deriveSituation(['Resort Phú Quốc cho kỷ niệm 1 năm'], need())
    const sl = shortlistCandidates(ranked.ranked, undefined, e => admitsForUpscale(plain.hard, e.candidate))
    expect(sl.selected.map(s => s.entry.candidate.name)).toContain('Rio Guest House Phú Quốc')
  })
})

describe('stage 1: the model reads the rows in PROVIDER order, with no shortlist and no ranking', () => {
  it('keeps the provider order even when the shortlist names a later row, and strips both engine fields', () => {
    const out = trimPlacesForModel({
      hotel_list: [...HOTEL_LIST].reverse(),
      _tappy_shortlist: [{ rank: 0, id: 'r2', name: 'The Poplar Resort', role: 'best_overall' }],
      _tappy_ranking: { id: 'r2', name: 'The Poplar Resort' },
      booking_link: 'https://booking',
    }, 'hotel_list', { modelChooses: true }) as Record<string, unknown>
    const rows = out.hotel_list as Array<Record<string, unknown>>
    expect(rows.map(r => r.name)).toEqual([...HOTEL_LIST].reverse().map(r => r.name))
    expect(out).not.toHaveProperty('_tappy_shortlist')
    expect(out).not.toHaveProperty('_tappy_ranking')
    expect(out.booking_link).toBe('https://booking')
    expect(String(out.results_note)).toMatch(/thu tu nha cung cap/)
  })
})

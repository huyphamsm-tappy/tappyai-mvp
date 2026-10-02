import { describe, it, expect } from 'vitest'
import {
  narrowToClipTarget, applyClipTarget, nameMatches, addressAgreement, asksForAlternatives,
  identityTokens, splitBrand, applyClipAlternatives, requestedAlternatives, DEFAULT_ALTERNATIVES,
} from './exploreClipTarget'

// ── ONE venue from many rows — deterministic, name-first, address-checked ────
//
// The provider returns the neighbourhood; the clip names one place in it. These
// tests pin the three outcomes and the two rules that keep them honest: a name is
// never read as a location, and a better-ranked stranger is never the answer.

const row = (name: string, address = '', extra: Record<string, unknown> = {}) => ({
  name, address, rating: 4.5, user_ratings_total: 120, maps_link: `https://maps.google.com/?q=${encodeURIComponent(name)}`,
  phone: '028 0000 0000', opening_hours: 'Mo-Su 07:00-22:00', website_uri: 'https://example.test', lat: 10.77, lng: 106.7, ...extra,
})

const GOC_HUE = row('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1, Thành phố Hồ Chí Minh')
const STRANGERS = [
  row('Bún Bò Huế Đông Ba', '110A Nguyễn Du, Quận 1, TP.HCM'),
  row('Cơm Tấm Cali', '32 Nguyễn Thái Bình, Quận 1, TP.HCM'),
  row('Quán Huế Ngon', '5 Lê Thị Hồng Gấm, Quận 1, TP.HCM'),
  row('Phở Hòa Pasteur', '260C Pasteur, Quận 3, TP.HCM'),
  row('Nhà hàng Ngon 138', '138 Nam Kỳ Khởi Nghĩa, Quận 1, TP.HCM'),
  row('Bún Chả Hà Nội', '10 Calmette, Quận 1, TP.HCM'),
  row('Huế Xưa Quán', '44 Ký Con, Quận 1, TP.HCM'),
]

describe('name matching', () => {
  it('splits a brand from its branch tail', () => {
    expect(splitBrand('GÓC HUẾ - Nguyễn Thái Bình')).toEqual({ head: 'GÓC HUẾ', tail: 'Nguyễn Thái Bình' })
    expect(splitBrand('Bún Bò Huế Cô Ba')).toEqual({ head: 'Bún Bò Huế Cô Ba', tail: '' })
  })

  it('drops venue-type words but keeps dish words — they ARE the identity here', () => {
    expect(identityTokens('Quán Bún Bò Huế Cô Ba')).toEqual(['bun', 'bo', 'hue', 'co', 'ba'])
    expect(identityTokens('Nhà hàng Cơm Tấm Cali')).toEqual(['com', 'tam', 'cali'])
  })

  it('matches the clip brand inside a longer provider name, and a longer clip against a shorter row brand', () => {
    expect(nameMatches('GÓC HUẾ', 'GÓC HUẾ - Nguyễn Thái Bình')).toBe(true)
    expect(nameMatches('GÓC HUẾ - Nguyễn Thái Bình', 'GÓC HUẾ')).toBe(true)
    expect(nameMatches('Cô Ba', 'Bún Bò Huế Cô Ba')).toBe(true)
  })

  it('does NOT match a stranger that merely shares a word', () => {
    expect(nameMatches('GÓC HUẾ', 'Quán Huế Ngon')).toBe(false)
    expect(nameMatches('GÓC HUẾ', 'Huế Xưa Quán')).toBe(false)
    expect(nameMatches('GÓC HUẾ', 'Bún Bò Huế Đông Ba')).toBe(false)
    expect(nameMatches('Cô Ba', 'Cô Ba Bún Bò Huế Chi Nhánh 2 - Cô Tư')).toBe(true)
  })

  it('a single-token brand must match a single-token brand exactly — "Huế" alone swallows nothing', () => {
    expect(nameMatches('Huế', 'Quán Huế Ngon')).toBe(false)
    expect(nameMatches('Huế', 'Huế')).toBe(true)
  })
})

describe('address agreement — addresses only, never names', () => {
  it('house number + street word → same', () => {
    expect(addressAgreement('155 Nguyễn Thái Bình, Quận 1, TP.HCM', GOC_HUE)).toBe('same')
  })
  it('same known city or district without a house number → area', () => {
    expect(addressAgreement('Quận 1, TP.HCM', row('X', '32 Nguyễn Thái Bình, Quận 1, TP.HCM'))).toBe('area')
  })
  it('two different known cities → conflict', () => {
    expect(addressAgreement('Quận 1, TP.HCM', row('X', '12 Hàng Bài, Hoàn Kiếm, Hà Nội'))).toBe('conflict')
  })
  it('no clip address → unknown, whatever the name says', () => {
    expect(addressAgreement(null, row('Bún Bò Huế', 'Hà Nội'))).toBe('unknown')
    expect(addressAgreement('', GOC_HUE)).toBe('unknown')
  })
})

describe('TEST C · exact target among strangers → resolved, row preserved whole', () => {
  it('keeps exactly the matching row', () => {
    const out = narrowToClipTarget([...STRANGERS.slice(0, 4), GOC_HUE, ...STRANGERS.slice(4)], {
      placeName: 'GÓC HUẾ - Nguyễn Thái Bình',
      placeAddress: '155 Nguyễn Thái Bình, Quận 1, TP.HCM',
    })
    expect(out.status).toBe('resolved')
    expect(out.results).toHaveLength(1)
    // TEST I — the very same object, every provider field intact.
    expect(out.results[0]).toBe(GOC_HUE)
    expect(out.results[0]).toMatchObject({ phone: '028 0000 0000', opening_hours: 'Mo-Su 07:00-22:00', rating: 4.5, user_ratings_total: 120 })
  })
})

describe('TEST D · no row carries the name → unresolved, first result NOT chosen', () => {
  it('returns no rows', () => {
    const out = narrowToClipTarget(STRANGERS, { placeName: 'GÓC HUẾ - Nguyễn Thái Bình', placeAddress: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' })
    expect(out.status).toBe('unresolved')
    expect(out.results).toEqual([])
  })
  it('a higher rating never rescues a stranger', () => {
    const star = row('Phở Hòa Pasteur', '260C Pasteur, Quận 3, TP.HCM', { rating: 5, user_ratings_total: 9000 })
    const out = narrowToClipTarget([star, ...STRANGERS], { placeName: 'GÓC HUẾ', placeAddress: null })
    expect(out.status).toBe('unresolved')
  })
})

describe('TEST E · two branches, no address → ambiguous with ONLY those two', () => {
  it('keeps the branches, drops the strangers', () => {
    const a = row('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Quận 1, TP.HCM')
    const b = row('GÓC HUẾ - Ân Dương', '12 Ân Dương, Quận 7, TP.HCM')
    const out = narrowToClipTarget([STRANGERS[0], a, STRANGERS[1], b, STRANGERS[2]], { placeName: 'GÓC HUẾ', placeAddress: null })
    expect(out.status).toBe('ambiguous')
    expect(out.results).toEqual([a, b])
  })

  it('a branch pinned by the clip address resolves instead', () => {
    const a = row('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Quận 1, TP.HCM')
    const b = row('GÓC HUẾ - Ân Dương', '12 Ân Dương, Quận 7, TP.HCM')
    const out = narrowToClipTarget([a, b], { placeName: 'GÓC HUẾ', placeAddress: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' })
    expect(out.status).toBe('resolved')
    expect(out.results).toEqual([a])
  })

  it('a branch named in the clip tail resolves even without an address', () => {
    const a = row('GÓC HUẾ - Nguyễn Thái Bình')
    const b = row('GÓC HUẾ - Ân Dương')
    const out = narrowToClipTarget([b, a], { placeName: 'GÓC HUẾ - Nguyễn Thái Bình', placeAddress: null })
    expect(out.status).toBe('resolved')
    expect(out.results).toEqual([a])
  })

  it('caps an ambiguous answer at three rows, best agreement first', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map(t => row(`GÓC HUẾ - ${t}`, `1 ${t} Street, Quận 1, TP.HCM`))
    const out = narrowToClipTarget(rows, { placeName: 'GÓC HUẾ', placeAddress: null })
    expect(out.status).toBe('ambiguous')
    expect(out.results).toHaveLength(3)
  })
})

describe('TEST G · no address', () => {
  const clip = { placeName: 'Cô Ba', placeAddress: null }
  it('exactly one strong match → resolved', () => {
    const target = row('Bún Bò Huế Cô Ba', '5 Trần Hưng Đạo, Quận 1, TP.HCM')
    const out = narrowToClipTarget([...STRANGERS, target], clip)
    expect(out.status).toBe('resolved')
    expect(out.results).toEqual([target])
  })
  it('several plausible → ambiguous', () => {
    const out = narrowToClipTarget([row('Bún Bò Huế Cô Ba', 'Quận 1'), row('Cô Ba Bún Bò Huế', 'Quận 5')], clip)
    expect(out.status).toBe('ambiguous')
    expect(out.results).toHaveLength(2)
  })
  it('zero → unresolved', () => {
    expect(narrowToClipTarget(STRANGERS, clip).status).toBe('unresolved')
  })
})

describe('TEST H · "Huế" in a NAME is not a location', () => {
  it('two cities\' "Bún Bò Huế" with no clip address → ambiguous, not Huế', () => {
    const hn = row('Bún Bò Huế — Hà Nội', '25 Hàng Bài, Hoàn Kiếm, Hà Nội')
    const sg = row('Bún Bò Huế — TP.HCM', '40 Nguyễn Huệ, Quận 1, TP.HCM')
    const out = narrowToClipTarget([hn, sg], { placeName: 'Bún Bò Huế', placeAddress: null })
    expect(out.status).toBe('ambiguous')
    expect(out.results).toEqual([hn, sg])
  })
  it('and a clip ADDRESS in Saigon pins the Saigon one', () => {
    const hn = row('Bún Bò Huế — Hà Nội', '25 Hàng Bài, Hoàn Kiếm, Hà Nội')
    const sg = row('Bún Bò Huế — TP.HCM', '40 Nguyễn Huệ, Quận 1, TP.HCM')
    const out = narrowToClipTarget([hn, sg], { placeName: 'Bún Bò Huế', placeAddress: 'Quận 1, TP.HCM' })
    expect(out.status).toBe('resolved')
    expect(out.results).toEqual([sg])
  })
})

describe('explicit discovery escape (Explore-only detector)', () => {
  it.each([
    'Có quán nào tương tự không?',
    'Gợi ý thêm quán khác',
    'Có chỗ nào gần đây không?',
    'Cho mình vài lựa chọn khác',
    'Có quán nào ngon hơn không?',
    'Tìm thêm những quán tương tự',
    'Any similar places nearby?',
    'Recommend other restaurants',
  ])('asks for alternatives: %s', (t) => expect(asksForAlternatives(t)).toBe(true))

  it.each([
    'Cho mình biết thêm về GÓC HUẾ - Nguyễn Thái Bình',
    'Chỗ này ngon không?',
    'Quán mở cửa mấy giờ?',
    'Giá ở đây khoảng bao nhiêu?',
    'Quán có chỗ đậu xe không?',
    'Tell me more about GÓC HUẾ',
  ])('asks about THIS place: %s', (t) => expect(asksForAlternatives(t)).toBe(false))
})

describe('applyClipTarget — a new result object, envelope kept, venue set replaced', () => {
  const envelope = {
    source: 'serper_places', count: 8, location: 'Quận 1, TP.HCM',
    google_maps_search: 'https://maps.google.com/maps?q=GOC+HUE', place_search_status: 'has_results',
    no_results_instruction: undefined, results: [...STRANGERS.slice(0, 3), GOC_HUE, ...STRANGERS.slice(3)],
  }

  it('resolved: one row, count 1, marker set, generic instruction absent, envelope untouched', () => {
    const { result, status } = applyClipTarget(envelope, { placeName: 'GÓC HUẾ - Nguyễn Thái Bình', placeAddress: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' }, 'vi')
    expect(status).toBe('resolved')
    expect(result._tappy_clip_target).toBe('resolved')
    expect(result.results).toEqual([GOC_HUE])
    expect(result.count).toBe(1)
    expect(result.place_search_status).toBe('has_results')
    expect('no_results_instruction' in result).toBe(false)
    expect(result.google_maps_search).toBe(envelope.google_maps_search)
    expect(result.source).toBe('serper_places')
    // Not a mutation: the tool's own object still holds all eight.
    expect(envelope.results).toHaveLength(8)
  })

  it('unresolved: no rows, status empty (the grounding gate\'s signal), Explore instruction present', () => {
    const { result, status } = applyClipTarget({ ...envelope, results: STRANGERS }, { placeName: 'GÓC HUẾ', placeAddress: null }, 'vi')
    expect(status).toBe('unresolved')
    expect(result.results).toEqual([])
    expect(result.place_search_status).toBe('empty')
    expect(String(result.no_results_instruction)).toMatch(/KHONG XAC MINH DUOC/)
    expect(String(result.no_results_instruction)).toMatch(/KHONG gioi thieu quan khac/)
  })

  it('ambiguous: the plausible rows only, with the branch-question instruction', () => {
    const a = row('GÓC HUẾ - Nguyễn Thái Bình'), b = row('GÓC HUẾ - Ân Dương')
    const { result, status } = applyClipTarget({ ...envelope, results: [STRANGERS[0], a, b] }, { placeName: 'GÓC HUẾ', placeAddress: null }, 'en')
    expect(status).toBe('ambiguous')
    expect(result.results).toEqual([a, b])
    expect(String(result.no_results_instruction)).toMatch(/SEVERAL PLACES SHARE THE NAME/)
  })

  it('tolerates a non-object or row-less result', () => {
    expect(applyClipTarget(null, { placeName: 'X', placeAddress: null }, 'vi').status).toBe('unresolved')
    expect(applyClipTarget({ location_required: true, results: [] }, { placeName: 'X', placeAddress: null }, 'vi').status).toBe('unresolved')
  })
})

describe('"gần đây" / "ngon hơn" ALONE are not an escape (2026-09-13)', () => {
  it.each(['gần đây', 'Có gần đây không?', 'gần đây có gì chơi?', 'ngon hơn', 'Quán này ngon hơn không?', 'ngon hơn không?'])(
    'stays on the venue: %s', (t) => expect(asksForAlternatives(t)).toBe(false),
  )
})

describe('applyClipAlternatives — the explicit-alternatives turn is deterministic too', () => {
  const CLIP = { placeName: 'GÓC HUẾ - Nguyễn Thái Bình', placeAddress: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' }
  const envelope = () => ({
    source: 'serper_places', count: 8, location: 'Quận 1, TP.HCM',
    google_maps_search: 'https://maps.google.com/maps?q=GOC+HUE', place_search_status: 'has_results',
    results: [STRANGERS[0], GOC_HUE, ...STRANGERS.slice(1)],
  })

  it('reads the number the user asked for, defaulting to three and capping at eight', () => {
    expect(requestedAlternatives('gợi ý thêm 3 quán')).toBe(3)
    expect(requestedAlternatives('cho mình 5 chỗ khác')).toBe(5)
    expect(requestedAlternatives('recommend 2 places')).toBe(2)
    expect(requestedAlternatives('gợi ý thêm quán khác')).toBe(DEFAULT_ALTERNATIVES)
    expect(requestedAlternatives('gợi ý 9 quán')).toBe(8)
  })

  it('drops the target from its own alternatives, caps the list, keeps provider order and the envelope', () => {
    const { result, requested, kept } = applyClipAlternatives(envelope(), CLIP, 'vi', 'gợi ý thêm 3 quán')
    expect(requested).toBe(3)
    expect(kept).toBe(3)
    expect(result.results).toEqual(STRANGERS.slice(0, 3))
    expect(result.count).toBe(3)
    expect(result.source).toBe('serper_places')
    expect(result.google_maps_search).toBe('https://maps.google.com/maps?q=GOC+HUE')
    expect(result._tappy_clip_alternatives).toEqual({ of: CLIP.placeName, requested: 3 })
    expect(String(result.alternatives_instruction)).toContain(CLIP.placeName)
    expect(String(result.alternatives_instruction)).toMatch(/LUA CHON THAY THE/)
    expect(applyClipAlternatives(envelope(), CLIP, 'en', 'other places').result.alternatives_instruction).toMatch(/ALTERNATIVES/)
  })

  it('never marks the turn as a target verdict, and never mutates the input', () => {
    const input = envelope()
    const before = JSON.stringify(input)
    const { result } = applyClipAlternatives(input, CLIP, 'vi', 'gợi ý thêm quán khác')
    expect('_tappy_clip_target' in result).toBe(false)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('a provider with fewer rows than asked yields what it has; no rows yields none', () => {
    expect(applyClipAlternatives({ results: [GOC_HUE, STRANGERS[0]] }, CLIP, 'vi', 'gợi ý thêm 5 quán').kept).toBe(1)
    expect(applyClipAlternatives({ results: [] }, CLIP, 'vi', 'gợi ý thêm').result.results).toEqual([])
    expect(applyClipAlternatives(null, CLIP, 'vi', 'gợi ý thêm').result.results).toEqual([])
  })
})

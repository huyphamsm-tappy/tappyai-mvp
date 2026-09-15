import { describe, it, expect } from 'vitest'
import { deriveDecisionFrame, qualifiesFor, missingFor, evidenceGap, evidenceSummary, buildDecisionFrameBlock, type DecisionFrame } from './decisionFrame'
import { deriveNeedProfile } from './needProfile'
import { rankCandidates } from './rank'
import { shortlistCandidates } from './shortlist'
import { normalizePlaces } from './candidate'
import { detectPlanningIntent, detectForcedTool } from '../intent'
import { guardPlaceClaimsInText } from '../placeClaimGuard'
import { buildSystem } from '../promptBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// The shared consultative core, exercised the way the route drives it: the
// conversation → need profile → decision frame → (rows → ranked → shortlist
// gated by the frame → evidence gap) → the prompt block the model reads.
//
// MEASURED 2026-09-15: "trưa nay ăn gì cho ngon" → "quận 1" ran one search that
// echoed the sentence, shortlisted two rows with no attribute at all, described
// them, and asked "bạn muốn ăn loại gì?". Every case below is a behaviour, not a
// shape.
// ─────────────────────────────────────────────────────────────────────────────

const LUNCH_NOON = new Date('2026-09-15T05:30:00Z') // 12:30 in Asia/Ho_Chi_Minh

function frameFor(turns: string[], opts: { gps?: boolean; prefs?: { cuisine_likes?: string[] }; now?: Date } = {}): { frame: DecisionFrame; need: ReturnType<typeof deriveNeedProfile> } {
  const messages = turns.map(content => ({ role: 'user', content }))
  const gps = opts.gps ? { lat: 10.77, lng: 106.7 } : null
  const need = deriveNeedProfile(messages, { storedPreferences: opts.prefs ?? null, gps })
  const last = turns[turns.length - 1]
  const frame = deriveDecisionFrame({
    messages, need, planningIntent: detectPlanningIntent(last), forcedTool: detectForcedTool(last), hasGps: !!gps,
    storedPreferences: opts.prefs ?? null, now: opts.now ?? LUNCH_NOON,
  })
  return { frame, need }
}

// Rows in the shapes the tools really emit.
const OSM = (name: string, extra: Record<string, unknown> = {}) => ({ name, maps_link: `https://www.google.com/maps?q=${name}`, lat: 10.77, lng: 106.7, ...extra })
const GOOGLE = (name: string, rating: number, count: number, extra: Record<string, unknown> = {}) =>
  ({ name, address: 'Quận 1, TP HCM', google_rating: `${rating}⭐ (${count} đánh giá)`, rating_value: rating, rating_count: count, maps_link: `https://maps.google.com/?cid=${name}`, ...extra })

function pipeline(rows: Array<Record<string, unknown>>, turns: string[], source = 'Google Maps', opts: { gps?: boolean; prefs?: { cuisine_likes?: string[] } } = {}) {
  const { frame, need } = frameFor(turns, opts)
  const ranked = rankCandidates(normalizePlaces({ results: rows }), need)
  const shortlist = shortlistCandidates(ranked.ranked, 3, e => qualifiesFor(frame, e))
  const gap = evidenceGap(frame, ranked.ranked, !/openstreetmap/i.test(source))
  return { frame, need, ranked, shortlist, gap }
}

describe('PRE-SEARCH — the frame understands the situation before any tool runs', () => {
  it('FOOD A/B — "trưa nay ăn gì cho ngon" → "quận 1": lunch, quality first, no clarification once the area is known', () => {
    const { frame, need } = frameFor(['trưa nay ăn gì cho ngon', 'quận 1'])
    expect(frame.goal).toBe('recommend')
    expect(frame.domains).toEqual(['food'])
    expect(frame.occasion.meal).toBe('lunch')
    expect(frame.occasion.when).toBe('now')
    expect(frame.criteria[0]).toEqual({ key: 'quality', source: 'stated' })
    expect(frame.informationNeeded).toEqual(expect.arrayContaining(['rating', 'reviewCount', 'openingHours']))
    expect(need.location.text).toMatch(/quan 1/i)
    expect(frame.clarify).toBeNull()
  })

  it('FOOD — the same request with no area and no GPS asks ONE thing: where', () => {
    const { frame } = frameFor(['trưa nay ăn gì cho ngon'])
    expect(frame.clarify).toEqual({ about: 'location' })
  })

  it('FOOD — GPS stands in for the area, and adds distance as an inferred criterion', () => {
    const { frame } = frameFor(['tối nay ăn gì ngon'], { gps: true })
    expect(frame.clarify).toBeNull()
    expect(frame.criteria.map(c => c.key)).toEqual(expect.arrayContaining(['quality', 'distance']))
    expect(frame.criteria.find(c => c.key === 'distance')?.source).toBe('inferred')
  })

  it('FOOD H — a stored cuisine preference becomes a preference criterion', () => {
    const { frame } = frameFor(['ăn gì ở quận 3 giờ'], { prefs: { cuisine_likes: ['bún bò'] } })
    expect(frame.criteria).toContainEqual({ key: 'cuisine', source: 'preference' })
  })

  it('FOOD C — constraints: "quán bún bò rẻ gần đây" → price + distance stated, budget-free', () => {
    const { frame } = frameFor(['quán bún bò rẻ gần đây'], { gps: true })
    expect(frame.criteria.map(c => c.key)).toEqual(expect.arrayContaining(['price', 'distance']))
    expect(frame.criteria.find(c => c.key === 'distance')?.source).toBe('stated')
  })

  it('FOOD — a bare "ăn gì" at 12:30 is lunch by the clock, at 19:30 dinner', () => {
    expect(frameFor(['ăn gì ở quận 1']).frame.occasion.meal).toBe('lunch')
    expect(frameFor(['ăn gì ở quận 1'], { now: new Date('2026-09-15T12:30:00Z') }).frame.occasion.meal).toBe('dinner')
  })

  it('SHOPPING A/C — "mua laptop 20 triệu để code": shopping, price criterion, no location question', () => {
    const { frame } = frameFor(['mua laptop 20 triệu để code'])
    expect(frame.domains).toEqual(['shopping'])
    expect(frame.placeDecision).toBe(false)
    expect(frame.criteria.map(c => c.key)).toContain('price')
    expect(frame.clarify).toBeNull()
  })

  it('SHOPPING — "mua gì làm quà" with no subject asks what, not where', () => {
    const { frame } = frameFor(['mua gì làm quà sinh nhật'])
    expect(frame.domains).toContain('shopping')
    expect(frame.clarify).toEqual({ about: 'subject' })
  })

  it('SHOPPING D — comparison is a compare goal', () => {
    expect(frameFor(['iPhone 15 hay Galaxy S24 tốt hơn']).frame.goal).toBe('compare')
    expect(frameFor(['so sánh Jaspas với Au Tresor']).frame.goal).toBe('compare')
  })

  it('ENTERTAINMENT B/E — "tối nay đi bar nào ở quận 1, chọn giúp": decide, tonight, open-now inferred', () => {
    const { frame } = frameFor(['tối nay đi bar nào ở quận 1, chọn giúp mình'])
    // "quận" normalizes to "quan" — it must never read as "quán" (food).
    expect(frame.domains).toEqual(['entertainment'])
    expect(frame.goal).toBe('decide')
    expect(frame.occasion.when).toBe('tonight')
    expect(frame.criteria.map(c => c.key)).toContain('openNow')
    expect(frame.clarify).toBeNull()
  })

  it('TRAVEL B/C — "khách sạn Đà Nẵng gần biển dưới 1 triệu": travel, price + stated location', () => {
    const { frame, need } = frameFor(['khách sạn Đà Nẵng gần biển dưới 1 triệu'])
    expect(frame.domains).toContain('travel')
    expect(frame.criteria.map(c => c.key)).toContain('price')
    expect(need.location.text).toMatch(/da nang/i)
    expect(frame.clarify).toBeNull()
  })

  it('TRAVEL F — a trip plan is a plan goal spanning domains', () => {
    const { frame } = frameFor(['lập kế hoạch du lịch Huế 2 ngày: khách sạn, ăn uống và tham quan'])
    expect(frame.goal).toBe('plan')
    expect(frame.domains).toEqual(expect.arrayContaining(['travel', 'food']))
    expect(frame.occasion.when).toBe('trip')
  })

  it('SPA A/B — "spa massage gần đây" with GPS: spa, distance stated, no question', () => {
    const { frame } = frameFor(['spa massage gần đây'], { gps: true })
    expect(frame.domains).toContain('spa')
    expect(frame.criteria[0].key).toBe('distance')
    expect(frame.clarify).toBeNull()
  })

  it('SPA — without a location it asks where, once', () => {
    expect(frameFor(['spa massage thư giãn']).frame.clarify).toEqual({ about: 'location' })
  })

  it('CROSS-DOMAIN J — "ăn tối rồi đi bar quận 1": food + entertainment, one frame', () => {
    const { frame } = frameFor(['ăn tối rồi đi bar ở quận 1'])
    expect(frame.domains).toEqual(expect.arrayContaining(['food', 'entertainment']))
    expect(frame.occasion.meal).toBe('dinner')
  })

  it('INFORM — "thời tiết Đà Nẵng hôm nay" / "giá vàng" are not decisions: no criteria, no question, no block', () => {
    for (const q of ['thời tiết Đà Nẵng hôm nay', 'giá vàng hôm nay bao nhiêu']) {
      const { frame, need } = frameFor([q])
      expect(frame.goal).toBe('inform')
      expect(frame.placeDecision).toBe(false)
      expect(frame.clarify).toBeNull()
      expect(buildDecisionFrameBlock(frame, need)).toBe('')
    }
  })

  it('I — a refinement turn inherits the situation: "rẻ hơn chút" after the lunch request keeps lunch + Q1 and adds price', () => {
    const { frame, need } = frameFor(['trưa nay ăn gì cho ngon', 'quận 1', 'rẻ hơn chút được không'])
    expect(frame.occasion.meal).toBe('lunch')
    expect(need.location.text).toMatch(/quan 1/i)
    expect(frame.criteria.map(c => c.key)).toContain('price')
  })
})

describe('POST-SEARCH — a name is a search result, a recommendation needs evidence', () => {
  const TURNS = ['trưa nay ăn gì cho ngon', 'quận 1']

  it('G — the measured OSM set: one wifi flag qualifies nobody; no shortlist, gap says insufficient', () => {
    const rows = [OSM('Nhà Hàng Jaspas', { wifi: true }), OSM('Nhà Hàng Au Tresor'), OSM('Nhà Hàng Crazy Buffalo')]
    const { shortlist, gap } = pipeline(rows, TURNS, 'OpenStreetMap')
    expect(shortlist.selected).toEqual([])
    expect(gap).toEqual({ qualified: 0, total: 3, needed: expect.arrayContaining(['rating', 'reviewCount']), action: 'insufficient' })
  })

  it('G — the same set from a provider that can carry evidence: search again, once', () => {
    const rows = [OSM('A', { wifi: true }), OSM('B'), OSM('C')]
    expect(pipeline(rows, TURNS, 'Google Maps').gap.action).toBe('search_again')
  })

  it('B (only one strong) — one rated row among three: shortlist of ONE, never padded', () => {
    const rows = [GOOGLE('Cơm Tấm Ba Ghiền', 4.6, 1200), OSM('Nhà Hàng Au Tresor'), OSM('Nhà Hàng Crazy Buffalo')]
    const { shortlist, gap } = pipeline(rows, TURNS)
    expect(shortlist.selected.map(s => s.entry.candidate.name)).toEqual(['Cơm Tấm Ba Ghiền'])
    expect(gap.action).toBe('recommend')
    expect(gap.qualified).toBe(1)
  })

  it('A — three rated rows: ranked by the stated criterion (rating × reviews), evidence and reasons attached', () => {
    const rows = [GOOGLE('Quán B', 4.2, 80), GOOGLE('Quán A', 4.8, 900), GOOGLE('Quán C', 4.5, 300)]
    const { shortlist, frame } = pipeline(rows, TURNS)
    expect(shortlist.selected.map(s => s.entry.candidate.name)).toEqual(['Quán A', 'Quán C', 'Quán B'])
    const top = shortlist.selected[0].entry
    expect(evidenceSummary(top.candidate.attrs)).toMatchObject({ rating: 4.8, reviews: 900 })
    expect(top.reasons.some(r => r.key === 'rating' && r.contribution > 0)).toBe(true)
    expect(missingFor(frame, top)).toEqual(['openingHours'])
  })

  it('§6 — A (name + wifi) never outranks B (rating + reviews + hours) on a quality request', () => {
    const rows = [OSM('A', { wifi: true }), GOOGLE('B', 4.4, 210, { opening_hours: '10:00–22:00' })]
    const { shortlist } = pipeline(rows, TURNS)
    expect(shortlist.selected.map(s => s.entry.candidate.name)).toEqual(['B'])
  })

  it('C — a distance request qualifies on distance evidence, so a GPS-measured OSM row can be recommended', () => {
    const rows = [OSM('Bún Bò Gánh', { distance_km: 0.4 }), OSM('Xa Lắm', { distance_km: 6 }), OSM('Không rõ')]
    const { shortlist, gap } = pipeline(rows, ['quán bún bò gần đây'], 'OpenStreetMap', { gps: true })
    expect(gap.action).toBe('recommend')
    expect(shortlist.selected.map(s => s.entry.candidate.name)).toEqual(['Bún Bò Gánh', 'Xa Lắm'])
  })

  it('SPA / ENTERTAINMENT / TRAVEL — the same threshold applies to every place domain', () => {
    const spa = pipeline([OSM('Sen Spa'), GOOGLE('Miu Miu Spa', 4.7, 2100)], ['spa massage ở quận 1'])
    expect(spa.shortlist.selected.map(s => s.entry.candidate.name)).toEqual(['Miu Miu Spa'])
    const bar = pipeline([OSM('Bar X'), OSM('Bar Y')], ['tối nay đi bar nào ở quận 1'], 'OpenStreetMap')
    expect(bar.gap.action).toBe('insufficient')
    const hotel = pipeline([GOOGLE('Sea Hotel', 4.3, 560), OSM('No Data Hostel')], ['khách sạn Đà Nẵng gần biển'])
    expect(hotel.shortlist.selected.map(s => s.entry.candidate.name)).toEqual(['Sea Hotel'])
  })

  it('no predicate — the selector behaves exactly as before (additive parameter)', () => {
    const rows = [OSM('A', { wifi: true }), OSM('B'), OSM('C')]
    const { need } = frameFor(TURNS)
    const ranked = rankCandidates(normalizePlaces({ results: rows }), need)
    expect(shortlistCandidates(ranked.ranked, 3).selected).toHaveLength(3)
  })
})

describe('THE PROMPT — the frame reaches the model, the rulebook stays cache-stable', () => {
  it('states goal, situation, criteria, the evidence needed and "search for the goal" on the lunch request', () => {
    const { frame, need } = frameFor(['trưa nay ăn gì cho ngon', 'quận 1'])
    const block = buildDecisionFrameBlock(frame, need)
    expect(block).toContain('MUC TIEU: GOI Y de user chon')
    expect(block).toContain('bua trua')
    expect(block).toContain('khu vuc: quan 1')
    expect(block).toMatch(/TIEU CHI.*chat luong\/ngon \(rating \+ so danh gia\)/)
    expect(block).toContain('BANG CHUNG CAN DE QUYET DINH: rating, reviewCount, openingHours')
    expect(block).toContain('DU DE GOI Y: KHONG hoi truoc')
    expect(block).toContain('KHONG chep nguyen cau cua user')
    expect(block).toContain('_tappy_evidence_gap')
  })

  it('asks for the area first when it is the one decisive gap', () => {
    const { frame, need } = frameFor(['trưa nay ăn gì cho ngon'])
    expect(buildDecisionFrameBlock(frame, need)).toContain('THIEU: khu vuc/vi tri')
  })

  it('the shared rulebook carries the evidence-gap contract and the describe-from-fields rule, byte-identically across requests', () => {
    const a = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, null)
    const b = buildSystem(null, 'unknown', false, '', 'en', 'prefs', null, null, false, null)
    expect(a.shared).toBe(b.shared)
    for (const pin of ["action='recommend'", "action='search_again'", "action='insufficient'", 'THEM DUNG MOT LAN', 'KHONG goi lan thu ba', 'MO TA DIA DIEM CHI TU DU LIEU THAT', 'KHONG HOI "ban muon an loai gi']) {
      expect(a.shared).toContain(pin)
    }
  })
})

describe('PROVENANCE — atmosphere and quality adjectives need text about the place', () => {
  const ev = { ratings: [], distancesKm: [], texts: [], placeNames: ['Nhà Hàng Jaspas', 'Mimi Ultra Lounge'], entityTexts: new Map<string, string[]>(), ratingsByEntity: new Map(), reviewCountsByEntity: new Map(), phonesByEntity: new Map() }

  it('the measured embellishments go; the wifi fact and the name stay', () => {
    const text = 'Mình chọn **Nhà Hàng Jaspas** — quán có wifi, không gian thoải mái, chất lượng.\n\nMimi Ultra Lounge sôi động, có wifi.'
    const out = guardPlaceClaimsInText(text, ev as never, { scope: 'all' })
    expect(out.text).not.toMatch(/không gian thoải mái|chất lượng|sôi động/)
    expect(out.text).toContain('Nhà Hàng Jaspas')
    expect(out.text).toContain('có wifi')
  })

  it('retrieved text about THAT place carries the claim', () => {
    const withText = { ...ev, entityTexts: new Map([['Nhà Hàng Jaspas', ['Không gian thoải mái, phục vụ tốt — review Foody']]]) }
    const out = guardPlaceClaimsInText('Nhà Hàng Jaspas có không gian thoải mái.', withText as never, { scope: 'all' })
    expect(out.redacted).toBe(0)
  })

  it('suitability inferred from a real category is not touched', () => {
    const out = guardPlaceClaimsInText('Mimi Ultra Lounge là bar, lý tưởng để nhảy múa.', ev as never, { scope: 'all' })
    expect(out.redacted).toBe(0)
  })
})

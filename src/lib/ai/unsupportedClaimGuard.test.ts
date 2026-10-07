import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardUnsupportedClaims, foldAligned, type ClaimVenue } from './unsupportedClaimGuard'
import { parsePriceBand } from '@/lib/recommendation/priceBand'

// Verbatim replies from the round-5 blind grading on 526129a (owner 2026-09-28).
const EV = join(process.cwd(), 'docs/uat/evidence')
const c40 = (id: string) => JSON.parse(readFileSync(join(EV, 'c40-ab-2026-09-27/head-526129a-FTP', `${id}.json`), 'utf8')) as { text: string; prose: string; rows: Array<{ name: string; price?: string; hours?: string }> }
const golden = (id: string) => JSON.parse(readFileSync(join(EV, 'golden/uat4-p1-golden-526129a-sub-rep2', `${id}.json`), 'utf8')) as { turns: Array<{ user: string; text: string }> }
const venuesOf = (rows: Array<{ name: string; price?: string }>): ClaimVenue[] => rows.map(r => ({ name: r.name, band: parsePriceBand(r.price ?? null), texts: [r.name] }))

describe('foldAligned keeps indices', () => {
  it('one unit in, one unit out', () => {
    const s = 'Mình xác nhận TP HCM không có rạp IMAX 👍 đường'
    expect(foldAligned(s)).toHaveLength(s.length)
    expect(foldAligned('Đông Ba')).toBe('dong ba')
  })
})

describe('R1 — golden T2: an absolute negation of the asked feature becomes "chưa xác nhận được"', () => {
  const t2 = golden('T2')
  const ev = { venues: [], sharedTexts: [], userTexts: t2.turns.map(t => t.user) }
  it('t2: "xác nhận TP HCM hiện không có rạp IMAX"', () => {
    const r = guardUnsupportedClaims(t2.turns[1].text, ev)
    expect(r.text).not.toMatch(/xác nhận TP HCM hiện không có rạp IMAX/)
    expect(r.text).toContain('chưa xác nhận được TP HCM có rạp IMAX')
    expect(r.text).toContain('Mình vừa tìm lại và') // the sentence stays
    expect(r.rewritten).toContain('negation')
  })
  it('t1: "không có rạp IMAX" and "không cung cấp công nghệ IMAX" become unconfirmed', () => {
    const r = guardUnsupportedClaims(t2.turns[0].text, ev)
    expect(r.text).not.toMatch(/không có rạp IMAX|không cung cấp công nghệ IMAX/)
    expect(r.text).toContain('**chưa được xác nhận là có rạp IMAX** trong danh sách kết quả')
    expect(r.text).toContain('**BHD Star Cineplex** chưa được xác nhận là có cung cấp công nghệ IMAX')
  })
  it('kept when the data itself says so, or when the user never asked', () => {
    const text = 'Rạp A không có IMAX.'
    expect(guardUnsupportedClaims(text, { venues: [], sharedTexts: ['Rạp A (không có phòng IMAX)'], userTexts: ['rạp IMAX'] }).text).toBe(text)
    expect(guardUnsupportedClaims('Quán này không có chỗ đậu xe.', { venues: [], sharedTexts: [], userTexts: ['quán ăn ngon'] }).text).toBe('Quán này không có chỗ đậu xe.')
  })
})

describe('R2 — c40 F2: a price ceiling asserted from a band', () => {
  const f2 = c40('F2')
  it('"giá dưới 80k" for Bếp Ông Cậu (1-100.000 ₫) → the band, and "not sure"', () => {
    const r = guardUnsupportedClaims(f2.prose, { venues: venuesOf(f2.rows), sharedTexts: [], userTexts: [f2.text] })
    expect(r.text).not.toMatch(/và giá dưới 80k\./)
    expect(r.text).toContain('và giá tham khảo tới 100k (chưa chắc dưới 80k).')
    expect(r.text).toContain('**Bếp Ông Cậu** là lựa chọn mình nghiêng về nhất')
    expect(r.rewritten).toContain('price_ceiling')
  })
  it('a band inside the ceiling, and a restated search, are left alone', () => {
    const v: ClaimVenue[] = [{ name: 'Quán A', band: parsePriceBand('30-60.000 ₫'), texts: [] }]
    expect(guardUnsupportedClaims('Quán A giá dưới 80k.', { venues: v, sharedTexts: [], userTexts: ['duoi 80k'] }).text).toBe('Quán A giá dưới 80k.')
    expect(guardUnsupportedClaims('Mình tìm quán dưới 80k ở Quận 1.', { venues: v, sharedTexts: [], userTexts: ['duoi 80k'] }).rewritten).toEqual([])
  })
})

describe('R3 — c40 T1: "trong ngân sách" about an unpriced hotel', () => {
  const t1 = c40('T1')
  it('the fit phrase goes, the pick and its other reasons stay', () => {
    const r = guardUnsupportedClaims(t1.prose, { venues: [...venuesOf(t1.rows), { name: 'M Hotel Da Nang', band: null, texts: ['M Hotel Da Nang'] }], sharedTexts: [], userTexts: [t1.text] })
    expect(r.text).not.toMatch(/giá hợp lý trong ngân sách/)
    expect(r.text).toContain('Mình chọn **M Hotel Da Nang** (4.8⭐, 2.860 đánh giá) vì nó nằm gần biển')
    expect(r.text).toContain('được đánh giá cao')
    expect(r.rewritten).toContain('budget_fit')
  })
})

describe('R4 — c40 P6: an asked-for service the venue data never mentions', () => {
  const p6 = c40('P6')
  it('"có dịch vụ massage couple chuyên nghiệp" → "mình chưa xác nhận được có dịch vụ massage couple"', () => {
    const r = guardUnsupportedClaims(p6.prose, { venues: venuesOf(p6.rows), sharedTexts: [], userTexts: [p6.text] })
    expect(r.text).not.toMatch(/có dịch vụ massage couple chuyên nghiệp/)
    expect(r.text).toContain('mình chưa xác nhận được có dịch vụ massage couple')
    expect(r.text).toContain('Mình chọn **Hạ Spa Quận 1** cho bạn') // the pick sentence stays
    expect(r.rewritten).toContain('service')
  })
  it('kept when the venue data names the service, or the claim is conditional', () => {
    const v: ClaimVenue[] = [{ name: 'Couple Spa Q1', band: null, texts: ['Couple Spa Q1 · massage couple'] }]
    expect(guardUnsupportedClaims('Couple Spa Q1 có dịch vụ massage couple.', { venues: v, sharedTexts: [], userTexts: ['spa couple'] }).rewritten).toEqual([])
    expect(guardUnsupportedClaims('Bạn nên gọi hỏi xem có phòng riêng không.', { venues: [], sharedTexts: [], userTexts: ['phòng riêng'] }).rewritten).toEqual([])
  })
})

// Round 6 (d965363, c40 F8 rep A): a hedge about the PRICE let an unsupported private room through.
describe('R4 — the hedge must govern the claim it sits next to', () => {
  const f8 = JSON.parse(readFileSync(join(EV, 'c40-ab-2026-09-27/head-d965363-claims-A/F8.json'), 'utf8')) as { text: string; prose: string; rows: Array<{ name: string; price?: string }> }
  it('"cũng có phòng riêng nhưng chưa xác nhận được giá cụ thể" → the room is unconfirmed too', () => {
    const r = guardUnsupportedClaims(f8.prose, { venues: venuesOf(f8.rows), sharedTexts: [], userTexts: [f8.text] })
    expect(r.text).not.toMatch(/cũng có phòng riêng/)
    expect(r.text).toContain('mình chưa xác nhận được có phòng riêng nhưng chưa xác nhận được giá cụ thể')
    expect(r.rewritten).toContain('service')
  })
  it('the R1 rewrite ("chưa xác nhận được có X") is never rewritten again', () => {
    const once = guardUnsupportedClaims('Rạp A không có IMAX.', { venues: [], sharedTexts: [], userTexts: ['rạp IMAX'] }).text
    expect(guardUnsupportedClaims(once, { venues: [], sharedTexts: [], userTexts: ['rạp IMAX'] }).text).toBe(once)
  })
})

// Round 6 (d965363): a distance no row carries, and an indirect question R4 garbled.
describe('R5 — c40 P2: a distance no row carries', () => {
  const p2 = JSON.parse(readFileSync(join(EV, 'c40-ab-2026-09-27/head-d965363-claims-B/P2.json'), 'utf8')) as { text: string; prose: string; rows: Array<{ name: string; price?: string; distance_km?: number }> }
  it('"cách bạn khoảng 0.8km" / "cách khoảng 1.2km" go; the pick and its other facts stay', () => {
    expect(p2.rows.every(r => r.distance_km === undefined)).toBe(true)
    const r = guardUnsupportedClaims(p2.prose, { venues: venuesOf(p2.rows), sharedTexts: [], userTexts: [p2.text], distancesKm: [] })
    expect(r.text).not.toMatch(/0\.8km|1\.2km/)
    expect(r.text).toContain('mình gợi ý **Hyan Spa** — có **5⭐ (103 đánh giá)**, chuyên foot spa, mở 10:00–21:00')
    expect(r.rewritten.filter(x => x === 'distance')).toHaveLength(2)
  })
  it('a distance a row carries, or a snippet states, is kept', () => {
    const t = 'Quán A cách bạn khoảng 0.8km. Khách sạn B cách biển 900 m.'
    const r = guardUnsupportedClaims(t, { venues: [], sharedTexts: ['Khách sạn B - cách biển 900 m'], userTexts: ['quan an'], distancesKm: [0.75] })
    expect(r.text).toBe(t)
  })
})

describe('R1/R4 never rewrite an indirect question (golden T2 t2, round 6)', () => {
  it('"không xác nhận rõ rạp nào có phòng IMAX" and "để chắc chắn rạp nào có IMAX" are left as written', () => {
    const t = 'Kết quả không xác nhận rõ rạp nào có phòng IMAX. Để chắc chắn rạp nào có IMAX, bạn nên kiểm tra trên CGV.'
    expect(guardUnsupportedClaims(t, { venues: [], sharedTexts: [], userTexts: ['Rạp chiếu phim IMAX ở TP HCM'] }).text).toBe(t)
  })
})

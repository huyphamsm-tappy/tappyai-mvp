// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardPlanItems } from './planItemGuard'

// ── N3 (30/10): a famous sight in the one-brain plan card is not tagged "(gợi ý chưa kiểm chứng)" ─────────────────────────────────
//
// Measured 30/10 on localhost (1550de4, smoke "gợi ý chỗ đi chơi cuối tuần"): the brochure item "Dạo biển Mỹ Khê" carried
// "(gợi ý chưa kiểm chứng)" - a beach every guide names, written from the model's own knowledge. On the one-brain route a stable fact
// is stated (ONE_BRAIN_CORE, "Be useful, not only careful"). What can change is still not trusted: the item keeps no price, link,
// address or place id, and a description with a figure (hours, a fee) is still replaced - by a plain "check the hours and fee" line.
// Owner 30/10: "để lại nó cũng đâu có giải quyết được câu trả lời cho user".

const plan = (items: unknown[]) => `x [TAPPY_PLAN]${JSON.stringify({ type: 'evening', title: 'Cuối tuần ở Đà Nẵng', days: [{ label: 'Thứ Bảy', items }] })}[/TAPPY_PLAN]`
const items = (r: { text: string }) => JSON.parse(r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]'))).days[0].items
const BEACH = { time: '16:00', category: 'attraction', name: 'Dạo biển Mỹ Khê', description: 'Đi dạo khi trời tạnh, để ý cờ cảnh báo của cứu hộ', price: '50.000đ', maps_link: 'https://x', place_id: 'p9' }
const PLACES = [{ name: 'Wind Garden Coffee', address: '72 Lê Mạnh Trinh', place_types: ['cafe'] }]

describe('N3 · plan card sights on the one-brain route', () => {
  it('one brain: a sight from general knowledge keeps its description, with no "chưa kiểm chứng" tag', () => {
    const it0 = items(guardPlanItems(plan([BEACH]), PLACES, { destination: 'Đà Nẵng', keepSights: true, knownSightsUnlabelled: true }))[0]
    expect(it0.name).toBe('Dạo biển Mỹ Khê')
    expect(it0.description).toBe('Đi dạo khi trời tạnh, để ý cờ cảnh báo của cứu hộ')
  })
  it('one brain: what can change is still dropped - no price, link, place id; a figure in the description is replaced by a plain check line', () => {
    const it0 = items(guardPlanItems(plan([{ ...BEACH, description: 'Mở cửa 05:00–22:00, vé 20.000đ' }]), PLACES, { destination: 'Đà Nẵng', keepSights: true, knownSightsUnlabelled: true }))[0]
    expect(it0.price).toBe('')
    expect(it0.maps_link).toBeUndefined()
    expect(it0.place_id).toBeUndefined()
    expect(it0.description).not.toMatch(/\d/)
    expect(it0.description).toContain('kiểm tra lại')
    expect(it0.description).not.toMatch(/chưa kiểm chứng|kiến thức chung/)
  })
  it('the stream filter asks for it on the one-brain route only (wiring, read from the source)', () => {
    const src = readFileSync(join(__dirname, 'streamEnrichment.ts'), 'utf8')
    expect(src).toContain("...(collector?.oneBrain === true ? { knownSightsUnlabelled: true } : {})")
  })
  it('other routes: the tag and the general-knowledge line stay as before', () => {
    const it0 = items(guardPlanItems(plan([BEACH]), PLACES, { destination: 'Đà Nẵng', keepSights: true }))[0]
    expect(it0.description).toMatch(/\(gợi ý chưa kiểm chứng\)$/)
    const it1 = items(guardPlanItems(plan([{ ...BEACH, description: 'Mở cửa 05:00–22:00' }]), PLACES, { destination: 'Đà Nẵng', keepSights: true }))[0]
    expect(it1.description).toContain('kiến thức chung')
  })
})

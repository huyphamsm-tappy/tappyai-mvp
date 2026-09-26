import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyHardConstraintGate, HARD_GATE_TOOLS, entityTextsOf } from './hardConstraintGate'
import { deriveSituation, type Hard } from './situationFrame'
import { admitsForHard } from './upscale'
import { HARD_GROUP } from './hardConstraints'

// ── A.3 (owner 2026-09-19): ONE choke point, every tool, nothing silent ─────────────────────
//
// The gap classification used to live inside the search_places branch; a hotel turn got no gap
// and no heads-up. Now every tool's execute() passes through `applyHardConstraintGate`.

const need = () => ({ budget: null as never, location: { text: null, gps: null } })
const logs = () => {
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')) })
  return { lines, spy }
}
afterEach(() => vi.restoreAllMocks())

describe('every Hard the code can produce is classified, and the gate applies per tool', () => {
  it('the union and the group table agree (compile-time exhaustive; listed here for the report)', () => {
    const all: Hard[] = ['quiet', 'parking', 'kids', 'vegetarian', 'outdoor', 'private_room', 'late_open', 'delivery', 'air_con', 'view', 'live_music', 'wheelchair', 'upscale']
    for (const h of all) expect(HARD_GROUP[h]).toBeTruthy()
    expect(Object.keys(HARD_GROUP).sort()).toEqual([...all].sort())
  })
  it('applies to search_places and get_hotel_prices only — the two tools whose rows are places', () => {
    expect([...HARD_GATE_TOOLS].sort()).toEqual(['get_hotel_prices', 'search_places'])
  })
})

describe('hotel path (get_hotel_prices) — the gate now fires', () => {
  it('"sang chút" on hotel_list rows with no fancy evidence ⇒ gap, note, stream context', () => {
    const situation = deriveSituation(['Resort Phú Quốc cho kỷ niệm 1 năm, sang chút'], need())
    const result: Record<string, unknown> = { hotel_list: [{ name: 'Rio Guest House Phú Quốc', place_types: ['Khách sạn'] }, { name: 'The Poplar Resort', place_types: ['Khách sạn'] }] }
    const { lines } = logs()
    const out = applyHardConstraintGate('get_hotel_prices', result, situation, 'vi')
    expect(out.applicable).toBe(true)
    expect(out.report?.gaps).toEqual(['upscale'])
    expect(result._tappy_hard_gaps).toEqual(['upscale'])
    expect(String(result._tappy_evidence_note)).toContain('mức sang trọng')
    expect(lines.some(l => l.includes('"step":"attributes"') && l.includes('"tool":"get_hotel_prices"'))).toBe(true)
  })
  it('a hotel row whose category text carries the evidence supports the constraint', () => {
    const situation = deriveSituation(['khách sạn Đà Nẵng có view biển'], need())
    expect(situation.hard).toContain('view')
    const result: Record<string, unknown> = { hotel_list: [{ name: 'Sea View Hotel', place_types: ['Khách sạn view biển'] }] }
    const out = applyHardConstraintGate('get_hotel_prices', result, situation, 'vi')
    expect(out.report?.gaps).toEqual([])
    expect('_tappy_hard_gaps' in result).toBe(false)
  })
})

describe('places path (search_places) — late_open is judged on opening_hours (A.2)', () => {
  const situation = deriveSituation(['Spa nào mở khuya sau 22h ở Quận 3'], need())
  it('the situation reads late_open', () => expect(situation.hard).toContain('late_open'))
  it('only rows closing late vouch; the note names them; the shortlist admits only them', () => {
    const rows = [
      { name: 'Massage Cổ Phong Q3', opening_hours: '09:00–22:00', rating_value: 4.9, rating_count: 12190 },
      { name: 'Charm Spa Garden', opening_hours: '10:00–00:00', rating_value: 4.9, rating_count: 217 },
    ]
    const result: Record<string, unknown> = { results: rows }
    const out = applyHardConstraintGate('search_places', result, situation, 'vi')
    expect(out.report?.rowBacked).toEqual(['late_open'])
    expect(result._tappy_hard_backed_by).toEqual({ late_open: ['Charm Spa Garden'] })
    expect(String(result._tappy_evidence_note)).toContain('Charm Spa Garden')
    expect(admitsForHard(situation.hard, { name: rows[0].name, raw: rows[0] }, { anyRowClosesLate: true })).toEqual({ admitted: false, reason: 'late_open' })
    expect(admitsForHard(situation.hard, { name: rows[1].name, raw: rows[1] }, { anyRowClosesLate: true })).toEqual({ admitted: true, reason: null })
  })
  it('no row carries opening_hours ⇒ gap + field missing; nothing is excluded from the shortlist (there is no evidence to prefer)', () => {
    const rows = [{ name: 'A' }, { name: 'B' }]
    const result: Record<string, unknown> = { results: rows }
    const out = applyHardConstraintGate('search_places', result, situation, 'vi')
    expect(out.report?.gaps).toEqual(['late_open'])
    expect(out.report?.fieldMissing).toEqual(['late_open'])
    expect(String(result._tappy_evidence_note)).toContain('giờ mở khuya')
    expect(admitsForHard(situation.hard, { name: 'A', raw: rows[0] }, { anyRowClosesLate: false }).admitted).toBe(true)
  })
})

describe('tools the gate does not apply to are logged, never silent', () => {
  it.each(['get_transport_options', 'get_flight_prices', 'get_weather', 'web_search', 'some_future_tool'])('%s with a stated hard constraint logs hard_not_applicable', (tool) => {
    const situation = deriveSituation(['quán yên tĩnh có chỗ đậu xe'], need())
    const { lines } = logs()
    const out = applyHardConstraintGate(tool, { shopping_results: [{ title: 'x' }] }, situation, 'vi')
    expect(out.applicable).toBe(false)
    expect(lines.some(l => l.includes('"step":"hard_not_applicable"') && l.includes(`"tool":"${tool}"`) && l.includes('"quiet"'))).toBe(true)
  })
  // B1 (2026-09-20): search_products is no longer "not applicable" — it is judged against the
  // shopping constraints (the product unit's own vocabulary), and annotates the result the same way.
  it('search_products is judged against the SHOPPING constraints: gaps annotated, evidence note written, budget gap detected', () => {
    const situation = deriveSituation(['nước hoa 100ml cho mẹ, còn hàng, tầm 2 triệu'], need())
    const { lines } = logs()
    const result = { search_results: [{ title: 'Nước hoa Chanel Chance 50ml', price: 3_200_000 }, { title: 'Nước hoa Dior 100ml' }] } as Record<string, unknown>
    const k = { productType: 'perfume', unknownType: null, brand: null, budget: { min: 0, max: 2_000_000, type: 'under' as const }, ramGb: null, storageGb: null, size: null, variant: '100ml', inStock: true, recipient: 'me', wantsAccessory: false }
    const out = applyHardConstraintGate('search_products', result, situation, 'vi', { shopping: k })
    expect(out.applicable).toBe(true)
    expect(out.report?.gaps).toEqual(['in_stock', 'recipient'])
    expect(result._tappy_hard_gaps).toEqual(['in_stock', 'recipient'])
    expect(result._tappy_hard_backed_by).toEqual({ variant: ['Nước hoa Dior 100ml'] })
    expect(String(result._tappy_evidence_note)).toContain('KHONG listing nao xac nhan')
    expect(out.budgetGap).toBe(false)
    expect(lines.some(l => l.includes('"step":"attributes"') && l.includes('"tool":"search_products"'))).toBe(true)
    expect(lines.some(l => l.includes('hard_not_applicable'))).toBe(false)
  })
  it('search_products with no shopping constraints handed over is not applicable (nothing to judge)', () => {
    const situation = deriveSituation(['quán yên tĩnh'], need())
    expect(applyHardConstraintGate('search_products', { search_results: [] }, situation, 'vi').applicable).toBe(false)
  })
  it('no situation (flag OFF / no frame) ⇒ nothing happens and nothing is logged', () => {
    const { lines } = logs()
    expect(applyHardConstraintGate('search_places', { results: [{ name: 'A' }] }, null, 'vi').applicable).toBe(false)
    expect(lines).toEqual([])
  })
})

describe('an unknown constraint name through the gate ⇒ gap AND a logged warning', () => {
  it('sauna_xyz is EVIDENCE_REQUIRED, becomes a gap on the result, and warns with its value', () => {
    const situation = deriveSituation(['quán ăn tối'], need())
    situation.hard = ['sauna_xyz' as Hard]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result: Record<string, unknown> = { results: [{ name: 'A' }] }
    const out = applyHardConstraintGate('search_places', result, situation, 'vi')
    expect(out.report?.gaps).toEqual(['sauna_xyz'])
    expect(out.report?.unclassified).toEqual(['sauna_xyz'])
    expect(result._tappy_hard_gaps).toEqual(['sauna_xyz'])
    expect(warn.mock.calls.some(c => String(c[0]).includes('"hard":"sauna_xyz"'))).toBe(true)
  })
})

describe('entityTextsOf reads places and hotels alike', () => {
  it('hotel_list category words are entity text', () => {
    const t = entityTextsOf({ hotel_list: [{ name: 'H', place_types: ['Resort sang trọng'] }] })
    expect(t.get('H')).toEqual(['H · Resort sang trọng'])
  })
})

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlanItems, groundedSightDescription, type PlanPlace } from './planItemGuard'
import { agentSystemV2For } from './agent/runtime/consultativeVoice'

// Real Maps rows of the Round 23 / Round 24 Nha Trang turns (audit trace, fields as the guard saw them).
const THAP_TRAM_HUONG: PlanPlace = { name: 'Tháp Trầm Hương', place_id: 'ChIJEwTU1HtncDERBl13UGJnQ3Y', address: 'Trần Phú Hai tháng Tư, Quảng trường, Nha Trang, Khánh Hòa 650000, Việt Nam', opening_hours: 'Mở cửa cả ngày', place_types: ['Điểm thu hút khách du lịch', 'Công viên'] }
const THAP_BA: PlanPlace = { name: 'Tháp Bà Ponagar', place_id: 'ChIJUfK4YYxncDERfB2v8ZdvXxE', address: '61 Hai Tháng Tư, Bắc Nha Trang, Khánh Hòa 650000, Việt Nam', opening_hours: '06:00–18:00', place_types: ['Điểm thu hút khách du lịch'] }
const LONG_SON: PlanPlace = { name: 'Chùa Long Sơn', place_id: 'ChIJ6VnfP3ldcDERHoQBNdIRQhs', address: '22 Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', opening_hours: 'Mở cửa cả ngày', place_types: ['Điểm thu hút khách du lịch', 'Chùa', 'Chùa phật giáo'] }
const SHAKTI: PlanPlace = { name: 'SHAKTI VEGGIES BISTRO ( Chay )', place_id: 'ChIJuaGUcptncDERmRbCeVeIFiI', address: '31 Đ. Huỳnh Thúc Kháng, Nha Trang, Khánh Hòa 57000, Việt Nam', opening_hours: '07:00–21:15', place_types: ['Nhà hàng cho người ăn chay', 'Nhà hàng ăn chay', 'Nhà hàng món chay'] }
const SEN_VANG: PlanPlace = { name: 'Quán Chay Sen Vàng', place_id: 'ChIJ14yockBdcDERExgSvHklZRg', address: '01 Lạc Long Quân, Nha Trang, Khánh Hòa 650000, Việt Nam', opening_hours: '06:00–20:00', place_types: ['Quán ăn nhỏ'] }
const ROWS = [THAP_TRAM_HUONG, THAP_BA, LONG_SON, SHAKTI, SEN_VANG]

const wrap = (days: unknown[]) => `Lead.\n\n[TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Nha Trang', people: 2, days })}[/TAPPY_PLAN]`
const daysOf = (text: string) => (JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]')).trim()) as { days: Array<{ items: Array<Record<string, unknown>> }> }).days
const ON = { destination: 'Nha Trang', keepSights: true, vegetarian: true }
const OFF = { destination: 'Nha Trang' }

// Round 23 live: the model's description of Tháp Trầm Hương (row has no "ven biển").
const MODEL_DESC = 'Ghé khu quảng trường ven biển, tham quan nhẹ nhàng trước bữa tối.'

describe('1(a) a sight\'s description claims only what its row supports', () => {
  it('flag on: "ven biển" is not in the row → neutral description from the row (categories + hours)', () => {
    const out = groundedSightDescription(MODEL_DESC, THAP_TRAM_HUONG)
    expect(out).toBe('Điểm thu hút khách du lịch, Công viên; theo dữ liệu tra cứu: Mở cửa cả ngày.')
    expect(String(out)).not.toMatch(/biển|quảng trường/i)
  })
  it('a claim the row DOES support stays: "quảng trường" is in the address; the Tháp Bà Ponagar real description has no scene claim', () => {
    const ok = 'Ghé khu quảng trường, tham quan nhẹ nhàng trước bữa tối.'
    expect(groundedSightDescription(ok, THAP_TRAM_HUONG)).toBe(ok)
    const ba = 'Tham quan cụm tháp; dữ liệu tra cứu ghi giờ hoạt động 06:00–18:00.'
    expect(groundedSightDescription(ba, THAP_BA)).toBe(ba)
  })
  it('through guardPlanItems: flag on rewrites it, flag off leaves the model\'s text untouched', () => {
    const plan = wrap([{ label: 'Ngày 1', items: [{ time: '17:30', category: 'attraction', name: 'Tháp Trầm Hương', description: MODEL_DESC }] }])
    expect(daysOf(guardPlanItems(plan, ROWS, ON).text)[0].items[0].description).toBe('Điểm thu hút khách du lịch, Công viên; theo dữ liệu tra cứu: Mở cửa cả ngày.')
    expect(daysOf(guardPlanItems(plan, ROWS, OFF).text)[0].items[0].description).toBe(MODEL_DESC)
  })
})

// Round 24 live, day 3 as the MODEL wrote it (audit trace) after day 1 already used Tháp Trầm Hương.
const DAY1 = { label: 'Ngày 1', items: [{ time: '20:30', category: 'entertainment', name: 'Tháp Trầm Hương và quảng trường ven biển', description: 'Ngắm biển, dạo nhẹ khu quảng trường.' }] }
const DAY3 = {
  label: 'Ngày 3', items: [
    { time: '07:30', category: 'food', name: 'SHAKTI VEGGIES BISTRO ( Chay )', description: 'Ăn sáng chay; hỏi trước món và giờ phục vụ ngày đi.' },
    { time: '09:00', category: 'hotel', name: 'Trả phòng, gửi hành lý', description: 'Thu xếp hành lý và hỏi chỗ ở có thể giữ hành lý đến giờ khởi hành hay không.' },
    { time: '10:00', category: 'attraction', name: 'Tháp Trầm Hương và khu ven biển', description: 'Ghé lại khu trung tâm chụp ảnh, nghỉ chân.' },
    { time: '11:30', category: 'food', name: 'Quán Chay Sen Vàng', description: 'Ăn trưa chay trước khi khởi hành; xác nhận trước quán phục vụ đúng giờ.' },
    { time: '13:00', category: 'transport', name: 'Lấy hành lý và ra điểm đón xe', description: 'Chừa thời gian di chuyển ra bến/điểm đón.' },
    { time: '14:00', category: 'transport', name: 'Di chuyển Nha Trang → TP.HCM', description: 'Chọn chuyến về phù hợp giờ trả phòng.' },
  ],
}
const names = (items: Array<Record<string, unknown>>) => items.map(i => i.name)

describe('2 the return day keeps check-out and the way home, restaurants need vegetarian data', () => {
  it('flag on (real day 3): check-out kept as a plain stop; the repeated sight is dropped; Sen Vàng ("Quán ăn nhỏ" only) is a slot; Shakti (vegetarian place_types) stays', () => {
    const d3 = daysOf(guardPlanItems(wrap([DAY1, DAY3]), ROWS, ON).text)[1].items
    expect(names(d3)).toEqual(['SHAKTI VEGGIES BISTRO ( Chay )', 'Trả phòng, gửi hành lý', 'Ăn trưa gần chỗ ở', 'Lấy hành lý và ra điểm đón xe', 'Di chuyển Nha Trang → TP.HCM'])
    const out = d3.find(i => i.name === 'Trả phòng, gửi hành lý')!
    expect(out.category).toBe('rest')
    for (const f of ['address', 'maps_link', 'place_id', 'booking_link']) expect(out[f]).toBeUndefined()
  })
  it('flag off (control): the generic check-out is dropped exactly as before', () => {
    const d3 = daysOf(guardPlanItems(wrap([DAY1, DAY3]), ROWS, OFF).text)[1].items
    expect(names(d3)).not.toContain('Trả phòng, gửi hành lý')
  })
  it('an invented hotel NAME with no row is still dropped with the flag on', () => {
    const plan = wrap([{ label: 'Ngày 1', items: [{ time: '15:00', category: 'hotel', name: 'Khách sạn Lotus Bay', description: 'Nhận phòng.' }] }])
    expect(daysOf(guardPlanItems(plan, ROWS.filter(r => r !== SEN_VANG), ON).text)[0].items).toEqual([])
  })
  it('a famous sight named from general knowledge (no row) is kept by NAME only and marked unverified; flag off drops it', () => {
    const plan = wrap([{ label: 'Ngày 3', items: [{ time: '10:00', category: 'attraction', name: 'Nhà thờ Núi', description: 'Ngắm nhà thờ đá cổ.', address: '1 Thái Nguyên', maps_link: 'https://maps.google.com/?cid=1', price: '50.000đ' }] }])
    const it = daysOf(guardPlanItems(plan, ROWS, ON).text)[0].items[0]
    expect(it.name).toBe('Nhà thờ Núi')
    expect(it.description).toBe('Ngắm nhà thờ đá cổ. (gợi ý chưa kiểm chứng)')
    for (const f of ['address', 'maps_link', 'place_id']) expect(it[f]).toBeUndefined()
    expect(it.price).toBe('')
    // flag off (control): the old behaviour — the unknown sight is swapped for an unused retrieved attraction, never kept by name
    expect(names(daysOf(guardPlanItems(plan, ROWS, OFF).text)[0].items)).not.toContain('Nhà thờ Núi')
  })
  it('a description that already says it is general knowledge is not marked twice', () => {
    const plan = wrap([{ label: 'Ngày 3', items: [{ time: '10:00', category: 'attraction', name: 'Nhà thờ Núi', description: 'Điểm nổi tiếng (gợi ý từ kiến thức chung).' }] }])
    expect(daysOf(guardPlanItems(plan, ROWS, ON).text)[0].items[0].description).toBe('Điểm nổi tiếng (gợi ý từ kiến thức chung).')
  })
})

describe('prompt (flag on only)', () => {
  it('states the return-day rule; flag off has none of it', () => {
    expect(agentSystemV2For(true)).toContain('Ngày về của kế hoạch không để trống')
    expect(agentSystemV2For(false)).not.toContain('Ngày về của kế hoạch không để trống')
  })
})

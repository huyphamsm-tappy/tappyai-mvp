// @vitest-environment node
import { describe, it as test, expect } from 'vitest'
import { guardPlanItems, type PlanPlace } from './planItemGuard'

// Round 26: a thin return day is topped up from the turn's OWN results (flag on only). Fixtures = the Round 25 live turn on 3018 (audit trace): the model's plan as
// written and the get_trip_data rows of that turn (compact: the fields the guard reads).
const row = (name: string, place_id: string, address: string, opening_hours: string | undefined, place_types: string[]): PlanPlace =>
  ({ name, place_id, address, ...(opening_hours ? { opening_hours } : {}), place_types })
const HOTELS = [
  row('Seaside', 'ChIJNQW5RXxncDERCeti-smSCvg', '70 Đống Đa, Nha Trang, Khánh Hòa 650000, Việt Nam', undefined, ['Khách sạn']),
  row('Mercure Nha Trang Beach', 'ChIJV5-fj4xncDERWVExWsE1GCg', '88A Trần Phú, Nha Trang, Khánh Hòa 57100, Việt Nam', undefined, ['Khách sạn']),
]
const BA = row('Tháp Bà Ponagar', 'ChIJUfK4YYxncDERfB2v8ZdvXxE', '61 Hai Tháng Tư, Bắc Nha Trang, Khánh Hòa 650000, Việt Nam', '06:00–18:00', ['Điểm thu hút khách du lịch'])
const TRAM = row('Tháp Trầm Hương', 'ChIJEwTU1HtncDERBl13UGJnQ3Y', 'Trần Phú Hai tháng Tư, Quảng trường, Nha Trang, Khánh Hòa 650000, Việt Nam', 'Mở cửa cả ngày', ['Điểm thu hút khách du lịch', 'Công viên'])
const HON_TAM = row('Đảo Hòn Tằm', 'ChIJ-b9_ywNhcDERqvfgsQl7cnM', 'Đảo Hòn Tằm, Nha Trang, Khánh Hòa 650000, Việt Nam', 'Mở cửa cả ngày', ['Điểm thu hút khách du lịch'])
const ROBINSON = row('Robinson Beach Nha Trang', 'ChIJhXw0rLRlcDERiXwSJn5zot0', 'Đảo Hòn Tre, Nha Trang, Khánh Hòa 650000, Việt Nam', 'Mở cửa cả ngày', ['Điểm thu hút khách du lịch', 'Nhà chòi trên bãi biển', 'Nơi tổ chức sự kiện'])
const CAP_TREO = row('Cáp Treo Vinpearl Harbour Nha Trang - Đảo', 'ChIJ1T5opB5ncDERLumb5cHIZKE', 'Nha Trang, Khánh Hòa, Việt Nam', '07:00–17:30', ['Điểm thu hút khách du lịch'])
const HAI_DUONG = row('Bảo Tàng Hải Dương Học', 'ChIJ____YjZncDERGNP0e4TWvWw', '1 Cầu Đá - Hòn Một, Cầu Đá, Nha Trang, Khánh Hòa 650000, Việt Nam', '06:00–18:00', ['Điểm thu hút khách du lịch', 'Viện nghiên cứu', 'Bảo tàng'])
const BAI_TRANH = row('Bãi Tranh Nha Trang', 'ChIJs1Dr-dpgcDERpoTmal9PkHc', 'Nha Trang, Khánh Hòa, Việt Nam', '07:00–17:00', ['Điểm thu hút khách du lịch', 'Bãi biển công cộng'])
const VINWONDERS = row('VinWonders Nha Trang', 'ChIJUXQmxMdncDERI-V3_g5la4I', 'Đảo Hòn Tre, Nha Trang, Khánh Hòa, Việt Nam', undefined, ['Công viên giải trí', 'Công viên xe dã ngoại'])
const BACH_DANG = row('Công viên Bạch Đằng', 'ChIJBzs5uEZncDERU_cwDiDSh40', 'Trần Phú, Nha Trang, Khánh Hòa, Việt Nam', 'Mở cửa cả ngày', ['Điểm thu hút khách du lịch', 'Công viên'])
const LONG_SON = row('Chùa Long Sơn', 'ChIJ6VnfP3ldcDERHoQBNdIRQhs', '22 Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', 'Mở cửa cả ngày', ['Điểm thu hút khách du lịch', 'Chùa', 'Chùa phật giáo'])
const YEN = row('Yên Nhà Hàng Chay & Yoga Nha Trang', 'ChIJfzuRr_lncDERy_9HqtTi7EE', '46/9 Đ. Lê Thánh Tôn, Nha Trang, Khánh Hòa 650000, Việt Nam', '00:00–14:00, 16:00–21:00', ['Nhà hàng cho người ăn chay'])
const BUT_VIET = row('Nhà Hàng Chay Bụt Việt - Nha Trang', 'ChIJ_c1HlnZncDERzHVa3R_JPfA', '74-76 Đống Đa, phường, Nha Trang, Khánh Hòa 650000, Việt Nam', '10:30–14:00, 16:30–21:00', ['Nhà hàng cho người ăn chay'])
const TUE_NGUYEN = row('Nhà Hàng Chay Tuệ Nguyên - Nha Trang', 'ChIJW-MFEUVdcDERcOxUGtTeono', '12C Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', '06:30–21:00', ['Nhà hàng cho người ăn chay'])
const HOAN_HY = row('Nhà hàng chay Hoan Hỷ', 'ChIJAcjAk31ncDER7wvANJkRiTY', '47b Đ. Lê Đại Hành, Nha Trang, Khánh Hòa 650000, Việt Nam', '06:15–21:30', ['Nhà hàng'])
const SENTA = row('Senta Vegetarian', 'ChIJq2z_InxncDERPXYRWSrnReY', '11 Yersin, Nha Trang, Khánh Hòa 650000, Việt Nam', '10:00–22:00', ['Nhà hàng cho người ăn chay'])
const ROWS = [...HOTELS, BA, TRAM, HON_TAM, ROBINSON, CAP_TREO, HAI_DUONG, BAI_TRANH, VINWONDERS, BACH_DANG, LONG_SON, YEN, BUT_VIET, TUE_NGUYEN, HOAN_HY, SENTA]

type It = Record<string, unknown>
const it = (time: string, category: string, name: string, description: string, address = '', place_id = ''): It => ({ time, category, name, description, address, place_id })
const LIVE_DAYS = [
  { label: 'Ngày 1', items: [
    it('Sáng', 'transport', 'Di chuyển từ TP.HCM đến Nha Trang', 'Đi xe khách hoặc tàu; chọn chuyến đến trước buổi trưa để còn thời gian nhận phòng và nghỉ. Thời gian di chuyển tùy chuyến, chưa có dữ liệu giờ cụ thể.'),
    it('Trưa', 'hotel', 'Nhận phòng và nghỉ ngơi', 'Chọn khách sạn khu trung tâm để tiện gọi xe đến các điểm ăn uống, tham quan; thời gian di chuyển giữa các điểm là ước tính và tùy giao thông.'),
    it('Chiều', 'attraction', 'Tháp Bà Ponagar', 'Tham quan quần thể tháp; đi xe công nghệ từ khu trung tâm, thời gian di chuyển ước tính khoảng 10–20 phút tùy điểm xuất phát.', '61 Hai Tháng Tư, Bắc Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJUfK4YYxncDERfB2v8ZdvXxE'),
    it('Tối', 'food', 'Nhà Hàng Chay Bụt Việt - Nha Trang', 'Ăn tối món chay; đi xe từ khu trung tâm, thời gian di chuyển ước tính khoảng 5–15 phút tùy điểm xuất phát. Hỏi trước về món và giờ phục vụ khi đến.', '74-76 Đống Đa, phường, Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJ_c1HlnZncDERzHVa3R_JPfA'),
    it('Sau bữa tối', 'entertainment', 'Tháp Trầm Hương', 'Dạo ngắm khu vực quảng trường và ven biển; có thể gọi xe đến gần điểm rồi đi một đoạn ngắn tùy chỗ xuống.', 'Trần Phú Hai tháng Tư, Quảng trường, Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJEwTU1HtncDERBl13UGJnQ3Y'),
  ] },
  { label: 'Ngày 2', items: [
    it('Sáng', 'food', 'Yên Nhà Hàng Chay & Yoga Nha Trang', 'Ăn sáng hoặc dùng bữa nhẹ; gọi xe từ khách sạn, thời gian di chuyển ước tính khoảng 5–15 phút tùy điểm xuất phát.', '46/9 Đ. Lê Thánh Tôn, Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJfzuRr_lncDERy_9HqtTi7EE'),
    it('Cuối buổi sáng', 'attraction', 'Bảo Tàng Hải Dương Học', 'Tham quan bảo tàng; đi xe công nghệ từ khu trung tâm, thời gian di chuyển ước tính khoảng 15–25 phút tùy giao thông.', '1 Cầu Đá - Hòn Một, Cầu Đá, Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJ____YjZncDERGNP0e4TWvWw'),
    it('Trưa', 'food', 'Senta Vegetarian', 'Ăn trưa món chay rồi về khách sạn nghỉ; gọi xe giữa các điểm, thời gian di chuyển ước tính khoảng 10–20 phút tùy giao thông.', '11 Yersin, Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJq2z_InxncDERPXYRWSrnReY'),
    it('Chiều', 'rest', 'Nghỉ tại khách sạn', 'Dành thời gian nghỉ chân, tránh xếp quá nhiều điểm để chuyến đi nhẹ nhàng hơn.'),
    it('Tối', 'food', 'Nhà hàng chay Hoan Hỷ', 'Ăn tối món chay; gọi xe từ khách sạn, thời gian di chuyển ước tính khoảng 5–15 phút tùy điểm xuất phát.', '47b Đ. Lê Đại Hành, Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJAcjAk31ncDER7wvANJkRiTY'),
    it('Sau bữa tối', 'entertainment', 'Công viên Bạch Đằng', 'Ngồi thư thả ở công viên ven biển; gọi xe đến gần để hạn chế đi bộ.', 'Trần Phú, Nha Trang, Khánh Hòa, Việt Nam', 'ChIJBzs5uEZncDERU_cwDiDSh40'),
  ] },
  { label: 'Ngày 3', items: [
    it('Sáng', 'food', 'Nhà Hàng Chay Tuệ Nguyên - Nha Trang', 'Ăn sáng món chay; gọi xe từ khách sạn, thời gian di chuyển ước tính khoảng 10–20 phút tùy điểm xuất phát.', '12C Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJW-MFEUVdcDERcOxUGtTeono'),
    it('Giữa buổi sáng', 'attraction', 'Chùa Long Sơn', 'Ghé chùa trước khi về; đây là gợi ý tham quan, bạn nên cân nhắc sức đi lại tại chỗ và gọi xe đến gần điểm.', '22 Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJ6VnfP3ldcDERHoQBNdIRQhs'),
    it('Trưa', 'hotel', 'Trả phòng, lấy hành lý', 'Thu xếp hành lý và trả phòng; chừa thời gian dự phòng trước giờ xe hoặc tàu khởi hành.'),
    it('Đầu giờ chiều', 'transport', 'Nha Trang về TP.HCM', 'Ra bến xe hoặc ga theo vé đã đặt; giờ khởi hành và thời gian đi tùy chuyến, chưa có dữ liệu cụ thể.'),
  ] },
]
const wrap = (days: unknown[]) => `Lead.\n\n[TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Nha Trang đôi – 3 ngày 2 đêm', people: 2, days })}[/TAPPY_PLAN]`
const daysOf = (text: string) => (JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]')).trim()) as { days: Array<{ items: It[] }> }).days
const names = (items: It[]) => items.map(i => String(i.name))
const ON = { destination: 'Nha Trang', keepSights: true, vegetarian: true }
const OFF = { destination: 'Nha Trang' }

describe('return day topped up from the turn\'s own results (flag on)', () => {
  test('real Round 25 turn: day 3 had 4 stops → the one valid unused inland sight (Bãi Tranh) is added before the check-out; nothing on an island, no amusement park', () => {
    const out = guardPlanItems(wrap(LIVE_DAYS), ROWS, ON)
    const d3 = daysOf(out.text)[2].items
    expect(names(d3)).toEqual(['Nhà Hàng Chay Tuệ Nguyên - Nha Trang', 'Chùa Long Sơn', 'Bãi Tranh Nha Trang', 'Seaside', 'Nha Trang về TP.HCM'])
    const added = d3[2]
    expect(added.time).toBe('Trước khi trả phòng')
    expect(added.category).toBe('attraction')
    expect(added.description).toBe('Gợi ý thêm từ kết quả tra cứu: Điểm thu hút khách du lịch, Bãi biển công cộng; theo dữ liệu tra cứu: 07:00–17:00.')
    expect(added.address).toBe('Nha Trang, Khánh Hòa, Việt Nam')
    expect(added.place_id).toBe('ChIJs1Dr-dpgcDERpoTmal9PkHc')
    expect(added.price).toBe('')
    const all = JSON.stringify(daysOf(out.text))
    for (const bad of ['Đảo Hòn Tằm', 'Robinson Beach', 'Cáp Treo', 'VinWonders']) expect(all).not.toContain(bad)
    expect(out.returnDayFilled).toBe(1)
    // the way home and the check-out are still there; days 1 and 2 are not touched by the top-up
    expect(names(d3)).toContain('Nha Trang về TP.HCM')
    expect(daysOf(out.text)[0].items).toHaveLength(5)
    expect(daysOf(out.text)[1].items).toHaveLength(6)
  })
  test('the added stop is not a repeat: nothing of days 1-2 is reused', () => {
    const d3 = daysOf(guardPlanItems(wrap(LIVE_DAYS), ROWS, ON).text)[2].items
    const earlier = new Set(daysOf(wrap(LIVE_DAYS)).slice(0, 2).flatMap(d => names(d.items)))
    expect(names(d3).filter(n => earlier.has(n))).toEqual([])
  })
  test('no valid candidate (the only inland unused sight is gone) → the plan is left as it is: 4 stops, honest', () => {
    const out = guardPlanItems(wrap(LIVE_DAYS), ROWS.filter(r => r !== BAI_TRANH), ON)
    expect(daysOf(out.text)[2].items).toHaveLength(4)
    expect(out.returnDayFilled).toBeUndefined()
  })
  test('a day that already has 5 stops is not touched (second pass over the result adds nothing)', () => {
    const once = guardPlanItems(wrap(LIVE_DAYS), ROWS, ON)
    const twice = guardPlanItems(once.text, ROWS, ON)
    expect(daysOf(twice.text)[2].items).toHaveLength(5)
    expect(twice.returnDayFilled).toBeUndefined()
  })
  test('clock times on both sides: a gap under 2 h takes nothing; a gap of 2 h or more takes the stop at a half-hour', () => {
    const tight = [LIVE_DAYS[0], { label: 'Ngày 2', items: [it('08:00', 'food', 'Nhà Hàng Chay Tuệ Nguyên - Nha Trang', 'Ăn sáng chay.', '12C Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJW-MFEUVdcDERcOxUGtTeono'), it('09:30', 'hotel', 'Trả phòng, lấy hành lý', 'Trả phòng.'), it('11:00', 'transport', 'Nha Trang về TP.HCM', 'Về.')] }]
    expect(daysOf(guardPlanItems(wrap(tight), ROWS, ON).text)[1].items.map(i => i.name)).not.toContain('Bãi Tranh Nha Trang')
    const roomy = [LIVE_DAYS[0], { label: 'Ngày 2', items: [it('08:00', 'food', 'Nhà Hàng Chay Tuệ Nguyên - Nha Trang', 'Ăn sáng chay.', '12C Đ. 23 Tháng 10, Tây Nha Trang, Khánh Hòa 650000, Việt Nam', 'ChIJW-MFEUVdcDERcOxUGtTeono'), it('12:00', 'hotel', 'Trả phòng, lấy hành lý', 'Trả phòng.'), it('14:00', 'transport', 'Nha Trang về TP.HCM', 'Về.')] }]
    const d = daysOf(guardPlanItems(wrap(roomy), ROWS, ON).text)[1].items
    const added = d.find(i => i.name === 'Bãi Tranh Nha Trang')!
    expect(added.time).toBe('09:00')
    expect(d.indexOf(added)).toBe(1)
  })
  test('a plan of one day is never topped up', () => {
    const one = [{ label: 'Ngày 1', items: [LIVE_DAYS[2].items[0], LIVE_DAYS[2].items[2], LIVE_DAYS[2].items[3]] }]
    expect(daysOf(guardPlanItems(wrap(one), ROWS, ON).text)[0].items.map(i => i.name)).not.toContain('Bãi Tranh Nha Trang')
  })
})

describe('flag off (control)', () => {
  test('without keepSights nothing is added to the return day', () => {
    const out = guardPlanItems(wrap(LIVE_DAYS), ROWS, OFF)
    expect(names(daysOf(out.text)[2].items)).not.toContain('Bãi Tranh Nha Trang')
    expect(out.returnDayFilled).toBeUndefined()
  })
})

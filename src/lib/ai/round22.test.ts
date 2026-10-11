// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlanItems } from './planItemGuard'
import { guardPlanTripFacts } from './planTripFactsGuard'
import { appendPlanBudget } from './planBudget'
import { stripOrphanSourceLabels, dedupeCaveats } from './caveatDedupe'
import { stripClosingInvite } from './closingInvite'
import { agentSystemV2For } from './agent/runtime/consultativeVoice'

// ── Nha Trang, Round 21 live run on 3018 (audit trace, the plan the MODEL wrote before `plan_items`, verbatim names / times / categories) ──────────
const MODEL_PLAN = {"type":"trip","title":"Nha Trang 3 ngày 2 đêm — khám phá nhẹ nhàng, ăn chay","people":2,"days":[{"label":"Ngày 1 — Thứ bảy 17/10","items":[{"time":"06:00","category":"transport","name":"Di chuyển TP.HCM → Nha Trang","description":"Gợi ý đi xe khách đêm"},{"time":"08:00","category":"hotel","name":"Khách sạn khu trung tâm Nha Trang","description":"Gửi hành lý hoặc nhận phòng"},{"time":"09:00","category":"attraction","name":"Tháp Bà Ponagar","description":"Tham quan cụm di tích"},{"time":"11:30","category":"food","name":"Yên Nhà Hàng Chay & Yoga Nha Trang","description":"Ăn trưa chay"},{"time":"13:00","category":"rest","name":"Nghỉ trưa và nhận phòng","description":"Về cùng khách sạn nghỉ ngơi"},{"time":"16:30","category":"attraction","name":"Tháp Trầm Hương và bờ biển Trần Phú","description":"Ngắm biển"},{"time":"18:30","category":"food","name":"Nhà Hàng Chay Bụt Việt - Nha Trang","description":"Bữa tối chay"},{"time":"20:00","category":"entertainment","name":"Ngắm biển buổi tối","description":"Chọn một đoạn ven biển"}]},{"label":"Ngày 2 — Chủ nhật 18/10","items":[{"time":"08:00","category":"food","name":"Senta Vegetarian","description":"Ăn sáng/brunch chay"},{"time":"09:30","category":"attraction","name":"Bảo Tàng Hải Dương Học","description":"Tham quan trong nhà"},{"time":"12:00","category":"food","name":"Nhà Hàng Chay Tuệ Nguyên - Nha Trang","description":"Ăn trưa chay"},{"time":"13:30","category":"rest","name":"Nghỉ tại khách sạn","description":"Nghỉ trưa"},{"time":"16:00","category":"attraction","name":"Chùa Long Sơn","description":"Ghé chùa"},{"time":"18:30","category":"food","name":"Quán Chay Sen Vàng","description":"Ăn tối chay"},{"time":"20:00","category":"entertainment","name":"Thư giãn ở khu trung tâm","description":"Chọn quán nước hoặc ngồi nghỉ gần khách sạn"}]},{"label":"Ngày 3 — Thứ hai 19/10","items":[{"time":"08:00","category":"food","name":"Nhà Hàng Chay Bụt Việt - Nha Trang","description":"Ăn sáng muộn/brunch chay"},{"time":"10:30","category":"hotel","name":"Trả phòng, gửi hành lý","description":"Trả phòng tại khách sạn đã ở hai đêm"},{"time":"11:00","category":"food","name":"Nhà Hàng Chay Tuệ Nguyên - Nha Trang","description":"Bữa trưa chay trước khi khởi hành"},{"time":"12:30","category":"rest","name":"Lấy hành lý và ra bến xe","description":"Gọi xe tới bến"},{"time":"14:00","category":"transport","name":"Di chuyển Nha Trang → TP.HCM","description":"Gợi ý chọn chuyến chiều"}]}]}
// the venues get_trip_data returned (names as the guard saw them; addresses name the city)
const POOL = [
  { name: 'Seaside', address: '70 Đống Đa, Nha Trang, Khánh Hòa', place_types: ['khách sạn'] },
  { name: 'Yên Nhà Hàng Chay & Yoga Nha Trang', address: '46/9 Lê Thánh Tôn, Nha Trang', place_types: ['nhà hàng chay'] },
  { name: 'Nhà Hàng Chay Bụt Việt - Nha Trang', address: '74-76 Đống Đa, Nha Trang', place_types: ['nhà hàng chay'] },
  { name: 'Senta Vegetarian', address: '31 Huỳnh Thúc Kháng, Nha Trang', place_types: ['nhà hàng chay'] },
  { name: 'Nhà Hàng Chay Tuệ Nguyên - Nha Trang', address: '12 Nguyễn Thiện Thuật, Nha Trang', place_types: ['nhà hàng chay'] },
  { name: 'Quán Chay Sen Vàng', address: '01 Lạc Long Quân, Nha Trang', place_types: ['nhà hàng chay'] },
]
const wrap = (p: unknown) => `Lead.\n\n[TAPPY_PLAN]${JSON.stringify(p)}[/TAPPY_PLAN]\n\nTail.`
type Item = { time?: string; category: string; name: string; address?: string; maps_link?: string; place_id?: string }
const daysOf = (text: string) => (JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]'))) as { days: Array<{ label: string; items: Item[] }> }).days

describe('Nha Trang day 3 and day 2 (Round 21 trace), flag on', () => {
  const guarded = guardPlanItems(wrap(MODEL_PLAN), POOL, { destination: 'Nha Trang', keepSights: true })
  const facts = guardPlanTripFacts(guarded.text, ['lên kế hoạch đi Nha Trang đi đôi, ăn chay, 3 ngày 2 đêm cuối tuần sau'], { assumeLegs: true })
  const days = daysOf(facts.text)

  it('day 3 has a breakfast and a lunch, each a retrieved venue or the plain fallback — never an invented name', () => {
    const d3 = days[2].items
    const breakfast = d3.find(i => i.time && i.time < '10:30' && /ăn sáng|sáng/i.test(i.name) || (i.time && i.time < '10:30' && i.category === 'food'))
    const lunch = d3.find(i => i.time && i.time >= '11:00' && i.time <= '14:30' && (/ăn trưa/i.test(i.name) || i.category === 'food'))
    expect(breakfast?.name).toBe('Ăn sáng gần chỗ ở')
    expect(lunch?.name).toBe('Ăn trưa gần chỗ ở')
    const known = new Set(POOL.map(p => p.name))
    for (const i of d3.filter(x => x.category === 'food')) expect(known.has(i.name), i.name).toBe(true)
    // the fallback slots carry no venue facts at all
    for (const s of [breakfast, lunch]) { expect(s?.category).toBe('rest'); expect(s?.address).toBeUndefined(); expect(s?.maps_link).toBeUndefined(); expect(s?.place_id).toBeUndefined() }
  })
  it('day 3 still has the check-out at the SAME hotel as day 1 and the return leg', () => {
    const stay = days[0].items.find(i => i.category === 'hotel')!.name
    const out = days[2].items.find(i => i.category === 'hotel')!
    expect(out.name).toBe(stay)
    expect(days[2].items.some(i => i.category === 'transport' && /TP\.HCM/.test(i.name))).toBe(true)
  })
  it('flag off (control): the repeated restaurants stay as the model wrote them (no fallback slot)', () => {
    const off = daysOf(guardPlanItems(wrap(MODEL_PLAN), POOL, { destination: 'Nha Trang' }).text)
    expect(off[2].items.map(i => i.name)).not.toContain('Ăn sáng gần chỗ ở')
  })
  it('KNOWN LIMIT: a generic evening name the model writes ("Thư giãn ở khu trung tâm") is kept as written — code cannot make it concrete without inventing a place', () => {
    expect(days[1].items.at(-1)?.name).toBe('Thư giãn ở khu trung tâm')
  })
  it('the prompt (flag on) now demands a NAMED evening place and forbids the generic wording; flag off has no such rule', () => {
    expect(agentSystemV2For(true)).toContain('NÊU TÊN một nơi hoặc hoạt động cụ thể')
    expect(agentSystemV2For(true)).toContain('"thư giãn ở khu trung tâm"')
    expect(agentSystemV2For(false)).not.toContain('NÊU TÊN một nơi')
  })
  it('the prompt (flag on) says a multi-day plan after get_trip_data is the [TAPPY_PLAN] card, not written-out days (live Round 22: prose plan, no card); flag off unchanged', () => {
    expect(agentSystemV2For(true)).toContain('PHẢI là khối [TAPPY_PLAN]')
    expect(agentSystemV2For(false)).not.toContain('PHẢI là khối [TAPPY_PLAN]')
  })
})

// ── Nha Trang, Round 22 live #3 (chat 6c29f12d…, SHA 564579c): the model wrote unnamed meals ("Bữa trưa chay gần trung tâm" …) and `plan_items` swapped
//    all 7 for unused pool restaurants — a vegetarian plan showed "Hải Sản Hạnh Xuân", "Cơm Gà Hà", "Quán Bò Nướng Lạc Cảnh". The plan below is the model's own (trace).
const MODEL_PLAN_UNNAMED = {"type":"trip","people":2,"days":[{"label":"Ngày 1","items":[{"time":"07:00","category":"transport","name":"Di chuyển TP.HCM → Nha Trang"},{"time":"09:00","category":"hotel","name":"Khách sạn Panama Nha Trang"},{"time":"11:30","category":"food","name":"Bữa trưa chay gần trung tâm"},{"time":"15:30","category":"attraction","name":"Bãi biển Trần Phú"},{"time":"18:00","category":"food","name":"Bữa tối chay"},{"time":"20:00","category":"entertainment","name":"Quảng trường 2 Tháng 4 và Tháp Trầm Hương"}]},{"label":"Ngày 2","items":[{"time":"08:00","category":"food","name":"Bữa sáng chay"},{"time":"09:30","category":"attraction","name":"Tháp Bà Ponagar"},{"time":"11:30","category":"food","name":"Bữa trưa chay khu Bắc Nha Trang"},{"time":"14:00","category":"rest","name":"Nghỉ tại khách sạn"},{"time":"16:00","category":"attraction","name":"Chùa Long Sơn"},{"time":"18:00","category":"food","name":"Bữa tối chay"},{"time":"20:00","category":"entertainment","name":"Dạo khu ven biển Trần Phú"}]},{"label":"Ngày 3","items":[{"time":"08:00","category":"food","name":"Bữa sáng chay"},{"time":"09:30","category":"attraction","name":"Chợ Đầm"},{"time":"11:30","category":"hotel","name":"Trả phòng, lấy hành lý"},{"time":"12:00","category":"food","name":"Bữa trưa chay gần trung tâm"},{"time":"14:00","category":"transport","name":"Di chuyển Nha Trang → TP.HCM"}]}]}
// what the search returned: a hotel and restaurants of every kind — NOT only vegetarian
const MIXED_POOL = [
  { name: 'Khách sạn Panama Nha Trang', address: '39 Hùng Vương, Nha Trang', place_types: ['khách sạn'] },
  { name: 'Hải Sản Hạnh Xuân - Nha Trang', address: '1 Trần Phú, Nha Trang', place_types: ['nhà hàng hải sản'] },
  { name: 'Cơm Gà Hà', address: '75 Ngô Gia Tự, Nha Trang', place_types: ['quán cơm gà'] },
  { name: 'Quán Bò Nướng Lạc Cảnh', address: '77 Nguyễn Bỉnh Khiêm, Nha Trang', place_types: ['nhà hàng bò nướng'] },
  { name: 'Chè Cứu Đói', address: '40A Đức Kế, Nha Trang', place_types: ['quán chè'] },
  { name: 'Món Ăn Ngon', address: '2 Lê Lợi, Nha Trang', place_types: ['nhà hàng'] },
]
describe('unnamed meals are never swapped for a random retrieved restaurant (live Round 22 #3)', () => {
  const meals = (text: string) => daysOf(text).flatMap(d => d.items).filter(i => /bữa|ăn /i.test(i.name) || i.category === 'food')
  it('flag on: every meal stays a plain slot; no pool restaurant name appears anywhere; sights, hotel, check-out and return leg are intact', () => {
    const r = guardPlanItems(wrap(MODEL_PLAN_UNNAMED), MIXED_POOL, { destination: 'Nha Trang', keepSights: true })
    const days = daysOf(r.text)
    const names = days.flatMap(d => d.items.map(i => i.name))
    for (const bad of ['Hải Sản Hạnh Xuân - Nha Trang', 'Cơm Gà Hà', 'Quán Bò Nướng Lạc Cảnh', 'Chè Cứu Đói', 'Món Ăn Ngon']) expect(names, bad).not.toContain(bad)
    expect(r.mealSlots).toBe(7)
    expect(r.replaced).toBe(0)
    const count = (n: string) => meals(r.text).filter(i => i.name === n).length
    expect([count('Ăn sáng gần chỗ ở'), count('Ăn trưa gần chỗ ở'), count('Ăn tối gần chỗ ở')]).toEqual([2, 3, 2])
    for (const m of meals(r.text)) { expect(m.category).toBe('rest'); expect(m.address).toBeUndefined(); expect(m.place_id).toBeUndefined() }
    // day 3 has its breakfast AND lunch; the evenings are the named places the model wrote
    expect(days[2].items.filter(i => i.category === 'rest').map(i => i.name)).toEqual(['Ăn sáng gần chỗ ở', 'Ăn trưa gần chỗ ở'])
    expect(days[0].items.at(-1)?.name).toBe('Quảng trường 2 Tháng 4 và Tháp Trầm Hương')
    expect(days[1].items.at(-1)?.name).toBe('Dạo khu ven biển Trần Phú')
    expect(days[0].items.find(i => i.category === 'hotel')?.name).toBe('Khách sạn Panama Nha Trang')
    expect(days[2].items.find(i => i.category === 'hotel')?.name).toBe('Khách sạn Panama Nha Trang')
    expect(days[2].items.at(-1)?.name).toMatch(/Nha Trang → TP\.HCM/)
  })
  it('the fallback description does not claim "chay" (the plan may not be vegetarian)', () => {
    const r = guardPlanItems(wrap(MODEL_PLAN_UNNAMED), MIXED_POOL, { destination: 'Nha Trang', keepSights: true })
    const d = JSON.parse(r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]'))).days[0].items.find((i: { category: string }) => i.category === 'rest')
    expect(d.description).not.toMatch(/chay/i)
  })
  it('flag off (control, the old behaviour the live run hit): the unnamed meals ARE swapped for pool restaurants', () => {
    const r = guardPlanItems(wrap(MODEL_PLAN_UNNAMED), MIXED_POOL, { destination: 'Nha Trang' })
    const names = daysOf(r.text).flatMap(d => d.items.map(i => i.name))
    expect(names).toContain('Hải Sản Hạnh Xuân - Nha Trang')
    expect(r.replaced).toBeGreaterThan(0)
  })
  it('a meal the model NAMED and the tools returned still becomes that venue (flag on)', () => {
    const named = { type: 'trip', days: [{ label: 'Ngày 1', items: [{ time: '12:00', category: 'food', name: 'Cơm Gà Hà' }] }] }
    const r = guardPlanItems(wrap(named), MIXED_POOL, { destination: 'Nha Trang', keepSights: true })
    expect(daysOf(r.text)[0].items[0].name).toBe('Cơm Gà Hà')
    expect(r.matched).toBe(1)
  })
})

describe('budget when get_trip_data returns no price', () => {
  const withLines = { ...MODEL_PLAN, budget_lines: [
    { item: 'Khách sạn 2 đêm', per: 'room_night', unit_amount: 900_000, label: 'estimate', basis: 'tự ước' },
    { item: 'Vé xe khứ hồi', per: 'person_leg', unit_amount: 450_000, legs: 2, label: 'checked', basis: 'Vexere' },
  ] }
  it('no retrieved amount at all: every line says "chưa có dữ liệu", no figure, no total', () => {
    const r = appendPlanBudget(wrap(withLines), [], { day: 11, month: 10 })
    expect(r.added).toBe(true)
    const block = r.text.slice(r.text.indexOf('💰'))
    expect(block).toContain('Khách sạn 2 đêm: chưa có dữ liệu')
    expect(block).toContain('Vé xe khứ hồi: chưa có dữ liệu')
    expect(block).toContain('Tổng: chưa tính được vì chưa khoản nào có nguồn')
    expect(block).not.toMatch(/\d{3}\.\d{3}đ/)
  })
})

describe('orphan source label — the production prose chain (orphan → caveat dedupe → closing invite) on the verbatim Round 21 text', () => {
  // from the audit trace (final_out, Snow Crash turn 1, first Round 21 run): a markdown link, then the model's own "([The Guardian])" label
  const LIVE = 'Có thể bạn đang nghe về **The Three-Body Problem** (*Tam Thể*) của Lưu Từ Hân: Mark Zuckerberg từng chọn cuốn này cho câu lạc bộ sách của mình, còn Bill Gates cũng giới thiệu nó trong danh sách sách nên đọc. Nhưng họ không hẳn cùng tham gia một nhóm đọc sách; có vẻ là hai người cùng đề xuất một cuốn ([en.wikipedia.org](https://en.wikipedia.org/wiki/Mark_Zuckerberg_book_club)). ([The Guardian]) Zuckerberg từng tổ chức câu lạc bộ sách trực tuyến **A Year of Books** vào năm 2015, mỗi hai tuần giới thiệu một cuốn ([en.wikipedia.org](https://en.wikipedia.org/wiki/Mark_Zuckerberg_book_club)).'
  const chain = (s: string) => stripClosingInvite(dedupeCaveats(stripOrphanSourceLabels(s)))
  it('the orphan label goes; both real links, the bold names and every sentence stay', () => {
    const out = chain(LIVE)
    expect(out).not.toContain('The Guardian')
    expect(out.match(/\(\[en\.wikipedia\.org\]\(https:\/\/en\.wikipedia\.org\/wiki\/Mark_Zuckerberg_book_club\)\)/g)).toHaveLength(2)
    expect(out).toContain('**A Year of Books**')
    expect(out).toContain('Zuckerberg từng tổ chức câu lạc bộ sách trực tuyến')
    expect(out.replace(/\s+/g, ' ')).toBe(LIVE.replace(' ([The Guardian])', '').replace(/\s+/g, ' '))
  })
  it('valid citations are never touched: [S#] markers, "([S1])", a labelled link, a plain [text](url), a source line', () => {
    for (const ok of [
      'Nguồn: [goodreads.com](https://www.goodreads.com/book/show/830) · [en.wikipedia.org](https://en.wikipedia.org/wiki/Snow_Crash)',
      'Giá xăng 28.250 đ/lít [S2] theo PVOIL ([vnexpress.net](https://vnexpress.net/a-1.html)).',
      'Xem thêm ([S1]) và [S3].',
      'Đặt tại [Trip.com](https://www.tappyai.com/go/at?u=https%3A%2F%2Ftrip.com) ngay.',
    ]) expect(stripOrphanSourceLabels(ok), ok).toBe(ok)
  })
  it('only a bracketed NAME inside parentheses with nothing behind it is removed; a bare "[The Guardian]" and ordinary parentheses stay (documented scope)', () => {
    expect(stripOrphanSourceLabels('Báo cáo của [The Guardian] nói vậy (theo ghi chú).')).toBe('Báo cáo của [The Guardian] nói vậy (theo ghi chú).')
    expect(stripOrphanSourceLabels('Đúng vậy ([Reuters]).')).toBe('Đúng vậy.')
    expect(stripOrphanSourceLabels('Đúng vậy ([Reuters]) và ([Bloomberg]).')).toBe('Đúng vậy và.')
  })
})

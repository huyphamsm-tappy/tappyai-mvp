// @vitest-environment node
// Phase 8 POST-UAT (2026-10-09) · Fix group 2 — snippet_price / budget guard regressions (B3: UAT-09 t2, UAT-25). Pure.
import { describe, it, expect } from 'vitest'
import { guardSnippetPricesInText, type SnippetPriceScope } from '@/lib/ai/snippetPriceGuard'
import { dropOrphanLeadIns, dropBareListMarkers } from '@/lib/ai/citationIntegrity'

const scope = (names: string[]): SnippetPriceScope => ({ byEntity: new Map(), placeNames: names })
const both = (text: string, user: string, names: string[] = []) => ({
  v1: guardSnippetPricesInText(text, [], user, names.length ? scope(names) : undefined),
  v2: guardSnippetPricesInText(text, [], user, scope(names), { v2: true, priceBandsByEntity: new Map() }),
})
const kept = (text: string, user: string, names: string[] = []) => {
  const r = both(text, user, names)
  expect(r.v1.text).toBe(text)
  expect(r.v2.text).toBe(text)
}

describe('POST-UAT B3 · a budget allocation is not a merchant price (kept)', () => {
  it('UAT-25 shape: one-day HCMC plan, 700k split under a lead-in', () => {
    kept('Chia ngân sách tham khảo như sau:\n- Ăn sáng: 40.000đ\n- Ăn trưa: 70.000đ\n- Cà phê: 50.000đ\n- Ăn tối: 120.000đ\n- Di chuyển (xe buýt/xe ôm): 100.000đ\n- Vé tham quan: 65.000đ\n- Dự phòng: 255.000đ', 'Giảm ngân sách xuống 700.000 đồng.')
  })
  it('UAT-09 shape: café startup with 150 triệu — capital allocation', () => {
    kept('Với 150 triệu, đây là khung phân bổ sơ bộ:\n- Cải tạo mặt bằng, decor: khoảng 40–50 triệu\n- Máy pha, máy xay, tủ mát: khoảng 35–45 triệu\n- Đặt cọc thuê mặt bằng 2–3 tháng: khoảng 30 triệu\n- Nguyên liệu ban đầu: khoảng 10 triệu\n- Quỹ dự phòng vận hành 2–3 tháng: phần còn lại', 'Nếu vốn của tôi chỉ có 150 triệu đồng thì nên ưu tiên gì?')
  })
  it('restaurant operating-cost estimate (no user budget; labelled estimates)', () => {
    kept('Chi phí vận hành hàng tháng ước tính:\n- Thuê mặt bằng: 15–25 triệu\n- Lương 4 nhân viên: 28–32 triệu\n- Điện nước gas: 6–8 triệu', 'Mở một quán ăn nhỏ thì mỗi tháng tốn những khoản gì?')
  })
  it('two-day travel budget', () => {
    kept('Dự trù cho 2 ngày (ngân sách 4 triệu, gia đình 3 người):\n- Lưu trú 1 đêm: khoảng 1–1,5 triệu\n- Ăn uống: khoảng 1,2 triệu\n- Di chuyển nội thành: khoảng 500.000đ\n- Vé tham quan và dự phòng: phần còn lại', 'Đi Đà Nẵng 2 ngày 1 đêm, gia đình, ngân sách tổng 4 triệu đồng.')
  })
  it('shopping budget split', () => {
    kept('Với ngân sách 5 triệu cho đồ dùng học tập, có thể chia:\n- Laptop cũ: không đủ, bỏ qua\n- Balo: khoảng 500.000đ\n- Sách vở, dụng cụ: khoảng 1 triệu', 'Mình có 5 triệu sắm đồ đi học.')
  })
  it('monthly personal budget (percent shares)', () => {
    kept('Phân bổ ngân sách tháng theo 50/30/20:\n- Thiết yếu: 7,5 triệu\n- Mong muốn: 4,5 triệu\n- Tiết kiệm: 3 triệu', 'Lương mình 15 triệu/tháng, chia ngân sách sao cho hợp lý?')
  })
  it('event planning budget', () => {
    kept('Gợi ý chia ngân sách tiệc 20 triệu:\n- Thuê địa điểm: khoảng 5 triệu\n- Ăn uống: khoảng 10 triệu\n- Trang trí, âm thanh: khoảng 3 triệu', 'Tổ chức tiệc công ty 50 người, ngân sách 20 triệu.')
  })
  it('a breakdown subtotal that is the sum of its own items is kept', () => {
    kept('Chi phí dự kiến:\n- Ăn uống: 300.000đ\n- Di chuyển: 150.000đ\n- Tổng: 450.000đ', 'Đi chơi 1 ngày ngân sách 700k.')
  })
})

describe('POST-UAT B3 · merchant / product prices are still judged (removed without evidence)', () => {
  const names = ['Phở Hòa Pasteur', 'Bún Chả Hương Liên']
  it('a venue-specific unverified menu price is removed even inside a budget block', () => {
    const r = both('Chia ngân sách như sau:\n- Ăn trưa ở Phở Hòa Pasteur: 95.000đ/tô\n- Cà phê: 50.000đ', 'ngân sách 700k', names)
    expect(r.v1.text).not.toMatch(/95\.000/)
    expect(r.v2.text).not.toMatch(/95\.000/)
    expect(r.v2.text).toMatch(/Cà phê: 50\.000đ/)
  })
  it('a product price without evidence is not an allocation (no planning frame)', () => {
    const r = both('Tai nghe Sony WH-1000XM5 đang bán 7.490.000đ.', 'tai nghe chống ồn tốt', [])
    expect(r.v1.text).not.toMatch(/7\.490\.000/)
  })
  it('a bold-named place in a budget line is a merchant claim', () => {
    const r = both('Ngân sách ăn trưa:\n- **Cơm Tấm Ba Ghiền**: 85.000đ/phần', 'ngân sách 700k', [])
    expect(r.v2.text).not.toMatch(/85\.000/)
  })
  it('mixed sentence: the venue price goes, the budget figure the user gave stays', () => {
    const r = both('Ăn trưa ở Phở Hòa Pasteur khoảng 95.000đ, với ngân sách 700.000đ vẫn thoải mái.', 'ngân sách 700.000đ', names)
    expect(r.v2.text).not.toMatch(/95\.000/)
  })
  it('F-086 still holds: the user envelope restated as the total cost is judged', () => {
    const r = both('Chi phí khoảng 3 triệu cho cả tối.', 'budget 3 triệu, 2 người, Quận 1', [])
    expect(r.v1.text).not.toMatch(/3 triệu/)
  })
  it('a "total" with no parts is not a subtotal', () => {
    const r = both('Chi phí dự kiến cho cả ngày: tổng khoảng 650.000đ.', 'Đi chơi 1 ngày ngân sách 700k.', [])
    expect(r.v1.text).not.toMatch(/650\.000/)
  })
  it('an item above the user envelope is not an allocation', () => {
    const r = both('Chia ngân sách:\n- Khách sạn: 2.500.000đ', 'ngân sách 700k', [])
    expect(r.v1.text).not.toMatch(/2\.500\.000/)
  })
})

describe('POST-UAT B3 · nothing dangling after a removal', () => {
  it('a lead-in whose items were all removed goes; one with content stays', () => {
    expect(dropOrphanLeadIns('Lịch trình nhẹ nhàng.\n\nChia ngân sách tham khảo như sau:\n\n[FOLLOWUPS]\na\n[/FOLLOWUPS]').text).toBe('Lịch trình nhẹ nhàng.\n\n[FOLLOWUPS]\na\n[/FOLLOWUPS]')
    expect(dropOrphanLeadIns('Chia ngân sách tham khảo như sau:').text).toBe('')
    const ok = 'Chia ngân sách như sau:\n- Ăn trưa: 70.000đ'
    expect(dropOrphanLeadIns(ok).text).toBe(ok)
  })
  it('an empty "**Chi phí:**" heading before the next section goes; real headings with sub-headings stay', () => {
    expect(dropOrphanLeadIns('**Chi phí:**\n\n**Lưu ý:**\nMang áo mưa.').text).toBe('**Lưu ý:**\nMang áo mưa.')
    const sections = '## Lịch trình\n### Ngày 1\nSáng: dạo phố.'
    expect(dropOrphanLeadIns(sections).text).toBe(sections)
  })
  it('a paragraph after a lead-in with a blank line is content, not orphaned', () => {
    const t = 'Gợi ý:\n\nĐi sớm để tránh nắng.'
    expect(dropOrphanLeadIns(t).text).toBe(t)
  })
  it('works with the bare-list-marker pass: no orphan marker, no orphan lead-in', () => {
    const t = 'Chúc bạn vui.\n\nChi phí dự kiến:\n-\n-'
    const a = dropBareListMarkers(t).text
    expect(dropOrphanLeadIns(a).text).toBe('Chúc bạn vui.')
  })
})

describe('POST-UAT B3 · regression found by the full suite: a venue price is not a split because the sentence says "budget"', () => {
  it('"Mình chọn **X** … Giá 100-200k/người rất hợp budget" — the price is X\'s (anaphora), judged as before', () => {
    const t = 'Mình chọn **Quán Mới Mở Quận 1** cho bạn. Giá 100-200k/người rất hợp budget, mở đến 3h sáng.'
    const r = both(t, 'quán ăn khuya ngân sách 300k', ['Quán Mới Mở Quận 1'])
    expect(r.v1.text).not.toMatch(/100-200k/)
    expect(r.v2.text).not.toMatch(/100-200k/)
  })
  it('a budget LIST under a header after a venue paragraph (blank line) is still a split', () => {
    kept('Mình chọn **Quán Mới Mở Quận 1** cho bữa tối.\n\nVới ngân sách 700.000đ, có thể chia:\n- Ăn tối: 250.000đ\n- Di chuyển: 100.000đ', 'ngân sách 700.000đ', ['Quán Mới Mở Quận 1'])
  })
})

describe('POST-UAT B3 · snippet allocation scope, sharpened after the mutation run (P9b / P9c / P12 survived)', () => {
  it('P9b — a split word does not detach a price from the venue named on the line above (anaphora)', () => {
    const r = both('Mình chọn **Quán Mới Mở Quận 1** cho bữa tối.\nChi phí dự kiến 150.000đ/người.', 'ăn tối ngân sách 700.000đ', ['Quán Mới Mở Quận 1'])
    expect(r.v1.text).not.toMatch(/150\.000/)
    expect(r.v2.text).not.toMatch(/150\.000/)
  })
  it('P9c — a mere "budget" mention with no venue is not a split frame', () => {
    const r = both('Một bữa ở khu này khoảng 150.000đ/người là hợp budget.', 'ăn tối ngân sách 700.000đ', [])
    expect(r.v1.text).not.toMatch(/150\.000/)
  })
})

describe('POST-UAT B3 · an announcing lead-in ("như sau:") with no list after it', () => {
  it('goes when a paragraph (not a list) follows; stays when its list is there; a plain "Gợi ý:" lead-in is not touched', () => {
    expect(dropOrphanLeadIns('Mở đầu.\n\nChia ngân sách tham khảo như sau:\n\nBạn muốn mình tìm thêm không?').text).toBe('Mở đầu.\n\nBạn muốn mình tìm thêm không?')
    const ok = 'Chi phí gồm:\n\n- Mặt bằng\n- Thiết bị'
    expect(dropOrphanLeadIns(ok).text).toBe(ok)
    const table = 'Giá vàng như sau:\n\n| Loại | Mua |\n|---|---|\n| SJC | 140 |'
    expect(dropOrphanLeadIns(table).text).toBe(table)
  })
})

describe('POST-UAT B3 · capital allocations measured on the post-fix UAT-09 t2 run', () => {
  it('"Giữ tối thiểu khoảng 30 triệu làm vốn lưu động" (user capital 150 triệu) is an allocation, kept by guard and gate', () => {
    const t = '**Giữ tối thiểu khoảng 30 triệu làm vốn lưu động**, đừng tiêu hết trước ngày khai trương.'
    kept(t, 'Nếu vốn của tôi chỉ có 150 triệu đồng thì nên ưu tiên gì?')
  })
  it('but an amount above the user capital, or a place-named amount, is still judged', () => {
    const r = both('Giữ lại khoảng 200 triệu làm vốn lưu động.', 'vốn của tôi chỉ có 150 triệu', [])
    expect(r.v1.text).not.toMatch(/200 triệu/)
  })
})

describe('POST-UAT B3 · UAT-25 shapes measured on the post-fix run (itinerary slots, disclosed allowances, context across turns)', () => {
  const USERS = ['Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng, có lịch trình và các lựa chọn ăn uống phù hợp.', 'Giảm ngân sách xuống 700.000 đồng.']
  const ALL = USERS.join('\n')
  const NAMES = ['Nhà Hàng Wrap&Roll', 'Nhà Hàng Hai Lúa Sài Gòn']
  it('itinerary slot allowances (the splitter cuts these lines at ":") are kept when the user gave the envelope', () => {
    const t = 'Lịch một ngày:\n- **07:30–08:30:** Ăn sáng bình dân: **40–70 nghìn**.\n- **16:00–17:00:** Cà phê hoặc nước uống: **40–70 nghìn**.\n- **Đi lại và dự phòng:** Chừa **150–200 nghìn**, gom điểm gần nhau để hạn chế tiền xe.'
    kept(t, ALL, NAMES)
  })
  it('a slot that names a place on its own line is that place\'s price (judged)', () => {
    const r = both('Lịch một ngày:\n- **Trưa:** Ăn ở **Nhà Hàng Hai Lúa Sài Gòn**, khoảng **120 nghìn**.', ALL, NAMES)
    expect(r.v2.text).not.toMatch(/120 nghìn/)
  })
  it('a disclosed allowance after named venues is a planning number, not a quote', () => {
    kept('Trưa: chọn một trong hai quán ở trên.\nGiá các quán này chưa được xác nhận, nên xem thực đơn trước khi gọi; dự trù **150–250 nghìn**.', ALL, NAMES)
  })
  it('turn 3: the 700.000 envelope from turn 2 is still the user\'s (whole conversation), so restating it as a budget is kept', () => {
    kept('Với ngân sách **700.000 đồng/người**, mình thay bằng lịch nhẹ nhàng quanh trung tâm.', [...USERS, 'Bỏ điểm đến thứ hai.'].join('\n'), NAMES)
  })
  it('without a user envelope a slot amount is not an allowance (no planning frame) — judged', () => {
    const r = both('- **12:00–13:00:** Ăn trưa: **85 nghìn**.', 'Gợi ý lịch một ngày ở Quận 1', [])
    expect(r.v1.text).not.toMatch(/85 nghìn/)
  })
})

describe('POST-UAT B3 · the envelope stated as a constraint (UAT-25 t1 post-fix run)', () => {
  it('"giữ tổng chi khoảng 1 triệu đồng" is kept; "tổng chi phí khoảng 1 triệu cho cả ngày" (envelope as the cost) is still judged', () => {
    const U = 'Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng.'
    kept('Dưới đây là lịch trình **một ngày ở trung tâm TP.HCM**, tính cho một người và giữ tổng chi khoảng **1 triệu đồng**.', U)
    expect(guardSnippetPricesInText('Tổng chi phí khoảng 1 triệu đồng cho cả ngày.', [], U).text).not.toMatch(/1 triệu/)
  })
  it('"vốn" (the user\'s capital) restated as capital is the envelope (UAT-09)', () => {
    kept('Với vốn 150 triệu, chi phí mở quán cần được chia theo thứ tự ưu tiên.', 'Nếu vốn của tôi chỉ có 150 triệu đồng thì nên ưu tiên gì?')
  })
})

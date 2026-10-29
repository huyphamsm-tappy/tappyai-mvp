// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { guardTravelClaimsInText } from './travelGuard'
import { guardPlanPrices } from './planPriceGuard'

// 29/10 (localhost 3039, 25-question run, one brain): the post-model stages deleted a name, a table row or a whole bullet whose figures the tools had
// returned, because the model wrote the name in its own words ("Bún chả Bà Thành" for the row "Bà Thành - Bún chả & Bún Hải Sản", "–" for "-"), or
// wrote its own planning split of the user's budget. The strings below are the replies of that run, verbatim; the tool rows are the real ones, trimmed
// to the fields the guards read. One brain keeps the text (the quality stages run in shadow); every other path is unchanged.

async function run(user: string, frames: string[], oneBrain: boolean, travel = false, planBlock?: string): Promise<string> {
  const collector = createEnrichmentCollector(user)
  if (oneBrain) collector.oneBrain = true
  if (planBlock) collector.planBlock = planBlock
  const orig = console.log
  console.log = () => {}
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, travel, user, false)
    const body = await new Response(res.body).text()
    return body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  } finally { console.log = orig }
}

const placeFrames = (call: Record<string, unknown>, rows: Array<Record<string, unknown>>, reply: string): string[] => [
  '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'search_places', args: call }),
  'a:' + JSON.stringify({ toolCallId: 't1', result: { source: 'Serper Maps', count: rows.length, location: String(call.location), results: rows, _tappy_place_domain: 'food', place_search_status: 'has_results' } }),
  '0:' + JSON.stringify(reply),
  'd:{"finishReason":"stop"}',
]

const CAFE_USER = 'Ở Quận 3 TP.HCM có quán cà phê nào yên tĩnh, có ổ cắm, ngồi làm việc cả buổi được không?'
const CAFE_ROWS = [
  { name: 'WorkFlow Quận 3 - Working Space & Café', address: '195/3 Hai Bà Trưng, Xuân Hòa, Hồ Chí Minh, Việt Nam', google_rating: '4.5⭐ (435 đánh giá Google Maps)', rating_value: 4.5, rating_count: 435, opening_hours: '07:30–21:30', maps_link: 'https://maps.google.com/?cid=1011267597805569721' },
  { name: 'The Coffee House - Võ Văn Tần', address: '223 Võ Văn Tần, Bàn Cờ, Hồ Chí Minh 700000, Việt Nam', google_rating: '4.3⭐ (2.261 đánh giá Google Maps)', rating_value: 4.3, rating_count: 2261, opening_hours: '07:00–22:00', maps_link: 'https://maps.google.com/?cid=3535620640817726007' },
  { name: 'The Coffee House - Cao Thắng', address: '86-88 Cao Thắng, Bàn Cờ, Hồ Chí Minh 700000, Việt Nam', google_rating: '4.3⭐ (3.111 đánh giá Google Maps)', rating_value: 4.3, rating_count: 3111, opening_hours: '07:00–22:00', maps_link: 'https://maps.google.com/?cid=15343922622511307487' },
]
const CAFE_REPLY = 'Có. **Mình sẽ thử WorkFlow Quận 3 trước** nếu bạn cần ngồi làm việc lâu: đây là mô hình working space & café, hợp nhu cầu hơn quán cà phê thông thường. Tuy vậy, thông tin tìm được chưa xác nhận cụ thể độ yên tĩnh hay ổ cắm tại từng chỗ ngồi, nên gọi hỏi trước sẽ chắc ăn.\n\n- **WorkFlow Quận 3 – Working Space & Café:** 195/3 Hai Bà Trưng; mở cửa hằng ngày 07:30–21:30; Google Maps hiển thị 4,5/5 từ 435 đánh giá. [Xem bản đồ](https://maps.google.com/?cid=1011267597805569721)\n- **The Coffee House – Võ Văn Tần:** 223 Võ Văn Tần; giờ niêm yết 07:00–22:00, đánh giá 4,3/5 từ 2.261 lượt. Chuỗi thường tiện để ngồi làm việc, nhưng mình chưa xác minh được ổ cắm và mức ồn ở chi nhánh này. [Xem bản đồ](https://maps.google.com/?cid=3535620640817726007)\n- **The Coffee House – Cao Thắng:** 86–88 Cao Thắng; giờ niêm yết 07:00–22:00, đánh giá 4,3/5 từ 3.111 lượt. Bạn nên hỏi trước về chỗ ngồi sát ổ cắm và tình hình đông khách. [Xem bản đồ](https://maps.google.com/?cid=15343922622511307487)\n\nKhi gọi, hỏi nhanh: “Quán có ổ cắm gần bàn không, buổi chiều có yên để làm việc vài tiếng không?” Thông tin giờ mở cửa và đánh giá là dữ liệu tra cứu tại **29/10/2026**, có thể thay đổi.'

describe('one brain: a venue bullet whose figures the place tool returned is kept whole', () => {
  it('one brain keeps the names, addresses, ratings and counts of both Coffee House bullets', async () => {
    const out = await run(CAFE_USER, placeFrames({ query: 'quiet cafe power outlets work laptop', location: 'Quận 3, TP.HCM', type: 'cafe' }, CAFE_ROWS, CAFE_REPLY), true)
    expect(out).toContain('**The Coffee House – Võ Văn Tần:** 223 Võ Văn Tần')
    expect(out).toContain('đánh giá 4,3/5 từ 2.261 lượt')
    expect(out).toContain('**The Coffee House – Cao Thắng:** 86–88 Cao Thắng')
    expect(out).toContain('từ 3.111 lượt')
  })
  // The cause was the review-count pattern: "07:00–22:00, đánh giá" read as "00, đánh giá" = 0 reviews (placeClaimGuard.ts); fixed for every path.
  it('the same reply on every other path keeps them too: an hour followed by a comma and "đánh giá" is not a review count', async () => {
    const out = await run(CAFE_USER, placeFrames({ query: 'quiet cafe power outlets work laptop', location: 'Quận 3, TP.HCM', type: 'cafe' }, CAFE_ROWS, CAFE_REPLY), false)
    expect(out).toContain('223 Võ Văn Tần')
    expect(out).toContain('từ 2.261 lượt')
  })
  it('a real review count the tool does not have is still cut on every path', async () => {
    const reply = CAFE_REPLY.replace('đánh giá 4,3/5 từ 2.261 lượt', 'đánh giá 4,3/5 từ 9.999 đánh giá')
    expect(await run(CAFE_USER, placeFrames({ query: 'quiet cafe power outlets work laptop', location: 'Quận 3, TP.HCM', type: 'cafe' }, CAFE_ROWS, reply), false)).not.toContain('9.999 đánh giá')
  })
})

const BUN_USER = 'Quán bún chả ngon ở Hà Nội mà người Hà Nội hay ăn, không phải quán du lịch? Cho mình 3 quán, kèm địa chỉ và giờ mở cửa.'
const BUN_ROWS = [
  { name: 'Bún Chả Duy Diễm', address: '140 Ngọc Khánh, Giảng Võ, Hà Nội', rating_value: 4.2, rating_count: 900, opening_hours: '07:00–20:30', maps_link: 'https://maps.google.com/?cid=17148691553428935263' },
  { name: 'Bún Chả Que Tre Bình Chung', address: '299 Bạch Mai, Bạch Mai, Hà Nội', rating_value: 4.4, rating_count: 700, opening_hours: '09:30–15:00, 17:00–20:30', maps_link: 'https://maps.google.com/?cid=7283740909328064171' },
  // trimmed: the real row is "Bà Thành - Bún chả & Bún Hải Sản" (address not copied; the guards read only the name here)
  { name: 'Bà Thành - Bún chả & Bún Hải Sản', address: 'Ngõ 12 Đào Tấn, Giảng Võ, Hà Nội', rating_value: 4.1, rating_count: 500, opening_hours: '06:30–14:00, 16:30–21:30', maps_link: 'https://maps.google.com/?cid=13388820197176158390' },
]
const BUN_REPLY = 'Nếu muốn tránh các quán quá nổi tiếng với khách du lịch, mình sẽ ưu tiên **quán ở ngoài lõi phố cổ**. Ba lựa chọn dưới đây có địa chỉ và giờ mở cửa đang được Google Maps niêm yết; giờ quán có thể thay đổi, nên kiểm tra lại trước khi đi.\n\n- **Bún chả Duy Diễm** — 140 Ngọc Khánh, Giảng Võ. Mở **07:00–20:30**. Nằm ngoài khu phố cổ, phù hợp nếu bạn muốn ăn kiểu quán khu dân cư hơn. [Google Maps](https://maps.google.com/?cid=17148691553428935263)\n- **Bún chả Que Tre Bình Chung** — 299 Bạch Mai, Bạch Mai. Mở **09:30–15:00 và 17:00–20:30**. Quán có giờ nghỉ giữa buổi, nhớ canh giờ nếu đi chiều. [Google Maps](https://maps.google.com/?cid=7283740909328064171)\n- **Bún chả Bà Thành** — số 6, ngõ 12 Đào Tấn, Giảng Võ. Mở **06:30–14:00 và 16:30–21:30**. Có cả khung ăn sáng/trưa lẫn tối, tiện nếu bạn ở khu Ba Đình–Cầu Giấy. [Google Maps](https://maps.google.com/?cid=13388820197176158390)\n\nNếu chỉ chọn một quán để bắt đầu, mình nghiêng về **Duy Diễm** vì ở ngoài phố cổ và có giờ mở cửa liền mạch trong ngày.'

describe('one brain: a name written in another order is the same venue, and an unmatched name is labelled, never cut', () => {
  it('the third bullet keeps its name and address', async () => {
    const out = await run(BUN_USER, placeFrames({ query: 'bún chả ngon người địa phương ăn', location: 'Hà Nội', type: 'restaurant' }, BUN_ROWS, BUN_REPLY), true)
    expect(out).toContain('**Bún chả Bà Thành** — số 6, ngõ 12 Đào Tấn, Giảng Võ.')
    expect(out).not.toContain('(chưa xác minh)')
  })
  it('a name no row has is labelled once, and its address stays', async () => {
    const reply = BUN_REPLY.replace('Bún chả Bà Thành', 'Bún chả Hàng Không')
    const out = await run(BUN_USER, placeFrames({ query: 'bún chả ngon người địa phương ăn', location: 'Hà Nội', type: 'restaurant' }, BUN_ROWS.slice(0, 2), reply), true)
    expect(out).toContain('Bún chả Hàng Không** (chưa xác minh) — số 6, ngõ 12 Đào Tấn')
    expect(out.match(/\(chưa xác minh\)/g)).toHaveLength(1)
  })
  it('without one brain the unmatched bullet is cut as before', async () => {
    const reply = BUN_REPLY.replace('Bún chả Bà Thành', 'Bún chả Hàng Không')
    const out = await run(BUN_USER, placeFrames({ query: 'bún chả ngon người địa phương ăn', location: 'Hà Nội', type: 'restaurant' }, BUN_ROWS.slice(0, 2), reply), false)
    expect(out).not.toContain('Hàng Không')
  })
})

// the product table of the same run: the tool returned the price of "Xiaomi Mi Air Purifier 4 lite" (2550000) and the model called it "Xiaomi Smart Air Purifier 4 Lite"
describe('one brain: a product row whose price the shopping tool returned is kept when the model renames the product', () => {
  const USER = 'Mình muốn mua máy lọc không khí cho phòng ngủ khoảng 20m², ngân sách dưới 4 triệu, nhà có trẻ nhỏ. Tư vấn giúp 3 mẫu, so sánh và cho link mua.'
  const frames = (reply: string) => [
    '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'search_products', args: { query: 'Xiaomi Smart Air Purifier 4 Lite chính hãng giá Việt Nam mua máy lọc không khí' } }),
    'a:' + JSON.stringify({ toolCallId: 't1', result: { query: 'Xiaomi', source: 'Google Shopping (Serper)', search_results: [
      { title: 'Máy lọc không khí Xiaomi Mi Air Purifier 4 lite', link: 'https://www.google.com/search?ibp=oshop&q=x', price: 2550000, price_vnd: 2550000, source: 'KingHome.vn', rating: 4.6, rating_count: 663, product_id: '1891803794353206266', has_purchase: true },
      { title: 'Máy lọc không khí Xiaomi Mi Air Purifier 4', link: 'https://www.google.com/search?ibp=oshop&q=y', price: 3450000, price_vnd: 3450000, source: 'Hugotech.vn', rating: 4.6, rating_count: 300, product_id: '1', has_purchase: true },
    ] } }),
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const REPLY = 'Mình nghiêng về **Xiaomi Smart Air Purifier 4 Lite**: giá được ghi nhận là **2.550.000₫**, thấp hơn ngân sách.\n\n| Mẫu | Giá tham khảo | Nhận xét |\n|---|---:|---|\n| **Xiaomi Smart Air Purifier 4 Lite** | **2.550.000₫** | Lựa chọn cân bằng để cân nhắc. |\n| **Xiaomi Smart Air Purifier 4** | **3.450.000₫** | Vừa ngân sách. |\n\nBạn xem thêm độ ồn ở chế độ ngủ trước khi chốt.'
  it('one brain keeps both table rows', async () => {
    const out = await run(USER, frames(REPLY), true)
    expect(out).toContain('| **Xiaomi Smart Air Purifier 4 Lite** | **2.550.000₫** |')
    expect(out).toContain('| **Xiaomi Smart Air Purifier 4** | **3.450.000₫** |')
  })
})

// today's date, stated as the date of the lookup (the prompt asks for it), is not "a travel date the user did not give"
describe('one brain: the date the model gives for its own lookup stays', () => {
  const USER = 'Tư vấn nồi chiên không dầu cho gia đình 4 người, dưới 3 triệu, dễ vệ sinh. Shopee hay Điện Máy Xanh mua chỗ nào lợi hơn?'
  const REPLY = 'Mình nghiêng về Điện Máy Xanh.\n\n- **Muốn tiết kiệm:** Điện Máy Xanh cũng đang có Philips NA130/00 6,2 lít. Giá và danh sách hàng là kết quả tra cứu ngày **29/10/2026**, có thể đổi theo khuyến mãi và khu vực.'
  const frames = ['0:' + JSON.stringify(REPLY), 'd:{"finishReason":"stop"}']
  it('one brain keeps the lookup date', async () => {
    expect(await run(USER, frames, true, true)).toContain('kết quả tra cứu ngày **29/10/2026**')
  })
  it('without one brain the sentence is cut as before', async () => {
    expect(await run(USER, frames, false, true)).not.toContain('29/10/2026')
  })
})

// the shopping answer of the same run: its price sentence ("…dưới ngân sách 3 triệu") went with the budget-fit rule
describe('one brain: the price sentence of a shopping answer stays', () => {
  const USER = 'Tư vấn nồi chiên không dầu cho gia đình 4 người, dưới 3 triệu, dễ vệ sinh. Shopee hay Điện Máy Xanh mua chỗ nào lợi hơn?'
  const PAGE = 'https://www.dienmayxanh.com/noi-chien-khong-dau/noi-chien-khong-dau-philips-na231-00-6-2-lit?srsltid=AYCX9vJZgMsKLJr7inV4BcMYIrraSoDJbjaKiRVb6RCNks0Tf0b-Uc2Z'
  const REPLY = `**Mình khuyên Philips NA231/00 6.2 lít mua ở Điện Máy Xanh** nếu ưu tiên dễ vệ sinh, bảo hành và ít rủi ro khi mua. Giá đang niêm yết **2.090.000₫**, dưới ngân sách 3 triệu; 6.2 lít cũng phù hợp gia đình 4 người. [Điện Máy Xanh](${PAGE})\n\n- **Vì sao hợp:** Lòng nồi phủ chống dính, vỉ tách dầu tháo rời. [Chi tiết NA231/00](${PAGE})`
  const settle = async (oneBrain: boolean): Promise<string> => {
    const collector = createEnrichmentCollector(USER)
    if (oneBrain) collector.oneBrain = true
    // the legacy frame: a budget was stated and no row carried a price
    collector.setConsultativeV1({ on: true, rendersCard: true, namedRefetch: [], referenced: [], carried: [], hardGaps: [], budgetGap: true, budget: null, priorTimes: [] } as never)
    const orig = console.log
    console.log = () => {}
    try {
      const res = applyPlaceEnrichmentStreamFilter(new Response(['0:' + JSON.stringify(REPLY), 'd:{"finishReason":"stop"}'].join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER, false)
      return (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    } finally { console.log = orig }
  }
  it('one brain keeps the price sentence', async () => {
    expect(await settle(true)).toContain('Giá đang niêm yết **2.090.000₫**, dưới ngân sách 3 triệu')
  })
  it('without one brain the price sentence is cut, as before', async () => {
    expect(await settle(false)).not.toContain('dưới ngân sách 3 triệu')
  })
})

// a shopping question the keyword detector reads as a travel turn ("mua chỗ nào"): the listing's price the shopping tool returned is evidence
describe('one brain: a price the shopping tool returned survives the travel guard', () => {
  const USER = 'Tư vấn nồi chiên không dầu cho gia đình 4 người, dưới 3 triệu, dễ vệ sinh. Shopee hay Điện Máy Xanh mua chỗ nào lợi hơn?'
  const frames = (reply: string) => [
    '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'search_products', args: { query: 'nồi chiên không dầu 6 lít' } }),
    'a:' + JSON.stringify({ toolCallId: 't1', result: { query: 'x', source: 'Google Shopping (Serper)', search_results: [{ title: 'Nồi chiên không dầu B.COOK 6 lít', link: 'https://www.google.com/search?ibp=oshop&q=1', price: 690000, price_vnd: 690000, source: 'Shopee', rating: 4.9, rating_count: 148, product_id: '1', has_purchase: true }] } }),
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const REPLY = 'Mình ưu tiên nồi 5–6 lít.\n\n- **Mẫu đáng cân nhắc:** Nồi chiên không dầu **B.COOK 6 lít** đang được niêm yết trên Shopee với giá **690.000 đồng**, đánh giá **4,9/5 từ 148 lượt**.\n- **Mẫu khác:** Nồi chiên **Bịa 5 lít** giá **555.000 đồng**.'
  it('the listing price stays, an invented price is still cut', async () => {
    const out = await run(USER, frames(REPLY), true, true)
    expect(out).toContain('giá **690.000 đồng**')
    expect(out).not.toContain('555.000')
  })
  it('without one brain the travel guard still judges it as before (the listing price is not its evidence)', async () => {
    const out = await run(USER, frames(REPLY), false, true)
    expect(out).not.toContain('555.000')
    expect(out).not.toContain('690.000')
  })
})

// the user's 15 triệu split by the model into its own planning figures (the real reply of the run, plan block left out)
const SPLIT = '**Ngân sách 15 triệu cho hai người có thể làm được**, nếu săn được vé khứ hồi Hà Nội–Phú Quốc khoảng **5–6 triệu đồng tổng cộng**, ở nhà nghỉ/khách sạn bình dân và đi tự túc. Mình đã tạo lịch trình 3 ngày 2 đêm kèm dự toán trong thẻ kế hoạch bên dưới.\n\n- **Vé máy bay:** Hiện chưa thể chốt giá chính xác nếu chưa có ngày bay cụ thể. Một trang so sánh vé ghi giá khứ hồi tham khảo khoảng 1,38–4,42 triệu đồng/người, nhưng đây không phải báo giá đảm bảo cho ngày giữa tháng 12; hãy đặt mục tiêu tối đa **6 triệu đồng/2 người**, gồm hành lý cần thiết.\n- **Lưu trú:** Dự trù **1,4 triệu/2 đêm** cho phòng đôi bình dân ở Dương Đông. Mình chưa xác minh được giá phòng theo ngày; các khách sạn tìm thấy hiện chưa có giá xác nhận, nên cần kiểm tra ngày cụ thể trước khi đặt.\n- **Ăn uống và đi lại:** Dự trù **2,1 triệu** ăn uống, **700.000 đồng** thuê xe máy và xăng, **500.000 đồng** cho đi sân bay/đi lại khác. Đây là mức lập kế hoạch tiết kiệm, chưa phải giá báo từ nhà cung cấp.\n- **Tổng dự toán:** Khoảng **11–12 triệu đồng**, gồm vé bay theo mục tiêu săn vé, còn khoảng **3–4 triệu dự phòng** cho giá vé/phòng tăng hoặc hành lý.\n\n**Lưu ý:** Dự toán này chưa tính mua sắm lớn và có thể vượt 15 triệu nếu vé bay khứ hồi hai người cao hơn 6 triệu.'
const TRIP_USER = 'Mình với bạn gái muốn đi Phú Quốc 3 ngày 2 đêm từ Hà Nội vào giữa tháng 12/2026, tổng ngân sách khoảng 15 triệu cho 2 người, gồm vé máy bay. Lên giúp mình lịch trình từng ngày và chia chi phí từng khoản.'

describe('travel guard money: "keep" leaves the model\'s own planning figures (one brain), "judge" is unchanged', () => {
  it('judge (default) still cuts the figures no live fare, user number or calculator backs', () => {
    const r = guardTravelClaimsInText(SPLIT, [], TRIP_USER)
    expect(r.redacted).toBeGreaterThan(0)
    expect(r.text).not.toContain('2,1 triệu')
  })
  it('keep returns the split as written', () => {
    const r = guardTravelClaimsInText(SPLIT, [], TRIP_USER, { money: 'keep' })
    expect(r.text).toBe(SPLIT)
    expect(r.redacted).toBe(0)
  })
  it('keep does not switch off the schedule / availability check', () => {
    // (a lead sentence: the guard keeps a reply whole when removing the sentence would empty it)
    const r = guardTravelClaimsInText('Mình gợi ý đi vào buổi sáng cho thoải mái.\n\nChuyến bay khởi hành lúc 8h sáng, còn 3 chỗ.', [], TRIP_USER, { money: 'keep', availability: 'counted' })
    expect(r.text).not.toContain('còn 3 chỗ')
    expect(r.text).toContain('buổi sáng cho thoải mái')
  })
})

describe('the same split through the stream filter (travel turn)', () => {
  const frames = ['0:' + JSON.stringify(SPLIT), 'd:{"finishReason":"stop"}']
  const PLAN = JSON.stringify({ type: 'trip', title: 'Phú Quốc 3 ngày 2 đêm', people: 2, days: [{ label: 'Ngày 1', items: [{ time: 'Sáng', category: 'transport', name: 'Bay Hà Nội – Phú Quốc', description: 'Chọn chuyến đến trước đầu giờ chiều.' }] }] })
  it('a plan turn in one brain (the model called present_plan) keeps its own planning figures', async () => {
    const out = await run(TRIP_USER, frames, true, true, PLAN)
    expect(out).toContain('**2,1 triệu** ăn uống')
    expect(out).toContain('Khoảng **11–12 triệu đồng**')
  })
  it('a one-brain turn with no plan keeps judging the money it states (an invented fare is cut)', async () => {
    expect(await run(TRIP_USER, frames, true, true)).not.toContain('2,1 triệu')
  })
  it('without one brain they are cut as before', async () => {
    expect(await run(TRIP_USER, frames, false, true)).not.toContain('2,1 triệu')
  })
  it('a plan turn in one brain gets no code-written "÷ 2 người" line after the model\'s own split; elsewhere the line is still added', async () => {
    const plan = JSON.stringify({ type: 'trip', title: 'Phú Quốc 3 ngày 2 đêm', people: 2, days: [{ label: 'Ngày 1', items: [{ time: 'Sáng', category: 'transport', name: 'Bay Hà Nội – Phú Quốc', description: 'Chọn chuyến đến trước đầu giờ chiều.' }] }] })
    const withPlan = ['0:' + JSON.stringify(`Mình đã lập lịch trình bên dưới.\n\n[TAPPY_PLAN]\n${plan}\n[/TAPPY_PLAN]`), 'd:{"finishReason":"stop"}']
    expect(await run(TRIP_USER, withPlan, true, true, plan)).not.toContain('÷ 2 người')
    expect(await run(TRIP_USER, withPlan, false, true)).toContain('÷ 2 người')
  })
  it('a plan card in the reply keeps its budget in one brain and loses it without', async () => {
    const plan = { type: 'trip', title: 'Phú Quốc 3 ngày 2 đêm', people: 2, budget_total: 'Khoảng 15.000.000₫ cho 2 người; dự toán giả định vé tối đa 6,0 triệu/2 người.', days: [{ label: 'Ngày 1', items: [{ time: 'Sáng', category: 'transport', name: 'Bay Hà Nội – Phú Quốc', description: 'Chọn chuyến đến trước đầu giờ chiều.' }] }] }
    const reply = `Mình đã lập lịch trình bên dưới.\n\n[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]`
    const f = ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
    expect(await run(TRIP_USER, f, true, true)).toContain('dự toán giả định vé tối đa 6,0 triệu/2 người')
    expect(await run(TRIP_USER, f, false, true)).not.toContain('dự toán giả định vé tối đa 6,0 triệu')
  })
})

describe('plan card budget: keepModelBudget leaves the model\'s own total and cost lines', () => {
  const plan = {
    type: 'trip',
    budget_total: 'Khoảng 15.000.000₫ cho 2 người, gồm vé máy bay; dự toán giả định săn vé khứ hồi tối đa 6,0 triệu/2 người và đi tự túc tiết kiệm.',
    cost_breakdown: { 'Vé máy bay khứ hồi 2 người (mục tiêu săn):': '5.000.000–6.000.000₫', 'Ăn uống 3 ngày cho 2 người:': '2.100.000₫ dự trù', 'Tổng dự toán:': 'Khoảng 11.000.000–12.000.000₫; còn khoảng đệm 3.000.000–4.000.000₫' },
    days: [{ label: 'Ngày 1', items: [{ time: 'Sáng', category: 'transport', name: 'Bay Hà Nội (HAN) – Phú Quốc (PQC)', description: 'Chọn chuyến đến trước đầu giờ chiều.' }] }],
  }
  const text = `Tóm tắt.\n\n[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]`
  const evidence = { byEntity: new Map<string, number[]>(), userAmounts: [15_000_000] }
  const parsed = (t: string) => JSON.parse(t.slice(t.indexOf('[TAPPY_PLAN]') + 12, t.indexOf('[/TAPPY_PLAN]')).trim()) as typeof plan
  it('default replaces the total and the cost lines by "chưa có giá"', () => {
    const p = parsed(guardPlanPrices(text, evidence, 'vi').text)
    expect(p.budget_total).toBe('chưa có giá')
    expect(p.cost_breakdown['Ăn uống 3 ngày cho 2 người:']).toBe('chưa có giá')
  })
  it('keepModelBudget keeps both', () => {
    const p = parsed(guardPlanPrices(text, evidence, 'vi', { keepModelBudget: true }).text)
    expect(p.budget_total).toBe(plan.budget_total)
    expect(p.cost_breakdown).toEqual(plan.cost_breakdown)
  })
})

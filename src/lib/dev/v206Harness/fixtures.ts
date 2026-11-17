// DEV TEST HARNESS FIXTURES (route /dev/v206, development only; the route answers 404 in a production build).
//
// These are the six scenarios of the mockup D:\redesign\TappyAI_Web_Mockups_v206.html written as the data the product's chat actually reads:
//   · an assistant message = markdown text, plus the markers the product's own readers decode ([TAPPY_MEDIA], [TAPPY_PLAN]),
//   · the place cards = a `tappy.places.v1` annotation (handed to the product's own cache, exactly as the chat does across its save navigation),
//   · the history and the project = a conversation store.
// The text is illustrative (taken from the mockup's sample content): it is NOT fact, it is never shown outside the dev route, and everything the mockup only pretended
// (a "verified" badge, a gate status, a discount code, a booking offer) is deliberately left out: the product has no data behind those, and the harness must not invent it.
import type { HistoryConversation } from '@/lib/chat/workspace/historyModel'
import type { ChatProject } from '@/components/chat/workspace/useConversationList'
import type { PlacesLiveView, LivePlace, LiveAction } from '@/lib/recommendation/liveView'
import type { PresentationFrame } from '@/lib/presentation/read'

export interface HarnessMessage { role: 'user' | 'assistant'; content: string }

export interface HarnessScenario {
  n: 1 | 2 | 3 | 4 | 5 | 6
  /** the tab name of the mockup */
  label: string
  /** the conversation the workspace shows as open */
  conversationId: string
  kind: 'chat' | 'project'
  messages: HarnessMessage[]
  /** the place cards of the (last) answer, as the annotation the product reads */
  placesView?: PlacesLiveView
  /** a project to open (kind 'project') */
  projectId?: string
  /** the blocks the model declared for the (last) answer, as the live frame the product reads (15/11: the subject cards) */
  presentation?: PresentationFrame
}

/** The subject cards the model would declare for scenario 1: sample text of the mockup, labelled as such; no link, no picture of ours (the entity-profile fixture answers with no picture). */
const S1_PROFILES: PresentationFrame = {
  presentation: {
    v: 1,
    blocks: [{
      id: 'prof1', type: 'profiles', items: [
        { name: 'Elon Musk', subtitle: '1971 · 55 tuổi trong năm 2026', points: [
          { lead: 'PayPal', text: 'tham gia xây dựng X.com, tiền thân của PayPal.' }, { lead: 'Tesla', text: 'thúc đẩy xe điện trở thành ngành công nghiệp quy mô lớn.' },
          { lead: 'SpaceX', text: 'thương mại hóa tên lửa tái sử dụng, tạo bước ngoặt cho ngành phóng vệ tinh.' }, { lead: 'Starlink', text: 'xây dựng mạng Internet vệ tinh toàn cầu.' }, { lead: 'xAI', text: 'bước vào cuộc đua AI với Grok.' },
        ], sources: ['Tesla Investor Relations', 'Biography.com', 'TechCrunch'] },
        { name: 'Sam Altman', subtitle: '1985 · 41 tuổi trong năm 2026', points: [
          { lead: 'Loopt', text: 'startup đầu tiên, sau đó được Green Dot mua lại.' }, { lead: 'Y Combinator', text: 'cựu Chủ tịch vườn ươm khởi nghiệp số 1 thế giới, đỡ đầu Airbnb, Stripe, Reddit.' },
          { lead: 'OpenAI', text: 'đồng sáng lập và CEO, biến ChatGPT thành sản phẩm công nghệ phát triển nhanh nhất lịch sử.' }, { lead: 'Worldcoin (World Network)', text: 'mạng lưới định danh sinh trắc học toàn cầu thời đại AI.' },
          { lead: 'Helion Energy', text: 'đầu tư 375 triệu USD đặt cược vào năng lượng nhiệt hạch sạch.' },
        ], sources: ['Y Combinator', 'OpenAI', 'Reuters'] },
      ],
    }],
  },
  links: {},
}

export const assistantTextOf =(s: HarnessScenario): string => s.messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n')

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
// Times are relative to a clock the CALLER hands in (the page's server render passes one, and the browser reuses it): a clock read here would differ between the server render
// and the hydration ("57 phút trước" against "30 phút trước"). Each offset sits 30 s past a whole minute, so a few seconds of drift never flips the relative label.
const agoFrom = (nowMs: number) => (ms: number): string => new Date(nowMs - ms - 30_000).toISOString()

// ── 1. Elon vs Sam: two subjects, a comparison table, a verdict ─────────────────────────────────────────────
const S1_MEDIA = '[TAPPY_MEDIA]' + JSON.stringify({
  v: 1,
  kind: 'entities',
  entities: [
    { name: 'Elon Musk', summary: 'Doanh nhân gốc Nam Phi, đứng đầu Tesla, SpaceX và xAI.', href: 'https://en.wikipedia.org/wiki/Elon_Musk', source: 'Wikipedia' },
    { name: 'Sam Altman', summary: 'Doanh nhân Mỹ, giám đốc điều hành OpenAI, từng là chủ tịch Y Combinator.', href: 'https://en.wikipedia.org/wiki/Sam_Altman', source: 'Wikipedia' },
  ],
}) + '[/TAPPY_MEDIA]'

const S1_ANSWER = `Đây là một cuộc đối đầu rất đáng phân tích, vì **Elon Musk** và **Sam Altman** đại diện cho hai trường phái lãnh đạo công nghệ gần như đối lập:

- **Elon Musk:** kỹ sư tư duy hệ thống (First Principles), nhà công nghiệp, thích đánh cược lớn, xây dựng những thứ thay đổi cả ngành công nghiệp.
- **Sam Altman:** nhà chiến lược, nhà tổ chức vốn và nhân tài, giỏi xây dựng hệ sinh thái AI, biến công nghệ thành nền tảng có hàng trăm triệu người sử dụng.

Nhưng câu hỏi ai giỏi hơn phải tách ra: giỏi công nghệ, giỏi kinh doanh, giỏi lãnh đạo hay giỏi nhìn thấy tương lai. Gộp tất cả thành một điểm thì hơi oan cho cả hai ông.

## So sánh thành tích thực tế

**Elon Musk** gắn với PayPal (X.com), Tesla, SpaceX, Starlink và xAI. **Sam Altman** gắn với Loopt, Y Combinator, OpenAI, Worldcoin và Helion Energy.

${S1_MEDIA}

## So sánh các khía cạnh cốt lõi

So sánh nhanh theo bốn trục:

| Khía cạnh | Elon Musk | Sam Altman |
| --- | --- | --- |
| Trọng tâm kỹ thuật | Kỹ thuật cơ khí, vật lý thực tế, dây chuyền sản xuất tự động | Mô hình AI tạo sinh, hạ tầng siêu máy tính, thuật toán phần mềm |
| Năng lực gọi vốn và quy tụ | Dựa vào tầm nhìn cá nhân và thị trường chứng khoán công chúng | Kết nối liên minh chiến lược (Microsoft, SoftBank, quỹ quốc gia) |
| Phong cách điều hành | Trực tiếp, vi mô, văn hóa "hardcore", ép tiến độ cực hạn | Ngoại giao khéo léo, trao quyền nghiên cứu tự do, xây dựng đồng thuận |
| Quy mô ảnh hưởng | Thay đổi cả 4 ngành: ô tô, vũ trụ, viễn thông, năng lượng | Định hình hướng đi của trí tuệ nhân tạo |

> Kết luận: nếu định nghĩa "giỏi" là làm chủ kỹ thuật và biến điều bất khả thi trong thế giới vật lý thành sự thật, Elon Musk là thiên tài công nghiệp. Nếu đo bằng năng lực nhìn thấu tương lai của AI, thu hút nhân tài và kết nối mạng lưới quyền lực số, Sam Altman đang nắm bánh lái quan trọng bậc nhất của kỷ nguyên mới.`

// ── 2. Tesla: a direct answer, a dated list, a callout, a data table ───────────────────────────────────────
const S2_ANSWER = `Đúng một phần: **Tesla** gắn liền với **Elon Musk**, nhưng có một chi tiết lịch sử thú vị là Elon không phải người sáng lập đầu tiên.

Câu chuyện chính xác là:

- **2003:** Martin Eberhard và Marc Tarpenning thành lập Tesla Motors.
- **2004:** Elon Musk đầu tư khoảng 6,5 triệu USD trong vòng gọi vốn Series A đầu tiên, trở thành cổ đông lớn nhất và Chủ tịch HĐQT.
- **2008:** Elon chính thức trở thành CEO của công ty.
- **2009:** một thỏa thuận pháp lý cho phép 5 người, trong đó có Elon Musk, được công nhận là đồng sáng lập Tesla.

> Một điều đáng nể: Elon không tạo ra Tesla từ con số 0, nhưng chính ông là người rót vốn sinh tử và tham gia định hướng kỹ thuật sản phẩm, biến một startup xe điện vô danh thành tập đoàn công nghệ toàn cầu.

Thông số kỹ thuật của hệ thống trạm sạc V4 Supercharger:

| Thông số kỹ thuật | Hệ thống V4 Supercharger | Ý nghĩa thực tế |
| --- | --- | --- |
| Công suất sạc đỉnh | Lên tới 500 kW | Hỗ trợ xe điện dân dụng và xe tải hạng nặng Tesla Semi |
| Kiến trúc điện áp | 400V - 1000V | Tương thích cả dòng xe cũ và dòng xe 800V thế hệ mới |
| Thời gian sạc nhanh | 15 phút cho 320 km | Gần tương đương thời gian dừng nghỉ chân và đổ xăng truyền thống |

Nguồn: báo cáo kỹ thuật Tesla Investor Day và hồ sơ SEC (dữ liệu mẫu của bộ thử, không phải số liệu thật).`

// ── 3. Thảo Điền: two place cards with their editorial text around them ────────────────────────────────────
const S3_ANSWER = `Khu Thảo Điền (TP. Thủ Đức) là điểm hẹn ẩm thực quen thuộc của các cặp đôi nhờ không gian sân vườn biệt thự xanh mát và yên tĩnh. Với ngân sách khoảng 1,5 - 2,0 triệu cho 2 người, đây là hai lựa chọn hợp nhất:

## La Villa French Restaurant — cổ điển và riêng tư

Tọa lạc trong một căn biệt thự Pháp biệt lập có hồ bơi và khu vườn nhiệt đới tĩnh lặng, **La Villa French Restaurant** mang đến trải nghiệm ẩm thực Pháp tinh tế. Không gian ngoài hiên nhìn ra vườn hoa là chỗ lý tưởng cho các cặp đôi tìm sự lãng mạn nhẹ nhàng.

## The Deck Saigon — bàn ven sông ngắm hoàng hôn

Nhà hàng sát bờ sông Sài Gòn với sàn gỗ ngoài trời đón gió tự nhiên. Nổi tiếng với góc ngắm hoàng hôn và thực đơn Pan-Asian, Âu hiện đại ở **The Deck Saigon**.

> Mẹo đặt chỗ: với buổi hẹn hò 2 người, nên đặt trước tối thiểu 1 ngày và ghi chú "bàn ven sông ngắm hoàng hôn (17:30)" nếu chọn The Deck, hoặc "bàn cạnh hồ bơi trong sân vườn" nếu chọn La Villa.`

const act = (kind: LiveAction['kind'], url: string, labelKey: string, over: Partial<LiveAction> = {}): LiveAction => ({ kind, urlKind: 'direct', url, labelKey, ...over })

const placeBase = (id: string, name: string, rank: number, over: Partial<LivePlace>): LivePlace => ({
  id, domain: 'food', kind: 'place', name, rank, actions: [], ...over,
})

const S3_VIEW: PlacesLiveView = {
  kind: 'tappy.places.v1',
  v: 1,
  domain: 'food',
  ranked: true,
  shown: 2,
  picked: ['harness-la-villa', 'harness-the-deck'],
  items: [
    placeBase('harness-la-villa', 'La Villa French Restaurant', 0, {
      address: '14 Ngô Quang Huy, An Khánh, TP. Thủ Đức',
      rating: 4.8, ratingCount: 890, distanceKm: 1.8,
      priceRangeText: '800.000 - 1.100.000 ₫',
      openingHours: 'Thứ 3 - CN: 18:00 - 22:30', openNow: true,
      phone: '02838982082', categories: ['Nhà hàng Pháp'], recommended: true,
      actions: [
        act('maps', 'https://www.google.com/maps/search/?api=1&query=La+Villa+French+Restaurant+Thao+Dien', 'v3.action.maps', { priority: 1 } as Partial<LiveAction>),
        act('call', 'tel:02838982082', 'v3.action.call', { priority: 2 } as Partial<LiveAction>),
      ],
    }),
    placeBase('harness-the-deck', 'The Deck Saigon', 1, {
      address: '38 Nguyễn Ư Dĩ, Thảo Điền, TP. Thủ Đức',
      rating: 4.7, ratingCount: 2400, distanceKm: 2.1,
      priceRangeText: '900.000 - 1.200.000 ₫',
      openingHours: '08:00 - 23:00', openNow: true,
      phone: '02837446632', categories: ['Nhà hàng ven sông'],
      actions: [
        act('maps', 'https://www.google.com/maps/search/?api=1&query=The+Deck+Saigon+Thao+Dien', 'v3.action.maps', { priority: 1 } as Partial<LiveAction>),
        act('call', 'tel:02837446632', 'v3.action.call', { priority: 2 } as Partial<LiveAction>),
      ],
    }),
  ],
}

// ── 4. Đà Lạt: a [TAPPY_PLAN] with days, stops, tips and a budget ─────────────────────────────────────────
const S4_PLAN = {
  type: 'trip',
  title: 'Lịch trình Đà Lạt 3N2Đ: dưỡng lành cùng bé 5 tuổi',
  people: 3,
  budget_total: '~10.500.000đ',
  days: [
    {
      label: 'Ngày 1: Hồ Tuyền Lâm',
      items: [
        { time: '11:30', emoji: '🚗', category: 'transport', name: 'Sân bay Liên Khương và xe riêng về Terracotta Resort', description: 'Xe riêng 7 chỗ đón sẵn tại sảnh, di chuyển khoảng 32 km về khu nghỉ dưỡng bên hồ Tuyền Lâm (khoảng 35 phút).' },
        { time: '14:00', emoji: '🌲', category: 'hotel', name: 'Villa Hồ Tuyền Lâm', description: 'Nhận phòng tầng trệt, không có bậc thang dốc, có lối dạo bộ trải thảm cỏ an toàn cho bé. Cả nhà ngủ trưa hồi sức sau chuyến bay.', address: 'Hồ Tuyền Lâm, Đà Lạt' },
        { time: '17:30', emoji: '🍲', category: 'food', name: 'Lẩu gà lá é Tao Ngộ', description: 'Cách resort 10 phút. Nên dặn quán lấy phần nước lèo riêng, chưa bỏ ớt hiểm, để bé ăn cùng bún tươi.', address: 'Đường 3 Tháng 4, Đà Lạt', price: '~600.000đ' },
      ],
    },
    {
      label: 'Ngày 2: Puppy Farm',
      items: [
        { time: '08:30', emoji: '🐶', category: 'entertainment', name: 'Nông trại cún Puppy Farm và vườn dâu công nghệ cao', description: 'Lối đi bê tông bằng phẳng, xe đẩy lăn êm. Bé vuốt ve cún và tự hái dâu tây sạch trên giàn treo.', price: '~300.000đ' },
        { time: '12:00', emoji: '🍗', category: 'food', name: 'Cơm lam gà nướng Khương Duy', description: 'Quán sân vườn rộng bên sườn đồi. Cơm lam nướng ống tre dẻo thơm là món bé 5 tuổi ăn ngon miệng.', address: 'Ngã 3 Tuyền Lâm, Đà Lạt' },
      ],
    },
    {
      label: 'Ngày 3: Cáp treo Robin',
      items: [
        { time: '09:00', emoji: '🚠', category: 'entertainment', name: 'Cáp treo đồi Robin sang Thiền viện Trúc Lâm', description: 'Tuyến cáp treo dài 2,3 km với cabin khép kín. Bé ngắm thung lũng thông và hồ Tuyền Lâm từ trên cao, không phải leo trèo.', price: '~450.000đ' },
        { time: '13:30', emoji: '✈️', category: 'transport', name: 'Trả phòng và xe riêng ra sân bay Liên Khương', description: 'Ăn trưa nhẹ tại resort, xe đón lúc 13:30 để kịp chuyến bay 15:45 về TP.HCM.' },
      ],
    },
  ],
  cost_breakdown: {
    'Resort và lưu trú': '3.800.000đ',
    'Xe riêng và di chuyển': '2.400.000đ',
    'Ẩm thực và nhà hàng': '2.600.000đ',
    'Vé tham quan và trải nghiệm': '1.200.000đ',
    'Dự phòng phát sinh': '500.000đ',
  },
  local_tips: [
    { text: 'Đèo Prenn hiện khá phẳng, nhưng nên cho bé uống chút nước ấm hoặc dán miếng dán thảo dược trước khi khởi hành 20 phút để chống say xe.', basis: 'general', place: 'Sân bay Liên Khương và xe riêng về Terracotta Resort' },
    { text: 'Nên đến Puppy Farm vào khung 08:30 - 10:00 khi các bạn cún được thả tự do nhiều nhất và nắng dịu.', basis: 'general', place: 'Nông trại cún Puppy Farm và vườn dâu công nghệ cao' },
    { text: 'Buổi tối Đà Lạt có thể xuống 12 - 14°C, nên mang áo ấm cho bé.', basis: 'general' },
    { text: 'Đặt xe riêng trước ít nhất 1 ngày, nhất là dịp cuối tuần.', basis: 'general' },
    { text: 'Mang sẵn đồ ăn nhẹ quen thuộc cho bé trong các chặng di chuyển.', basis: 'general' },
  ],
}

const S4_ANSWER = `Dưới đây là lịch trình 3 ngày 2 đêm nhẹ nhàng cho gia đình có bé 5 tuổi: ít cung dốc, có chỗ nghỉ trưa thoải mái bên hồ Tuyền Lâm.

[TAPPY_PLAN]${JSON.stringify(S4_PLAN)}[/TAPPY_PLAN]`

// ── 5. Deep Research: a report long enough (and with enough sections) for the product to treat it as one ─────
const S5_SECTIONS: Array<[string, string[]]> = [
  ['Tóm tắt điều hành', [
    'Phú Quốc có địa hình chia cắt tự nhiên thành ba cụm du lịch với vi khí hậu và bãi biển khác biệt rõ rệt. Chọn sai cụm theo mùa có thể làm giảm đáng kể chất lượng kỳ nghỉ, nhất là với gia đình có trẻ nhỏ và người lớn tuổi.',
    'Bắc đảo (Bãi Dài, Gành Dầu) tập trung các khu vui chơi giải trí khép kín, bãi biển thoai thoải, phù hợp gia đình có trẻ hiếu động. Nam đảo (Bãi Khem, Mũi Ông Đội) có vùng biển êm nhất đảo nhờ được bao bọc bởi hai dãy núi, hợp nghỉ dưỡng biệt lập. Bãi Trường (Dương Tơ) là dải bờ biển hướng Tây dài nhất đảo, ngắm hoàng hôn đẹp và chỉ cách sân bay khoảng 10 - 15 phút.',
    'Khuyến nghị sơ bộ của báo cáo thử này: gia đình ba thế hệ cần di chuyển ít và biển êm nên ưu tiên Nam đảo hoặc Bãi Trường; gia đình có trẻ thích công viên giải trí nên cân nhắc Bắc đảo. Đây là dữ liệu mẫu của bộ thử, không phải kết quả nghiên cứu thật.',
  ]],
  ['Phương pháp và phạm vi', [
    'Bộ thử này mô phỏng một báo cáo nghiên cứu sâu: câu hỏi nghiên cứu, tiêu chí so sánh, nguồn tham chiếu và kết luận. Mỗi tiêu chí được đối chiếu giữa ba cụm nghỉ dưỡng: khoảng cách từ sân bay, đặc tính sóng và bãi biển, đối tượng phù hợp, thương hiệu tiêu biểu và mức giá trung bình mỗi đêm.',
    'Phạm vi giới hạn ở kỳ nghỉ cuối năm cho gia đình. Báo cáo không đánh giá chất lượng dịch vụ từng khách sạn, không đưa ra giá phòng thực tế theo ngày, và không thay thế việc kiểm tra tình trạng phòng trước khi đặt.',
    'Mọi con số trong tài liệu này là số mẫu phục vụ việc kiểm tra giao diện. Khi chạy với mô hình thật, mỗi con số phải đi kèm nguồn và trạng thái đối soát do quy trình kiểm chứng của sản phẩm tạo ra.',
  ]],
  ['So sánh ba cụm nghỉ dưỡng', [
    'Bảng dưới đây gom các tiêu chí chính của ba cụm. Khoảng cách và mức giá là số mẫu để minh họa cách trình bày bảng so sánh trong báo cáo.',
    '| Tiêu chí | Bắc đảo | Nam đảo | Bãi Trường |\n| --- | --- | --- | --- |\n| Khoảng cách từ sân bay | 45 - 50 phút (khoảng 38 km) | 25 - 30 phút (khoảng 22 km) | 10 - 15 phút (khoảng 11 km) |\n| Đặc tính sóng và bãi biển | Sóng êm vào mùa khô (T11 - T4), mùa mưa sóng lớn | Biển êm gần như quanh năm | Sóng đều vừa phải, cát vàng, ngắm hoàng hôn |\n| Phù hợp đối tượng | Gia đình có trẻ nhỏ, thích công viên giải trí | Cặp đôi, người tìm sự yên tĩnh | Khách công tác, gia đình trẻ thích ẩm thực |\n| Mức giá trung bình mỗi đêm | 3,2 - 5,5 triệu đồng | 6,5 - 14 triệu đồng | 4,5 - 10 triệu đồng |',
    'Điểm đáng chú ý là khoảng cách tới sân bay tỷ lệ nghịch với mức độ yên tĩnh: cụm gần sân bay nhất lại sôi động nhất, còn cụm xa hơn thường yên tĩnh và đắt hơn.',
  ]],
  ['Phân tích theo mùa', [
    'Mùa khô kéo dài từ khoảng tháng 11 đến tháng 4 là thời điểm biển êm ở hầu hết các bãi, phù hợp cho kỳ nghỉ cuối năm. Từ tháng 5 đến tháng 10 gió Tây Nam làm sóng lớn hơn ở bờ Tây, trong khi vùng Nam đảo vẫn được che chắn tốt hơn.',
    'Với kỳ nghỉ vào tháng 12, cả ba cụm đều ở mùa thuận lợi. Khác biệt chính nằm ở mật độ khách và giá phòng: dịp cuối năm giá thường tăng và phòng gia đình hết sớm, nên cần giữ chỗ từ sớm.',
    'Gia đình có người lớn tuổi nên chú ý thêm đến khoảng cách di chuyển trong nội khu và việc resort có xe điện đưa đón hay không, vì đây thường là yếu tố quyết định mức thoải mái hơn là hạng sao.',
  ]],
  ['Chi phí và ngân sách', [
    'Với bốn ngày ba đêm cho cả gia đình, chi phí lưu trú chiếm phần lớn ngân sách. Chọn cụm gần sân bay giúp giảm tiền di chuyển, nhưng không nhất thiết giảm tổng chi phí vì mức giá phòng ở Bãi Trường cũng rất rộng.',
    'Các khoản cần tính thêm gồm vé máy bay, ăn uống ngoài resort, vé vui chơi và dự phòng. Nên để dự phòng khoảng mười phần trăm tổng ngân sách cho các phát sinh nhỏ.',
    'Số liệu chi phí trong phần này là ước tính mẫu. Báo cáo thật phải nêu rõ phần nào là số đã đối soát, phần nào là ước tính, và dựa trên giả định nào.',
  ]],
  ['Hạ tầng và di chuyển', [
    'Sân bay quốc tế Phú Quốc nằm ở phía Tây Nam đảo, nên Bãi Trường là cụm gần nhất về thời gian di chuyển. Đường từ sân bay lên Bắc đảo dài hơn và đông hơn vào cuối tuần; đường xuống Nam đảo thoáng hơn nhưng có đoạn hẹp và nhiều khúc cua.',
    'Trong nội khu, các resort lớn thường có xe điện đưa đón 24/7, nhưng không phải nơi nào cũng có. Với ông bà và trẻ nhỏ, đây là tiêu chí nên hỏi trực tiếp trước khi đặt phòng, vì một khu nghỉ dưỡng trải rộng có thể mất khá nhiều thời gian đi bộ giữa phòng, nhà hàng và bãi biển.',
    'Nếu thuê xe riêng, giá thường tính theo chặng sân bay hoặc theo ngày tham quan. Nên thống nhất giá trọn gói và giờ đón từ trước để tránh phát sinh, đặc biệt vào dịp lễ khi nhu cầu tăng cao.',
  ]],
  ['Ẩm thực và tiện ích cho gia đình', [
    'Phú Quốc nổi tiếng với hải sản, nước mắm và các món địa phương. Gia đình có người lớn tuổi không ăn được cay nên nói rõ khi đặt bàn, vì nhiều món hải sản được chế biến khá đậm vị. Các nhà hàng ven biển thường đông vào giờ hoàng hôn, nên đặt chỗ sớm.',
    'Về tiện ích, nên kiểm tra resort có hồ bơi nông cho trẻ nhỏ, câu lạc bộ trẻ em, bữa sáng phù hợp trẻ và dịch vụ trông trẻ hay không. Với người lớn tuổi, phòng tầng trệt hoặc có thang máy, lối đi không bậc thang và nhân viên hỗ trợ hành lý là những chi tiết nhỏ nhưng quan trọng.',
    'Các quán ăn ngoài resort giúp thay đổi khẩu vị và tiết kiệm chi phí, nhưng cần tính thời gian di chuyển và giờ nghỉ trưa của trẻ. Báo cáo thật sẽ liệt kê từng địa điểm kèm nguồn và thời điểm kiểm tra; phần này chỉ là ví dụ về cách trình bày.',
  ]],
  ['Thời điểm đặt phòng', [
    'Kỳ nghỉ cuối năm là mùa cao điểm, nên các phòng gia đình và biệt thự hai phòng ngủ thường hết trước các hạng phòng đơn. Với kỳ nghỉ khoảng tháng 12, nên giữ chỗ sớm từ vài tháng trước và ưu tiên chính sách cho phép đổi ngày hoặc hoàn một phần tiền.',
    'Giá phòng thường thấp hơn ở các ngày giữa tuần và cao vọt vào dịp lễ, Giáng sinh và Tết dương lịch. Nếu lịch cho phép, dời ngày đi hoặc ngày về một đến hai ngày có thể giảm đáng kể chi phí lưu trú mà không đổi cụm nghỉ dưỡng.',
    'Vé máy bay cũng nên chốt sớm, vì khung giờ sáng thuận tiện cho người lớn tuổi và trẻ nhỏ thường được bán hết đầu tiên. Khi đã có giờ bay, mới nên đặt xe đưa đón và các hoạt động trong ngày đầu tiên.',
  ]],
  ['Những câu hỏi cần làm rõ trước khi quyết định', [
    'Số người và độ tuổi chính xác của từng thành viên, vì ảnh hưởng đến loại phòng, vé vui chơi và tiện ích cần thiết. Ngân sách tối đa cho lưu trú và cho toàn chuyến, để loại sớm các lựa chọn vượt khả năng chi trả.',
    'Mức ưu tiên giữa yên tĩnh và tiện lợi: một nhóm muốn biển êm, riêng tư sẽ chọn khác với nhóm muốn gần quán ăn và chợ đêm. Các ràng buộc về ăn uống, sức khỏe và khả năng đi bộ của người lớn tuổi.',
    'Những điều này sẽ được giữ lại trong ngữ cảnh của dự án để các cuộc trò chuyện sau, như lập lịch trình hoặc so sánh vé máy bay, không phải hỏi lại từ đầu.',
  ]],
  ['Rủi ro và hạn chế', [
    'Rủi ro thời tiết: bão và mưa lớn có thể làm hủy hoặc đổi lịch các hoạt động ngoài trời. Rủi ro giá: giá phòng biến động mạnh theo dịp lễ. Rủi ro thông tin: một số số liệu trong báo cáo có thể đã cũ vào thời điểm đọc.',
    'Hạn chế lớn nhất của bản thử này là không có nguồn thật: mọi nhận định đều là ví dụ để kiểm tra bố cục báo cáo, mục lục, bảng, chú thích và danh sách nguồn.',
  ]],
  ['Kết luận và khuyến nghị', [
    'Nếu ưu tiên biển êm và sự yên tĩnh, Nam đảo là lựa chọn phù hợp nhất cho gia đình ba thế hệ, đổi lại mức giá cao hơn và quãng đường từ sân bay dài hơn. Nếu ưu tiên tiện lợi và ẩm thực, Bãi Trường là điểm cân bằng. Nếu cần giải trí cho trẻ nhỏ, Bắc đảo phù hợp nhất.',
    'Dù chọn cụm nào, nên coi bảng so sánh ở trên là điểm xuất phát chứ không phải quyết định cuối cùng: giá phòng, tình trạng phòng và chính sách đổi trả thay đổi theo từng ngày, còn nhu cầu thực tế của từng thành viên trong gia đình mới là tiêu chí có trọng số lớn nhất. Một bước kiểm tra ngắn với hai hoặc ba resort cụ thể trước khi đặt thường tiết kiệm nhiều thời gian và tiền bạc hơn việc đọc thêm nhiều báo cáo.',
    'Bước tiếp theo nên làm: xác nhận ngày bay, số người, nhu cầu xe đưa đón nội khu và các ràng buộc ăn uống, rồi so sánh giá phòng thực tế của hai đến ba resort trong cụm đã chọn.',
  ]],
  ['Nguồn', [
    '1. Dữ liệu mẫu của bộ thử giao diện (không phải nguồn thật) — harness.local',
    '2. Dữ liệu mẫu về giá phòng của bộ thử giao diện (không phải nguồn thật) — harness.local',
  ]],
]

const S5_REPORT = '# Báo cáo so sánh ba cụm nghỉ dưỡng trọng điểm Phú Quốc\n\n' + S5_SECTIONS.map(([h, ps]) => `## ${h}\n\n${ps.join('\n\n')}`).join('\n\n')

// ── 6. The project, and the conversations linked to it ────────────────────────────────────────────────────
const PQ_RESEARCH: HarnessMessage[] = [
  { role: 'user', content: 'Khảo sát giúp tôi 3 cụm resort ở Phú Quốc cho kỳ nghỉ gia đình cuối năm.' },
  { role: 'assistant', content: S5_REPORT },
]
const PQ_PLAN: HarnessMessage[] = [
  { role: 'user', content: 'Lập kế hoạch Phú Quốc 4N3Đ ở Bãi Trường cho gia đình 3 thế hệ.' },
  { role: 'assistant', content: 'Đây là hướng đi 4 ngày 3 đêm tập trung ở Bãi Trường: ngày 1 nhận phòng và nghỉ ngơi, ngày 2 đi Hòn Thơm, ngày 3 tham quan phía Nam, ngày 4 trả phòng.' },
]

export const HARNESS_SCENARIOS: HarnessScenario[] = [
  { n: 1, label: 'Elon vs Sam', conversationId: 'h-elon', kind: 'chat', messages: [{ role: 'user', content: 'So sánh 2 cha nội Elon với Sam coi cha nào giỏi hơn' }, { role: 'assistant', content: S1_ANSWER }], presentation: S1_PROFILES },
  { n: 2, label: 'Tesla Fact', conversationId: 'h-tesla', kind: 'chat', messages: [{ role: 'user', content: 'Tesla có phải do Elon sáng lập từ đầu không? Kể tóm tắt giai đoạn đầu' }, { role: 'assistant', content: S2_ANSWER }] },
  { n: 3, label: 'Thảo Điền', conversationId: 'h-thaodien', kind: 'chat', messages: [{ role: 'user', content: 'Tư vấn cho tôi quán ăn tối cao cấp ở Thảo Điền Quận 2 cuối tuần này, không gian ấm cúng, đồ ăn ngon' }, { role: 'assistant', content: S3_ANSWER }], placesView: S3_VIEW },
  { n: 4, label: 'Đà Lạt Travel', conversationId: 'h-dalat', kind: 'chat', messages: [{ role: 'user', content: 'Lên giúp mình lịch trình Đà Lạt 3N2Đ cho gia đình có bé 5 tuổi, ưu tiên di chuyển nhẹ nhàng, không đi quá nhiều điểm dốc và có chỗ nghỉ trưa thoải mái.' }, { role: 'assistant', content: S4_ANSWER }] },
  { n: 5, label: 'Deep Research', conversationId: 'h-dossier', kind: 'chat', messages: PQ_RESEARCH },
  { n: 6, label: 'Dự án Phú Quốc', conversationId: 'h-project', kind: 'project', messages: [], projectId: 'p1' },
]

/** the text of the conversation the sidebar lists, by id (the project's linked conversations carry their own messages) */
const msgs = (m: HarnessMessage[]) => m.map(x => ({ role: x.role, content: x.content }))
const stub = (q: string, a: string): HarnessMessage[] => [{ role: 'user', content: q }, { role: 'assistant', content: a }]

export const harnessStoreItems = (nowMs: number): HistoryConversation[] => {
  const ago = agoFrom(nowMs)
  return [
    { id: 'h-thaodien', title: 'Quán ăn Âu sân vườn Thảo Điền', category: 'food', updated_at: ago(2 * HOUR), is_pinned: true, messages: msgs(HARNESS_SCENARIOS[2].messages) },
    { id: 'h-dossier', title: 'Khảo sát 3 cụm resort Phú Quốc (Dossier)', category: 'travel', updated_at: ago(3 * DAY), is_pinned: true, project_id: 'p1', messages: msgs(PQ_RESEARCH) },
    { id: 'h-elon', title: 'So sánh Elon Musk và Sam Altman', category: 'general', updated_at: ago(30 * MIN), messages: msgs(HARNESS_SCENARIOS[0].messages) },
    { id: 'h-tesla', title: 'Tesla và vai trò sáng lập của Elon Musk', category: 'general', updated_at: ago(3 * HOUR), messages: msgs(HARNESS_SCENARIOS[1].messages) },
    { id: 'h-dalat', title: 'Lịch trình Đà Lạt 3N2Đ cho bé 5 tuổi', category: 'travel', updated_at: ago(5 * HOUR), messages: msgs(HARNESS_SCENARIOS[3].messages) },
    { id: 'h-comtam', title: 'Quán cơm tấm đêm Sài Gòn nổi tiếng', category: 'food', updated_at: ago(2 * DAY), messages: msgs(stub('Cơm tấm khuya ở Sài Gòn?', 'Đây là vài gợi ý mẫu.')) },
    { id: 'h-pq-plan', title: 'Kế hoạch du lịch Phú Quốc 4N3Đ Bãi Trường', category: 'travel', updated_at: ago(5 * DAY), project_id: 'p1', messages: msgs(PQ_PLAN) },
    { id: 'h-laptop', title: 'Vệ sinh laptop và sửa chữa uy tín Q.10', category: 'general', updated_at: ago(20 * DAY), messages: msgs(stub('Chỗ vệ sinh laptop quận 10?', 'Đây là vài gợi ý mẫu.')) },
  ]
}

export const HARNESS_PROJECTS: ChatProject[] = [
  { id: 'p1', title: 'Dự án Du lịch Phú Quốc 2026', description: 'Chuyến đi gia đình 4N3Đ tháng 12/2026, 3 thế hệ nghỉ dưỡng biển êm', conversationCount: 2 },
]

/** what /api/entity-profile would answer for the chips of the scenarios (fixed, local: no Wikipedia request, no picture host) */
export const HARNESS_PROFILES = [
  { name: 'Elon Musk', title: 'Elon Musk', description: 'Doanh nhân', extract: 'Elon Musk là doanh nhân gốc Nam Phi, đứng đầu Tesla, SpaceX và xAI. (Dữ liệu mẫu của bộ thử.)', image: null, href: 'https://en.wikipedia.org/wiki/Elon_Musk', lang: 'en', source: 'Wikipedia' },
  { name: 'Sam Altman', title: 'Sam Altman', description: 'Doanh nhân', extract: 'Sam Altman là doanh nhân Mỹ, giám đốc điều hành OpenAI. (Dữ liệu mẫu của bộ thử.)', image: null, href: 'https://en.wikipedia.org/wiki/Sam_Altman', lang: 'en', source: 'Wikipedia' },
  { name: 'Tesla', title: 'Tesla, Inc.', description: 'Hãng xe điện', extract: 'Tesla, Inc. là hãng sản xuất xe điện và năng lượng sạch của Mỹ. (Dữ liệu mẫu của bộ thử.)', image: null, href: 'https://en.wikipedia.org/wiki/Tesla,_Inc.', lang: 'en', source: 'Wikipedia' },
] as const

export function scenarioByParam(raw: string | undefined | null): HarnessScenario {
  const n = Number(raw)
  return HARNESS_SCENARIOS.find(s => s.n === n) ?? HARNESS_SCENARIOS[0]
}

// The web-only features Tappy can explain (owner 20/11: "Tappy tu giai thich moi tinh nang cho nguoi khong biet dung"). The shared how-to-use guide (./guide, the page /how-to-use) is held equal
// with the Android and iOS strings by a parity test, so a feature that exists only on the web lives HERE, and the explain_feature tool reads both. Every number is read from the code that enforces
// it (plan prices, Deep Research allowances, the visitor limit), never typed again, so a change of a price or a limit changes the explanation too. Every sentence describes what exists today.
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { STANDARD_RESEARCH_MONTHLY, ADVANCED_RESEARCH_MONTHLY } from '@/lib/plans/tiers'
import { ANON_LIFETIME_LIMIT } from '@/lib/config/product'

export interface FeatureText { title: string; what: string; steps: string[]; more: string[] }
export interface WebFeature {
  id: string
  /** where it lives in the web app (a path), when it has a page of its own */
  where?: string
  /** extra words (folded: no accents, lower case, both languages) people use for it */
  keywords: string
  vi: FeatureText
  en: FeatureText
}

const vnd = (n: number): string => `${n.toLocaleString('vi-VN')}đ`
const usd = (n: number): string => `${n.toLocaleString('en-US')} VND`

export function webFeatures(): WebFeature[] {
  const stdPro = STANDARD_RESEARCH_MONTHLY.pro, advPro = ADVANCED_RESEARCH_MONTHLY.pro
  const stdMax = STANDARD_RESEARCH_MONTHLY.promax, advMax = ADVANCED_RESEARCH_MONTHLY.promax
  const P = Object.fromEntries((['pip', 'momo', 'coco', 'promax1m', 'promax3m'] as const).map(id => [id, { priceVnd: PLAN_CONFIG[id].priceVnd ?? 0 }])) as Record<'pip' | 'momo' | 'coco' | 'promax1m' | 'promax3m', { priceVnd: number }>
  return [
    {
      id: 'overview',
      keywords: 'lam duoc gi tinh nang moi dung bat dau gioi thieu tong quan huong dan what can you do getting started new overview features help',
      vi: {
        title: 'Tappy làm được gì',
        what: 'Tappy là trợ lý AI nói tiếng Việt: bạn hỏi bằng lời thường, Tappy trả lời và, khi cần, tra cứu giúp bạn.',
        steps: [
          'Mở Chat và nhắn điều bạn muốn bằng câu tự nhiên, ví dụ "tìm quán bún bò gần đây" hoặc "lập kế hoạch đi Đà Nẵng 3 ngày 2 đêm".',
          'Đọc câu trả lời; khi cần, Tappy hiện thẻ địa điểm, sản phẩm hoặc kế hoạch để bạn bấm xem.',
          'Hỏi tiếp để thu hẹp hoặc chỉnh lại; càng nêu rõ khu vực, ngân sách, dịp đi thì gợi ý càng sát.',
        ],
        more: [
          'Hỏi kiến thức, xin lời khuyên, nhờ viết và tính toán.',
          'Tìm quán ăn, cà phê, spa, khách sạn và địa điểm; tìm sản phẩm để so sánh; xem tin tức, thời tiết, giá vàng, giá vé (gói Coco và Tappy có tra cứu thời gian thực).',
          'Lập kế hoạch du lịch trọn gói, chia sẻ bằng liên kết hoặc tải PDF; viết báo cáo Nghiên cứu sâu (gói Coco và Tappy).',
          'Lưu lại để xem sau, nhận thông báo, nghe Tappy đọc câu trả lời và dùng vài công cụ nhỏ; hỏi Tappy về từng mục để biết cách dùng.',
        ],
      },
      en: {
        title: 'What Tappy can do',
        what: 'Tappy is an AI assistant that speaks Vietnamese: you ask in plain words, Tappy answers and, when needed, looks things up for you.',
        steps: [
          'Open Chat and write what you want in a natural sentence, for example "find a bun bo place near me" or "plan a 3-day 2-night trip to Da Nang".',
          'Read the answer; when it helps, Tappy shows place, product or plan cards you can tap.',
          'Ask a follow-up to narrow it down or change it; the more you say about the area, budget or occasion, the better the suggestion.',
        ],
        more: [
          'Ask for facts, advice, writing help and calculations.',
          'Find restaurants, cafes, spas, hotels and places; find products to compare; check news, weather, gold prices and fares (the Coco and Tappy plans have real-time lookups).',
          'Plan a full trip, share it with a link or download a PDF; write a Deep Research report (Coco and Tappy plans).',
          'Save things for later, get notifications, listen to answers read aloud and use a few small tools; ask Tappy about any of these to learn how.',
        ],
      },
    },
    {
      id: 'deep_research',
      keywords: 'nghien cuu sau bao cao deep research report phan tich chuyen sau pdf tai bao cao',
      vi: {
        title: 'Nghiên cứu sâu',
        what: 'Tappy đọc nhiều nguồn rồi viết một báo cáo có bố cục, có trích dẫn nguồn, dành cho câu hỏi cần phân tích kỹ (thị trường, so sánh, xu hướng).',
        steps: [
          'Bấm dấu + cạnh ô nhập tin nhắn và bật Nghiên cứu sâu.',
          'Gõ câu hỏi cần phân tích, nêu rõ chủ đề và phạm vi bạn quan tâm.',
          'Chờ vài phút: Tappy tìm nguồn, đọc và viết báo cáo.',
          'Đọc báo cáo trong khung riêng; có nút Tải PDF để lưu lại.',
        ],
        more: [
          `Mỗi tháng gói Coco có ${stdPro} báo cáo Standard và ${advPro} báo cáo Advanced; gói Tappy có ${stdMax} Standard và ${advMax} Advanced.`,
          'Tài khoản miễn phí và khách chưa có Nghiên cứu sâu.',
          'Báo cáo chỉ dựa trên nguồn đã đọc; điều chưa chắc được ghi rõ trong báo cáo.',
        ],
      },
      en: {
        title: 'Deep Research',
        what: 'Tappy reads many sources and writes a structured report with citations, for questions that need careful analysis (a market, a comparison, a trend).',
        steps: [
          'Tap the + next to the message box and turn on Deep Research.',
          'Type the question to analyse, saying the topic and the scope you care about.',
          'Wait a few minutes: Tappy finds sources, reads them and writes the report.',
          'Read the report in its own panel; a Download PDF button saves it.',
        ],
        more: [
          `Each month the Coco plan has ${stdPro} Standard and ${advPro} Advanced reports; the Tappy plan has ${stdMax} Standard and ${advMax} Advanced.`,
          'Free accounts and visitors do not have Deep Research.',
          'A report rests only on the sources it read; what is uncertain is said so in the report.',
        ],
      },
    },
    {
      id: 'trip_plan',
      keywords: 'ke hoach du lich lich trinh chuyen di trip plan itinerary chia se link pdf khach san an gi quan an',
      vi: {
        title: 'Kế hoạch du lịch',
        what: 'Nhờ Tappy lập kế hoạch cho một chuyến đi: Tappy tra cứu rồi trả về một thẻ kế hoạch có đủ ngày, giờ, đi lại, chỗ ở, món nên thử, dự toán và mẹo.',
        steps: [
          'Trong Chat, nhắn ví dụ "lập kế hoạch đi Quy Nhơn 3 ngày 2 đêm".',
          'Đọc thẻ kế hoạch: mỗi ngày có các điểm dừng, mục Chỗ ở gợi ý, Món nên thử và Dự toán chi phí.',
          'Trả lời câu hỏi cuối (số người, ngày đi, ngân sách) để Tappy chỉnh kế hoạch sát hơn.',
          'Bấm Chia sẻ liên kết để gửi một trang kế hoạch cho người đi cùng, hoặc Tải PDF để lưu.',
        ],
        more: [
          'Tappy không tự chốt số người, ngày đi hay ngân sách; khi bạn chưa nói, giá được tính theo từng người.',
          'Giá phòng và nút đặt chỉ hiện khi tra cứu có đúng khách sạn đó và có ngày đi.',
          'Cần đăng nhập để tạo liên kết chia sẻ.',
        ],
      },
      en: {
        title: 'Trip plans',
        what: 'Ask Tappy to plan a trip: it looks things up, then returns a plan card with days, times, getting there, where to stay, dishes to try, a cost estimate and tips.',
        steps: [
          'In Chat, write for example "plan a 3-day 2-night trip to Quy Nhon".',
          'Read the plan card: each day has its stops, plus Where to stay, What to try and a cost estimate.',
          'Answer the last question (how many people, dates, budget) so Tappy can fit the plan better.',
          'Tap Share link to send a plan page to the people travelling with you, or Download PDF to keep it.',
        ],
        more: [
          'Tappy does not decide the number of people, the dates or the budget for you; until you say, prices are per person.',
          'A room price and a booking button appear only when the lookup returned that very hotel and you gave dates.',
          'You need to be signed in to create a share link.',
        ],
      },
    },
    {
      id: 'planner',
      where: '/planner',
      keywords: 'ke hoach cua toi planner luu ke hoach xem lai ke hoach cu',
      vi: {
        title: 'Kế hoạch của tôi',
        what: 'Trang AI Planner (My Plans) giữ lại các kế hoạch Tappy đã lập cùng bạn trong các cuộc trò chuyện, để mở lại khi cần.',
        steps: ['Mở AI Planner (My Plans) trong menu hoặc trong Hồ sơ.', 'Chọn một kế hoạch để xem lại đầy đủ.'],
        more: ['Cần đăng nhập để thấy kế hoạch của mình.'],
      },
      en: {
        title: 'My plans',
        what: 'The AI Planner (My Plans) page keeps the plans Tappy made with you in your chats, so you can open them again.',
        steps: ['Open AI Planner (My Plans) from the menu or from your Profile.', 'Pick a plan to see it in full.'],
        more: ['You need to be signed in to see your plans.'],
      },
    },
    {
      id: 'plans_billing',
      where: '/subscription',
      keywords: 'goi thanh toan gia nang cap mua them gia han coco tappy promax free mien phi chuyen khoan vietqr subscription plan price upgrade',
      vi: {
        title: 'Gói và thanh toán',
        what: 'Có tài khoản miễn phí và hai gói trả phí: Coco và Tappy. Gói trả phí mở tra cứu thời gian thực (giá, địa điểm, tin tức), đối tác đặt chỗ và Nghiên cứu sâu.',
        steps: [
          'Mở trang Gói và chọn gói muốn mua.',
          'Chọn thanh toán chuyển khoản, quét mã VietQR bằng ứng dụng ngân hàng.',
          'Chờ vài giây để gói được kích hoạt.',
        ],
        more: [
          `Giá hiện tại: Coco 1 tháng ${vnd(P.momo.priceVnd)}, Coco 3 tháng ${vnd(P.coco.priceVnd)}, Tappy 1 tháng ${vnd(P.promax1m.priceVnd)}, Tappy 3 tháng ${vnd(P.promax3m.priceVnd)}; gói dùng thử 7 ngày chỉ mua được một lần (${vnd(P.pip.priceVnd)}).`,
          'Chuyển khoản một lần, không tự trừ tiền; hết hạn thì mua lại hoặc mua thêm.',
          'Đang còn gói mà mua thêm gói cùng loại thì số ngày được cộng dồn vào hạn hiện tại.',
          'Có thể nâng cấp từ Coco lên Tappy: các ngày còn lại của Coco được giữ và cộng vào; không hạ từ Tappy xuống Coco khi gói còn hạn.',
          'Gói mua qua App Store hoặc Google Play được quản lý trong cửa hàng đó, không mua thêm trên web.',
          `Khách chưa đăng nhập được hỏi ${ANON_LIFETIME_LIMIT} câu; sau đó cần tạo tài khoản miễn phí. Tài khoản miễn phí chat bằng khả năng của mô hình, chưa có tra cứu thời gian thực.`,
        ],
      },
      en: {
        title: 'Plans and payment',
        what: 'There is a free account and two paid plans: Coco and Tappy. A paid plan opens real-time lookups (prices, places, news), booking partners and Deep Research.',
        steps: [
          'Open the Plans page and choose the plan to buy.',
          'Choose bank transfer and scan the VietQR code with your banking app.',
          'Wait a few seconds for the plan to be activated.',
        ],
        more: [
          `Current prices: Coco 1 month ${usd(P.momo.priceVnd)}, Coco 3 months ${usd(P.coco.priceVnd)}, Tappy 1 month ${usd(P.promax1m.priceVnd)}, Tappy 3 months ${usd(P.promax3m.priceVnd)}; the 7-day trial can be bought once (${usd(P.pip.priceVnd)}).`,
          'One transfer, nothing is charged automatically; when it ends, buy again or buy more.',
          'While a plan runs, buying the same kind of plan adds the days to the current end date.',
          'You can upgrade from Coco to Tappy: the days left on Coco are kept and added; you cannot move down from Tappy to Coco while the plan runs.',
          'A plan bought on the App Store or Google Play is managed in that store, not topped up on the web.',
          `A visitor can ask ${ANON_LIFETIME_LIMIT} questions; after that a free account is needed. A free account chats with the model's own ability, without real-time lookups.`,
        ],
      },
    },
    {
      id: 'memory',
      where: '/profile/tappy-knows',
      keywords: 'tappy nho gi bo nho xoa bo nho so thich ghi nho memory forget privacy',
      vi: {
        title: 'Tappy nhớ gì về bạn',
        what: 'Tappy có thể nhớ phong cách và sở thích bạn đã nói (ví dụ thích biển yên tĩnh) để gợi ý sát hơn. Bạn xem và xóa được những gì Tappy nhớ.',
        steps: ['Mở Hồ sơ rồi vào mục Tappy biết gì về bạn.', 'Xem danh sách điều Tappy nhớ.', 'Bấm Xóa bộ nhớ của Tappy nếu muốn Tappy quên hết.'],
        more: ['Tappy chỉ dùng ký ức để gợi ý phong cách, không tự quyết số người đi hay ngân sách thay bạn.'],
      },
      en: {
        title: 'What Tappy remembers about you',
        what: 'Tappy can remember the style and tastes you mentioned (for example you like quiet beaches) to suggest things that fit. You can see and delete what it remembers.',
        steps: ['Open your Profile and go to What Tappy knows about you.', 'Read the list of what Tappy remembers.', "Tap Clear Tappy's memory if you want Tappy to forget everything."],
        more: ['Tappy uses memory only to suggest a style; it does not decide the number of travellers or your budget for you.'],
      },
    },
  ]
}

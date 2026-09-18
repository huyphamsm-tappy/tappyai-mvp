// Public discovery hubs (/food /shopping /travel /entertainment /spa) dictionary —
// the G1 GEO surface. Layered over the base dictionary by useTranslation, same
// contract as ./landing and ./share. All hub content lives here; the page under
// src/app/(discovery) only renders these keys. Both languages are complete and
// pinned by discoveryI18n.test.ts.
//
// Server-side lookup (`hubText`) exists because the hub is a server component:
// SSR renders the product locale (vi, see layout.tsx) so crawlers get real text,
// and the client component reconciles to the visitor's stored locale after
// hydration — the same pattern every other screen uses.

export const vi: Record<string, string> = {
  // Chrome
  'hub.ui.tryNow': 'Hỏi thử ngay',
  'hub.ui.sharedResults': 'Kết quả mọi người đã chia sẻ',
  'hub.ui.faq': 'Câu hỏi thường gặp',
  'hub.ui.askAbout': 'Hỏi Tappy về {domain}',
  'hub.ui.domainsNav': 'Lĩnh vực',
  'hub.ui.about': 'Giới thiệu',

  // Food
  'hub.food.title': 'Tìm quán ăn ngon với TappyAI — gợi ý theo nhu cầu, có bằng chứng',
  'hub.food.description': 'Hỏi Tappy "ăn gì, ở đâu" bằng tiếng Việt. Tappy đối chiếu đánh giá, giờ mở cửa, khoảng giá và đưa ra một lựa chọn rõ ràng, kèm link Maps và đặt món.',
  'hub.food.h1': 'Ăn gì, ở đâu — hỏi Tappy',
  'hub.food.intro': 'Tappy là trợ lý AI thuần Việt cho chuyện ăn uống: quán ngon gần bạn, đặt bàn, giao món, review thật. Mỗi câu trả lời là một quyết định có lý do, không phải danh sách 20 quán.',
  'hub.food.example1': 'Quán bún bò ngon ở quận 1 mở cửa tối nay',
  'hub.food.example2': 'Cà phê yên tĩnh để làm việc ở Đà Nẵng',
  'hub.food.example3': 'Nhà hàng hải sản cho 6 người, tầm 300k/người',
  'hub.food.example4': 'Quán chay ngon gần Hồ Gươm',
  'hub.food.faq1.q': 'Tappy lấy thông tin quán ăn từ đâu?',
  'hub.food.faq1.a': 'Từ dữ liệu bản đồ và đánh giá công khai. Tappy nêu rõ nguồn cho từng thông tin và không tự bịa giá hay giờ mở cửa.',
  'hub.food.faq2.q': 'Có cần đăng nhập không?',
  'hub.food.faq2.a': 'Không. Bạn có thể hỏi thử ngay; đăng nhập miễn phí để hỏi nhiều hơn và lưu kết quả.',

  // Shopping
  'hub.shopping.title': 'So sánh giá và chọn mua với TappyAI — quyết định, không phải catalogue',
  'hub.shopping.description': 'Hỏi Tappy nên mua gì trong tầm giá của bạn. Tappy so sánh cấu hình, giá từ nhiều sàn và người bán uy tín, rồi chỉ ra lựa chọn đáng tiền.',
  'hub.shopping.h1': 'Mua gì cho đáng tiền — hỏi Tappy',
  'hub.shopping.intro': 'Laptop, điện thoại, đồ gia dụng, mỹ phẩm: Tappy gom giá từ các sàn, đối chiếu cấu hình và đánh giá, và nói thẳng nên mua cái nào. Có theo dõi giá.',
  'hub.shopping.example1': 'Laptop khoảng 20 triệu để làm việc văn phòng',
  'hub.shopping.example2': 'Máy hút bụi robot dưới 8 triệu',
  'hub.shopping.example3': 'Điện thoại pin trâu tầm 6 triệu',
  'hub.shopping.example4': 'Kem chống nắng cho da dầu',
  'hub.shopping.faq1.q': 'Giá Tappy đưa ra có chính xác không?',
  'hub.shopping.faq1.a': 'Giá lấy từ danh sách công khai của người bán tại thời điểm hỏi và có link trực tiếp để bạn kiểm tra.',
  'hub.shopping.faq2.q': 'Tappy có nhận hoa hồng không?',
  'hub.shopping.faq2.a': 'Một số link mua hàng là link liên kết. Điều đó không ảnh hưởng đến thứ tự gợi ý.',

  // Travel
  'hub.travel.title': 'Lên kế hoạch du lịch với TappyAI — lịch trình theo ngày, có chỗ ở và giá',
  'hub.travel.description': 'Hỏi Tappy về chuyến đi của bạn: điểm đến, khách sạn, lịch trình từng ngày, chi phí ước tính. Trả lời bằng tiếng Việt, có link đặt phòng.',
  'hub.travel.h1': 'Đi đâu, ở đâu, làm gì — hỏi Tappy',
  'hub.travel.intro': 'Từ "cuối tuần này đi đâu" đến lịch trình 5 ngày: Tappy dựng kế hoạch theo ngày, gợi ý chỗ ở phù hợp ngân sách và kèm link đặt.',
  'hub.travel.example1': 'Lịch trình 3 ngày ở Đà Lạt cho cặp đôi',
  'hub.travel.example2': 'Khách sạn gần biển Nha Trang tầm 1 triệu/đêm',
  'hub.travel.example3': 'Đi Phú Quốc tháng 10 có gì cần lưu ý',
  'hub.travel.example4': 'Kế hoạch cuối tuần ở Sài Gòn cho gia đình',
  'hub.travel.faq1.q': 'Tappy có đặt phòng giúp không?',
  'hub.travel.faq1.a': 'Tappy đưa link đặt trực tiếp trên các nền tảng đặt phòng; bạn hoàn tất trên nền tảng đó.',
  'hub.travel.faq2.q': 'Có thể chia sẻ kế hoạch không?',
  'hub.travel.faq2.a': 'Có. Mỗi kết quả có thể chia sẻ thành trang công khai — người nhận xem được mà không cần cài app.',

  // Entertainment
  'hub.entertainment.title': 'Tối nay làm gì — TappyAI gợi ý phim, sự kiện, chỗ chơi',
  'hub.entertainment.description': 'Hỏi Tappy về phim đang chiếu, quán bar, sự kiện cuối tuần, chỗ chơi cho nhóm bạn. Gợi ý theo khu vực và ngân sách.',
  'hub.entertainment.h1': 'Tối nay làm gì — hỏi Tappy',
  'hub.entertainment.intro': 'Phim, nhạc sống, board game, karaoke, chỗ hẹn hò: Tappy chọn theo tâm trạng, khu vực và ngân sách của bạn.',
  'hub.entertainment.example1': 'Tối nay làm gì ở quận 3 với 3 người bạn',
  'hub.entertainment.example2': 'Quán bar có nhạc sống ở Hà Nội',
  'hub.entertainment.example3': 'Chỗ chơi board game ở Đà Nẵng',
  'hub.entertainment.example4': 'Kế hoạch hẹn hò tối thứ Bảy',
  'hub.entertainment.faq1.q': 'Tappy có biết suất chiếu và vé không?',
  'hub.entertainment.faq1.a': 'Tappy chỉ nêu những gì có bằng chứng công khai; với vé và suất chiếu, Tappy dẫn bạn tới nguồn chính thức thay vì đoán.',
  'hub.entertainment.faq2.q': 'Có cần đăng nhập không?',
  'hub.entertainment.faq2.a': 'Không. Bạn có thể hỏi thử ngay; đăng nhập miễn phí để hỏi nhiều hơn và lưu kết quả.',

  // Spa
  'hub.spa.title': 'Spa, làm đẹp, chăm sóc bản thân — TappyAI gợi ý theo nhu cầu',
  'hub.spa.description': 'Hỏi Tappy về spa, massage, nail, chăm sóc da gần bạn. Gợi ý theo đánh giá thật, khoảng giá và giờ mở cửa.',
  'hub.spa.h1': 'Chăm sóc bản thân — hỏi Tappy',
  'hub.spa.intro': 'Massage sau ngày dài, spa cho hai người, tiệm nail uy tín: Tappy chọn theo khu vực, đánh giá và ngân sách.',
  'hub.spa.example1': 'Spa massage thư giãn ở quận 7',
  'hub.spa.example2': 'Tiệm nail đẹp gần Cầu Giấy',
  'hub.spa.example3': 'Chăm sóc da mặt cho da mụn ở Sài Gòn',
  'hub.spa.example4': 'Spa couple tầm 1 triệu cho hai người',
  'hub.spa.faq1.q': 'Tappy có đặt lịch giúp không?',
  'hub.spa.faq1.a': 'Tappy đưa số điện thoại hoặc link đặt lịch của cơ sở; bạn xác nhận trực tiếp với họ.',
  'hub.spa.faq2.q': 'Có cần đăng nhập không?',
  'hub.spa.faq2.a': 'Không. Bạn có thể hỏi thử ngay; đăng nhập miễn phí để hỏi nhiều hơn và lưu kết quả.',

  // G1 completion — Scam Shield SEO + /about entity layer
  'seo.scamShield.description': 'Dán link, quét mã QR hoặc tin nhắn đáng ngờ — Scam Shield của TappyAI kiểm tra dấu hiệu lừa đảo, đối chiếu danh sách cảnh báo và giải thích rõ vì sao. Miễn phí, không cần đăng nhập.',
  'about.title': 'Giới thiệu TappyAI — Tappy là gì và trả lời như thế nào',
  'about.description': 'TappyAI là trợ lý AI thuần Việt cho ăn uống, mua sắm, du lịch, giải trí và làm đẹp, kèm Scam Shield kiểm tra lừa đảo. Mỗi câu trả lời là một quyết định có lý do, có nguồn, có link.',
  'about.h1': 'TappyAI là gì?',
  'about.intro': 'TappyAI (gọi tắt là Tappy) là trợ lý AI cá nhân cho cuộc sống hằng ngày ở Việt Nam. Bạn hỏi bằng tiếng Việt hoặc tiếng Anh; Tappy đối chiếu dữ liệu công khai và trả lời bằng một lựa chọn rõ ràng — kèm lý do, nguồn và link để bạn tự kiểm tra.',
  'about.whatTitle': 'Tappy làm được gì',
  'about.whatDomains': 'Năm lĩnh vực: ăn uống, mua sắm, du lịch, giải trí, spa & làm đẹp. Mỗi lĩnh vực có một trang riêng với câu hỏi mẫu và kết quả mọi người đã chia sẻ.',
  'about.whatScam': 'Scam Shield: kiểm tra link, mã QR hoặc tin nhắn đáng ngờ, đối chiếu danh sách cảnh báo và giải thích dấu hiệu lừa đảo. Miễn phí, không cần đăng nhập.',
  'about.whatShare': 'Chia sẻ kết quả: mỗi câu trả lời có thể trở thành một trang công khai, ai cũng đọc được mà không cần cài app hay đăng nhập.',
  'about.howTitle': 'Tappy trả lời như thế nào',
  'about.howSources': 'Thông tin quán, giá, giờ mở cửa và đánh giá lấy từ dữ liệu bản đồ và danh sách công khai tại thời điểm hỏi. Tappy nêu nguồn cho từng thông tin và không tự bịa giá, giờ mở cửa hay số điện thoại.',
  'about.howHonesty': 'Khi không có bằng chứng — không có link đặt, không có đánh giá — Tappy nói thẳng là chưa có, thay vì đoán.',
  'about.howAffiliate': 'Một số link mua hàng hoặc đặt phòng là link liên kết. Điều đó không ảnh hưởng đến thứ tự gợi ý.',
  'about.privacyTitle': 'Riêng tư',
  'about.privacyBody': 'Trang kết quả công khai chỉ chứa nội dung bạn chọn chia sẻ, đã được lọc thông tin cá nhân. Bạn có thể gỡ bất kỳ trang nào đã chia sẻ.',
  'about.whoTitle': 'Ai làm TappyAI',
  'about.whoBody': 'TappyAI được xây dựng tại Việt Nam, cho người dùng Việt Nam, và phục vụ bằng cả tiếng Việt lẫn tiếng Anh. Liên hệ: {email}.',
  'about.linksTitle': 'Xem thêm',
  'about.linkHowTo': 'Hướng dẫn sử dụng',
  'about.linkPrivacy': 'Chính sách bảo mật',
  'about.linkTerms': 'Điều khoản dịch vụ',
  'about.linkStartup': 'Câu chuyện TappyAI',
  'about.linkScam': 'Scam Shield',
  'about.cta': 'Hỏi Tappy ngay',
}

export const en: Record<string, string> = {
  'hub.ui.tryNow': 'Try a question',
  'hub.ui.sharedResults': 'Results people have shared',
  'hub.ui.faq': 'Frequently asked questions',
  'hub.ui.askAbout': 'Ask Tappy about {domain}',
  'hub.ui.domainsNav': 'Domains',
  'hub.ui.about': 'About',

  'hub.food.title': 'Find great food in Vietnam with TappyAI — evidence-backed picks',
  'hub.food.description': 'Ask Tappy "what to eat, where" in Vietnamese or English. Tappy cross-checks reviews, hours and price bands and gives one clear pick with Maps and ordering links.',
  'hub.food.h1': 'What to eat, where — ask Tappy',
  'hub.food.intro': 'Tappy is a Vietnam-first AI agent for food: good places near you, reservations, delivery, honest reviews. Every answer is a decision with reasons, not a list of twenty.',
  'hub.food.example1': 'Best bún bò in District 1 open tonight',
  'hub.food.example2': 'A quiet café to work from in Da Nang',
  'hub.food.example3': 'Seafood restaurant for 6, about 300k per person',
  'hub.food.example4': 'Good vegetarian food near Hoan Kiem Lake',
  'hub.food.faq1.q': 'Where does Tappy get restaurant data?',
  'hub.food.faq1.a': 'From map data and public reviews. Tappy states the source for each fact and never invents prices or hours.',
  'hub.food.faq2.q': 'Do I need an account?',
  'hub.food.faq2.a': 'No. Try a question right away; sign in for free to ask more and keep your results.',

  'hub.shopping.title': 'Compare prices and choose with TappyAI — a decision, not a catalogue',
  'hub.shopping.description': 'Ask Tappy what to buy for your budget. Tappy compares specs and prices across marketplaces and trusted sellers, then points to the value pick.',
  'hub.shopping.h1': 'What is worth buying — ask Tappy',
  'hub.shopping.intro': 'Laptops, phones, appliances, beauty: Tappy gathers prices across marketplaces, checks specs and ratings, and says plainly which one to buy. Price watch included.',
  'hub.shopping.example1': 'A laptop around 20 million VND for office work',
  'hub.shopping.example2': 'Robot vacuum under 8 million',
  'hub.shopping.example3': 'Long-battery phone around 6 million',
  'hub.shopping.example4': 'Sunscreen for oily skin',
  'hub.shopping.faq1.q': 'Are the prices accurate?',
  'hub.shopping.faq1.a': 'Prices come from sellers’ public listings at the time of asking, with direct links so you can verify.',
  'hub.shopping.faq2.q': 'Does Tappy earn commission?',
  'hub.shopping.faq2.a': 'Some purchase links are affiliate links. That never changes the ranking.',

  'hub.travel.title': 'Plan a trip in Vietnam with TappyAI — day-by-day itineraries with stays and prices',
  'hub.travel.description': 'Ask Tappy about your trip: destinations, hotels, day-by-day plans, estimated costs. Answers with booking links.',
  'hub.travel.h1': 'Where to go, stay and what to do — ask Tappy',
  'hub.travel.intro': 'From "where this weekend" to a five-day itinerary: Tappy builds a day-by-day plan, suggests stays that fit the budget and links to book.',
  'hub.travel.example1': '3-day Da Lat itinerary for a couple',
  'hub.travel.example2': 'Beachfront hotel in Nha Trang around 1 million/night',
  'hub.travel.example3': 'Phu Quoc in October — what to know',
  'hub.travel.example4': 'A family weekend plan in Saigon',
  'hub.travel.faq1.q': 'Does Tappy book for me?',
  'hub.travel.faq1.a': 'Tappy links directly to booking platforms; you complete the booking there.',
  'hub.travel.faq2.q': 'Can I share a plan?',
  'hub.travel.faq2.a': 'Yes. Any result can be shared as a public page that opens without installing anything.',

  'hub.entertainment.title': 'What to do tonight — TappyAI picks movies, events and places',
  'hub.entertainment.description': 'Ask Tappy about movies, bars, weekend events and places for a group. Suggestions by area and budget.',
  'hub.entertainment.h1': 'What to do tonight — ask Tappy',
  'hub.entertainment.intro': 'Movies, live music, board games, karaoke, date spots: Tappy picks by mood, area and budget.',
  'hub.entertainment.example1': 'What to do tonight in District 3 with 3 friends',
  'hub.entertainment.example2': 'Bars with live music in Hanoi',
  'hub.entertainment.example3': 'Board game cafés in Da Nang',
  'hub.entertainment.example4': 'A Saturday-night date plan',
  'hub.entertainment.faq1.q': 'Does Tappy know showtimes and tickets?',
  'hub.entertainment.faq1.a': 'Tappy only states what has public evidence; for tickets and showtimes it points you to the official source instead of guessing.',
  'hub.entertainment.faq2.q': 'Do I need an account?',
  'hub.entertainment.faq2.a': 'No. Try a question right away; sign in for free to ask more and keep your results.',

  'hub.spa.title': 'Spa, beauty and self-care in Vietnam — TappyAI picks by your needs',
  'hub.spa.description': 'Ask Tappy about spas, massage, nails and skincare near you. Picks by real ratings, price band and opening hours.',
  'hub.spa.h1': 'Self-care — ask Tappy',
  'hub.spa.intro': 'A massage after a long day, a couples spa, a trusted nail salon: Tappy picks by area, ratings and budget.',
  'hub.spa.example1': 'Relaxing massage spa in District 7',
  'hub.spa.example2': 'A good nail salon near Cau Giay',
  'hub.spa.example3': 'Facial for acne-prone skin in Saigon',
  'hub.spa.example4': 'Couples spa around 1 million for two',
  'hub.spa.faq1.q': 'Does Tappy book appointments?',
  'hub.spa.faq1.a': 'Tappy gives the venue’s phone or booking link; you confirm with them directly.',
  'hub.spa.faq2.q': 'Do I need an account?',
  'hub.spa.faq2.a': 'No. Try a question right away; sign in for free to ask more and keep your results.',

  // G1 completion — Scam Shield SEO + /about entity layer
  'seo.scamShield.description': 'Paste a link, scan a QR code or drop in a suspicious message — TappyAI’s Scam Shield checks for fraud signals, matches public warning lists and explains why. Free, no sign-in.',
  'about.title': 'About TappyAI — what it is and how it answers',
  'about.description': 'TappyAI is a Vietnamese-first AI assistant for food, shopping, travel, entertainment and beauty, with Scam Shield for fraud checks. Every answer is a reasoned decision with sources and links.',
  'about.h1': 'What is TappyAI?',
  'about.intro': 'TappyAI (Tappy for short) is a personal AI assistant for everyday life in Vietnam. Ask in Vietnamese or English; Tappy checks public data and answers with one clear pick — with the reason, the source and a link so you can verify it yourself.',
  'about.whatTitle': 'What Tappy does',
  'about.whatDomains': 'Five domains: food, shopping, travel, entertainment, spa & beauty. Each has its own page with example questions and results people have shared.',
  'about.whatScam': 'Scam Shield: check a link, QR code or suspicious message against public warning lists, with the fraud signals explained. Free, no sign-in.',
  'about.whatShare': 'Shareable results: any answer can become a public page that anyone can read without installing an app or signing in.',
  'about.howTitle': 'How Tappy answers',
  'about.howSources': 'Venue details, prices, opening hours and ratings come from map data and public listings at the time you ask. Tappy names the source for each fact and never invents a price, opening hour or phone number.',
  'about.howHonesty': 'When there is no evidence — no booking link, no rating — Tappy says so instead of guessing.',
  'about.howAffiliate': 'Some shopping or booking links are affiliate links. That never changes the order of recommendations.',
  'about.privacyTitle': 'Privacy',
  'about.privacyBody': 'A public result page contains only what you chose to share, with personal details filtered out. You can withdraw any page you shared.',
  'about.whoTitle': 'Who makes TappyAI',
  'about.whoBody': 'TappyAI is built in Vietnam, for people in Vietnam, and served in both Vietnamese and English. Contact: {email}.',
  'about.linksTitle': 'See also',
  'about.linkHowTo': 'How to use',
  'about.linkPrivacy': 'Privacy policy',
  'about.linkTerms': 'Terms of service',
  'about.linkStartup': 'The TappyAI story',
  'about.linkScam': 'Scam Shield',
  'about.cta': 'Ask Tappy now',
}

export type HubLocale = 'vi' | 'en'

/**
 * Server-side lookup for a server component (the client goes through
 * useTranslation, which layers these same maps). Falls back to Vietnamese —
 * the product locale — only for a key the English map genuinely lacks, which
 * discoveryI18n.test.ts makes impossible for shipped keys.
 */
export function hubText(locale: HubLocale, key: string, vars?: Record<string, string>): string {
  let str = (locale === 'en' ? en[key] : vi[key]) ?? vi[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v)
  return str
}

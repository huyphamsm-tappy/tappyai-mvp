// Feature usage guidance — the strings behind /how-to-use.
//
// Same contract as ../w2 and ../w3: flat vi/en maps, keys namespaced under
// `guide.` so the merge in useTranslation stays collision-free. Deliberately
// NOT named w4 — an unrelated w4 wave is in progress elsewhere and a name
// collision would be resolved silently by the object spread, with the later
// module winning and no error anywhere.
//
// EVERY sentence here describes behaviour that exists today. Where a platform
// differs the text says so rather than describing the union of all three, and
// where the product cannot guarantee a link the text says the button only
// appears when the source provides one. That last point is the whole reason
// the money/URL rules exist upstream: promising a link the retrieval layer
// never returned is exactly the failure the guidance must not reintroduce.

export const en: Record<string, string> = {
  'guide.title': 'How to use TappyAI',
  'guide.intro':
    'TappyAI answers in plain language and, when it helps, looks things up for you — places to eat, trips, products, and more. This page explains what each part does and what to expect.',

  // ── Chat ──────────────────────────────────────────────────────────────────
  'guide.chat.heading': 'Chatting with TappyAI',
  'guide.chat.what':
    'Ask a question in your own words and TappyAI answers. It decides on its own when it needs to search for something.',
  'guide.chat.s1': 'Open Chat and type what you want to know.',
  'guide.chat.s2': 'Write naturally — full sentences work better than keywords.',
  'guide.chat.s3': 'Add details that matter to you, such as an area, a budget, or an occasion.',
  'guide.chat.s4': 'Read the answer, then ask a follow-up to narrow it down.',
  'guide.chat.result':
    'A written answer. When your question is about places, trips or products, the answer also carries cards and buttons you can tap.',
  'guide.chat.b1': 'Suggested follow-up chips — tap one instead of typing.',
  'guide.chat.b2': 'Buttons under a recommendation open the matching place, website, or store.',
  'guide.chat.nodata':
    'If TappyAI cannot find something, it says so instead of guessing. It will not invent a shop, a price, or a link.',
  'guide.chat.lang':
    'TappyAI replies in the language you write in. Switch the app language any time in Settings.',

  // ── Food ──────────────────────────────────────────────────────────────────
  'guide.food.heading': 'Finding food and drink',
  'guide.food.what':
    'Ask for somewhere to eat or drink and TappyAI suggests real places with their details.',
  'guide.food.s1': 'Say what you want — for example, "quiet coffee shop in District 1".',
  'guide.food.s2': 'Mention the area, or allow location so nearby places can be found.',
  'guide.food.s3': 'Look through the suggestions and open the one you like.',
  'guide.food.result':
    'For each place you get its name and address, its Google rating when there is one, and buttons to open it.',
  'guide.food.b1': 'Google Maps — opens the place on the map.',
  'guide.food.b2': 'Website — appears only when the place has an official website.',
  'guide.food.b3': 'Food delivery buttons — search that restaurant on the delivery apps.',
  'guide.food.nodata':
    'Not every place has a website, a rating, or a delivery listing. When one is missing the button simply is not shown — TappyAI does not put a made-up link in its place.',

  // ── Travel ────────────────────────────────────────────────────────────────
  'guide.travel.heading': 'Planning a trip',
  'guide.travel.what':
    'Ask about a destination and TappyAI suggests places to go and where to stay.',
  'guide.travel.s1': 'Name the destination, and the dates if you already know them.',
  'guide.travel.s2': 'Say what kind of trip it is — family, budget, a few days, and so on.',
  'guide.travel.s3': 'Open a suggestion to see the detail, or ask for something different.',
  'guide.travel.result':
    'Suggested places and, for accommodation, a hotel list with booking links.',
  'guide.travel.b1': 'Booking.com and Agoda — open a search for that place on the booking site.',
  'guide.travel.b2': 'Google Maps — shows where it is.',
  'guide.travel.nodata':
    'Prices and availability come from the booking sites, not from TappyAI. Always confirm the final price on the site before you pay.',

  // ── Shopping ──────────────────────────────────────────────────────────────
  'guide.shop.heading': 'Looking for a product',
  'guide.shop.what':
    'Describe a product and TappyAI helps you compare it and points you to where it is sold.',
  'guide.shop.s1': 'Describe what you want, including the model if you know it.',
  'guide.shop.s2': 'Say what matters most — budget, size, or how you will use it.',
  'guide.shop.s3': 'Read the comparison, then open a shopping link to check the current price.',
  'guide.shop.result':
    'A comparison in plain language, plus links to search for the product on the marketplaces.',
  'guide.shop.b1': 'Shopee, Tiki, Lazada — open a search for that product on each site.',
  'guide.shop.nodata':
    'TappyAI cannot see live stock or checkout prices. Treat any price it mentions as a rough guide and confirm on the store page.',

  // ── Read aloud ────────────────────────────────────────────────────────────
  'guide.voice.heading': 'Listening to answers',
  'guide.voice.what': 'TappyAI can read an answer out loud instead of you reading it.',
  'guide.voice.s1': 'Send a message and wait for the answer.',
  'guide.voice.s2': 'Tap the speaker icon on the answer to start reading.',
  'guide.voice.s3': 'Tap it again to stop.',
  'guide.voice.result': 'The answer is spoken using the voice built into your device or browser.',
  'guide.voice.nodata':
    'The available voices come from your device, so how it sounds depends on the languages your device has installed. If your device has no voice for that language, the answer stays on screen as text.',

  // ── Notifications ─────────────────────────────────────────────────────────
  'guide.notif.heading': 'Notifications',
  'guide.notif.what':
    'TappyAI can notify you about things you asked it to keep an eye on.',
  'guide.notif.s1': 'Allow notifications when the app asks.',
  'guide.notif.s2': 'Open Notifications in your profile to see what has arrived.',
  'guide.notif.s3': 'Tap a notification to open what it refers to.',
  'guide.notif.result': 'Notifications appear on your device and in the in-app list.',
  'guide.notif.identity':
    'Some notifications come from Tappy itself and play their own recognisable sound, so you know it is Tappy without looking.',
  'guide.notif.android':
    'On Android you can turn that Tappy sound off in Settings. Turning it off only silences the sound — the notifications still arrive.',
  'guide.notif.nodata':
    'If you refuse the permission, nothing is sent to your device. You can still open the in-app list at any time.',

  // ── Reviews ───────────────────────────────────────────────────────────────
  'guide.reviews.heading': 'Reviews from other people',
  'guide.reviews.what': 'A feed of short reviews people have posted about places.',
  'guide.reviews.s1': 'Open Reviews to browse the feed.',
  'guide.reviews.s2': 'Open a review to read it in full and see the place.',
  'guide.reviews.s3': 'Post your own review from the same screen.',
  'guide.reviews.result': 'Other people’s experiences, alongside what TappyAI suggests.',
  'guide.reviews.nodata': 'Newer or quieter places may have no reviews yet.',

  // ── Saved ─────────────────────────────────────────────────────────────────
  'guide.saved.heading': 'Saving things for later',
  'guide.saved.what': 'Keep places and content you want to come back to.',
  'guide.saved.s1': 'Tap the save or favourite control on something you like.',
  'guide.saved.s2': 'Find it again under your profile.',
  'guide.saved.result': 'Your own list, kept to your account.',
  'guide.saved.nodata': 'Saving needs an account, so that the list follows you between devices.',

  // ── Tools ─────────────────────────────────────────────────────────────────
  'guide.tools.heading': 'The small tools',
  'guide.tools.what': 'A few focused tools sit alongside chat for everyday jobs.',
  'guide.tools.b1': 'Scan — photograph a document and get the text out of it.',
  'guide.tools.b2': 'Translate — translate text between languages.',
  'guide.tools.b3': 'Currency — convert an amount between currencies.',
  'guide.tools.b4': 'Split bill — work out who owes what after a shared meal.',
  'guide.tools.nodata':
    'Each tool tells you when it cannot finish — for example when a photo is too blurry to read.',

  // ── Account ───────────────────────────────────────────────────────────────
  'guide.account.heading': 'Your account',
  'guide.account.what':
    'You can start using TappyAI without an account. Signing in is what lets your things follow you.',
  'guide.account.b1': 'Without an account — chat and browse.',
  'guide.account.b2': 'With an account — saved items, your reviews, notifications, and preferences.',
  'guide.account.nodata':
    'When something needs an account, TappyAI asks you to sign in at that point rather than blocking you earlier.',

  // ── Honest limits ─────────────────────────────────────────────────────────
  'guide.limits.heading': 'What to keep in mind',
  'guide.limits.b1':
    'TappyAI can be wrong. Treat what it says as a starting point, not the final word.',
  'guide.limits.b2':
    'Opening hours, prices and availability change. Confirm on the place’s own page before you travel or pay.',
  'guide.limits.b3':
    'A button only appears when the underlying source really provides that link. A missing button means the information does not exist, not that it was hidden.',
  'guide.limits.b4': 'TappyAI does not give financial or investment advice.',
}

export const vi: Record<string, string> = {
  'guide.title': 'Hướng dẫn sử dụng TappyAI',
  'guide.intro':
    'TappyAI trả lời bằng ngôn ngữ đời thường, và khi cần thì tự tra cứu giúp bạn — chỗ ăn uống, chuyến đi, sản phẩm và nhiều thứ khác. Trang này giải thích từng phần làm gì và bạn sẽ nhận được gì.',

  'guide.chat.heading': 'Trò chuyện với TappyAI',
  'guide.chat.what':
    'Hỏi bằng lời của bạn, TappyAI trả lời. Khi cần tra cứu, TappyAI tự quyết định.',
  'guide.chat.s1': 'Mở phần Trò chuyện và gõ điều bạn muốn biết.',
  'guide.chat.s2': 'Cứ viết tự nhiên — câu đầy đủ cho kết quả tốt hơn từ khoá rời rạc.',
  'guide.chat.s3': 'Thêm chi tiết quan trọng với bạn: khu vực, ngân sách, hay dịp gì.',
  'guide.chat.s4': 'Đọc câu trả lời rồi hỏi tiếp để thu hẹp lại.',
  'guide.chat.result':
    'Một câu trả lời bằng chữ. Nếu bạn hỏi về địa điểm, chuyến đi hay sản phẩm, câu trả lời còn kèm thẻ thông tin và các nút bấm được.',
  'guide.chat.b1': 'Gợi ý hỏi tiếp — bấm một cái thay vì gõ lại.',
  'guide.chat.b2': 'Các nút dưới mỗi gợi ý mở đúng địa điểm, website hoặc gian hàng.',
  'guide.chat.nodata':
    'Nếu không tìm được, TappyAI nói thẳng là không có chứ không đoán. TappyAI không bịa ra quán, giá hay đường link.',
  'guide.chat.lang':
    'Bạn viết tiếng nào, TappyAI trả lời tiếng đó. Đổi ngôn ngữ ứng dụng bất cứ lúc nào trong Cài đặt.',

  'guide.food.heading': 'Tìm chỗ ăn uống',
  'guide.food.what':
    'Hỏi chỗ ăn hoặc uống, TappyAI gợi ý những nơi có thật kèm thông tin của nơi đó.',
  'guide.food.s1': 'Nói bạn muốn gì — ví dụ "quán cà phê yên tĩnh ở Quận 1".',
  'guide.food.s2': 'Nêu khu vực, hoặc cho phép định vị để tìm chỗ gần bạn.',
  'guide.food.s3': 'Xem các gợi ý rồi mở nơi bạn thích.',
  'guide.food.result':
    'Mỗi nơi có tên và địa chỉ, điểm đánh giá Google nếu có, cùng các nút để mở ra xem.',
  'guide.food.b1': 'Google Maps — mở địa điểm trên bản đồ.',
  'guide.food.b2': 'Website — chỉ hiện khi nơi đó thật sự có website chính thức.',
  'guide.food.b3': 'Nút đặt đồ ăn — tìm đúng quán đó trên các ứng dụng giao đồ ăn.',
  'guide.food.nodata':
    'Không phải nơi nào cũng có website, điểm đánh giá hay mặt trên app giao đồ ăn. Thiếu cái nào thì nút đó không hiện — TappyAI không thay vào bằng một đường link bịa ra.',

  'guide.travel.heading': 'Lên kế hoạch chuyến đi',
  'guide.travel.what': 'Hỏi về một điểm đến, TappyAI gợi ý nơi nên đi và chỗ nghỉ.',
  'guide.travel.s1': 'Nêu điểm đến, kèm ngày đi nếu bạn đã biết.',
  'guide.travel.s2': 'Nói rõ kiểu chuyến đi — gia đình, tiết kiệm, đi mấy ngày…',
  'guide.travel.s3': 'Mở một gợi ý để xem chi tiết, hoặc hỏi phương án khác.',
  'guide.travel.result':
    'Các nơi nên đi, và với chỗ nghỉ thì có danh sách khách sạn kèm link đặt phòng.',
  'guide.travel.b1': 'Booking.com và Agoda — mở trang tìm kiếm chỗ đó trên site đặt phòng.',
  'guide.travel.b2': 'Google Maps — cho biết nó nằm ở đâu.',
  'guide.travel.nodata':
    'Giá và tình trạng phòng là của các site đặt phòng, không phải của TappyAI. Hãy xác nhận giá cuối cùng trên site trước khi thanh toán.',

  'guide.shop.heading': 'Tìm sản phẩm',
  'guide.shop.what':
    'Mô tả sản phẩm, TappyAI giúp bạn so sánh và chỉ chỗ bán.',
  'guide.shop.s1': 'Mô tả thứ bạn cần, kèm tên model nếu biết.',
  'guide.shop.s2': 'Nói điều bạn quan tâm nhất — ngân sách, kích thước, hay dùng để làm gì.',
  'guide.shop.s3': 'Đọc phần so sánh rồi mở link mua sắm để xem giá hiện tại.',
  'guide.shop.result':
    'Một bản so sánh dễ hiểu, kèm link tìm sản phẩm đó trên các sàn.',
  'guide.shop.b1': 'Shopee, Tiki, Lazada — mở trang tìm sản phẩm đó trên từng sàn.',
  'guide.shop.nodata':
    'TappyAI không thấy được tồn kho hay giá lúc thanh toán. Hãy xem giá TappyAI nêu là con số tham khảo và kiểm tra lại trên trang của người bán.',

  'guide.voice.heading': 'Nghe câu trả lời',
  'guide.voice.what': 'TappyAI có thể đọc to câu trả lời thay vì bạn phải đọc bằng mắt.',
  'guide.voice.s1': 'Gửi tin nhắn và chờ câu trả lời.',
  'guide.voice.s2': 'Bấm biểu tượng loa trên câu trả lời để bắt đầu đọc.',
  'guide.voice.s3': 'Bấm lần nữa để dừng.',
  'guide.voice.result': 'Câu trả lời được đọc bằng giọng có sẵn trong thiết bị hoặc trình duyệt của bạn.',
  'guide.voice.nodata':
    'Giọng đọc là của thiết bị, nên nghe thế nào tuỳ vào những ngôn ngữ máy bạn đã cài. Nếu máy không có giọng cho ngôn ngữ đó, câu trả lời vẫn nằm trên màn hình dưới dạng chữ.',

  'guide.notif.heading': 'Thông báo',
  'guide.notif.what': 'TappyAI có thể báo cho bạn những thứ bạn nhờ nó để mắt tới.',
  'guide.notif.s1': 'Cho phép thông báo khi ứng dụng hỏi.',
  'guide.notif.s2': 'Mở mục Thông báo trong trang cá nhân để xem những gì đã đến.',
  'guide.notif.s3': 'Bấm vào một thông báo để mở thứ nó nhắc tới.',
  'guide.notif.result': 'Thông báo hiện trên thiết bị và trong danh sách trong ứng dụng.',
  'guide.notif.identity':
    'Một số thông báo là do chính Tappy gửi và phát âm thanh riêng dễ nhận ra, để bạn biết đó là Tappy mà không cần nhìn.',
  'guide.notif.android':
    'Trên Android bạn có thể tắt âm thanh Tappy đó trong Cài đặt. Tắt đi chỉ làm im tiếng — thông báo vẫn đến bình thường.',
  'guide.notif.nodata':
    'Nếu bạn từ chối quyền, sẽ không có gì gửi tới thiết bị. Bạn vẫn mở được danh sách trong ứng dụng bất cứ lúc nào.',

  'guide.reviews.heading': 'Đánh giá của người khác',
  'guide.reviews.what': 'Một dòng các bài đánh giá ngắn mọi người viết về địa điểm.',
  'guide.reviews.s1': 'Mở mục Đánh giá để xem.',
  'guide.reviews.s2': 'Mở một bài để đọc đầy đủ và xem địa điểm.',
  'guide.reviews.s3': 'Đăng bài đánh giá của chính bạn ngay ở màn hình đó.',
  'guide.reviews.result': 'Trải nghiệm thật của người khác, đặt cạnh gợi ý của TappyAI.',
  'guide.reviews.nodata': 'Những nơi mới mở hoặc ít người biết có thể chưa có bài đánh giá nào.',

  'guide.saved.heading': 'Lưu lại để xem sau',
  'guide.saved.what': 'Giữ lại địa điểm và nội dung bạn muốn quay lại.',
  'guide.saved.s1': 'Bấm nút lưu hoặc yêu thích trên thứ bạn thích.',
  'guide.saved.s2': 'Tìm lại nó trong trang cá nhân của bạn.',
  'guide.saved.result': 'Danh sách của riêng bạn, gắn với tài khoản của bạn.',
  'guide.saved.nodata': 'Lưu cần có tài khoản, để danh sách theo bạn qua các thiết bị.',

  'guide.tools.heading': 'Vài công cụ nhỏ',
  'guide.tools.what': 'Vài công cụ gọn nằm cạnh phần trò chuyện, cho những việc thường ngày.',
  'guide.tools.b1': 'Quét tài liệu — chụp ảnh giấy tờ và lấy chữ ra khỏi ảnh.',
  'guide.tools.b2': 'Dịch — dịch văn bản giữa các ngôn ngữ.',
  'guide.tools.b3': 'Tiền tệ — quy đổi một số tiền sang đơn vị khác.',
  'guide.tools.b4': 'Chia tiền — tính xem ai còn nợ bao nhiêu sau bữa ăn chung.',
  'guide.tools.nodata':
    'Mỗi công cụ đều báo khi không làm được — ví dụ ảnh quá mờ nên không đọc nổi chữ.',

  'guide.account.heading': 'Tài khoản của bạn',
  'guide.account.what':
    'Bạn dùng TappyAI được ngay mà không cần tài khoản. Đăng nhập là để mọi thứ của bạn đi theo bạn.',
  'guide.account.b1': 'Chưa có tài khoản — vẫn trò chuyện và xem được.',
  'guide.account.b2': 'Có tài khoản — mục đã lưu, bài đánh giá của bạn, thông báo và tuỳ chọn riêng.',
  'guide.account.nodata':
    'Khi có việc cần tài khoản, TappyAI mới mời bạn đăng nhập ngay lúc đó, chứ không chặn bạn từ trước.',

  'guide.limits.heading': 'Vài điều nên nhớ',
  'guide.limits.b1':
    'TappyAI có thể sai. Hãy xem những gì nó nói là điểm khởi đầu, không phải kết luận cuối cùng.',
  'guide.limits.b2':
    'Giờ mở cửa, giá và tình trạng còn chỗ đều thay đổi. Hãy xác nhận trên trang của chính nơi đó trước khi đi hoặc trả tiền.',
  'guide.limits.b3':
    'Một nút chỉ hiện khi nguồn thật sự có đường link đó. Thiếu nút nghĩa là thông tin đó không tồn tại, chứ không phải bị giấu đi.',
  'guide.limits.b4': 'TappyAI không đưa lời khuyên tài chính hay đầu tư.',
}

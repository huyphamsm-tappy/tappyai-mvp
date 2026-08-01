// Startup landing page (/startup) dictionary — corporate introduction content for
// Google for Startups review, investors, and business partners. Layered over the
// base dictionary by useTranslation, same contract as ./w2 and ./w3. All page
// content lives here (business content separated from presentation); the section
// components under src/components/landing only render these keys.

export const en: Record<string, string> = {
  // Header
  'landing.nav.openApp': 'Open the app',
  'landing.nav.langLabel': 'Language',

  // 1. Hero
  'landing.hero.eyebrow': 'Welcome to TappyAI 👋',
  // Headline is split so the closing clause carries the brand's orange accent
  // (approved Hero reference, 2026-07-31). Both halves render as one sentence.
  'landing.hero.headlineLead': 'The AI lifestyle assistant for',
  'landing.hero.headlineAccent': 'everyday life in Vietnam',
  'landing.hero.headline': 'The AI lifestyle assistant for everyday life in Vietnam',
  'landing.hero.subtitle':
    'TappyAI combines a conversational AI assistant, a short-video review community, and everyday utilities into a single bilingual platform—built around how people in Vietnam eat, travel, and live.',
  'landing.hero.learnMore': 'Learn more',
  'landing.hero.viewProduct': 'View product',
  'landing.hero.screenshotAlt': 'TappyAI home screen — AI greeting card, category explorer, and daily tools',

  // 2. What is TappyAI
  'landing.what.title': 'What is TappyAI?',
  'landing.what.p1':
    'TappyAI is an AI lifestyle platform built for Vietnam. It is organized around what a person actually intends to do — eat, travel, plan, shop — rather than around separate app categories, so one assistant carries context across every domain instead of leaving people to stitch together a dozen tools. Alongside the assistant, a short-video review community keeps recommendations grounded in what local people have actually experienced.',
  'landing.what.p2':
    'The product runs as one connected ecosystem across web, Android, and iOS. The web platform is live today; the native Android and iOS applications are under active development, with Android currently in release-candidate testing. The interface is fully bilingual in Vietnamese and English.',

  // 3. Vision
  'landing.vision.title': 'Our vision',
  'landing.vision.p1':
    'Everyday decisions — where to eat, where to go, what a fair price is — should take seconds, not searches across many apps. TappyAI aims to be a single trusted companion for daily life in Vietnam, combining AI guidance with the honest experiences of a local community.',
  'landing.vision.p2':
    'We build for Vietnam first: local services, local language, and local habits — implemented to an international engineering standard.',

  // 4. Product overview
  'landing.product.title': 'Product overview',
  'landing.product.intro': 'One product, three connected layers.',
  'landing.product.assistant.title': 'AI assistant',
  'landing.product.assistant.desc':
    'A conversational assistant for food, travel, and local services. It answers in natural language, creates personalized plans with real places and photos, and adapts its suggestions to each user.',
  'landing.product.community.title': 'Review community',
  'landing.product.community.desc':
    'A short-video feed where users post reviews of restaurants, cafés, and places — with likes, comments, follows, and reusable audio tracks attached to each review.',
  'landing.product.tools.title': 'Everyday utilities',
  'landing.product.tools.desc':
    'Practical daily tools including translation, currency conversion, bill splitting, document scanning, and curated daily deals from popular services in Vietnam.',

  // 5. Key features
  'landing.features.title': 'Key features',
  'landing.features.chat.title': 'AI chat & planning',
  'landing.features.chat.desc':
    'Ask in your own words and get back a structured, brochure-style plan — real places with photos, ratings, merchant details, and community short-video reviews. Booking and shopping links are built in, so you can act on the answer instead of researching it yourself. That is the difference from a general AI assistant: each recommendation is assembled from real businesses and community short-video reviews, grounded in current information, and it ends where you can book or buy.',
  'landing.features.reviews.title': 'Short-video reviews',
  'landing.features.reviews.desc':
    'A vertical video feed of authentic user-generated reviews, with likes, comments, saves, and shares.',
  'landing.features.sounds.title': 'Sounds & music',
  'landing.features.sounds.desc':
    'Reviews can include reusable audio tracks powered by a built-in licensed music library.',
  'landing.features.deals.title': 'Daily deals',
  'landing.features.deals.desc':
    'A hand-curated selection of offers from popular Vietnamese services, refreshed every day.',
  'landing.features.tools.title': 'Practical utilities',
  'landing.features.tools.desc':
    'Translate, currency, split bill, document scan, and more — small tools for everyday situations.',
  'landing.features.bilingual.title': 'Bilingual by design',
  'landing.features.bilingual.desc':
    'The application interface can be switched between Vietnamese and English at any time.',

  // 6. Product screenshots
  'landing.shots.title': 'Product screenshots',
  'landing.shots.caption': 'Actual production interface, captured from the live product.',
  'landing.shots.home.label': 'Home',
  'landing.shots.home.alt': 'TappyAI home screen with AI greeting, categories, and daily tools',
  'landing.shots.chat.label': 'AI chat',
  'landing.shots.chat.alt': 'TappyAI chat screen with the Tappy assistant and suggested prompts',
  'landing.shots.reviews.label': 'Reviews feed',
  'landing.shots.reviews.alt': 'TappyAI short-video review feed with like, comment, and share actions',
  'landing.shots.music.label': 'Music library',
  'landing.shots.music.alt': 'TappyAI music library listing reusable audio tracks with play controls',
  'landing.shots.deals.label': 'Daily deals',
  'landing.shots.deals.alt': 'TappyAI daily deals screen listing curated offers from popular services',

  // 7. Technology
  'landing.tech.title': 'Technology',
  'landing.tech.intro': 'TappyAI is built on a modern, proven stack.',
  'landing.tech.web.title': 'Web application',
  'landing.tech.web.desc': 'Next.js, React, and TypeScript with Tailwind CSS, deployed on Vercel.',
  'landing.tech.mobile.title': 'Mobile',
  'landing.tech.mobile.desc':
    'Native mobile applications built for Android (Kotlin + Jetpack Compose) and iOS (Swift + SwiftUI).',
  'landing.tech.ai.title': 'Multi-LLM AI Platform',
  'landing.tech.ai.desc':
    'Built on a provider-agnostic Multi-LLM architecture, enabling TappyAI to intelligently orchestrate multiple AI models through a unified orchestration layer.',
  'landing.tech.data.title': 'Backend & data',
  'landing.tech.data.desc': 'Supabase — PostgreSQL, authentication, and row-level security — with media storage on Vercel Blob.',
  'landing.tech.ops.title': 'Analytics & payments',
  'landing.tech.ops.desc': 'PostHog product analytics and Stripe subscription billing.',

  // 8. About
  'landing.about.title': 'About TappyAI',
  'landing.about.p1':
    'TappyAI is built in Vietnam by Huy Phạm, who previously founded consumer internet ventures and kept meeting the same unsolved friction: deciding where to eat, judging whether a price is fair, or planning a trip still means searching across multiple disconnected apps and information sources, with reviews nobody can verify. Web, mobile, AI, and infrastructure are designed and engineered entirely in-house.',
  'landing.about.p2':
    'The mission is to help people turn intention into action with the least possible effort and the greatest possible confidence. The longer-term vision is a trusted everyday assistant that people in Vietnam rely on to discover, decide, plan, and act — a role earned by being genuinely useful and honest, not by competing for attention.',

  // 9. Contact
  'landing.contact.title': 'Contact & support',
  'landing.contact.support.label': 'Support',
  'landing.contact.founder.label': 'Founder & CEO',
  'landing.contact.founder.name': 'HUY PHẠM',
  'landing.contact.founder.bio1':
    'Entrepreneur and technology business leader with more than 15 years of experience building digital businesses, marketplaces, e-commerce ecosystems, and strategic partnerships in Vietnam.',
  'landing.contact.founder.bio2':
    'Throughout his career, Huy has worked across startups and technology companies, leading business development, enterprise partnerships, and go-to-market initiatives while collaborating closely with product and engineering teams.',
  'landing.contact.founder.bio3':
    'He previously founded consumer internet ventures, including Foodnow.vn and Mía Store, gaining first-hand experience in product development, operations, customer acquisition, and startup execution.',
  'landing.contact.founder.bio4':
    'Today, he is the Founder & CEO of TappyAI, an AI-powered consumer platform designed to simplify everyday life through conversational AI, local discovery, and intelligent recommendations. His long-term vision is to make AI practical, accessible, and useful for millions of people across Vietnam and Southeast Asia.',
  'landing.contact.website.label': 'Official website',

  // 10. Footer
  'landing.footer.legalNavLabel': 'Legal',
  'landing.footer.terms': 'Terms of Service',
  'landing.footer.privacy': 'Privacy Policy',
  'landing.footer.copyrightPolicy': 'Copyright Policy',
  'landing.footer.rights': '© 2026 TappyAI. All rights reserved.',
}

export const vi: Record<string, string> = {
  // Header
  'landing.nav.openApp': 'Mở ứng dụng',
  'landing.nav.langLabel': 'Ngôn ngữ',

  // 1. Hero
  'landing.hero.eyebrow': 'Chào mừng đến với TappyAI 👋',
  'landing.hero.headlineLead': 'Trợ lý AI cho',
  'landing.hero.headlineAccent': 'đời sống hằng ngày tại Việt Nam',
  'landing.hero.headline': 'Trợ lý AI cho đời sống hằng ngày tại Việt Nam',
  'landing.hero.subtitle':
    'TappyAI kết hợp trợ lý AI hội thoại, cộng đồng review video ngắn và các tiện ích thiết thực hằng ngày trong một sản phẩm song ngữ — xây dựng quanh cách người Việt ăn uống, đi lại và sinh hoạt.',
  'landing.hero.learnMore': 'Tìm hiểu thêm',
  'landing.hero.viewProduct': 'Xem sản phẩm',
  'landing.hero.screenshotAlt': 'Màn hình chính TappyAI — thẻ chào AI, khám phá theo danh mục và tiện ích hằng ngày',

  // 2. What is TappyAI
  'landing.what.title': 'TappyAI là gì?',
  'landing.what.p1':
    'TappyAI là nền tảng AI cho đời sống, xây dựng riêng cho Việt Nam. Sản phẩm được tổ chức quanh điều người dùng thật sự muốn làm — ăn gì, đi đâu, lên kế hoạch ra sao, mua ở đâu — thay vì chia nhỏ theo từng loại ứng dụng, nên chỉ một trợ lý duy nhất mang theo ngữ cảnh xuyên suốt mọi nhu cầu. Đi cùng trợ lý là cộng đồng review video ngắn, giữ cho mỗi gợi ý luôn bám sát trải nghiệm thực tế của người dùng bản địa.',
  'landing.what.p2':
    'Sản phẩm vận hành như một hệ sinh thái thống nhất trên web, Android và iOS. Nền tảng web hiện đã hoạt động chính thức; ứng dụng native Android và iOS đang được phát triển, trong đó Android ở giai đoạn kiểm thử bản phát hành thử (release candidate). Giao diện hỗ trợ song ngữ Việt – Anh.',

  // 3. Vision
  'landing.vision.title': 'Tầm nhìn',
  'landing.vision.p1':
    'Những quyết định hằng ngày — ăn ở đâu, đi đâu, giá bao nhiêu là hợp lý — nên mất vài giây, thay vì phải tìm kiếm qua nhiều ứng dụng. TappyAI hướng tới trở thành người bạn đồng hành tin cậy cho đời sống hằng ngày tại Việt Nam, kết hợp gợi ý từ AI với trải nghiệm chân thực của cộng đồng.',
  'landing.vision.p2':
    'Chúng tôi xây dựng cho Việt Nam trước tiên: dịch vụ địa phương, ngôn ngữ địa phương, thói quen địa phương — với chuẩn mực kỹ thuật quốc tế.',

  // 4. Product overview
  'landing.product.title': 'Tổng quan sản phẩm',
  'landing.product.intro': 'Một sản phẩm, ba lớp kết nối với nhau.',
  'landing.product.assistant.title': 'Trợ lý AI',
  'landing.product.assistant.desc':
    'Trợ lý hội thoại về ẩm thực, du lịch và dịch vụ địa phương. Trả lời bằng ngôn ngữ tự nhiên, lập kế hoạch với địa điểm và hình ảnh thực tế, cá nhân hóa gợi ý cho từng người dùng.',
  'landing.product.community.title': 'Cộng đồng review',
  'landing.product.community.desc':
    'Bảng tin video ngắn nơi người dùng đăng review về nhà hàng, quán cà phê và địa điểm — với lượt thích, bình luận, theo dõi và âm thanh có thể dùng lại gắn với mỗi review.',
  'landing.product.tools.title': 'Tiện ích hằng ngày',
  'landing.product.tools.desc':
    'Các công cụ thiết thực dùng mỗi ngày: dịch thuật, quy đổi tiền tệ, chia hóa đơn, quét tài liệu và danh sách deal chọn lọc từ các dịch vụ phổ biến tại Việt Nam.',

  // 5. Key features
  'landing.features.title': 'Tính năng chính',
  'landing.features.chat.title': 'Chat AI & lập kế hoạch',
  'landing.features.chat.desc':
    'Hỏi bằng ngôn ngữ thường ngày và nhận lại lịch trình có cấu trúc như một cẩm nang — địa điểm có thật kèm hình ảnh, đánh giá, thông tin quán và review video ngắn từ cộng đồng. Link đặt chỗ, mua sắm gắn sẵn để bạn hành động ngay, thay vì phải tự đi tìm lại từ đầu. Đó là điểm khác biệt so với một trợ lý AI thông thường: mỗi gợi ý được dựng từ cơ sở kinh doanh có thật và review video ngắn từ cộng đồng, dựa trên thông tin hiện hành, và kết thúc đúng chỗ bạn có thể đặt hoặc mua.',
  'landing.features.reviews.title': 'Review video ngắn',
  'landing.features.reviews.desc':
    'Bảng tin video dọc với các review chân thực từ người dùng thật, kèm lượt thích, bình luận, lưu và chia sẻ.',
  'landing.features.sounds.title': 'Âm thanh & âm nhạc',
  'landing.features.sounds.desc':
    'Mỗi review có thể gắn một âm thanh dùng lại được, cùng thư viện nhạc bản quyền và âm thanh gốc từ người dùng.',
  'landing.features.deals.title': 'Deal mỗi ngày',
  'landing.features.deals.desc':
    'Danh sách ưu đãi chọn lọc từ các dịch vụ phổ biến tại Việt Nam, làm mới mỗi ngày.',
  'landing.features.tools.title': 'Tiện ích thiết thực',
  'landing.features.tools.desc':
    'Dịch thuật, tiền tệ, chia hóa đơn, quét tài liệu và nhiều hơn nữa — những công cụ nhỏ cho tình huống hằng ngày.',
  'landing.features.bilingual.title': 'Song ngữ từ thiết kế',
  'landing.features.bilingual.desc':
    'Giao diện ứng dụng có thể chuyển đổi giữa tiếng Việt và tiếng Anh bất kỳ lúc nào.',

  // 6. Product screenshots
  'landing.shots.title': 'Hình ảnh sản phẩm',
  'landing.shots.caption': 'Giao diện thực tế, chụp trực tiếp từ sản phẩm đang vận hành.',
  'landing.shots.home.label': 'Trang chủ',
  'landing.shots.home.alt': 'Màn hình chính TappyAI với lời chào AI, danh mục và tiện ích hằng ngày',
  'landing.shots.chat.label': 'Chat AI',
  'landing.shots.chat.alt': 'Màn hình chat TappyAI với trợ lý Tappy và các gợi ý câu hỏi',
  'landing.shots.reviews.label': 'Bảng tin review',
  'landing.shots.reviews.alt': 'Bảng tin video review ngắn của TappyAI với thao tác thích, bình luận, chia sẻ',
  'landing.shots.music.label': 'Thư viện nhạc',
  'landing.shots.music.alt': 'Thư viện nhạc TappyAI liệt kê các âm thanh dùng lại được kèm nút phát',
  'landing.shots.deals.label': 'Deal mỗi ngày',
  'landing.shots.deals.alt': 'Màn hình deal mỗi ngày của TappyAI với các ưu đãi chọn lọc',

  // 7. Technology
  'landing.tech.title': 'Công nghệ',
  'landing.tech.intro': 'TappyAI được xây dựng trên nền tảng công nghệ hiện đại, đã được kiểm chứng.',
  'landing.tech.web.title': 'Ứng dụng web',
  'landing.tech.web.desc': 'Next.js, React và TypeScript với Tailwind CSS, triển khai trên Vercel.',
  'landing.tech.mobile.title': 'Di động',
  'landing.tech.mobile.desc':
    'Ứng dụng di động native dành cho Android (Kotlin + Jetpack Compose) và iOS (Swift + SwiftUI).',
  'landing.tech.ai.title': 'Nền tảng AI Multi-LLM',
  'landing.tech.ai.desc':
    'Được xây dựng trên kiến trúc Multi-LLM độc lập với nhà cung cấp, cho phép TappyAI điều phối thông minh nhiều mô hình AI thông qua một lớp điều phối AI thống nhất.',
  'landing.tech.data.title': 'Backend & dữ liệu',
  'landing.tech.data.desc': 'Supabase — PostgreSQL, xác thực và bảo mật cấp dòng (RLS) — cùng lưu trữ media trên Vercel Blob.',
  'landing.tech.ops.title': 'Phân tích & thanh toán',
  'landing.tech.ops.desc': 'Phân tích sản phẩm PostHog và thanh toán thuê bao Stripe.',

  // 8. About
  'landing.about.title': 'Về TappyAI',
  'landing.about.p1':
    'TappyAI được xây dựng tại Việt Nam bởi Huy Phạm, người từng sáng lập các dự án internet cho người dùng và liên tục gặp lại một vướng mắc chưa được giải quyết: chọn chỗ ăn, biết giá thế nào là hợp lý hay sắp xếp một chuyến đi vẫn phải tìm kiếm qua nhiều ứng dụng và nguồn thông tin rời rạc, cùng những bài review khó kiểm chứng. Web, di động, AI và hạ tầng đều do đội ngũ tự thiết kế và phát triển toàn bộ.',
  'landing.about.p2':
    'Sứ mệnh của TappyAI là giúp người dùng biến ý định thành hành động với ít công sức nhất và sự chắc chắn cao nhất. Tầm nhìn dài hạn là trở thành trợ lý thường ngày đáng tin cậy để người Việt khám phá, quyết định, lên kế hoạch và hành động — vị trí chỉ có được bằng sự hữu ích và trung thực, không phải bằng cách giành giật sự chú ý.',

  // 9. Contact
  'landing.contact.title': 'Liên hệ & hỗ trợ',
  'landing.contact.support.label': 'Hỗ trợ',
  'landing.contact.founder.label': 'Nhà sáng lập & CEO',
  'landing.contact.founder.name': 'HUY PHẠM',
  'landing.contact.founder.bio1':
    'Doanh nhân và nhà lãnh đạo kinh doanh công nghệ với hơn 15 năm kinh nghiệm xây dựng các doanh nghiệp số, sàn giao dịch, hệ sinh thái thương mại điện tử và quan hệ đối tác chiến lược tại Việt Nam.',
  'landing.contact.founder.bio2':
    'Trong suốt sự nghiệp, Huy đã làm việc tại nhiều startup và công ty công nghệ, dẫn dắt phát triển kinh doanh, quan hệ đối tác doanh nghiệp và các sáng kiến go-to-market, đồng thời phối hợp chặt chẽ với đội ngũ sản phẩm và kỹ thuật.',
  'landing.contact.founder.bio3':
    'Trước đây, anh từng sáng lập các dự án internet tiêu dùng, bao gồm Foodnow.vn và Mía Store, tích lũy kinh nghiệm thực tiễn về phát triển sản phẩm, vận hành, thu hút khách hàng và triển khai startup.',
  'landing.contact.founder.bio4':
    'Hiện tại, anh là Nhà sáng lập & CEO của TappyAI — nền tảng tiêu dùng ứng dụng AI được thiết kế để đơn giản hóa cuộc sống hằng ngày thông qua AI hội thoại, khám phá địa phương và gợi ý thông minh. Tầm nhìn dài hạn của anh là đưa AI trở nên thiết thực, dễ tiếp cận và hữu ích cho hàng triệu người tại Việt Nam và Đông Nam Á.',
  'landing.contact.website.label': 'Website chính thức',

  // 10. Footer
  'landing.footer.legalNavLabel': 'Pháp lý',
  'landing.footer.terms': 'Điều khoản sử dụng',
  'landing.footer.privacy': 'Chính sách bảo mật',
  'landing.footer.copyrightPolicy': 'Chính sách bản quyền',
  'landing.footer.rights': '© 2026 TappyAI. Bảo lưu mọi quyền.',
}

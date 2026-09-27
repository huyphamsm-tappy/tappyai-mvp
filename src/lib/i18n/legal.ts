// Legal document copy for /privacy, /terms, /delete-account, /copyright and /support.
// Layered over the base dictionary
// by useTranslation, same contract as ./landing, ./w2 and ./w3 — the pages hold
// the document *structure* (which keys, in what order) and this module holds
// every localized string, so the two language editions can never drift apart
// structurally.
//
// Content is not invented: the privacy text describes what the production
// deployment actually does, verified against the running system (first-party
// analytics via /api/track, personalization via /api/memory, feedback via
// /api/message-feedback, bookings via /api/bookings, and only those third
// parties whose credentials are set in the production environment). PostHog is
// deliberately absent — NEXT_PUBLIC_POSTHOG_KEY is not set in production and a
// full page load issues zero requests to any PostHog host.
//
// 2026-09-27 (App Store submission): re-audited against the web backend AND the
// iOS app — date of birth / guest age declaration (lib/account/ageEligibility.ts,
// guestAgeDeclaration.ts), precise coordinates (not stored; logs round to 2
// decimals in lib/ai/tools/food.ts), Google Web Risk (lib/scam-shield/providers),
// Apple IAP (api/iap/apple/verify), GA4 (lib/analytics/ga4.ts, web only), group
// answers readable by link (api/group/route.ts), user-to-user messages
// (api/messaging), Google Calendar read-only (api/integrations/google-calendar).

export const en: Record<string, string> = {
  // ---------------------------------------------------------------- privacy
  // ⚠️ OWNER-REVIEW (before merge): the whole privacy policy was re-audited against the web
  // backend and the iOS app on 2026-09-27 (docs trail: appstore-submission.md). Every line below
  // describes code that exists; lines marked OWNER-REVIEW are commitments or configuration facts
  // the code alone cannot prove. Set the effective date to the real publication date.
  'legal.privacy.title': 'Privacy Policy',
  'legal.privacy.effective': 'Effective Date: September 2026',

  'legal.privacy.s1.heading': '1. Information We Collect',
  'legal.privacy.s1.lead': 'Depending on the features you use, TappyAI collects:',
  'legal.privacy.s1.b1':
    'Sign-in information. With Google: your name, email address and profile photo. With Zalo: your Zalo account ID, name and profile photo. With email: your email address, and the name you enter if you create an account.',
  // ⚠️ OWNER-REVIEW: public statement of the 18+ rule and of the date-of-birth boundary
  // (src/lib/account/userDataClassification.ts — DOB is never an AI context field).
  'legal.privacy.s1.b2':
    'Your date of birth, to check that you are 18 or older before you use the AI assistant. It is stored with your account and is never sent to our AI provider; the assistant may receive only your age group. If you are not signed in, you instead confirm that you are 18 or older or enter your birth year; that answer is kept on your device (a browser cookie or the app’s storage), sent with each chat request, and not stored on our servers.',
  'legal.privacy.s1.b3':
    'Profile details you choose to add, such as your display name, bio, profile photo, cover photo and gender.',
  'legal.privacy.s1.b4':
    'Conversation history with the AI assistant, saved to your account when you are signed in.',
  'legal.privacy.s1.b5':
    'Personalization details the assistant remembers from your conversations — such as the area you are usually in, who you go out with, your usual timing, your food, spa, shopping and entertainment preferences, and your budget ranges — and the city you choose when you start using TappyAI.',
  'legal.privacy.s1.b6':
    'Content you post or share: reviews (text, rating, photos and videos), comments, likes and follows, messages you send to other users, and plans or results you choose to share. Reviews, comments and your public profile (name, photo and bio) are visible to other people; a shared page is visible to anyone who has its link.',
  // ⚠️ OWNER-REVIEW: group answers are readable by anyone holding the group link
  // (src/app/api/group/route.ts); the health hint is a judgement call.
  'legal.privacy.s1.b7':
    'Group dining details you enter when you join a group — your name, area, budget, food preferences and dietary restrictions. They are visible to everyone who has the group’s link. Dietary restrictions can reveal health information such as allergies, so enter only what you are comfortable sharing.',
  'legal.privacy.s1.b8':
    'Feedback you give on an AI reply (like, dislike, or report, with an optional reason).',
  'legal.privacy.s1.b9':
    'Booking details — your name and phone number — when you book a service through TappyAI.',
  'legal.privacy.s1.b10':
    'Precise location. With your permission, your device’s coordinates are sent with your request so we can find results near you. They are not saved to your account; our system logs keep only a rounded location (about 1 km).',
  'legal.privacy.s1.b11':
    'What you submit to our tools: photos you scan (such as menus or receipts), text you translate, and the links, messages or screenshots you check with Scam Shield. They are processed to give you the result. We do not store scanned photos, text you translate, or the messages you check.',
  'legal.privacy.s1.b12':
    'Purchase information if you subscribe to a paid plan. On the website, payment is handled by Stripe. In the iOS app, payment is handled by Apple; we receive the transaction identifier, the product and its expiry date, never your card details.',
  'legal.privacy.s1.b13':
    'Usage and device information — pages viewed, searches, the categories, places, deals and reviews you interact with, the features you use, plus device type, operating system, app version, language, a session identifier, and the country derived from your IP address.',
  'legal.privacy.s1.b14':
    'Google Calendar events, only if you connected your Google Calendar to TappyAI (read-only access): your upcoming events are used to suggest plans that fit your schedule.',
  'legal.privacy.s1.note':
    'If you browse without signing in, usage events are recorded against a random anonymous identifier instead of an account.',

  'legal.privacy.s2.heading': '2. How We Use Your Information',
  'legal.privacy.s2.lead': 'We use your information to:',
  'legal.privacy.s2.b1': 'Provide AI-powered conversations.',
  'legal.privacy.s2.b2': 'Save and restore your conversation history.',
  'legal.privacy.s2.b3': 'Display your account profile and the content you choose to publish.',
  'legal.privacy.s2.b4':
    'Personalize recommendations, based on what the assistant has remembered and on how you use the app.',
  'legal.privacy.s2.b5': 'Confirm and manage bookings you make.',
  'legal.privacy.s2.b6': 'Improve the quality and reliability of the service.',
  'legal.privacy.s2.b7': 'Protect platform security.',
  'legal.privacy.s2.b8': 'Check that you are 18 or older before you use the AI assistant.',
  // ⚠️ OWNER-REVIEW: "no third-party advertising" is true of the code today (no ad SDK, no
  // advertising identifier on any client) — keep it true or change this sentence.
  'legal.privacy.s2.note':
    'We do not sell your personal information, and we do not use it for third-party advertising.',

  'legal.privacy.s3.heading': '3. Third-Party Services',
  'legal.privacy.s3.lead':
    'To provide AI responses, search and other core features, TappyAI sends the relevant parts of your requests to these providers:',
  'legal.privacy.s3.b1':
    'Anthropic (Claude) — generates the assistant’s replies and powers the AI tools. It receives your messages and, where relevant to your request, what the assistant remembers about you, your profile context (preferred name, city, age group and gender if you added it), your location, upcoming calendar events if connected, and the photos or text you submit to an AI tool. It does not receive your date of birth, email address or account ID.',
  'legal.privacy.s3.b2':
    'Serper and Google search services — retrieve search and place results. They receive search queries and, when you share your location, your coordinates.',
  'legal.privacy.s3.b3':
    'OpenStreetMap (Nominatim and Overpass) — turns coordinates into a place name and finds places near you.',
  'legal.privacy.s3.b4':
    'Google Web Risk — checks links you submit to Scam Shield against Google’s list of unsafe sites. Scam Shield also runs public DNS, WHOIS and SSL-certificate lookups on the link’s domain.',
  'legal.privacy.s3.b5': 'Supabase — hosts our database and authentication.',
  'legal.privacy.s3.b6': 'Vercel — hosts the website and our servers.',
  // ⚠️ OWNER-REVIEW: confirm GCP_LOGGING_ENABLED in production before keeping "operating logs".
  'legal.privacy.s3.b7':
    'Google Cloud — stores the photos, videos and audio you upload, and our operating logs.',
  // ⚠️ OWNER-REVIEW: GA4 loads only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set (Production).
  // Remove this line if it is not set there.
  'legal.privacy.s3.b8':
    'Google Analytics — measures how the website is used. It receives page and feature events without your account ID, email address or message content. The mobile apps do not use Google Analytics.',
  'legal.privacy.s3.b9':
    'Stripe — processes payment if you subscribe to a paid plan on the website.',
  'legal.privacy.s3.b10':
    'Apple — processes in-app purchases in the iOS app, and transcribes your speech when you use voice input on iPhone.',
  'legal.privacy.s3.b11':
    'Google and Zalo — handle sign-in when you choose those options. Google also delivers notifications on Android and provides Google Calendar access if you connect it.',
  'legal.privacy.s3.p1': 'These providers process data according to their own privacy policies.',
  'legal.privacy.s3.p2':
    'If you turn on notifications, your browser or device also creates a push subscription, which we store in order to deliver those notifications.',
  'legal.privacy.s3.p3':
    'If you use voice input, your speech is transcribed by your browser or device’s own speech service, which may process the audio on its provider’s servers. TappyAI receives only the resulting text and never records, stores or uploads the audio itself.',
  // ⚠️ OWNER-REVIEW: true for the current ACCESSTRADE wrapping (utm only). Re-check when the
  // affiliate attribution work (feat/affiliate-live, CCP_ATTRIBUTION_SECRET) lands.
  'legal.privacy.s3.p4':
    'When you open a link to a partner such as a shop, delivery, ride or booking service, you leave TappyAI and that partner’s privacy policy applies. The link may tell the partner that you came from TappyAI, but not who you are.',

  'legal.privacy.s4.heading': '4. Data Storage and Security',
  'legal.privacy.s4.p1':
    'User data is securely stored using Supabase infrastructure with authentication and access controls. Photos, video and audio you upload are stored in Google Cloud Storage.',
  'legal.privacy.s4.p2':
    'Only authenticated users can access their own account information and conversation history.',

  'legal.privacy.s5.heading': '5. Your Rights',
  'legal.privacy.s5.lead': 'You may:',
  'legal.privacy.s5.b1': 'Sign out at any time.',
  'legal.privacy.s5.b2':
    'Review, correct or delete what the assistant remembers about you, under Settings → Memory.',
  'legal.privacy.s5.b3':
    'Edit your profile, and delete the reviews and comments you have posted.',
  'legal.privacy.s5.b4':
    'Delete your account and its associated data. The page “Delete Your TappyAI Account” (www.tappyai.com/delete-account) explains how.',
  // ⚠️ OWNER-REVIEW: commits the team to handling access/correction requests by email.
  'legal.privacy.s5.b5':
    'Contact us to ask for a copy of your data or to correct it.',

  // ⚠️ OWNER-REVIEW: commitment to delete data reported as belonging to someone under 18.
  'legal.privacy.children.heading': '6. People Under 18',
  'legal.privacy.children.p1':
    'TappyAI is for people aged 18 and over, and the AI assistant is not available to anyone who tells us they are younger. If you believe someone under 18 has given us personal information, contact us and we will delete it.',

  'legal.privacy.s6.heading': '7. Changes to This Policy',
  'legal.privacy.s6.p1': 'We may update this Privacy Policy from time to time.',
  'legal.privacy.s6.p2': 'The latest version will always be available on this page.',

  'legal.privacy.s7.heading': '8. Contact',

  // ------------------------------------------------------------------ terms
  'legal.terms.title': 'Terms of Service',
  'legal.terms.effective': 'Effective Date: August 2026',

  'legal.terms.s1.heading': '1. Introduction',
  'legal.terms.s1.p1':
    'TappyAI is an AI assistant that helps you find places to eat, shop, relax and travel, along with related reference information. By using TappyAI, you agree to the terms below.',

  'legal.terms.s2.heading': '2. Your Account',
  'legal.terms.s2.p1':
    'You sign in with a Google or Zalo account to use TappyAI. You are responsible for keeping your account secure and for activity that happens under it.',

  'legal.terms.s3.heading': '3. Information Provided by the AI',
  'legal.terms.s3.p1':
    'Prices, places, reviews and other information provided by TappyAI are for reference only. They are gathered from public sources and may change over time, by branch, or by the moment you ask. TappyAI does not guarantee complete accuracy and is not responsible for decisions made based on this information.',

  'legal.terms.s4.heading': '4. Acceptable Use',
  'legal.terms.s4.p1':
    'You agree not to use TappyAI for unlawful or harmful purposes, or in any way that infringes the rights of others.',

  'legal.terms.s5.heading': '5. Changes to These Terms',
  'legal.terms.s5.p1':
    'TappyAI may update these terms from time to time. Continuing to use the service after a change means you accept the updated terms.',

  'legal.terms.s6.heading': '6. Contact',

  // --------------------------------------------------------- delete account
  // Public page required by Google Play. It documents the account-deletion
  // route the Android app actually implements: a *request* sent by email to
  // support, not an automatic in-app erase. The app's own menu item reads
  // "Request account deletion" and its confirmation dialog states the account
  // "is not deleted automatically" — this copy must keep matching that wording,
  // because Play checks the published description against the shipped flow.
  'legal.delete.title': 'Delete Your TappyAI Account',
  'legal.delete.effective': 'Last updated: August 2026',

  'legal.delete.s1.heading': '1. How to Request Account Deletion',
  'legal.delete.s1.lead':
    'You can request deletion of your TappyAI account from inside the app. The request is sent to our support team by email — your account is not deleted automatically when you tap the button.',
  'legal.delete.s1.step1': 'Open TappyAI.',
  'legal.delete.s1.step2': 'Go to Settings.',
  'legal.delete.s1.step3': 'Choose Request account deletion.',
  'legal.delete.s1.step4':
    'Confirm. The app opens your email app with the request already prepared — send the email to submit it.',

  'legal.delete.s2.heading': '2. What Happens Next',
  'legal.delete.s2.p1':
    'Our support team receives your request and verifies that it came from the owner of the account. Once verified, we permanently delete your account and its associated data.',
  'legal.delete.s2.p2':
    'If you do not have an email app set up on your device, you can send the request yourself to the support address at the bottom of this page.',

  'legal.delete.s3.heading': '3. What Deletion Removes',
  'legal.delete.s3.lead': 'Once your request has been processed, deletion permanently removes:',
  'legal.delete.s3.b1': 'Your profile.',
  'legal.delete.s3.b2': 'Chat history.',
  'legal.delete.s3.b3': 'AI memory.',
  'legal.delete.s3.b4': 'Saved items.',
  'legal.delete.s3.b5': 'Preferences.',
  'legal.delete.s3.b6': 'Other user-generated content associated with your account.',

  'legal.delete.s4.heading': '4. Data We May Retain',
  'legal.delete.s4.p1':
    'Some information may be retained only where required by applicable laws or legitimate business obligations (for example payment or legal compliance records).',

  'legal.delete.s5.heading': '5. Need Help?',
  'legal.delete.s5.p1':
    'If you need assistance, or want to check the status of a request you have already sent, contact us:',

// -------------------------------------------------------------- copyright
  'legal.copyright.title': 'Music Copyright Policy',
  'legal.copyright.effective': 'Applies to music uploaded to TappyAI by its users.',

  'legal.copyright.s1.heading': '1. Conditions for uploading music',
  'legal.copyright.s1.p1':
    'When you upload a track (an “Original Sound”), you confirm that you own it or hold every legal right to it, and you grant TappyAI and other users the right to use it on the platform — adding it to videos, and playing it back. You may not upload music owned by someone else without permission.',

  'legal.copyright.s2.heading': '2. Responsibility',
  'legal.copyright.s2.p1':
    'Whoever uploads a track is legally responsible for it. TappyAI acts as an intermediary platform and will remove infringing content on receiving a valid notice.',

  'legal.copyright.s3.heading': '3. Reporting infringement (notice and takedown)',
  'legal.copyright.s3.p1':
    'If you hold the rights to a work and believe a track on TappyAI infringes them, send a notice to the copyright agent below, or use the in-app “Report” option and choose “Copyright”.',
  'legal.copyright.s3.lead': 'Your notice needs to include:',
  'legal.copyright.s3.b1': 'The track or link that infringes your rights.',
  'legal.copyright.s3.b2': 'Evidence that you are the rights holder.',
  'legal.copyright.s3.b3': 'Your contact details.',
  'legal.copyright.s3.note':
    'We review valid notices and remove infringing content within 24–48 hours of receiving them.',

  'legal.copyright.s4.heading': '4. Copyright agent',
  'legal.copyright.s4.p1':
    'We receive and handle every copyright complaint at this address:',
  'legal.copyright.agent': 'Copyright agent',

  'legal.copyright.s5.heading': '5. Repeat infringement',
  'legal.copyright.s5.p1':
    'An account that repeatedly uploads infringing content may lose the ability to upload music, or be suspended.',

  // ---------------------------------------------------------------- support
  // /support — the App Store Support URL. Every answer describes what ships today.
  // ⚠️ OWNER-REVIEW (before merge): confirm support@tappyai.com is a monitored mailbox; the
  // page promises no response time on purpose — add one only if the team can keep it.
  'legal.support.title': 'Support',
  'legal.support.effective': 'Last updated: September 2026',

  'legal.support.s1.heading': '1. Contact us',
  'legal.support.s1.p1':
    'For questions, problems with your account, or anything you want to report, email our support team:',
  'legal.support.s1.p2':
    'To help us answer faster, tell us the email address or sign-in method (Google, Zalo or email) of your account and describe the problem briefly. Never send us your password or a verification code.',

  'legal.support.s2.heading': '2. Frequently asked questions',
  'legal.support.faq.signIn.q': 'How do I sign in?',
  'legal.support.faq.signIn.a':
    'You can sign in with Google, with Zalo or with your email address. Browsing places, deals and reviews works without an account; saving your chat history and posting reviews need one.',
  // ⚠️ OWNER-REVIEW: public statement of the 18+ policy and of what the date of birth is used for.
  'legal.support.faq.age.q': 'Why does TappyAI ask for my age?',
  'legal.support.faq.age.a':
    'TappyAI is for people aged 18 and over. Before you chat with the AI assistant, a signed-in account is asked for its date of birth; without an account, you confirm that you are 18 or older or enter your birth year. Your date of birth is used to check your age and is never sent to our AI provider. People under 18 cannot use the assistant.',
  // ⚠️ OWNER-REVIEW: "not professional advice" and "entertainment only" are liability statements.
  'legal.support.faq.accuracy.q': 'Is the information TappyAI gives me accurate?',
  'legal.support.faq.accuracy.a':
    'Answers are generated by AI from public sources. Prices, opening hours, addresses and reviews can change or be wrong, so check important details with the place or seller before relying on them. Answers are for reference only and are not medical, legal or financial advice. Tarot, zodiac and horoscope content is for entertainment only.',
  'legal.support.faq.memory.q': 'What does Tappy remember about me, and how do I remove it?',
  'legal.support.faq.memory.a':
    'When you are signed in, the assistant can remember preferences from your conversations — such as the area you are usually in, your tastes and your budget — to make better suggestions. You can review, edit or delete them at any time in the Memory section of your settings.',
  // ⚠️ OWNER-REVIEW: commits the team to reviewing emailed reports of other users' content.
  'legal.support.faq.report.q': 'How do I report a wrong answer or inappropriate content?',
  'legal.support.faq.report.a':
    'Under each AI answer you can give a thumbs-down or choose Report; we use this feedback to improve answers. To report a review, comment or profile posted by another user, email support with a link to it and we will review it.',
  'legal.support.faq.delete.q': 'How do I delete my account?',
  'legal.support.faq.delete.a':
    'The page “Delete your TappyAI account” below explains how to do it and what deletion removes.',

  'legal.support.s3.heading': '3. Policies',
  'legal.support.link.privacy': 'Privacy Policy',
  'legal.support.link.terms': 'Terms of Service',
  'legal.support.link.delete': 'Delete your TappyAI account',

  // ------------------------------------------------------------ shared bits
  'legal.contact.email': 'Email',
  'legal.contact.website': 'Website',
}

export const vi: Record<string, string> = {
  // ---------------------------------------------------------------- privacy
  // ⚠️ OWNER-REVIEW: same points as the English block above — the two editions must say the same.
  'legal.privacy.title': 'Chính sách bảo mật',
  'legal.privacy.effective': 'Ngày hiệu lực: Tháng 9 năm 2026',

  'legal.privacy.s1.heading': '1. Thông tin chúng tôi thu thập',
  'legal.privacy.s1.lead': 'Tùy theo tính năng bạn sử dụng, TappyAI thu thập:',
  'legal.privacy.s1.b1':
    'Thông tin đăng nhập. Với Google: tên, địa chỉ email và ảnh đại diện. Với Zalo: mã tài khoản Zalo, tên và ảnh đại diện. Với email: địa chỉ email, và tên bạn nhập khi tạo tài khoản.',
  'legal.privacy.s1.b2':
    'Ngày sinh của bạn, để xác nhận bạn đủ 18 tuổi trước khi dùng trợ lý AI. Ngày sinh được lưu cùng tài khoản và không bao giờ được gửi cho nhà cung cấp AI; trợ lý chỉ có thể nhận nhóm tuổi của bạn. Nếu chưa đăng nhập, bạn chỉ cần xác nhận mình đủ 18 tuổi hoặc nhập năm sinh; câu trả lời này được lưu trên thiết bị của bạn (cookie của trình duyệt hoặc bộ nhớ của ứng dụng), gửi kèm mỗi yêu cầu trò chuyện và không được lưu trên máy chủ của chúng tôi.',
  'legal.privacy.s1.b3':
    'Thông tin hồ sơ bạn chọn thêm, như tên hiển thị, phần giới thiệu, ảnh đại diện, ảnh bìa và giới tính.',
  'legal.privacy.s1.b4':
    'Lịch sử trò chuyện với trợ lý AI, được lưu vào tài khoản khi bạn đã đăng nhập.',
  'legal.privacy.s1.b5':
    'Thông tin cá nhân hóa mà trợ lý ghi nhớ từ cuộc trò chuyện của bạn — ví dụ khu vực bạn thường ở, người bạn thường đi cùng, thời điểm bạn thường đi, sở thích về ăn uống, spa, mua sắm, giải trí và khoảng ngân sách của bạn — cùng thành phố bạn chọn khi bắt đầu dùng TappyAI.',
  'legal.privacy.s1.b6':
    'Nội dung bạn đăng hoặc chia sẻ: bài đánh giá (nội dung, điểm đánh giá, ảnh và video), bình luận, lượt thích và theo dõi, tin nhắn bạn gửi cho người dùng khác, và kế hoạch hoặc kết quả bạn chọn chia sẻ. Bài đánh giá, bình luận và hồ sơ công khai của bạn (tên, ảnh và phần giới thiệu) hiển thị với người khác; trang được chia sẻ hiển thị với bất kỳ ai có đường link.',
  'legal.privacy.s1.b7':
    'Thông tin nhóm ăn uống bạn nhập khi tham gia nhóm — tên, khu vực, ngân sách, sở thích ăn uống và hạn chế ăn uống. Những thông tin này hiển thị với mọi người có đường link của nhóm. Hạn chế ăn uống có thể tiết lộ thông tin sức khỏe như dị ứng, vì vậy bạn chỉ nên nhập những gì bạn thấy thoải mái chia sẻ.',
  'legal.privacy.s1.b8':
    'Phản hồi của bạn về một câu trả lời của AI (thích, không thích hoặc báo cáo, kèm lý do tùy chọn).',
  'legal.privacy.s1.b9':
    'Thông tin đặt chỗ — tên và số điện thoại của bạn — khi bạn đặt dịch vụ qua TappyAI.',
  'legal.privacy.s1.b10':
    'Vị trí chính xác. Khi bạn cho phép, tọa độ thiết bị được gửi kèm yêu cầu để tìm kết quả gần bạn. Tọa độ không được lưu vào tài khoản; nhật ký hệ thống chỉ giữ vị trí đã làm tròn (khoảng 1 km).',
  'legal.privacy.s1.b11':
    'Nội dung bạn gửi vào các công cụ: ảnh bạn quét (như thực đơn hoặc hóa đơn), văn bản bạn dịch, và đường link, tin nhắn hoặc ảnh chụp màn hình bạn kiểm tra bằng Scam Shield. Chúng được xử lý để trả kết quả cho bạn. Chúng tôi không lưu ảnh quét, văn bản bạn dịch hay tin nhắn bạn kiểm tra.',
  'legal.privacy.s1.b12':
    'Thông tin mua hàng nếu bạn đăng ký gói trả phí. Trên website, thanh toán do Stripe xử lý. Trong ứng dụng iOS, thanh toán do Apple xử lý; chúng tôi nhận mã giao dịch, gói đã mua và ngày hết hạn, không bao giờ nhận thông tin thẻ của bạn.',
  'legal.privacy.s1.b13':
    'Thông tin sử dụng và thiết bị — các trang bạn xem, nội dung bạn tìm kiếm, các danh mục, địa điểm, ưu đãi và bài đánh giá bạn tương tác, các tính năng bạn dùng, cùng với loại thiết bị, hệ điều hành, phiên bản ứng dụng, ngôn ngữ, mã phiên và quốc gia được xác định từ địa chỉ IP của bạn.',
  'legal.privacy.s1.b14':
    'Sự kiện trên Google Lịch, chỉ khi bạn đã kết nối Google Lịch với TappyAI (quyền chỉ đọc): các sự kiện sắp tới được dùng để gợi ý kế hoạch phù hợp với lịch của bạn.',
  'legal.privacy.s1.note':
    'Nếu bạn sử dụng mà không đăng nhập, các sự kiện sử dụng được ghi nhận theo một mã ẩn danh ngẫu nhiên thay vì theo tài khoản.',

  'legal.privacy.s2.heading': '2. Cách chúng tôi sử dụng thông tin',
  'legal.privacy.s2.lead': 'Chúng tôi sử dụng thông tin của bạn để:',
  'legal.privacy.s2.b1': 'Cung cấp các cuộc trò chuyện được hỗ trợ bởi AI.',
  'legal.privacy.s2.b2': 'Lưu và khôi phục lịch sử trò chuyện của bạn.',
  'legal.privacy.s2.b3': 'Hiển thị hồ sơ tài khoản và nội dung bạn chọn đăng công khai.',
  'legal.privacy.s2.b4':
    'Cá nhân hóa gợi ý, dựa trên những gì trợ lý đã ghi nhớ và cách bạn sử dụng ứng dụng.',
  'legal.privacy.s2.b5': 'Xác nhận và quản lý các đặt chỗ bạn thực hiện.',
  'legal.privacy.s2.b6': 'Cải thiện chất lượng và độ tin cậy của dịch vụ.',
  'legal.privacy.s2.b7': 'Bảo vệ an toàn của nền tảng.',
  'legal.privacy.s2.b8': 'Xác nhận bạn đủ 18 tuổi trước khi dùng trợ lý AI.',
  'legal.privacy.s2.note':
    'Chúng tôi không bán thông tin cá nhân của bạn và không dùng thông tin đó cho quảng cáo của bên thứ ba.',

  'legal.privacy.s3.heading': '3. Dịch vụ bên thứ ba',
  'legal.privacy.s3.lead':
    'Để cung cấp câu trả lời AI, tìm kiếm và các tính năng cốt lõi khác, TappyAI gửi những phần liên quan trong yêu cầu của bạn tới các nhà cung cấp sau:',
  'legal.privacy.s3.b1':
    'Anthropic (Claude) — tạo câu trả lời của trợ lý và vận hành các công cụ AI. Anthropic nhận tin nhắn của bạn và, khi liên quan đến yêu cầu, những gì trợ lý ghi nhớ về bạn, thông tin hồ sơ (tên gọi, thành phố, nhóm tuổi và giới tính nếu bạn đã thêm), vị trí của bạn, các sự kiện lịch sắp tới nếu đã kết nối, cùng ảnh hoặc văn bản bạn gửi vào công cụ AI. Anthropic không nhận ngày sinh, địa chỉ email hay mã tài khoản của bạn.',
  'legal.privacy.s3.b2':
    'Serper và dịch vụ tìm kiếm của Google — lấy kết quả tìm kiếm và địa điểm. Các dịch vụ này nhận nội dung tìm kiếm và, khi bạn chia sẻ vị trí, tọa độ của bạn.',
  'legal.privacy.s3.b3':
    'OpenStreetMap (Nominatim và Overpass) — chuyển tọa độ thành tên địa điểm và tìm địa điểm gần bạn.',
  'legal.privacy.s3.b4':
    'Google Web Risk — đối chiếu đường link bạn gửi vào Scam Shield với danh sách trang web không an toàn của Google. Scam Shield cũng tra cứu công khai DNS, WHOIS và chứng chỉ SSL của tên miền trong đường link.',
  'legal.privacy.s3.b5': 'Supabase — lưu trữ cơ sở dữ liệu và xác thực.',
  'legal.privacy.s3.b6': 'Vercel — vận hành trang web và máy chủ của chúng tôi.',
  'legal.privacy.s3.b7':
    'Google Cloud — lưu trữ ảnh, video và âm thanh bạn tải lên, cùng nhật ký vận hành của hệ thống.',
  'legal.privacy.s3.b8':
    'Google Analytics — đo lường cách trang web được sử dụng. Dịch vụ này nhận các sự kiện về trang và tính năng, không kèm mã tài khoản, địa chỉ email hay nội dung tin nhắn của bạn. Ứng dụng di động không dùng Google Analytics.',
  'legal.privacy.s3.b9':
    'Stripe — xử lý thanh toán nếu bạn đăng ký gói trả phí trên website.',
  'legal.privacy.s3.b10':
    'Apple — xử lý giao dịch mua trong ứng dụng iOS, và chuyển lời nói thành văn bản khi bạn nhập bằng giọng nói trên iPhone.',
  'legal.privacy.s3.b11':
    'Google và Zalo — xử lý đăng nhập khi bạn chọn các phương thức đó. Google cũng gửi thông báo trên Android và cung cấp quyền truy cập Google Lịch nếu bạn kết nối.',
  'legal.privacy.s3.p1': 'Các nhà cung cấp này xử lý dữ liệu theo chính sách bảo mật riêng của họ.',
  'legal.privacy.s3.p2':
    'Nếu bạn bật thông báo, trình duyệt hoặc thiết bị của bạn cũng tạo một đăng ký nhận thông báo đẩy, và chúng tôi lưu đăng ký đó để có thể gửi các thông báo này.',
  'legal.privacy.s3.p3':
    'Nếu bạn dùng nhập liệu bằng giọng nói, lời nói của bạn được chuyển thành văn bản bởi dịch vụ nhận dạng giọng nói của chính trình duyệt hoặc thiết bị, và dịch vụ đó có thể xử lý âm thanh trên máy chủ của họ. TappyAI chỉ nhận phần văn bản thu được, không ghi âm, không lưu và không tải lên âm thanh.',
  'legal.privacy.s3.p4':
    'Khi bạn mở đường link tới một đối tác như cửa hàng, dịch vụ giao đồ ăn, gọi xe hoặc đặt chỗ, bạn rời khỏi TappyAI và chính sách bảo mật của đối tác đó sẽ được áp dụng. Đường link có thể cho đối tác biết bạn đến từ TappyAI, nhưng không cho biết bạn là ai.',

  'legal.privacy.s4.heading': '4. Lưu trữ và bảo mật dữ liệu',
  'legal.privacy.s4.p1':
    'Dữ liệu người dùng được lưu trữ an toàn trên hạ tầng Supabase với cơ chế xác thực và kiểm soát truy cập. Ảnh, video và âm thanh bạn tải lên được lưu trên Google Cloud Storage.',
  'legal.privacy.s4.p2':
    'Chỉ người dùng đã đăng nhập mới có thể truy cập thông tin tài khoản và lịch sử trò chuyện của chính mình.',

  'legal.privacy.s5.heading': '5. Quyền của bạn',
  'legal.privacy.s5.lead': 'Bạn có thể:',
  'legal.privacy.s5.b1': 'Đăng xuất bất kỳ lúc nào.',
  'legal.privacy.s5.b2':
    'Xem lại, chỉnh sửa hoặc xóa những gì trợ lý ghi nhớ về bạn, trong Cài đặt → Trí nhớ.',
  'legal.privacy.s5.b3':
    'Chỉnh sửa hồ sơ, và xóa các bài đánh giá và bình luận bạn đã đăng.',
  'legal.privacy.s5.b4':
    'Xóa tài khoản và dữ liệu liên quan. Trang “Xóa tài khoản TappyAI” (www.tappyai.com/delete-account) hướng dẫn cách thực hiện.',
  'legal.privacy.s5.b5':
    'Liên hệ với chúng tôi để yêu cầu bản sao dữ liệu của bạn hoặc chỉnh sửa dữ liệu đó.',

  'legal.privacy.children.heading': '6. Người dưới 18 tuổi',
  'legal.privacy.children.p1':
    'TappyAI dành cho người từ 18 tuổi trở lên, và trợ lý AI không phục vụ bất kỳ ai cho biết mình chưa đủ 18 tuổi. Nếu bạn cho rằng một người dưới 18 tuổi đã cung cấp thông tin cá nhân cho chúng tôi, hãy liên hệ để chúng tôi xóa thông tin đó.',

  'legal.privacy.s6.heading': '7. Thay đổi chính sách',
  'legal.privacy.s6.p1': 'Chúng tôi có thể cập nhật Chính sách bảo mật này theo thời gian.',
  'legal.privacy.s6.p2': 'Phiên bản mới nhất sẽ luôn có trên trang này.',

  'legal.privacy.s7.heading': '8. Liên hệ',

  // ------------------------------------------------------------------ terms
  'legal.terms.title': 'Điều khoản dịch vụ',
  'legal.terms.effective': 'Ngày hiệu lực: Tháng 8 năm 2026',

  'legal.terms.s1.heading': '1. Giới thiệu',
  'legal.terms.s1.p1':
    'TappyAI là trợ lý AI giúp bạn tìm kiếm địa điểm ăn uống, mua sắm, spa, giải trí, du lịch và các thông tin tham khảo liên quan. Khi sử dụng TappyAI, bạn đồng ý với các điều khoản dưới đây.',

  'legal.terms.s2.heading': '2. Tài khoản',
  'legal.terms.s2.p1':
    'Bạn cần đăng nhập bằng tài khoản Google hoặc Zalo để sử dụng TappyAI. Bạn chịu trách nhiệm bảo mật tài khoản của mình và các hoạt động diễn ra dưới tài khoản đó.',

  'legal.terms.s3.heading': '3. Thông tin do AI cung cấp',
  'legal.terms.s3.p1':
    'Giá cả, địa điểm, đánh giá và các thông tin khác do TappyAI cung cấp chỉ mang tính tham khảo, được tổng hợp từ các nguồn tìm kiếm công khai và có thể thay đổi theo thời gian, chi nhánh hoặc thời điểm. TappyAI không đảm bảo tính chính xác tuyệt đối và không chịu trách nhiệm cho các quyết định dựa trên thông tin này.',

  'legal.terms.s4.heading': '4. Sử dụng hợp lý',
  'legal.terms.s4.p1':
    'Bạn đồng ý không sử dụng TappyAI cho mục đích bất hợp pháp, gây hại hoặc vi phạm quyền của người khác.',

  'legal.terms.s5.heading': '5. Thay đổi điều khoản',
  'legal.terms.s5.p1':
    'TappyAI có thể cập nhật điều khoản này theo thời gian. Việc tiếp tục sử dụng dịch vụ sau khi có thay đổi đồng nghĩa với việc bạn chấp nhận các điều khoản mới.',

  'legal.terms.s6.heading': '6. Liên hệ',

  // --------------------------------------------------------- delete account
  'legal.delete.title': 'Xóa tài khoản TappyAI',
  'legal.delete.effective': 'Cập nhật lần cuối: Tháng 8 năm 2026',

  'legal.delete.s1.heading': '1. Cách gửi yêu cầu xóa tài khoản',
  'legal.delete.s1.lead':
    'Bạn có thể gửi yêu cầu xóa tài khoản TappyAI ngay trong ứng dụng. Yêu cầu sẽ được gửi tới bộ phận hỗ trợ của chúng tôi qua email — tài khoản không bị xóa tự động ngay khi bạn nhấn nút.',
  'legal.delete.s1.step1': 'Mở TappyAI.',
  'legal.delete.s1.step2': 'Vào Cài đặt.',
  'legal.delete.s1.step3': 'Chọn Yêu cầu xóa tài khoản.',
  'legal.delete.s1.step4':
    'Xác nhận. Ứng dụng sẽ mở ứng dụng email với nội dung yêu cầu đã soạn sẵn — hãy gửi email đó để hoàn tất.',

  'legal.delete.s2.heading': '2. Điều gì diễn ra sau đó',
  'legal.delete.s2.p1':
    'Bộ phận hỗ trợ tiếp nhận yêu cầu và xác minh rằng yêu cầu đến từ chủ tài khoản. Sau khi xác minh, chúng tôi sẽ xóa vĩnh viễn tài khoản của bạn cùng các dữ liệu liên quan.',
  'legal.delete.s2.p2':
    'Nếu thiết bị của bạn chưa cài ứng dụng email, bạn có thể tự gửi yêu cầu tới địa chỉ hỗ trợ ở cuối trang này.',

  'legal.delete.s3.heading': '3. Những dữ liệu sẽ bị xóa',
  'legal.delete.s3.lead': 'Sau khi yêu cầu được xử lý, việc xóa sẽ loại bỏ vĩnh viễn:',
  'legal.delete.s3.b1': 'Hồ sơ.',
  'legal.delete.s3.b2': 'Lịch sử trò chuyện.',
  'legal.delete.s3.b3': 'Bộ nhớ AI.',
  'legal.delete.s3.b4': 'Nội dung đã lưu.',
  'legal.delete.s3.b5': 'Tùy chọn cá nhân.',
  'legal.delete.s3.b6': 'Các dữ liệu khác do bạn tạo và gắn với tài khoản.',

  'legal.delete.s4.heading': '4. Dữ liệu có thể được lưu lại',
  'legal.delete.s4.p1':
    'Một số dữ liệu có thể được lưu lại nếu pháp luật yêu cầu hoặc để thực hiện các nghĩa vụ hợp pháp (ví dụ thông tin thanh toán hoặc lưu trữ theo quy định).',

  'legal.delete.s5.heading': '5. Cần hỗ trợ?',
  'legal.delete.s5.p1':
    'Nếu cần hỗ trợ, hoặc muốn kiểm tra tình trạng yêu cầu đã gửi, vui lòng liên hệ:',

// -------------------------------------------------------------- copyright
  'legal.copyright.title': 'Chính sách bản quyền âm nhạc',
  'legal.copyright.effective': 'Áp dụng cho nhạc do người dùng đăng tải lên TappyAI.',

  'legal.copyright.s1.heading': '1. Điều kiện khi đăng nhạc',
  'legal.copyright.s1.p1':
    'Khi đăng một bản nhạc (“Original Sound”), bạn cam kết rằng bạn sở hữu hoặc có đầy đủ quyền hợp pháp đối với bản nhạc đó, và cấp cho TappyAI cùng người dùng khác quyền sử dụng nó (chèn vào video, phát lại) trên nền tảng. Bạn không được đăng nhạc có bản quyền của người khác khi chưa được phép.',

  'legal.copyright.s2.heading': '2. Trách nhiệm',
  'legal.copyright.s2.p1':
    'Người đăng chịu trách nhiệm pháp lý về nội dung mình tải lên. TappyAI hoạt động như một nền tảng trung gian và sẽ gỡ bỏ nội dung vi phạm khi nhận được thông báo hợp lệ.',

  'legal.copyright.s3.heading': '3. Báo cáo vi phạm (Notice-and-Takedown)',
  'legal.copyright.s3.p1':
    'Nếu bạn là chủ sở hữu quyền và cho rằng một bản nhạc trên TappyAI vi phạm bản quyền của bạn, hãy gửi thông báo tới đại diện bản quyền bên dưới, hoặc dùng tùy chọn “Báo cáo” trong ứng dụng và chọn “Bản quyền”.',
  'legal.copyright.s3.lead': 'Thông báo cần gồm:',
  'legal.copyright.s3.b1': 'Bản nhạc hoặc đường dẫn bị vi phạm.',
  'legal.copyright.s3.b2': 'Bằng chứng bạn là chủ sở hữu quyền.',
  'legal.copyright.s3.b3': 'Thông tin liên hệ của bạn.',
  'legal.copyright.s3.note':
    'Chúng tôi sẽ xem xét và gỡ bỏ nội dung vi phạm trong vòng 24–48 giờ kể từ khi nhận được thông báo hợp lệ.',

  'legal.copyright.s4.heading': '4. Đại diện bản quyền',
  'legal.copyright.s4.p1':
    'Chúng tôi tiếp nhận và xử lý mọi khiếu nại bản quyền qua địa chỉ này:',
  'legal.copyright.agent': 'Đại diện bản quyền',

  'legal.copyright.s5.heading': '5. Xử lý vi phạm lặp lại',
  'legal.copyright.s5.p1':
    'Tài khoản nhiều lần đăng nội dung vi phạm bản quyền có thể bị hạn chế đăng nhạc hoặc khóa.',

  // ---------------------------------------------------------------- support
  // ⚠️ OWNER-REVIEW: same points as the English block above.
  'legal.support.title': 'Hỗ trợ',
  'legal.support.effective': 'Cập nhật lần cuối: Tháng 9 năm 2026',

  'legal.support.s1.heading': '1. Liên hệ với chúng tôi',
  'legal.support.s1.p1':
    'Nếu bạn có câu hỏi, gặp sự cố với tài khoản hoặc muốn báo cáo điều gì, hãy gửi email cho bộ phận hỗ trợ:',
  'legal.support.s1.p2':
    'Để chúng tôi trả lời nhanh hơn, hãy cho biết địa chỉ email hoặc phương thức đăng nhập (Google, Zalo hoặc email) của tài khoản và mô tả ngắn gọn vấn đề. Tuyệt đối không gửi mật khẩu hoặc mã xác minh cho chúng tôi.',

  'legal.support.s2.heading': '2. Câu hỏi thường gặp',
  'legal.support.faq.signIn.q': 'Làm sao để đăng nhập?',
  'legal.support.faq.signIn.a':
    'Bạn có thể đăng nhập bằng Google, Zalo hoặc địa chỉ email. Bạn có thể xem địa điểm, ưu đãi và bài đánh giá mà không cần tài khoản; để lưu lịch sử trò chuyện và đăng bài đánh giá thì cần có tài khoản.',
  'legal.support.faq.age.q': 'Vì sao TappyAI hỏi tuổi của tôi?',
  'legal.support.faq.age.a':
    'TappyAI dành cho người từ 18 tuổi trở lên. Trước khi trò chuyện với trợ lý AI, tài khoản đã đăng nhập sẽ được yêu cầu nhập ngày sinh; nếu chưa đăng nhập, bạn xác nhận mình đủ 18 tuổi hoặc nhập năm sinh. Ngày sinh chỉ dùng để kiểm tra độ tuổi và không bao giờ được gửi cho nhà cung cấp AI. Người dưới 18 tuổi không thể sử dụng trợ lý.',
  'legal.support.faq.accuracy.q': 'Thông tin TappyAI đưa ra có chính xác không?',
  'legal.support.faq.accuracy.a':
    'Câu trả lời do AI tạo ra từ các nguồn công khai. Giá, giờ mở cửa, địa chỉ và đánh giá có thể thay đổi hoặc chưa chính xác, vì vậy hãy kiểm tra lại các thông tin quan trọng với địa điểm hoặc người bán trước khi quyết định. Câu trả lời chỉ mang tính tham khảo, không phải lời khuyên y tế, pháp lý hay tài chính. Nội dung tarot, cung hoàng đạo và tử vi chỉ nhằm mục đích giải trí.',
  'legal.support.faq.memory.q': 'Tappy ghi nhớ gì về tôi và làm sao để xóa?',
  'legal.support.faq.memory.a':
    'Khi bạn đã đăng nhập, trợ lý có thể ghi nhớ sở thích từ các cuộc trò chuyện — ví dụ khu vực bạn thường ở, khẩu vị và ngân sách — để gợi ý phù hợp hơn. Bạn có thể xem, chỉnh sửa hoặc xóa những thông tin này bất cứ lúc nào trong mục Trí nhớ của phần cài đặt.',
  'legal.support.faq.report.q': 'Làm sao để báo cáo câu trả lời sai hoặc nội dung không phù hợp?',
  'legal.support.faq.report.a':
    'Dưới mỗi câu trả lời của AI, bạn có thể bấm không thích hoặc chọn Báo cáo; chúng tôi dùng các phản hồi này để cải thiện câu trả lời. Để báo cáo bài đánh giá, bình luận hoặc hồ sơ do người dùng khác đăng, hãy gửi email cho bộ phận hỗ trợ kèm đường link tới nội dung đó để chúng tôi xem xét.',
  'legal.support.faq.delete.q': 'Làm sao để xóa tài khoản?',
  'legal.support.faq.delete.a':
    'Trang “Xóa tài khoản TappyAI” bên dưới hướng dẫn cách xóa và những dữ liệu sẽ bị xóa.',

  'legal.support.s3.heading': '3. Chính sách',
  'legal.support.link.privacy': 'Chính sách bảo mật',
  'legal.support.link.terms': 'Điều khoản dịch vụ',
  'legal.support.link.delete': 'Xóa tài khoản TappyAI',

  // ------------------------------------------------------------ shared bits
  'legal.contact.email': 'Email',
  'legal.contact.website': 'Website',
}

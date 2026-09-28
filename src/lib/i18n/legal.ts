// Legal document copy for /privacy and /terms. Layered over the base dictionary
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

export const en: Record<string, string> = {
  // ---------------------------------------------------------------- privacy
  'legal.privacy.title': 'Privacy Policy',
  'legal.privacy.effective': 'Effective Date: August 2026',

  'legal.privacy.s1.heading': '1. Information We Collect',
  'legal.privacy.s1.lead': 'TappyAI may collect:',
  'legal.privacy.s1.b1':
    'Google account information (name, email address, profile photo) when you sign in with Google. TappyAI also supports signing in with Zalo.',
  'legal.privacy.s1.b2': 'Conversation history with the AI assistant.',
  'legal.privacy.s1.b3': 'Basic account information required to provide our services.',
  'legal.privacy.s1.b4':
    'Personalization details the assistant remembers from your conversations — such as the area you are usually in, who you go out with, your usual timing, your food, spa, shopping and entertainment preferences, and your budget ranges.',
  'legal.privacy.s1.b5':
    'Feedback you give on an AI reply (like, dislike, or report, with an optional reason).',
  'legal.privacy.s1.b6':
    'Booking details — your name and phone number — when you book a service through TappyAI.',
  'legal.privacy.s1.b7':
    'Approximate location. With your permission, your device coordinates are used to show results near you.',
  'legal.privacy.s1.b8':
    'Usage and device information — pages viewed, searches, the categories, places, deals and reviews you interact with, the features you use, plus device type, operating system, app version, language, a session identifier, and the country derived from your IP address.',
  'legal.privacy.s1.note':
    'If you browse without signing in, usage events are recorded against a random anonymous identifier instead of an account.',

  'legal.privacy.s2.heading': '2. How We Use Your Information',
  'legal.privacy.s2.lead': 'We use your information to:',
  'legal.privacy.s2.b1': 'Provide AI-powered conversations.',
  'legal.privacy.s2.b2': 'Save and restore your conversation history.',
  'legal.privacy.s2.b3': 'Display your account profile.',
  'legal.privacy.s2.b4':
    'Personalize recommendations, based on what the assistant has remembered and on how you use the app.',
  'legal.privacy.s2.b5': 'Confirm and manage bookings you make.',
  'legal.privacy.s2.b6': 'Improve the quality and reliability of the service.',
  'legal.privacy.s2.b7': 'Protect platform security.',
  'legal.privacy.s2.note': 'We do not sell your personal information.',

  'legal.privacy.s3.heading': '3. Third-Party Services',
  'legal.privacy.s3.lead':
    'To provide AI responses, search and other core features, TappyAI may send relevant user requests to trusted providers, including:',
  'legal.privacy.s3.b1': 'Anthropic Claude — generates the assistant’s responses.',
  'legal.privacy.s3.b2': 'Google search services and Serper — retrieve search and place results.',
  'legal.privacy.s3.b3': 'Supabase — hosts our database, authentication and file storage.',
  'legal.privacy.s3.b4': 'Vercel — hosts the website.',
  'legal.privacy.s3.b8':
    'Google Cloud Storage — stores the photos, video and audio you upload.',
  'legal.privacy.s3.b5':
    'OpenStreetMap Nominatim — turns coordinates into a place name when you share your location.',
  'legal.privacy.s3.b6': 'Stripe — processes payment if you subscribe to a paid plan.',
  'legal.privacy.s3.b7': 'Google and Zalo — handle sign-in when you choose those options.',
  'legal.privacy.s3.p1': 'These providers process data according to their own privacy policies.',
  'legal.privacy.s3.p2':
    'If you turn on notifications, your browser or device also creates a push subscription, which we store in order to deliver those notifications.',
  'legal.privacy.s3.p3':
    'If you use voice input, your speech is transcribed by your browser or device’s own speech service, which may process the audio on its provider’s servers. TappyAI receives only the resulting text and never records, stores or uploads the audio itself.',

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
    'Request deletion of your account and associated data by contacting our support team.',

  'legal.privacy.s6.heading': '6. Changes to This Policy',
  'legal.privacy.s6.p1': 'We may update this Privacy Policy from time to time.',
  'legal.privacy.s6.p2': 'The latest version will always be available on this page.',

  'legal.privacy.s7.heading': '7. Contact',

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
  // 2026-09-28 release: the in-app button deletes at once (ACCOUNT_SELF_DELETE_ENABLED) — this copy
  // must keep matching that flow, because Play checks the published description against the app.
  // Request-by-email flow (0af672c), shown while ACCOUNT_SELF_DELETE_ENABLED is off - the app then offers
  // 'Request account deletion', and Play compares this page with the app (owner decision pending, 2026-09-29).
  'legal.deleteReq.title': 'Delete Your TappyAI Account',
  'legal.deleteReq.effective': 'Last updated: August 2026',

  'legal.deleteReq.s1.heading': '1. How to Request Account Deletion',
  'legal.deleteReq.s1.lead':
    'You can request deletion of your TappyAI account from inside the app. The request is sent to our support team by email — your account is not deleted automatically when you tap the button.',
  'legal.deleteReq.s1.step1': 'Open TappyAI.',
  'legal.deleteReq.s1.step2': 'Go to Settings.',
  'legal.deleteReq.s1.step3': 'Choose Request account deletion.',
  'legal.deleteReq.s1.step4':
    'Confirm. The app opens your email app with the request already prepared — send the email to submit it.',

  'legal.deleteReq.s2.heading': '2. What Happens Next',
  'legal.deleteReq.s2.p1':
    'Our support team receives your request and verifies that it came from the owner of the account. Once verified, we permanently delete your account and its associated data.',
  'legal.deleteReq.s2.p2':
    'If you do not have an email app set up on your device, you can send the request yourself to the support address at the bottom of this page.',

  'legal.deleteReq.s3.heading': '3. What Deletion Removes',
  'legal.deleteReq.s3.lead': 'Once your request has been processed, deletion permanently removes:',
  'legal.deleteReq.s3.b1': 'Your profile.',
  'legal.deleteReq.s3.b2': 'Chat history.',
  'legal.deleteReq.s3.b3': 'AI memory.',
  'legal.deleteReq.s3.b4': 'Saved items.',
  'legal.deleteReq.s3.b5': 'Preferences.',
  'legal.deleteReq.s3.b6': 'Other user-generated content associated with your account.',

  'legal.deleteReq.s4.heading': '4. Data We May Retain',
  'legal.deleteReq.s4.p1':
    'Some information may be retained only where required by applicable laws or legitimate business obligations (for example payment or legal compliance records).',

  'legal.deleteReq.s5.heading': '5. Need Help?',
  'legal.deleteReq.s5.p1':
    'If you need assistance, or want to check the status of a request you have already sent, contact us:',


  'legal.delete.title': 'Delete Your TappyAI Account',
  'legal.delete.effective': 'Last updated: 28 September 2026',
  'legal.delete.s1.heading': '1. How to Delete Your Account',
  'legal.delete.s1.lead': 'You can delete your TappyAI account yourself, from inside the app (Android or web). Deletion happens immediately and cannot be undone.',
  'legal.delete.s1.step1': 'Open TappyAI and sign in.',
  'legal.delete.s1.step2': 'Go to Me → Settings.',
  'legal.delete.s1.step3': 'Choose Delete account.',
  'legal.delete.s1.step4': 'Type DELETE (XÓA in Vietnamese) to confirm. Your account is deleted at once and you are signed out.',
  'legal.delete.s1.p2': 'If you can no longer sign in, email the support address at the bottom of this page from the email address of your account. We verify that the request comes from the owner of the account and delete it within 30 days.',
  'legal.delete.s2.heading': '2. What Happens Next',
  'legal.delete.s2.p1': 'Deleting the account removes your data from our database at once. The photos, videos and audio you uploaded are removed from our file storage within 48 hours after that.',
  'legal.delete.s2.p2': 'If you sign in again later with the same Google account or email address, you start with a new, empty account.',
  'legal.delete.s3.heading': '3. What Deletion Removes',
  'legal.delete.s3.lead': 'Deletion permanently removes:',
  'legal.delete.s3.b1': 'Your account and profile, including your name, profile photo, cover photo and bio.',
  'legal.delete.s3.b2': 'Your chats with TappyAI and your AI memory.',
  'legal.delete.s3.b3': 'Your saved places, favourites, preferences, price watches and plans.',
  'legal.delete.s3.b4': 'The reviews, comments and likes you posted, including their photos and videos.',
  'legal.delete.s3.b5': 'The result pages you shared publicly — their links stop working.',
  'legal.delete.s3.b6': 'The photos, videos and audio you uploaded, removed from our file storage.',
  'legal.delete.s3.b7': 'Groups you created, and your place in groups created by others.',
  'legal.delete.s3.b8': 'Notifications you caused in other people\'s inboxes (for example "… commented on your review").',
  'legal.delete.s3.b9': 'Your Google Calendar connection — we also revoke TappyAI\'s access at Google.',
  'legal.delete.s3b.heading': '4. Kept, but No Longer Linked to You',
  'legal.delete.s3b.lead': 'Some things you shared with other people belong to their record as well, so they stay without your name or account attached:',
  'legal.delete.s3b.b1': 'Messages you sent to other people stay in their conversation and are shown as coming from a deleted account.',
  'legal.delete.s3b.b2': 'Reports and moderation decisions about content or accounts are kept for safety and legal compliance, without a link to your account.',
  'legal.delete.s4.heading': '5. Data We May Retain',
  'legal.delete.s4.p1': 'We keep a limited amount of information after deletion, only where the law or a legitimate obligation requires it:',
  'legal.delete.s4.b1': 'Payment records held by our payment provider, for as long as tax and accounting law requires.',
  'legal.delete.s4.b2': 'Security logs of administrative actions, kept for up to 12 months. The IP address and browser information in them are deleted after 90 days, and these logs do not store email addresses.',
  'legal.delete.s4.b3': 'Server logs used to keep the service running, kept for up to 30 days and then deleted.',
  'legal.delete.s4.p2': 'Some copies are outside our control and may remain for a while:',
  'legal.delete.s4.c1': 'A photo or video that someone already viewed can stay on their own device — in their browser or app — for up to one day after we remove it from our storage.',
  'legal.delete.s4.c2': 'Videos uploaded before 28 September 2026 may remain reachable through their old link for up to one year, because copies of them were stored in Google\'s network before we changed how videos are stored, and we cannot recall those copies.',
  'legal.delete.s4.c3': 'A link preview that a social network or messaging app saved when someone shared your page can remain until that service refreshes it.',
  'legal.delete.s5.heading': '6. Need Help?',

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

  // ------------------------------------------------------------ shared bits
  'legal.contact.email': 'Email',
  'legal.contact.website': 'Website',
}

export const vi: Record<string, string> = {
  // ---------------------------------------------------------------- privacy
  'legal.privacy.title': 'Chính sách bảo mật',
  'legal.privacy.effective': 'Ngày hiệu lực: Tháng 8 năm 2026',

  'legal.privacy.s1.heading': '1. Thông tin chúng tôi thu thập',
  'legal.privacy.s1.lead': 'TappyAI có thể thu thập:',
  'legal.privacy.s1.b1':
    'Thông tin tài khoản Google (tên, địa chỉ email, ảnh đại diện) khi bạn đăng nhập bằng Google. TappyAI cũng hỗ trợ đăng nhập bằng Zalo.',
  'legal.privacy.s1.b2': 'Lịch sử trò chuyện với trợ lý AI.',
  'legal.privacy.s1.b3': 'Thông tin tài khoản cơ bản cần thiết để cung cấp dịch vụ.',
  'legal.privacy.s1.b4':
    'Thông tin cá nhân hóa mà trợ lý ghi nhớ từ cuộc trò chuyện của bạn — ví dụ khu vực bạn thường ở, người bạn thường đi cùng, thời điểm bạn thường đi, sở thích về ăn uống, spa, mua sắm, giải trí và khoảng ngân sách của bạn.',
  'legal.privacy.s1.b5':
    'Phản hồi của bạn về một câu trả lời của AI (thích, không thích hoặc báo cáo, kèm lý do tùy chọn).',
  'legal.privacy.s1.b6':
    'Thông tin đặt chỗ — tên và số điện thoại của bạn — khi bạn đặt dịch vụ qua TappyAI.',
  'legal.privacy.s1.b7':
    'Vị trí tương đối. Khi bạn cho phép, tọa độ thiết bị của bạn được dùng để hiển thị kết quả ở gần bạn.',
  'legal.privacy.s1.b8':
    'Thông tin sử dụng và thiết bị — các trang bạn xem, nội dung bạn tìm kiếm, các danh mục, địa điểm, ưu đãi và bài đánh giá bạn tương tác, các tính năng bạn dùng, cùng với loại thiết bị, hệ điều hành, phiên bản ứng dụng, ngôn ngữ, mã phiên và quốc gia được xác định từ địa chỉ IP của bạn.',
  'legal.privacy.s1.note':
    'Nếu bạn sử dụng mà không đăng nhập, các sự kiện sử dụng được ghi nhận theo một mã ẩn danh ngẫu nhiên thay vì theo tài khoản.',

  'legal.privacy.s2.heading': '2. Cách chúng tôi sử dụng thông tin',
  'legal.privacy.s2.lead': 'Chúng tôi sử dụng thông tin của bạn để:',
  'legal.privacy.s2.b1': 'Cung cấp các cuộc trò chuyện được hỗ trợ bởi AI.',
  'legal.privacy.s2.b2': 'Lưu và khôi phục lịch sử trò chuyện của bạn.',
  'legal.privacy.s2.b3': 'Hiển thị hồ sơ tài khoản của bạn.',
  'legal.privacy.s2.b4':
    'Cá nhân hóa gợi ý, dựa trên những gì trợ lý đã ghi nhớ và cách bạn sử dụng ứng dụng.',
  'legal.privacy.s2.b5': 'Xác nhận và quản lý các đặt chỗ bạn thực hiện.',
  'legal.privacy.s2.b6': 'Cải thiện chất lượng và độ tin cậy của dịch vụ.',
  'legal.privacy.s2.b7': 'Bảo vệ an toàn của nền tảng.',
  'legal.privacy.s2.note': 'Chúng tôi không bán thông tin cá nhân của bạn.',

  'legal.privacy.s3.heading': '3. Dịch vụ bên thứ ba',
  'legal.privacy.s3.lead':
    'Để cung cấp câu trả lời AI, tìm kiếm và các tính năng cốt lõi khác, TappyAI có thể gửi các yêu cầu liên quan của người dùng tới những nhà cung cấp đáng tin cậy, bao gồm:',
  'legal.privacy.s3.b1': 'Anthropic Claude — tạo ra câu trả lời của trợ lý.',
  'legal.privacy.s3.b2': 'Dịch vụ tìm kiếm của Google và Serper — lấy kết quả tìm kiếm và địa điểm.',
  'legal.privacy.s3.b3': 'Supabase — lưu trữ cơ sở dữ liệu, xác thực và tệp của chúng tôi.',
  'legal.privacy.s3.b4': 'Vercel — vận hành trang web.',
  'legal.privacy.s3.b8':
    'Google Cloud Storage — lưu trữ ảnh, video và âm thanh bạn tải lên.',
  'legal.privacy.s3.b5':
    'OpenStreetMap Nominatim — chuyển tọa độ thành tên địa điểm khi bạn chia sẻ vị trí.',
  'legal.privacy.s3.b6': 'Stripe — xử lý thanh toán nếu bạn đăng ký gói trả phí.',
  'legal.privacy.s3.b7': 'Google và Zalo — xử lý đăng nhập khi bạn chọn các phương thức đó.',
  'legal.privacy.s3.p1': 'Các nhà cung cấp này xử lý dữ liệu theo chính sách bảo mật riêng của họ.',
  'legal.privacy.s3.p2':
    'Nếu bạn bật thông báo, trình duyệt hoặc thiết bị của bạn cũng tạo một đăng ký nhận thông báo đẩy, và chúng tôi lưu đăng ký đó để có thể gửi các thông báo này.',
  'legal.privacy.s3.p3':
    'Nếu bạn dùng nhập liệu bằng giọng nói, lời nói của bạn được chuyển thành văn bản bởi dịch vụ nhận dạng giọng nói của chính trình duyệt hoặc thiết bị, và dịch vụ đó có thể xử lý âm thanh trên máy chủ của họ. TappyAI chỉ nhận phần văn bản thu được, không ghi âm, không lưu và không tải lên âm thanh.',

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
    'Yêu cầu xóa tài khoản và dữ liệu liên quan bằng cách liên hệ đội ngũ hỗ trợ của chúng tôi.',

  'legal.privacy.s6.heading': '6. Thay đổi chính sách',
  'legal.privacy.s6.p1': 'Chúng tôi có thể cập nhật Chính sách bảo mật này theo thời gian.',
  'legal.privacy.s6.p2': 'Phiên bản mới nhất sẽ luôn có trên trang này.',

  'legal.privacy.s7.heading': '7. Liên hệ',

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
  // Request-by-email flow (0af672c), shown while ACCOUNT_SELF_DELETE_ENABLED is off - the app then offers
  // 'Request account deletion', and Play compares this page with the app (owner decision pending, 2026-09-29).
  'legal.deleteReq.title': 'Xóa tài khoản TappyAI',
  'legal.deleteReq.effective': 'Cập nhật lần cuối: Tháng 8 năm 2026',

  'legal.deleteReq.s1.heading': '1. Cách gửi yêu cầu xóa tài khoản',
  'legal.deleteReq.s1.lead':
    'Bạn có thể gửi yêu cầu xóa tài khoản TappyAI ngay trong ứng dụng. Yêu cầu sẽ được gửi tới bộ phận hỗ trợ của chúng tôi qua email — tài khoản không bị xóa tự động ngay khi bạn nhấn nút.',
  'legal.deleteReq.s1.step1': 'Mở TappyAI.',
  'legal.deleteReq.s1.step2': 'Vào Cài đặt.',
  'legal.deleteReq.s1.step3': 'Chọn Yêu cầu xóa tài khoản.',
  'legal.deleteReq.s1.step4':
    'Xác nhận. Ứng dụng sẽ mở ứng dụng email với nội dung yêu cầu đã soạn sẵn — hãy gửi email đó để hoàn tất.',

  'legal.deleteReq.s2.heading': '2. Điều gì diễn ra sau đó',
  'legal.deleteReq.s2.p1':
    'Bộ phận hỗ trợ tiếp nhận yêu cầu và xác minh rằng yêu cầu đến từ chủ tài khoản. Sau khi xác minh, chúng tôi sẽ xóa vĩnh viễn tài khoản của bạn cùng các dữ liệu liên quan.',
  'legal.deleteReq.s2.p2':
    'Nếu thiết bị của bạn chưa cài ứng dụng email, bạn có thể tự gửi yêu cầu tới địa chỉ hỗ trợ ở cuối trang này.',

  'legal.deleteReq.s3.heading': '3. Những dữ liệu sẽ bị xóa',
  'legal.deleteReq.s3.lead': 'Sau khi yêu cầu được xử lý, việc xóa sẽ loại bỏ vĩnh viễn:',
  'legal.deleteReq.s3.b1': 'Hồ sơ.',
  'legal.deleteReq.s3.b2': 'Lịch sử trò chuyện.',
  'legal.deleteReq.s3.b3': 'Bộ nhớ AI.',
  'legal.deleteReq.s3.b4': 'Nội dung đã lưu.',
  'legal.deleteReq.s3.b5': 'Tùy chọn cá nhân.',
  'legal.deleteReq.s3.b6': 'Các dữ liệu khác do bạn tạo và gắn với tài khoản.',

  'legal.deleteReq.s4.heading': '4. Dữ liệu có thể được lưu lại',
  'legal.deleteReq.s4.p1':
    'Một số dữ liệu có thể được lưu lại nếu pháp luật yêu cầu hoặc để thực hiện các nghĩa vụ hợp pháp (ví dụ thông tin thanh toán hoặc lưu trữ theo quy định).',

  'legal.deleteReq.s5.heading': '5. Cần hỗ trợ?',
  'legal.deleteReq.s5.p1':
    'Nếu cần hỗ trợ, hoặc muốn kiểm tra tình trạng yêu cầu đã gửi, vui lòng liên hệ:',


  'legal.delete.title': 'Xóa tài khoản TappyAI',
  'legal.delete.effective': 'Cập nhật lần cuối: 28 tháng 9 năm 2026',
  'legal.delete.s1.heading': '1. Cách xóa tài khoản',
  'legal.delete.s1.lead': 'Bạn có thể tự xóa tài khoản TappyAI ngay trong ứng dụng (Android hoặc web). Tài khoản bị xóa ngay lập tức và không thể khôi phục.',
  'legal.delete.s1.step1': 'Mở TappyAI và đăng nhập.',
  'legal.delete.s1.step2': 'Vào Tôi → Cài đặt.',
  'legal.delete.s1.step3': 'Chọn Xóa tài khoản.',
  'legal.delete.s1.step4': 'Gõ XÓA (hoặc DELETE nếu dùng tiếng Anh) để xác nhận. Tài khoản bị xóa ngay và bạn được đăng xuất.',
  'legal.delete.s1.p2': 'Nếu bạn không còn đăng nhập được, hãy gửi email tới địa chỉ hỗ trợ ở cuối trang này từ địa chỉ email của tài khoản. Chúng tôi xác minh yêu cầu đến từ chủ tài khoản và xóa tài khoản trong vòng 30 ngày.',
  'legal.delete.s2.heading': '2. Điều gì diễn ra sau đó',
  'legal.delete.s2.p1': 'Khi tài khoản bị xóa, dữ liệu của bạn được xóa khỏi cơ sở dữ liệu ngay; ảnh, video và âm thanh bạn đã tải lên được xóa khỏi kho lưu trữ tệp trong vòng 48 giờ sau đó.',
  'legal.delete.s2.p2': 'Nếu sau này bạn đăng nhập lại bằng cùng tài khoản Google hoặc địa chỉ email, bạn sẽ bắt đầu với một tài khoản mới, trống.',
  'legal.delete.s3.heading': '3. Những dữ liệu sẽ bị xóa',
  'legal.delete.s3.lead': 'Việc xóa sẽ loại bỏ vĩnh viễn:',
  'legal.delete.s3.b1': 'Tài khoản và hồ sơ của bạn, gồm tên, ảnh đại diện, ảnh bìa và phần giới thiệu.',
  'legal.delete.s3.b2': 'Các cuộc trò chuyện với TappyAI và bộ nhớ AI.',
  'legal.delete.s3.b3': 'Địa điểm đã lưu, mục yêu thích, tùy chọn cá nhân, theo dõi giá và kế hoạch.',
  'legal.delete.s3.b4': 'Các đánh giá, bình luận và lượt thích bạn đã đăng, kèm ảnh và video.',
  'legal.delete.s3.b5': 'Các trang kết quả bạn đã chia sẻ công khai — đường link sẽ không còn mở được.',
  'legal.delete.s3.b6': 'Ảnh, video và âm thanh bạn đã tải lên, được xóa khỏi kho lưu trữ tệp của chúng tôi.',
  'legal.delete.s3.b7': 'Các nhóm bạn đã tạo, và tư cách thành viên của bạn trong nhóm do người khác tạo.',
  'legal.delete.s3.b8': 'Các thông báo bạn tạo ra trong hộp thư của người khác (ví dụ "… đã bình luận đánh giá của bạn").',
  'legal.delete.s3.b9': 'Kết nối Google Lịch — chúng tôi đồng thời thu hồi quyền truy cập của TappyAI tại Google.',
  'legal.delete.s3b.heading': '4. Được giữ lại nhưng không còn gắn với bạn',
  'legal.delete.s3b.lead': 'Một số nội dung bạn đã gửi cho người khác cũng thuộc về lịch sử của họ, nên được giữ lại nhưng không còn tên hay tài khoản của bạn:',
  'legal.delete.s3b.b1': 'Tin nhắn bạn đã gửi cho người khác vẫn nằm trong cuộc trò chuyện của họ và hiển thị là từ một tài khoản đã xóa.',
  'legal.delete.s3b.b2': 'Báo cáo vi phạm và quyết định kiểm duyệt liên quan đến nội dung hoặc tài khoản được giữ để bảo đảm an toàn và tuân thủ pháp luật, không còn liên kết với tài khoản của bạn.',
  'legal.delete.s4.heading': '5. Dữ liệu có thể được lưu lại',
  'legal.delete.s4.p1': 'Chúng tôi chỉ giữ lại một lượng thông tin hạn chế sau khi xóa, khi pháp luật hoặc nghĩa vụ hợp pháp yêu cầu:',
  'legal.delete.s4.b1': 'Hồ sơ thanh toán do đơn vị xử lý thanh toán lưu giữ, trong thời hạn luật thuế và kế toán yêu cầu.',
  'legal.delete.s4.b2': 'Nhật ký bảo mật về các thao tác quản trị, lưu tối đa 12 tháng. Địa chỉ IP và thông tin trình duyệt trong nhật ký được xóa sau 90 ngày, và nhật ký không lưu địa chỉ email.',
  'legal.delete.s4.b3': 'Nhật ký máy chủ dùng để vận hành dịch vụ, lưu tối đa 30 ngày rồi xóa.',
  'legal.delete.s4.p2': 'Một số bản sao nằm ngoài tầm kiểm soát của chúng tôi và có thể còn trong một thời gian:',
  'legal.delete.s4.c1': 'Ảnh hoặc video mà người khác đã xem có thể còn trên chính thiết bị của họ — trong trình duyệt hoặc ứng dụng — tối đa một ngày sau khi chúng tôi xóa tệp khỏi kho lưu trữ.',
  'legal.delete.s4.c2': 'Video tải lên trước ngày 28/09/2026 có thể vẫn mở được qua đường link cũ tối đa một năm, vì bản sao của chúng đã được lưu trong mạng của Google trước khi chúng tôi thay đổi cách lưu video, và chúng tôi không thể thu hồi các bản sao đó.',
  'legal.delete.s4.c3': 'Bản xem trước đường link mà mạng xã hội hoặc ứng dụng nhắn tin đã lưu khi ai đó chia sẻ trang của bạn có thể còn cho tới khi dịch vụ đó làm mới.',
  'legal.delete.s5.heading': '6. Cần hỗ trợ?',

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

  // ------------------------------------------------------------ shared bits
  'legal.contact.email': 'Email',
  'legal.contact.website': 'Website',
}

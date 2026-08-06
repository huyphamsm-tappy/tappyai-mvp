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
  'legal.privacy.s3.b4': 'Vercel — hosts the website and stores the photos, video and audio you upload.',
  'legal.privacy.s3.b5':
    'OpenStreetMap Nominatim — turns coordinates into a place name when you share your location.',
  'legal.privacy.s3.b6': 'Stripe — processes payment if you subscribe to a paid plan.',
  'legal.privacy.s3.b7': 'Google and Zalo — handle sign-in when you choose those options.',
  'legal.privacy.s3.p1': 'These providers process data according to their own privacy policies.',
  'legal.privacy.s3.p2':
    'If you turn on notifications, your browser or device also creates a push subscription, which we store in order to deliver those notifications.',

  'legal.privacy.s4.heading': '4. Data Storage and Security',
  'legal.privacy.s4.p1':
    'User data is securely stored using Supabase infrastructure with authentication and access controls. Photos, video and audio you upload are stored in Vercel Blob storage.',
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
  'legal.privacy.s3.b4': 'Vercel — vận hành trang web và lưu trữ ảnh, video, âm thanh bạn tải lên.',
  'legal.privacy.s3.b5':
    'OpenStreetMap Nominatim — chuyển tọa độ thành tên địa điểm khi bạn chia sẻ vị trí.',
  'legal.privacy.s3.b6': 'Stripe — xử lý thanh toán nếu bạn đăng ký gói trả phí.',
  'legal.privacy.s3.b7': 'Google và Zalo — xử lý đăng nhập khi bạn chọn các phương thức đó.',
  'legal.privacy.s3.p1': 'Các nhà cung cấp này xử lý dữ liệu theo chính sách bảo mật riêng của họ.',
  'legal.privacy.s3.p2':
    'Nếu bạn bật thông báo, trình duyệt hoặc thiết bị của bạn cũng tạo một đăng ký nhận thông báo đẩy, và chúng tôi lưu đăng ký đó để có thể gửi các thông báo này.',

  'legal.privacy.s4.heading': '4. Lưu trữ và bảo mật dữ liệu',
  'legal.privacy.s4.p1':
    'Dữ liệu người dùng được lưu trữ an toàn trên hạ tầng Supabase với cơ chế xác thực và kiểm soát truy cập. Ảnh, video và âm thanh bạn tải lên được lưu trên Vercel Blob.',
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

  // ------------------------------------------------------------ shared bits
  'legal.contact.email': 'Email',
  'legal.contact.website': 'Website',
}

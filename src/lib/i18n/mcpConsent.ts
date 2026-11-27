// Text of the connector (MCP) OAuth consent screen, /oauth/consent. Kept here, not in the component, so the hardcoded-UI-text guard stays at its baseline.
export type ConsentLocale = 'vi' | 'en'

export const CONSENT_COPY = {
  vi: {
    title: 'Cho phép kết nối với Tappy?', wantSuffix: 'muốn dùng Tappy thay mặt bạn với tài khoản', may: 'Ứng dụng này sẽ được phép:',
    safe: 'Chỉ đọc và soạn kế hoạch. Không đặt chỗ, không thanh toán, không đổi thông tin tài khoản. Bạn có thể thu hồi quyền bất cứ lúc nào.',
    allow: 'Cho phép', deny: 'Từ chối', invalid: 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy quay lại ứng dụng AI và thử kết nối lại.',
    unapproved: 'Ứng dụng này chưa được Tappy xác nhận nên yêu cầu đã bị từ chối. Bạn không cần làm gì thêm.',
    error: 'Không thể tải yêu cầu kết nối. Hãy thử lại sau.', loading: 'Đang tải…', sending: 'Đang chuyển bạn về ứng dụng…', unknownApp: 'Một ứng dụng AI',
  },
  en: {
    title: 'Allow this app to connect to Tappy?', wantSuffix: 'wants to use Tappy on your behalf, signed in as', may: 'It will be allowed to:',
    safe: 'Read-only and trip planning. No booking, no payment, no account changes. You can revoke access at any time.',
    allow: 'Allow', deny: 'Deny', invalid: 'This link is invalid or has expired. Go back to the AI app and try connecting again.',
    unapproved: 'This app is not recognised by Tappy, so the request was declined. You do not need to do anything.',
    error: 'Could not load the connection request. Please try again later.', loading: 'Loading…', sending: 'Sending you back to the app…', unknownApp: 'An AI app',
  },
} as const

/** The only scopes a connector can hold (src/lib/mcp/identity.ts MCP_SCOPES), in plain words. */
export const SCOPE_TEXT: Readonly<Record<string, Record<ConsentLocale, string>>> = {
  'places:read': { vi: 'Tìm quán ăn, địa điểm và điểm tham quan', en: 'Search restaurants, places and attractions' },
  'hotels:read': { vi: 'Tìm khách sạn và giá phòng', en: 'Search hotels and prices' },
  'shopping:read': { vi: 'Tìm sản phẩm và giá', en: 'Search products and prices' },
  'scam:check': { vi: 'Kiểm tra đường link có dấu hiệu lừa đảo (chỉ đọc, không mở link thay bạn)', en: 'Check a link for signs of a scam (read-only; it does not open the link for you)' },
  'deals:read': { vi: 'Xem ưu đãi của các đối tác trên trang Deal', en: 'See partner offers from the Deal page' },
  'clips:read': { vi: 'Tìm clip công khai của người dùng Tappy (không hiện tác giả)', en: 'Find public clips by Tappy users (the author is not shown)' },
  'transport:read': { vi: 'Tìm trang đặt vé xe khách trên Vexere (không đặt vé thay bạn)', en: 'Find a coach booking page on Vexere (it does not book for you)' },
  'itinerary:create': { vi: 'Lập lịch trình du lịch (chỉ soạn kế hoạch: không đặt chỗ, không thanh toán)', en: 'Plan a trip itinerary (a plan only: no booking, no payment)' },
}
export const UNKNOWN_SCOPE: Record<ConsentLocale, string> = { vi: 'Quyền không xác định:', en: 'Unknown permission:' }

/** Supabase's OAuth server can only carry OpenID scopes (seen on a real token 22/11/2026). They mean "know who I am"; the connector's capabilities are then listed in full (SCOPE_TEXT), because that is what the connection can do. */
export const IDENTITY_SCOPES = ['openid', 'profile', 'email', 'phone', 'offline_access'] as const
export const IDENTITY_TEXT: Record<ConsentLocale, string> = { vi: 'Biết tài khoản Tappy của bạn là ai (để xử lý yêu cầu của bạn)', en: 'Know which Tappy account is yours (to handle your requests)' }

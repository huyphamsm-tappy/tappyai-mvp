import type { RequestLocale } from './requestLocale'

/**
 * User-facing text that the SERVER produces, in both languages.
 *
 * ============================================================================
 * WHY A CATALOGUE AND NOT A TERNARY AT EACH CALL SITE — B04
 * ============================================================================
 * The strings here are the ones a user reads at their least patient moment: they hit a limit, an
 * upload failed, a provider was down. Written inline as `locale === 'en' ? … : …` they drift, and
 * three of the four routes that needed them simply never got the ternary at all — which is how an
 * English user came to read a Vietnamese sentence about their daily message limit.
 *
 * 🚨 Everything here is deliberately GENERIC. Server error text is the easiest place in a codebase
 * to leak an implementation detail to an attacker, so nothing in this file names a provider, a
 * model, a policy id, an internal state or a stack. The machine-readable `error` code in the JSON
 * body is what a client branches on; this is only what a human reads.
 */
type Message = { vi: string; en: string }

/** `{n}` is substituted by `serverMessage`; nothing else is interpolated. */
const MESSAGES = {
  // Rate limiting / quotas
  'rate.retryShortly': {
    vi: 'Vui lòng thử lại sau giây lát.',
    en: 'Please try again in a moment.',
  },
  'rate.retryTomorrow': {
    vi: 'Vui lòng thử lại vào ngày mai.',
    en: 'Please try again tomorrow.',
  },
  'chat.anonLimit': {
    vi: 'Bạn đã dùng hết {n} câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!',
    en: "You've used all {n} free questions for today. Sign in to keep chatting with Tappy!",
  },
  'chat.freeLimit': {
    vi: 'Bạn đã dùng hết {n} tin nhắn miễn phí hôm nay. Hẹn gặp lại bạn vào ngày mai nhé!',
    en: "You've used all {n} free messages for today. See you again tomorrow!",
  },
  'chat.tooLong': {
    vi: 'Tin nhắn quá dài. Vui lòng rút gọn.',
    en: 'That message is too long. Please shorten it.',
  },
  'translate.dailyLimit': {
    vi: 'Bạn đã dịch quá {n} lần hôm nay. Vui lòng quay lại vào ngày mai.',
    en: "You've used all {n} translations for today. Please come back tomorrow.",
  },
  'translate.tooLong': {
    vi: 'Văn bản quá dài (tối đa 2000 ký tự).',
    en: 'That text is too long (2000 characters maximum).',
  },
  'translate.failed': {
    vi: 'Lỗi dịch thuật. Vui lòng thử lại.',
    en: "Translation didn't work. Please try again.",
  },

  // ── B08 ────────────────────────────────────────────────────────────────────
  //
  // B04 localized the `message:` field on three routes. The UAT then found 96 user-facing
  // Vietnamese SENTENCES sitting in the `error:` field across 29 more — and `error` is also where
  // machine codes like `rate_limit` live, so one field was carrying two contracts at once. Web
  // clients read it straight into `setError(data.error)`, so those sentences were the UI.
  //
  // These keys are the human half. The machine half becomes a stable code in `error`, and the two
  // stop competing for the same field. Everything here stays generic — no provider, model, table
  // or policy name — for the same reason as the block above.

  // Auth / permission
  'auth.required': { vi: 'Cần đăng nhập', en: 'Please sign in' },
  'auth.forbidden': { vi: 'Bạn không có quyền thực hiện thao tác này', en: "You don't have permission to do that" },
  // B17. Says what to DO, not what the caller is — "you are anonymous" is a fact about them, not
  // an action they can take. The visitor is one tap from being allowed.
  'auth.accountRequired': {
    vi: 'Hãy đăng nhập để đăng bài, bình luận và theo dõi.',
    en: 'Sign in to post, comment and follow.',
  },

  // Validation
  'validation.invalid': { vi: 'Dữ liệu không hợp lệ', en: 'That data is not valid' },
  'validation.missingFields': { vi: 'Thiếu thông tin bắt buộc', en: 'Some required information is missing' },
  'validation.badBody': { vi: 'Request body không hợp lệ.', en: 'The request body is not valid.' },
  'validation.invalidReason': { vi: 'Lý do không hợp lệ', en: 'That reason is not valid' },

  // Generic server / load failures
  'server.error': { vi: 'Lỗi server', en: 'Something went wrong on our side' },
  'server.loadFailed': { vi: 'Lỗi tải danh sách', en: "Couldn't load the list" },
  'server.saveFailed': { vi: 'Không thể lưu', en: "Couldn't save" },
  'server.deleteFailed': { vi: 'Không thể xóa', en: "Couldn't delete" },
  'server.notFound': { vi: 'Không tìm thấy', en: 'Not found' },
  'server.providerConfig': { vi: 'Thiếu cấu hình provider', en: 'This feature is not configured' },

  // Reviews
  'review.loadFailed': { vi: 'Lỗi tải đánh giá', en: "Couldn't load reviews" },
  'review.loadMineFailed': { vi: 'Lỗi tải review của bạn', en: "Couldn't load your reviews" },
  'review.saveFailed': { vi: 'Không thể lưu bài viết, vui lòng thử lại', en: "Couldn't save the post — please try again" },
  'review.likeFailed': { vi: 'Không thể like', en: "Couldn't like this" },
  'review.contentRequired': { vi: 'Cần có nội dung hoặc ảnh để đăng bài.', en: 'A post needs text or a photo.' },

  // Social
  'social.followFailed': { vi: 'Không thể follow', en: "Couldn't follow" },
  'social.followSelf': { vi: 'Không thể tự follow', en: "You can't follow yourself" },
  'social.userNotFound': { vi: 'Không tìm thấy người dùng', en: 'User not found' },

  // Groups
  'group.notFound': { vi: 'Không tìm thấy nhóm', en: 'Group not found' },
  'group.invalidName': { vi: 'Tên nhóm không hợp lệ', en: 'That group name is not valid' },
  'group.createFailed': { vi: 'Không thể tạo nhóm', en: "Couldn't create the group" },
  'group.joinFailed': { vi: 'Không thể tham gia nhóm', en: "Couldn't join the group" },
  'group.full': { vi: 'Nhóm đã đầy (tối đa 10 người)', en: 'This group is full (10 people maximum)' },
  'group.suggestFailed': { vi: 'Lỗi tạo gợi ý, vui lòng thử lại', en: "Couldn't create suggestions — please try again" },

  // Bookings / preferences
  'booking.createFailed': { vi: 'Không thể tạo booking', en: "Couldn't create the booking" },
  'preferences.saveFailed': { vi: 'Không thể lưu sở thích', en: "Couldn't save your preferences" },

  // Media / upload
  'media.imageType': { vi: 'Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF', en: 'Only JPG, PNG, WebP or GIF images are accepted' },
  'media.imageTooLarge3': { vi: 'Ảnh tối đa 3MB', en: 'Images can be at most 3MB' },
  'media.imageTooLarge6': { vi: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 6MB.', en: 'That image is too large. Please choose one under 6MB.' },
  'media.uploadFailed': { vi: 'Không thể tải ảnh lên. Vui lòng thử lại.', en: "Couldn't upload the image. Please try again." },
  'media.fileNotFound': { vi: 'Không tìm thấy file', en: 'File not found' },
  'media.videoTooLong': { vi: 'Video quá dài. Vui lòng chọn video tối đa {n} giây.', en: 'That video is too long. Please choose one up to {n} seconds.' },

  // Music
  'music.trackNotFound': { vi: 'Không tìm thấy bài hát', en: 'Track not found' },
  'music.titleLength': { vi: 'Tên bài hát 1–120 ký tự', en: 'The track title must be 1–120 characters' },
  'music.badDuration': { vi: 'Thời lượng không hợp lệ (tối đa 10 phút)', en: 'That duration is not valid (10 minutes maximum)' },
  'music.publishFailed': { vi: 'Không thể đăng nhạc. Vui lòng thử lại.', en: "Couldn't publish the track. Please try again." },
  'music.reportFailed': { vi: 'Không thể gửi báo cáo', en: "Couldn't send the report" },

  // Scan / content generation
  'scan.readFailed': { vi: 'Lỗi khi đọc tài liệu. Vui lòng thử lại.', en: "Couldn't read the document. Please try again." },
  'content.topicRequired': { vi: 'Vui lòng nhập chủ đề hoặc mô tả.', en: 'Please enter a topic or description.' },
  'content.generateFailed': { vi: 'Không tạo được nội dung, vui lòng thử lại.', en: "Couldn't generate content — please try again." },
  'content.badFormat': { vi: 'Kết quả không đúng định dạng, vui lòng thử lại.', en: 'The result came back malformed — please try again.' },

  // Per-feature rate limits. `{n}` is the daily allowance.
  'rate.tooFast': { vi: 'Bạn thao tác quá nhanh, vui lòng thử lại sau giây lát.', en: "You're going a bit fast — please try again in a moment." },
  'rate.postLimit': { vi: 'Bạn đã đăng quá {n} bài hôm nay. Thử lại vào ngày mai nhé.', en: "You've posted {n} times today. Please try again tomorrow." },
  'rate.uploadLimit': { vi: 'Bạn đã tải lên {n} ảnh hôm nay. Thử lại vào ngày mai nhé.', en: "You've uploaded {n} images today. Please try again tomorrow." },
  'rate.scanLimit': { vi: 'Bạn đã quét quá {n} tài liệu hôm nay. Thử lại vào ngày mai nhé.', en: "You've scanned {n} documents today. Please try again tomorrow." },

  // Reviews / media, remaining cases
  'review.signInToReview': { vi: 'Cần đăng nhập để đánh giá', en: 'Please sign in to write a review' },
  'review.alreadyReviewed': { vi: 'Bạn đã đánh giá địa điểm này rồi.', en: "You've already reviewed this place." },
  'media.signInToUpload': { vi: 'Cần đăng nhập để tải ảnh', en: 'Please sign in to upload images' },
  'media.imageTooLarge5': { vi: 'File ảnh phải nhỏ hơn 5MB', en: 'Images must be smaller than 5MB' },
  'media.videoTooLongSec': { vi: 'Video quá dài. Vui lòng chọn video tối đa {n} giây.', en: 'That video is too long. Please choose one up to {n} seconds.' },
  'media.noFile': { vi: 'Không có file', en: 'No file was provided' },
  'media.uploadProtocol': { vi: 'Giao thức tải lên không còn được hỗ trợ', en: 'That upload method is no longer supported' },

  // Music, remaining cases
  'music.invalidFile': { vi: 'File nhạc không hợp lệ', en: 'That audio file is not valid' },
  'music.rightsRequired': { vi: 'Bạn cần xác nhận quyền sử dụng nhạc trước khi đăng', en: 'Please confirm you hold the rights to this track before publishing' },
  'music.signInToReport': { vi: 'Cần đăng nhập để báo cáo', en: 'Please sign in to report' },
  'music.trackGone': { vi: 'Bài nhạc không còn tồn tại, vui lòng chọn lại.', en: 'That track no longer exists — please pick another.' },
  'music.followFailed': { vi: 'Không theo dõi được', en: "Couldn't follow" },
  'music.saveFailed': { vi: 'Không lưu được', en: "Couldn't save" },

  // Groups, remaining cases
  'group.ownerOnly': { vi: 'Chỉ trưởng nhóm mới có thể gợi ý', en: 'Only the group owner can generate suggestions' },
  'group.noMembers': { vi: 'Chưa có thành viên nào tham gia', en: 'Nobody has joined yet' },

  // Subscription
  'subscription.noneToManage': { vi: 'Chưa có thông tin đăng ký để quản lý.', en: 'There is no subscription to manage yet.' },

  // Content generation, remaining
  'content.topicTooLong': { vi: 'Chủ đề quá dài (tối đa 500 ký tự).', en: 'That topic is too long (500 characters maximum).' },

  /**
   * 🚨 Deliberately GENERIC, replacing two messages that named internals.
   *
   * `viet-content` used to answer "AI provider chưa được cấu hình trên server." and "API key
   * không hợp lệ hoặc chưa được kích hoạt." Both tell an anonymous caller which subsystem is
   * missing and whether a credential is present or merely inactive — free reconnaissance, and of
   * no use whatsoever to the person reading it. The operator still learns the difference from the
   * machine `error` code and the server log; the user is told what they can act on.
   */
  'service.unavailable': { vi: 'Tính năng này tạm thời chưa dùng được. Vui lòng thử lại sau.', en: "This feature isn't available right now. Please try again later." },

  // Comments / reactions. 🚨 These were written WITHOUT diacritics ("Khong the gui binh luan"),
  // which is why the first B08 sweep missed them entirely — the Vietnamese regex keys off
  // diacritics, and ASCII-folded Vietnamese is invisible to it while being just as Vietnamese to
  // the person reading it.
  'comment.loadFailed': { vi: 'Lỗi tải bình luận', en: "Couldn't load comments" },
  'comment.postFailed': { vi: 'Không thể gửi bình luận', en: "Couldn't post your comment" },
  'comment.length': { vi: 'Bình luận phải từ 1–300 ký tự', en: 'A comment must be 1–300 characters' },
  'comment.tooFast': { vi: 'Bạn bình luận quá nhanh, thử lại sau giây lát.', en: "You're commenting too fast — please try again in a moment." },
  'reaction.invalid': { vi: 'Reaction không hợp lệ', en: 'That reaction is not valid' },
  'reaction.failed': { vi: 'Không thể react', en: "Couldn't react" },
  'reaction.removeFailed': { vi: 'Không thể xóa reaction', en: "Couldn't remove the reaction" },

  // Feed / saved
  'feed.loadFailed': { vi: 'Lỗi tải feed', en: "Couldn't load the feed" },
  'saved.removeFailed': { vi: 'Không thể bỏ lưu', en: "Couldn't remove from saved" },
  'server.updateFailed': { vi: 'Không thể cập nhật', en: "Couldn't update" },

  // Conversations
  'conversation.tooMany': { vi: 'Quá nhiều tin nhắn', en: 'Too many messages' },
  'conversation.tooLarge': { vi: 'Nội dung quá lớn', en: 'That content is too large' },

  // Subscription management
  'subscription.portalFailed': { vi: 'Không mở được trang quản lý đăng ký lúc này.', en: "Couldn't open subscription management right now." },

  // Purchases and push registration. These ARE user-facing — a person taps Subscribe or toggles
  // notifications and waits for the answer — even though the route talks to Apple/Stripe behind
  // the scenes. The wording says what the person can do, not which vendor call failed.
  'subscription.checkoutFailed': { vi: 'Không bắt đầu được thanh toán. Vui lòng thử lại.', en: "Couldn't start checkout. Please try again." },
  'subscription.verifyUnavailable': { vi: 'Chưa xác minh được giao dịch. Vui lòng thử lại sau giây lát.', en: "Couldn't verify the purchase yet. Please try again in a moment." },
  'subscription.invalidTransaction': { vi: 'Giao dịch không hợp lệ.', en: 'That purchase is not valid.' },
  'subscription.syncFailed': { vi: 'Không đồng bộ được gói đăng ký. Vui lòng thử lại.', en: "Couldn't sync your subscription. Please try again." },
  'notif.invalidSubscription': { vi: 'Thông tin đăng ký thông báo không hợp lệ.', en: 'That notification registration is not valid.' },
  'notif.saveFailed': { vi: 'Không bật được thông báo. Vui lòng thử lại.', en: "Couldn't turn on notifications. Please try again." },
  'notif.disableFailed': { vi: 'Không tắt được thông báo. Vui lòng thử lại.', en: "Couldn't turn off notifications. Please try again." },
  // V2.2-2 marketing consent. Its own key rather than reusing
  // `notif.invalidSubscription`: that message says a *device registration* is
  // invalid, which would be a confusing thing to read after changing a
  // marketing preference.
  'notif.invalidConsent': { vi: 'Lựa chọn nhận tin không hợp lệ.', en: 'That notification preference is not valid.' },

  // Scam Shield. 🚨 These were hardcoded ENGLISH — the mirror image of B08, and just as wrong:
  // a Vietnamese user asking the safety feature about a suspicious link got an English error.
  'scam.invalidUrl': { vi: 'Đường liên kết không hợp lệ.', en: 'That link is not valid.' },
  'scam.invalidBody': { vi: 'Yêu cầu không hợp lệ.', en: 'That request is not valid.' },
  'scam.privateUrl': { vi: 'Không kiểm tra được địa chỉ nội bộ.', en: "Internal network addresses can't be checked." },
  'scam.checkFailed': { vi: 'Chưa kiểm tra được liên kết này. Vui lòng thử lại.', en: "Couldn't check this link. Please try again." },
  'scam.tooManyChecks': { vi: 'Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau.', en: 'Too many checks. Please try again later.' },
  'scam.dailyLimit': { vi: 'Bạn đã dùng hết lượt kiểm tra hôm nay.', en: "You've used all of today's checks." },


  // ── W2 · voice ──────────────────────────────────────────────────────────────
  'voice.emptyText': { vi: 'Chưa có nội dung để đọc.', en: 'There is nothing to read out.' },
  'voice.tooLong': { vi: 'Nội dung quá dài để đọc.', en: 'That is too long to read out.' },
  'voice.languageUnsupported': { vi: 'Ngôn ngữ này chưa được hỗ trợ.', en: 'That language is not supported yet.' },
  'voice.unavailable': { vi: 'Giọng đọc chưa sẵn sàng. Vui lòng thử lại sau.', en: 'Voice is unavailable right now. Please try again later.' },
  'voice.synthesisFailed': { vi: 'Không tạo được giọng đọc. Vui lòng thử lại.', en: "Couldn't generate the audio. Please try again." },

  // ── W2 · link resolution (the chat composer) ────────────────────────────────
  'links.urlRequired': { vi: 'Vui lòng nhập đường liên kết.', en: 'Please enter a link.' },
  'links.unsupportedSource': { vi: 'Nguồn liên kết này chưa được hỗ trợ.', en: 'That kind of link is not supported yet.' },

  'notif.markReadFailed': { vi: 'Không thể đánh dấu đã đọc.', en: "Couldn't mark these as read." },
} as const satisfies Record<string, Message>

export type ServerMessageKey = keyof typeof MESSAGES

/**
 * The message for a key in the request's language.
 *
 * `vars` fills `{name}` placeholders. Absent keys are left in place rather than blanked, so a
 * typo shows up as a visible `{n}` in testing instead of a sentence with a hole in it.
 */
export function serverMessage(
  key: ServerMessageKey,
  locale: RequestLocale,
  vars?: Record<string, string | number>,
): string {
  let text: string = MESSAGES[key][locale]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v))
  }
  return text
}

/** Exposed for the parity guard, which asserts every key carries both languages and differs. */
export const SERVER_MESSAGES: Record<string, Message> = MESSAGES

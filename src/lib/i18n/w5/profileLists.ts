// The four profile list screens the UAT found Vietnamese-only in an EN session (C15), plus the two
// remaining Music strings (C43) and the Deals date convention (C17).

export const vi: Record<string, string> = {
  // ── /profile/bookings ──────────────────────────────────────────────────────
  'bookings.title': 'Lịch đặt chỗ',
  'bookings.status.confirmed': '✅ Đã xác nhận',
  'bookings.status.cancelled': '❌ Đã hủy',
  'bookings.status.pending': '⏳ Đang xử lý',
  'bookings.pendingNotice': ' — TappyAI đã ghi nhận đặt chỗ của bạn. Cơ sở sẽ liên hệ xác nhận qua SĐT bạn đã cung cấp.',
  'bookings.empty': 'Chưa có lịch đặt chỗ nào',
  'bookings.emptyHint': 'Dùng chat để tìm nhà hàng, spa, khách sạn và đặt chỗ ngay!',
  'bookings.exploreCta': 'Khám phá ngay',
  'bookings.guests': '{n} người',

  // ── /profile/favorites ─────────────────────────────────────────────────────
  'favorites.title': 'Đã lưu',
  'favorites.count': '{n} mục',
  'favorites.loadError': 'Không tải được mục đã lưu',
  'favorites.loadErrorHint': 'Vui lòng thử lại sau nhé.',
  'favorites.empty': 'Chưa lưu gì cả',
  'favorites.emptyHint': 'Bấm ♡ để lưu địa điểm yêu thích, hoặc 🔖 để lưu bài viết muốn xem lại — tất cả sẽ nằm ở đây.',
  'favorites.exploreCta': 'Khám phá ngay',
  'favorites.placesHeading': 'Địa điểm yêu thích',
  'favorites.savedAt': 'Đã lưu {date}',

  // ── (the /profile/posts keys lived here until My Reviews was removed) ──────

  // ── /profile/price-watches ─────────────────────────────────────────────────
  'watch.title': '🎯 Theo dõi giá',
  'watch.subtitle': 'Tappy báo bạn khi giá xuống mức mong muốn',
  'watch.howHeading': '💬 Cách thêm sản phẩm',
  'watch.howBody': 'Nhắn Tappy:',
  'watch.howExample': '“Tappy theo dõi AirPods Pro, báo mình khi dưới 2 triệu”',
  'watch.chatCta': 'Nhắn Tappy ngay',
  'watch.empty': 'Chưa theo dõi sản phẩm nào',
  'watch.emptyHint': 'Nhắn Tappy để thêm sản phẩm đầu tiên',
  'watch.activeHeading': 'Đang theo dõi ({n}/10)',
  'watch.target': 'Mục tiêu:',
  'watch.current': '· Hiện tại: {price}',
  'watch.lastChecked': 'Kiểm tra lần cuối: {date}',
  'watch.neverChecked': 'Chưa kiểm tra',
  'watch.million': ' triệu',

  // ── /music (C43) ───────────────────────────────────────────────────────────
  'music.uploadCta': 'Đăng',
  'music.royaltyFree': 'Miễn phí bản quyền',
  'music.licensed': 'Có bản quyền',
  'music.originalSound': 'Âm thanh gốc',
  'music.aiGenerated': 'AI tạo nhạc',
  'music.externalLink': 'Liên kết ngoài',
  'favorites.savedPostsHeading': 'Bài viết đã lưu',
  'favorites.postFallback': 'Bài viết',
  'watch.pendingCheck': 'Tappy sẽ kiểm tra giá trong vài giờ tới ⏳',
  'watch.cancelAria': 'Hủy theo dõi',
  'watch.notifiedHeading': 'Đã thông báo ({n})',
  'watch.droppedTo': 'Đã xuống mức',
  'watch.notifiedAt': 'Đã báo: {date}',
  'watch.refreshAria': 'Làm mới',
}

export const en: Record<string, string> = {
  'bookings.title': 'Bookings',
  'bookings.status.confirmed': '✅ Confirmed',
  'bookings.status.cancelled': '❌ Cancelled',
  'bookings.status.pending': '⏳ Pending',
  'bookings.pendingNotice': " — TappyAI has recorded your booking. The venue will call the number you gave to confirm it.",
  'bookings.empty': 'No bookings yet',
  'bookings.emptyHint': 'Use chat to find restaurants, spas and hotels — and book them right there!',
  'bookings.exploreCta': 'Start exploring',
  'bookings.guests': '{n} guests',

  'favorites.title': 'Saved',
  'favorites.count': '{n} items',
  'favorites.loadError': "Couldn't load your saved items",
  'favorites.loadErrorHint': 'Please try again in a moment.',
  'favorites.empty': 'Nothing saved yet',
  'favorites.emptyHint': 'Tap ♡ to save a place you love, or 🔖 to keep a post for later — they all land here.',
  'favorites.exploreCta': 'Start exploring',
  'favorites.placesHeading': 'Favourite places',
  'favorites.savedAt': 'Saved {date}',


  'watch.title': '🎯 Price watch',
  'watch.subtitle': 'Tappy tells you when the price drops to what you wanted',
  'watch.howHeading': '💬 How to add a product',
  'watch.howBody': 'Message Tappy:',
  'watch.howExample': '“Tappy, watch AirPods Pro and tell me when it goes under 2 million”',
  'watch.chatCta': 'Message Tappy',
  'watch.empty': 'No products watched yet',
  'watch.emptyHint': 'Message Tappy to add your first one',
  'watch.activeHeading': 'Watching ({n}/10)',
  'watch.target': 'Target:',
  'watch.current': '· Now: {price}',
  'watch.lastChecked': 'Last checked: {date}',
  'watch.neverChecked': 'Not checked yet',
  // "1.5 triệu" is "1.5M" in English — a suffix, hence the leading space in Vietnamese only.
  'watch.million': 'M',

  'music.uploadCta': 'Upload',

  'music.royaltyFree': 'Royalty-free',

  'music.licensed': 'Licensed',
  'music.originalSound': 'Original sound',
  'music.aiGenerated': 'AI-generated',
  'music.externalLink': 'External link',
  'favorites.savedPostsHeading': 'Saved posts',
  'favorites.postFallback': 'Post',
  'watch.pendingCheck': 'Tappy will check the price within a few hours ⏳',
  'watch.cancelAria': 'Stop watching',
  'watch.notifiedHeading': 'Notified ({n})',
  'watch.droppedTo': 'Dropped to',
  'watch.notifiedAt': 'Notified: {date}',
  'watch.refreshAria': 'Refresh',
}

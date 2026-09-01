// i18n keys for the Notifications screen (src/app/profile/notifications).
// Flat map, one entry per t('notifications.*') key referenced by the screen.
export const vi: Record<string, string> = {
  'notifications.title': 'Thông báo',

  'notifications.unsupported.title': 'Không được hỗ trợ',
  'notifications.unsupported.desc': 'Trình duyệt của bạn chưa hỗ trợ thông báo đẩy. Hãy thử Chrome hoặc Edge.',

  'notifications.denied.title': 'Quyền bị từ chối',
  'notifications.denied.descBefore': 'Bạn đã chặn thông báo. Để bật lại, hãy vào',
  'notifications.denied.descPath': 'Cài đặt trình duyệt → Quyền trang web → Thông báo',
  'notifications.denied.descAfter': 'và cho phép TappyAI.',

  'notifications.push.title': 'Thông báo đẩy',
  'notifications.push.on': 'Đang bật — Tappy sẽ nhắc bạn đúng lúc',
  'notifications.push.off': 'Tắt — bật để nhận nhắc nhở từ Tappy',
  'notifications.push.toggleAria': 'Bật/tắt thông báo đẩy',

  'notifications.receive.heading': 'Bạn sẽ nhận được',
  'notifications.receive.morningBrief': 'Morning brief cá nhân hóa lúc 7:30 sáng',
  'notifications.receive.deals': 'Deal & ưu đãi phù hợp sở thích của bạn',
  'notifications.receive.lunch': 'Nhắc ăn trưa mỗi ngày lúc 11 giờ',
  'notifications.receive.booking': 'Nhắc lịch đặt chỗ trước 3 ngày',
  'notifications.receive.weekly': 'Tổng kết tuần mỗi Chủ nhật 20:00',
  'notifications.receive.soundNote': 'Âm thanh tuỳ chỉnh "Tappy" phát khi ứng dụng đang mở. Khi app đóng, âm thanh do hệ thống điều khiển.',

  // Marketing consent (V2.2-2). Separate from the push toggle above on purpose:
  // turning push ON is a device permission, opting in to marketing is a choice
  // about what may be sent. Merging them would make one tap mean both.
  'notifications.marketing.heading': 'Tin khuyến mãi',
  'notifications.marketing.push.title': 'Nhận tin khuyến mãi qua thông báo',
  'notifications.marketing.push.desc': 'Tối đa 1 tin/ngày và 4 tin/tuần. Không gửi từ 22:00 đến 07:00.',
  'notifications.marketing.push.toggleAria': 'Bật/tắt tin khuyến mãi qua thông báo',
  'notifications.marketing.optedOutNote': 'Bạn đang tắt. Chúng tôi sẽ không gửi tin khuyến mãi nào.',
  'notifications.marketing.unsubscribeAll.title': 'Ngừng nhận tất cả tin khuyến mãi',
  'notifications.marketing.unsubscribeAll.desc': 'Áp dụng ngay cho mọi kênh, kể cả khi bạn đã bật ở trên.',
  'notifications.marketing.unsubscribeAll.aria': 'Ngừng nhận tất cả tin khuyến mãi',
  'notifications.marketing.unsubscribed': 'Đã ngừng nhận tất cả tin khuyến mãi.',
  'notifications.marketing.transactionalNote': 'Thông báo về tài khoản và bảo mật vẫn được gửi.',
  'notifications.marketing.error': 'Không lưu được thay đổi. Vui lòng thử lại.',
}

export const en: Record<string, string> = {
  'notifications.title': 'Notifications',

  'notifications.unsupported.title': 'Not supported',
  'notifications.unsupported.desc': 'Your browser doesn’t support push notifications yet. Try Chrome or Edge.',

  'notifications.denied.title': 'Permission denied',
  'notifications.denied.descBefore': 'You’ve blocked notifications. To re-enable them, go to',
  'notifications.denied.descPath': 'Browser settings → Site permissions → Notifications',
  'notifications.denied.descAfter': 'and allow TappyAI.',

  'notifications.push.title': 'Push notifications',
  'notifications.push.on': 'On — Tappy will remind you at the right time',
  'notifications.push.off': 'Off — turn on to get reminders from Tappy',
  'notifications.push.toggleAria': 'Toggle push notifications',

  'notifications.receive.heading': 'What you’ll receive',
  'notifications.receive.morningBrief': 'A personalized morning brief at 7:30 AM',
  'notifications.receive.deals': 'Deals & offers matched to your interests',
  'notifications.receive.lunch': 'A daily lunch reminder at 11 AM',
  'notifications.receive.booking': 'Booking reminders 3 days ahead',
  'notifications.receive.weekly': 'A weekly recap every Sunday at 8:00 PM',
  'notifications.receive.soundNote': 'A custom "Tappy" sound plays while the app is open. When the app is closed, the sound is controlled by your system.',

  // Marketing consent (V2.2-2). Separate from the push toggle above on purpose:
  // turning push ON is a device permission, opting in to marketing is a choice
  // about what may be sent. Merging them would make one tap mean both.
  'notifications.marketing.heading': 'Marketing',
  'notifications.marketing.push.title': 'Marketing messages by push',
  'notifications.marketing.push.desc': 'At most 1 a day and 4 a week. Never between 10 PM and 7 AM.',
  'notifications.marketing.push.toggleAria': 'Toggle marketing push messages',
  'notifications.marketing.optedOutNote': 'Off. We will not send you any marketing messages.',
  'notifications.marketing.unsubscribeAll.title': 'Unsubscribe from all marketing',
  'notifications.marketing.unsubscribeAll.desc': 'Applies immediately across every channel, even ones switched on above.',
  'notifications.marketing.unsubscribeAll.aria': 'Unsubscribe from all marketing',
  'notifications.marketing.unsubscribed': 'You are unsubscribed from all marketing.',
  'notifications.marketing.transactionalNote': 'Account and security notifications are still sent.',
  'notifications.marketing.error': 'Could not save that change. Please try again.',
}

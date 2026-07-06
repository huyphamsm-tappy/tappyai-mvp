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
}

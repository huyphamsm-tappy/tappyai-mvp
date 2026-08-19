// The few Account/Settings strings the web renders that have no Android
// counterpart, because the corresponding Android screen does not show that
// element (e.g. Android's Account "Edit profile" row has no subtitle).
//
// Hand-maintained — everything else in w4/ is GENERATED from the Android
// resources. Keys keep the Android snake_case convention so that if the Android
// screen ever grows the element, the resource can be added under the same name
// and this file shrinks. Do not add a key here that Android already defines.
export const vi: Record<string, string> = {
  'account_edit_profile_desc': 'Đổi tên hiển thị, ảnh đại diện',
  'account_display_name_fallback': 'bạn',
  // Android hands off to the system share sheet and never renders a confirmation.
  'bookings_share_done': 'Đã chia sẻ!',
  // The inline post-stay review widget is web-only — Android opens the full
  // review composer instead, so these have no Android counterpart.
  'bookings_review_title': 'Đánh giá {1}',
  'bookings_review_body_placeholder': 'Chia sẻ trải nghiệm của bạn... (20–500 ký tự)',
  'bookings_review_photo_hint': 'Tối đa 3 ảnh · Mỗi ảnh dưới 5MB',
  'bookings_review_submit': 'Gửi đánh giá',
  'bookings_review_done': 'Đã đánh giá!',
  'bookings_review_error_rating': 'Vui lòng chọn số sao.',
  'bookings_review_error_min_length': 'Đánh giá phải có ít nhất 20 ký tự.',
  // Price tracking: the web screen carries a subtitle, a worked example and a
  // "dropped to" line that the Android screen does not render.
  'pricetracking_subtitle': 'Tappy báo bạn khi giá xuống mức mong muốn',
  'pricetracking_how_to_add_example': '“Tappy theo dõi AirPods Pro, báo mình khi dưới 2 triệu”',
  'pricetracking_how_to_add_prefix': 'Nhắn Tappy:',
  'pricetracking_dropped_to': 'Đã xuống mức',
  'pricetracking_not_checked_yet': 'Chưa kiểm tra',
  'pricetracking_million_suffix': ' triệu',
  // Inline save-button states. Android shows a transient toast instead of
  // swapping the button label, so it has no equivalent resource.
  'common_saving': 'Đang lưu...',
  'common_saved': 'Đã lưu!',
  // App connections: Android's screen is display-only (no OAuth round trip), so
  // the connected state and the callback banners exist on the web only.
  'appconn_connected': 'Đã kết nối',
  'appconn_disconnect': 'Ngắt kết nối',
  'appconn_success_generic': 'Kết nối thành công!',
  'appconn_success_google_calendar': 'Đã kết nối Google Calendar thành công!',
  'appconn_success_zalo': 'Đã kết nối Zalo thành công!',
  'appconn_error_generic': 'Có lỗi xảy ra. Vui lòng thử lại.',
  'appconn_error_google_denied': 'Bạn đã huỷ kết nối Google.',
  'appconn_error_google_failed': 'Kết nối Google thất bại. Vui lòng thử lại.',
  'appconn_error_zalo_denied': 'Bạn đã huỷ kết nối Zalo.',
  'appconn_error_zalo_failed': 'Kết nối Zalo thất bại. Vui lòng thử lại.',
  // Edit-profile bits the Android screen does not render (it has no avatar hint
  // line and no optional-field marker).
  'account_avatar_hint': 'Nhấn vào 📷 để đổi ảnh · Tối đa 3MB',
  'account_bio_optional': '(tuỳ chọn)',
  'account_load_failed': 'Không thể tải thông tin',
  'account_avatar_upload_failed': 'Tải ảnh lên thất bại',
  'account_save_failed': 'Lưu thất bại',
}

export const en: Record<string, string> = {
  'account_edit_profile_desc': 'Change your display name and avatar',
  'account_display_name_fallback': 'there',
  'bookings_share_done': 'Shared!',
  'bookings_review_title': 'Review {1}',
  'bookings_review_body_placeholder': 'Share your experience... (20–500 characters)',
  'bookings_review_photo_hint': 'Up to 3 photos · 5MB each',
  'bookings_review_submit': 'Submit review',
  'bookings_review_done': 'Reviewed!',
  'bookings_review_error_rating': 'Please choose a star rating.',
  'bookings_review_error_min_length': 'A review needs at least 20 characters.',
  'pricetracking_subtitle': 'Tappy tells you when the price drops to your target',
  'pricetracking_how_to_add_example': '“Tappy, track AirPods Pro and tell me when it drops below 2M”',
  'pricetracking_how_to_add_prefix': 'Message Tappy:',
  'pricetracking_dropped_to': 'Dropped to',
  'pricetracking_not_checked_yet': 'Not checked yet',
  'pricetracking_million_suffix': 'M',
  'common_saving': 'Saving...',
  'common_saved': 'Saved!',
  'appconn_connected': 'Connected',
  'appconn_disconnect': 'Disconnect',
  'appconn_success_generic': 'Connected successfully!',
  'appconn_success_google_calendar': 'Google Calendar connected successfully!',
  'appconn_success_zalo': 'Zalo connected successfully!',
  'appconn_error_generic': 'Something went wrong. Please try again.',
  'appconn_error_google_denied': 'You cancelled the Google connection.',
  'appconn_error_google_failed': 'Could not connect Google. Please try again.',
  'appconn_error_zalo_denied': 'You cancelled the Zalo connection.',
  'appconn_error_zalo_failed': 'Could not connect Zalo. Please try again.',
  'account_avatar_hint': 'Tap 📷 to change your photo · 3MB max',
  'account_bio_optional': '(optional)',
  'account_load_failed': 'Could not load your profile',
  'account_avatar_upload_failed': 'Upload failed',
  'account_save_failed': 'Could not save',
}

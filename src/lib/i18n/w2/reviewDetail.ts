// i18n keys for the single review detail screen (src/app/reviews/[id]).
// Flat map of the SAME keys referenced via t('reviewDetail.*') in ReviewDetailView.
// Only UI chrome is translated here — user content, place data and AI text are untouched.

export const vi: Record<string, string> = {
  'reviewDetail.rating1': 'Kém',
  'reviewDetail.rating2': 'Tạm ổn',
  'reviewDetail.rating3': 'Bình thường',
  'reviewDetail.rating4': 'Ngon',
  'reviewDetail.rating5': 'Xuất sắc',
  'reviewDetail.verified': 'Xác nhận',
  'reviewDetail.anonymous': 'Ẩn danh',
  'reviewDetail.timeJustNow': 'vừa xong',
  'reviewDetail.timeMinutesAgo': '{n} phút trước',
  'reviewDetail.timeHoursAgo': '{n} giờ trước',
  'reviewDetail.timeDaysAgo': '{n} ngày trước',
  'reviewDetail.timeMonthsAgo': '{n} tháng trước',
  'reviewDetail.noBody': 'Không có nội dung mô tả.',
  'reviewDetail.ctaPrompt': 'Muốn biết thêm về',
  'reviewDetail.askTappy': 'Hỏi Tappy',
}

export const en: Record<string, string> = {
  'reviewDetail.rating1': 'Poor',
  'reviewDetail.rating2': 'Okay',
  'reviewDetail.rating3': 'Average',
  'reviewDetail.rating4': 'Great',
  'reviewDetail.rating5': 'Excellent',
  'reviewDetail.verified': 'Verified',
  'reviewDetail.anonymous': 'Anonymous',
  'reviewDetail.timeJustNow': 'just now',
  'reviewDetail.timeMinutesAgo': '{n} min ago',
  'reviewDetail.timeHoursAgo': '{n} hr ago',
  'reviewDetail.timeDaysAgo': '{n} days ago',
  'reviewDetail.timeMonthsAgo': '{n} months ago',
  'reviewDetail.noBody': 'No description provided.',
  'reviewDetail.ctaPrompt': 'Want to know more about',
  'reviewDetail.askTappy': 'Ask Tappy',
}

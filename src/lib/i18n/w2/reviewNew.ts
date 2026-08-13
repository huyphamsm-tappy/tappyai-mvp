// i18n keys for the create-a-review composer screen (src/app/reviews/new/page.tsx).
// Flat map, same keys used with t('reviewNew.*'). VN original + EN translation.
export const vi: Record<string, string> = {
  // Header + post button
  'reviewNew.headerTitle': 'Bài viết mới',
  'reviewNew.post': 'Đăng',

  // Success screen
  'reviewNew.successTitle': 'Đã đăng bài!',
  'reviewNew.successSubtitle': 'Cảm ơn bạn đã chia sẻ',

  // Media tabs
  'reviewNew.tabPhoto': 'Ảnh',
  'reviewNew.tabVideo': 'Video',
  'reviewNew.tabLink': 'Link',

  // Photo tab
  'reviewNew.addPhoto': 'Thêm ảnh',
  'reviewNew.maxPhotos': 'Tối đa {n} ảnh',
  'reviewNew.photoUploadError': 'Lỗi tải ảnh',

  // Video tab
  'reviewNew.selectVideo': 'Chọn video',
  'reviewNew.videoHint': 'mp4 · mov · webm  ·  tối đa 5 phút · 50MB',
  'reviewNew.creatingThumbnail': 'Đang tạo thumbnail...',
  'reviewNew.uploadingVideo': 'Đang tải video lên...',
  'reviewNew.analyzingContent': 'Đang phân tích nội dung...',
  'reviewNew.cancel': 'Hủy',
  'reviewNew.videoUploaded': 'Video đã tải lên',
  'reviewNew.remove': 'Xóa',
  'reviewNew.videoUnsupportedFormat': 'Chỉ hỗ trợ mp4, mov, webm',
  'reviewNew.videoTooLarge': 'Video phải nhỏ hơn 50MB',
  'reviewNew.videoReadError': 'Không đọc được thông tin video',
  // Giới hạn sản phẩm nói "5 phút"; chỉ thông báo lỗi mới nêu dung sai 5 giây.
  'reviewNew.videoLimitHint': 'Bạn có thể tải video dài tối đa 5 phút.',
  'reviewNew.videoTooLong': 'Video quá dài. Vui lòng chọn video tối đa 5 phút 5 giây.',
  'reviewNew.uploadCancelled': 'Đã hủy tải lên',
  'reviewNew.videoUploadError': 'Lỗi tải video. Vui lòng thử lại.',

  // URL tab
  'reviewNew.pasteYoutube': 'Dán link YouTube...',
  'reviewNew.loadingMeta': 'Đang tải thông tin...',
  'reviewNew.linkUnsupported': 'Hiện chỉ hỗ trợ link YouTube.',

  // Body
  'reviewNew.bodyPlaceholder': 'Chia sẻ trải nghiệm, cảm nhận của bạn...',

  // Place
  'reviewNew.addPlace': 'Thêm địa điểm',
  'reviewNew.placePlaceholder': 'Tên quán, nhà hàng, địa điểm...',

  // Rating
  'reviewNew.addRating': 'Thêm đánh giá sao',
  'reviewNew.ratingLabel': '{n} sao - {label}',
  'reviewNew.rating1': 'Tệ',
  'reviewNew.rating2': 'Không tốt',
  'reviewNew.rating3': 'Bình thường',
  'reviewNew.rating4': 'Tốt',
  'reviewNew.rating5': 'Tuyệt vời',

  // Music
  'reviewNew.addMusic': 'Thêm nhạc nền',
  'reviewNew.selectedMusicAria': 'Nhạc nền đã chọn, bấm để đổi nhạc',
  'reviewNew.removeMusic': 'Xóa nhạc nền',
  'reviewNew.loading': 'Đang tải...',

  // Submit
  'reviewNew.postError': 'Lỗi đăng bài',
}

export const en: Record<string, string> = {
  // Header + post button
  'reviewNew.headerTitle': 'New post',
  'reviewNew.post': 'Post',

  // Success screen
  'reviewNew.successTitle': 'Posted!',
  'reviewNew.successSubtitle': 'Thanks for sharing',

  // Media tabs
  'reviewNew.tabPhoto': 'Photo',
  'reviewNew.tabVideo': 'Video',
  'reviewNew.tabLink': 'Link',

  // Photo tab
  'reviewNew.addPhoto': 'Add photos',
  'reviewNew.maxPhotos': 'Up to {n} photos',
  'reviewNew.photoUploadError': 'Failed to upload photo',

  // Video tab
  'reviewNew.selectVideo': 'Choose a video',
  'reviewNew.videoHint': 'mp4 · mov · webm  ·  up to 5 minutes · 50MB',
  'reviewNew.creatingThumbnail': 'Creating thumbnail...',
  'reviewNew.uploadingVideo': 'Uploading video...',
  'reviewNew.analyzingContent': 'Analyzing content...',
  'reviewNew.cancel': 'Cancel',
  'reviewNew.videoUploaded': 'Video uploaded',
  'reviewNew.remove': 'Remove',
  'reviewNew.videoUnsupportedFormat': 'Only mp4, mov, webm are supported',
  'reviewNew.videoTooLarge': 'Video must be under 50MB',
  'reviewNew.videoReadError': "Couldn't read video info",
  // The product limit is stated as "5 minutes"; only the failure names the 5s tolerance.
  'reviewNew.videoLimitHint': 'Videos can be up to 5 minutes long.',
  'reviewNew.videoTooLong': 'Video is too long. Please choose a video up to 5 minutes 5 seconds.',
  'reviewNew.uploadCancelled': 'Upload cancelled',
  'reviewNew.videoUploadError': 'Upload failed. Please try again.',

  // URL tab
  'reviewNew.pasteYoutube': 'Paste a YouTube link...',
  'reviewNew.loadingMeta': 'Loading info...',
  'reviewNew.linkUnsupported': 'Only YouTube links are supported for now.',

  // Body
  'reviewNew.bodyPlaceholder': 'Share your experience and thoughts...',

  // Place
  'reviewNew.addPlace': 'Add location',
  'reviewNew.placePlaceholder': 'Cafe, restaurant, or place name...',

  // Rating
  'reviewNew.addRating': 'Add star rating',
  'reviewNew.ratingLabel': '{n} stars - {label}',
  'reviewNew.rating1': 'Terrible',
  'reviewNew.rating2': 'Poor',
  'reviewNew.rating3': 'Okay',
  'reviewNew.rating4': 'Good',
  'reviewNew.rating5': 'Excellent',

  // Music
  'reviewNew.addMusic': 'Add background music',
  'reviewNew.selectedMusicAria': 'Selected background music, tap to change',
  'reviewNew.removeMusic': 'Remove background music',
  'reviewNew.loading': 'Loading...',

  // Submit
  'reviewNew.postError': 'Failed to post',
}

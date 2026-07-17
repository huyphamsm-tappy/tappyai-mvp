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
  'reviewNew.videoHint': 'mp4 · mov · webm  ·  tối đa 60s · 50MB',
  'reviewNew.creatingThumbnail': 'Đang tạo thumbnail...',
  'reviewNew.uploadingVideo': 'Đang tải video lên...',
  'reviewNew.analyzingContent': 'Đang phân tích nội dung...',
  'reviewNew.cancel': 'Hủy',
  'reviewNew.videoUploaded': 'Video đã tải lên',
  'reviewNew.remove': 'Xóa',
  'reviewNew.videoUnsupportedFormat': 'Chỉ hỗ trợ mp4, mov, webm',
  'reviewNew.videoTooLarge': 'Video phải nhỏ hơn 50MB',
  'reviewNew.videoReadError': 'Không đọc được thông tin video',
  'reviewNew.videoTooLong': 'Video tối đa {n} giây',
  'reviewNew.uploadCancelled': 'Đã hủy tải lên',
  'reviewNew.videoUploadError': 'Lỗi tải video. Vui lòng thử lại.',

  // URL tab
  'reviewNew.pasteYoutube': 'Dán link YouTube...',
  'reviewNew.pasteTiktok': 'Dán link TikTok...',
  'reviewNew.pasteFacebook': 'Dán link Facebook...',
  'reviewNew.loadingMeta': 'Đang tải thông tin...',
  'reviewNew.facebookNote': 'Facebook: chỉ lưu link và hiển thị nút xem ngoài.',

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
  'reviewNew.videoHint': 'mp4 · mov · webm  ·  up to 60s · 50MB',
  'reviewNew.creatingThumbnail': 'Creating thumbnail...',
  'reviewNew.uploadingVideo': 'Uploading video...',
  'reviewNew.analyzingContent': 'Analyzing content...',
  'reviewNew.cancel': 'Cancel',
  'reviewNew.videoUploaded': 'Video uploaded',
  'reviewNew.remove': 'Remove',
  'reviewNew.videoUnsupportedFormat': 'Only mp4, mov, webm are supported',
  'reviewNew.videoTooLarge': 'Video must be under 50MB',
  'reviewNew.videoReadError': "Couldn't read video info",
  'reviewNew.videoTooLong': 'Video can be at most {n} seconds',
  'reviewNew.uploadCancelled': 'Upload cancelled',
  'reviewNew.videoUploadError': 'Upload failed. Please try again.',

  // URL tab
  'reviewNew.pasteYoutube': 'Paste a YouTube link...',
  'reviewNew.pasteTiktok': 'Paste a TikTok link...',
  'reviewNew.pasteFacebook': 'Paste a Facebook link...',
  'reviewNew.loadingMeta': 'Loading info...',
  'reviewNew.facebookNote': 'Facebook: we only save the link and show an external view button.',

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

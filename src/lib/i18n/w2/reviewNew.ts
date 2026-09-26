// i18n keys for the create-a-review composer screen (src/app/(app)/reviews/new/page.tsx).
// Flat map, same keys used with t('reviewNew.*'). VN original + EN translation.
export const vi: Record<string, string> = {
  // Header + post button
  'reviewNew.headerTitle': 'Bài viết mới',
  'reviewNew.post': 'Đăng',

  // Success screen
  'reviewNew.successTitle': 'Đã đăng bài!',
  'reviewNew.successSubtitle': 'Cảm ơn bạn đã chia sẻ',
  'reviewNew.moderationGoToProfile': 'Xem trong Hồ sơ của tôi',

  // Media tabs
  'reviewNew.tabPhoto': 'Ảnh',
  'reviewNew.tabVideo': 'Video',
  'reviewNew.tabLink': 'YouTube',
  'reviewNew.tabPhotoHint': 'Chia sẻ hình ảnh',
  'reviewNew.tabVideoHint': 'Đăng video ngắn',
  'reviewNew.tabLinkHint': 'Chia sẻ video YouTube',
  'reviewNew.chooseFile': 'Chọn file',
  'reviewNew.back': 'Quay lại',
  'reviewNew.heroTitle1': 'POST',
  'reviewNew.heroTitle2': 'UPLOAD',
  'reviewNew.visibilityLabel': 'Ai có thể xem?',
  'reviewNew.visibilityPublic': 'Công khai',

  // Photo tab
  'reviewNew.addPhoto': 'Thêm ảnh',
  'reviewNew.maxPhotos': 'Tối đa {n} ảnh',
  'reviewNew.photoUploadError': 'Lỗi tải ảnh',

  // Video tab
  'reviewNew.selectVideo': 'Chọn video',
  'reviewNew.videoHint': 'mp4 · mov  ·  tối đa 5 phút · 150MB',
  // ── Media step (V3) ──────────────────────────────────────────────────────
  // 🚨 EVERY FORMAT AND NUMBER BELOW IS THE ONE THE SERVER ACTUALLY ENFORCES. The design
  // reference offered "MP4, MOV – Tối đa 2GB"; the real policy is mp4/mov (WebM dropped, F-102) at 150MB and five
  // minutes, and photos are jpg/png/gif/webp at 5MB each. Copy that promises more than the
  // upload accepts turns a validation error into a broken product.
  'reviewNew.mediaSubtitle': 'Chia sẻ hình ảnh, video hoặc nội dung của bạn',
  'reviewNew.dropTitle': 'Kéo thả file vào đây',
  'reviewNew.dropHint': 'hoặc nhấn nút bên dưới để chọn',
  'reviewNew.dropActive': 'Thả file để tải lên',
  'reviewNew.photoHint': 'jpg · png · gif · webp  ·  tối đa {n}MB mỗi ảnh',
  'reviewNew.choosePhotos': 'Chọn ảnh',
  'reviewNew.linkHint': 'Hỗ trợ: {list}',
  'reviewNew.communityNote': 'Hãy tuân thủ chính sách cộng đồng khi đăng tải nội dung.',
  'reviewNew.creatingThumbnail': 'Đang tạo thumbnail...',
  'reviewNew.uploadingVideo': 'Đang tải video lên...',
  'reviewNew.analyzingContent': 'Đang phân tích nội dung...',
  'reviewNew.cancel': 'Hủy',
  'reviewNew.videoUploaded': 'Video đã tải lên',
  'reviewNew.remove': 'Xóa',
  'reviewNew.videoUnsupportedFormat': 'Video này chưa đúng định dạng. Bạn quay hoặc xuất lại thành MP4 hoặc MOV rồi thử lại nhé.',
  'reviewNew.videoTooLarge': 'Video quá lớn. Vui lòng chọn video tối đa 150MB.',
  'reviewNew.videoReadError': 'Không đọc được thông tin video',
  // Giới hạn sản phẩm nói "5 phút"; chỉ thông báo lỗi mới nêu dung sai 5 giây.
  'reviewNew.videoLimitHint': 'Bạn có thể tải video dài tối đa 5 phút và 150MB.',
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
  'reviewNew.areaPlaceholder': 'Khu vực (quận, thành phố) — không bắt buộc',
  'reviewNew.areaSuggested': 'Gợi ý từ nội dung clip — bạn có thể sửa hoặc xóa',

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
  'reviewNew.musicUnavailable': 'Bài nhạc này không còn trong thư viện',

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
  'reviewNew.moderationGoToProfile': 'View in my Profile',

  // Media tabs
  'reviewNew.tabPhoto': 'Photo',
  'reviewNew.tabVideo': 'Video',
  'reviewNew.tabLink': 'YouTube',
  'reviewNew.tabPhotoHint': 'Share photos',
  'reviewNew.tabVideoHint': 'Post a short video',
  'reviewNew.tabLinkHint': 'Share a YouTube video',
  'reviewNew.chooseFile': 'Choose a file',
  'reviewNew.back': 'Back',
  'reviewNew.heroTitle1': 'POST',
  'reviewNew.heroTitle2': 'UPLOAD',
  'reviewNew.visibilityLabel': 'Who can see this?',
  'reviewNew.visibilityPublic': 'Public',

  // Photo tab
  'reviewNew.addPhoto': 'Add photos',
  'reviewNew.maxPhotos': 'Up to {n} photos',
  'reviewNew.photoUploadError': 'Failed to upload photo',

  // Video tab
  'reviewNew.selectVideo': 'Choose a video',
  'reviewNew.videoHint': 'mp4 · mov  ·  up to 5 minutes · 150MB',
  // ── Media step (V3) — see the note in the Vietnamese block above ─────────
  'reviewNew.mediaSubtitle': 'Share images, videos or your content',
  'reviewNew.dropTitle': 'Drop a file here',
  'reviewNew.dropHint': 'or use the button below to choose one',
  'reviewNew.dropActive': 'Release to upload',
  'reviewNew.photoHint': 'jpg · png · gif · webp  ·  up to {n}MB each',
  'reviewNew.choosePhotos': 'Choose photos',
  'reviewNew.linkHint': 'Supported: {list}',
  'reviewNew.communityNote': 'Please follow the community policy when posting content.',
  'reviewNew.creatingThumbnail': 'Creating thumbnail...',
  'reviewNew.uploadingVideo': 'Uploading video...',
  'reviewNew.analyzingContent': 'Analyzing content...',
  'reviewNew.cancel': 'Cancel',
  'reviewNew.videoUploaded': 'Video uploaded',
  'reviewNew.remove': 'Remove',
  'reviewNew.videoUnsupportedFormat': 'This video format isn\'t supported. Please record or export it as MP4 or MOV and try again.',
  'reviewNew.videoTooLarge': 'Video is too large. Please choose a video up to 150MB.',
  'reviewNew.videoReadError': "Couldn't read video info",
  // The product limit is stated as "5 minutes"; only the failure names the 5s tolerance.
  'reviewNew.videoLimitHint': 'Videos can be up to 5 minutes long and 150MB.',
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
  'reviewNew.areaPlaceholder': 'Area (district, city) — optional',
  'reviewNew.areaSuggested': 'Suggested from the clip — edit or clear it',

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
  'reviewNew.musicUnavailable': 'This track is no longer in the library',

  // Submit
  'reviewNew.postError': 'Failed to post',
}

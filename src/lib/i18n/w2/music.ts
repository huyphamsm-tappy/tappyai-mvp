// Music Library screen (namespace: "music") — VN original + EN translation.
// Flat key map consumed by the i18n w2 loader. Category tab labels come from
// the DB (music_categories) and are intentionally NOT translated here.
//
// The `music.hero*` / `music.pill*` / `music.section*` keys are the V3 redesign's
// presentation copy. 🚨 EVERY CLAIM HERE IS BACKED BY A FEATURE THAT EXISTS: moods
// = the DB categories, preview = the page's shared <audio>, soundtrack = the
// review picker, upload = /music/upload. Nothing promises a catalogue size,
// playlists or recommendations, because the module has none of those.
export const vi: Record<string, string> = {
  'music.title': 'Thư viện nhạc',
  'music.backHome': 'Trang chủ',
  'music.searchPlaceholder': 'Tìm bài hát, nghệ sĩ...',
  'music.searchAriaLabel': 'Tìm nhạc',
  'music.clearSearch': 'Xóa tìm kiếm',
  'music.categoryAll': 'Tất cả',
  'music.emptyTracks': 'Không tìm thấy bài hát nào',
  'music.loadMore': 'Xem thêm',
  'music.heroTitle1': 'Âm nhạc',
  'music.heroTitle2': 'Cho mọi tâm trạng',
  'music.heroBody': 'Khám phá bài hát theo tâm trạng, nghe thử ngay và chọn nhạc nền cho review của bạn.',
  'music.heroCta': 'Khám phá ngay',
  'music.pillMoods': 'Nhạc theo tâm trạng',
  'music.pillPreview': 'Nghe thử ngay trên web',
  'music.pillSoundtrack': 'Nhạc nền cho review của bạn',
  'music.pillUpload': 'Đăng Original Sound của bạn',
  'music.seeAll': 'Xem tất cả',
  'music.sectionAll': 'Tất cả bài hát',
  'music.sectionResults': 'Kết quả tìm kiếm',
  'music.previewTrack': 'Nghe thử {title}',
  'music.stopPreview': 'Dừng nghe thử {title}',
  'music.nowPlaying': 'Đang phát',
}

export const en: Record<string, string> = {
  'music.title': 'Music library',
  'music.backHome': 'Home',
  'music.searchPlaceholder': 'Search songs, artists...',
  'music.searchAriaLabel': 'Search music',
  'music.clearSearch': 'Clear search',
  'music.categoryAll': 'All',
  'music.emptyTracks': 'No songs found',
  'music.loadMore': 'Load more',
  'music.heroTitle1': 'Music',
  'music.heroTitle2': 'For every mood',
  'music.heroBody': 'Browse songs by mood, preview them instantly and pick a soundtrack for your review.',
  'music.heroCta': 'Explore now',
  'music.pillMoods': 'Music by mood',
  'music.pillPreview': 'Preview instantly on the web',
  'music.pillSoundtrack': 'Soundtracks for your reviews',
  'music.pillUpload': 'Upload your Original Sound',
  'music.seeAll': 'See all',
  'music.sectionAll': 'All songs',
  'music.sectionResults': 'Search results',
  'music.previewTrack': 'Preview {title}',
  'music.stopPreview': 'Stop previewing {title}',
  'music.nowPlaying': 'Now playing',
}

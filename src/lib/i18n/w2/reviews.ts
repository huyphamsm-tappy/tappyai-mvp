// i18n dictionary module for the /reviews screen (TikTok-style feed + profile).
// Flat key→string maps, VN original + EN translation. Every key referenced via
// t('reviews.*') in src/app/reviews/page.tsx appears in BOTH vi and en.
// User-generated content (review bodies, place names, usernames, hashtags) is
// never keyed here — only chrome/labels/states.

export const vi: Record<string, string> = {
  // Shared fallbacks
  'reviews.anonymous': 'Ẩn danh',
  'reviews.me': 'Tôi',

  // Feed tabs
  'reviews.tabFollowing': 'Đang follow',
  'reviews.tabForYou': 'Đề xuất',
  'reviews.tabLatest': 'Mới nhất',

  // Action rail
  'reviews.railSave': 'Lưu',
  'reviews.railShare': 'Chia sẻ',

  // Post overflow menu
  'reviews.deletePost': 'Xoá bài',
  'reviews.hidePost': 'Ẩn bài',
  'reviews.deleteConfirmShort': 'Xoá?',

  // Comment sheet
  'reviews.commentsTitle': '{n} bình luận',
  'reviews.commentsLoadError': 'Không thể tải bình luận. Vui lòng thử lại.',
  'reviews.commentsEmpty': 'Chưa có bình luận nào',
  'reviews.commentSendError': 'Không thể đăng bình luận. Vui lòng thử lại.',
  'reviews.commentPlaceholder': 'Thêm bình luận...',
  'reviews.commentSend': 'Đăng',
  'reviews.commentDelete': 'Xóa bình luận',

  // Share sheet
  'reviews.shareTitle': 'Chia sẻ với bạn bè',
  'reviews.shareCopy': 'Sao chép',
  'reviews.shareCopied': 'Đã chép',
  'reviews.shareAction': 'Chia sẻ',

  // Profile stats + header
  'reviews.statFollowing': 'Đang follow',
  'reviews.statFollowers': 'Follower',
  'reviews.statPosts': 'Bài viết',
  'reviews.editProfile': 'Chỉnh sửa hồ sơ',
  'reviews.yourPreferences': '✨ Sở thích của bạn',

  // Profile tabs
  'reviews.profileTabPosts': 'Bài viết',
  'reviews.profileTabSaved': 'Đã lưu',
  'reviews.profileTabLiked': 'Đã thích',

  // Profile states
  'reviews.profileLoadError': 'Không thể tải hồ sơ. Vui lòng thử lại.',
  'reviews.emptyPosts': 'Chưa có bài nào',
  'reviews.emptyPostsCta': 'Đăng bài đầu tiên',
  'reviews.emptySaved': 'Chưa lưu bài nào',
  'reviews.emptyLiked': 'Chưa thích bài nào',

  // Profile action sheet
  'reviews.deleteConfirm': 'Xoá bài?',
  'reviews.sheetViewPost': 'Xem bài viết',
  'reviews.sheetShowPost': 'Hiện bài này',
  'reviews.sheetHidePost': 'Ẩn bài này',
  'reviews.sheetDeletePost': 'Xoá bài này',

  // Bottom nav + sidebar
  'reviews.navHome': 'Trang chủ',
  'reviews.navDiscover': 'Khám phá',
  'reviews.navSearch': 'Tìm Kiếm',
  'reviews.navInbox': 'Hộp thư',
  'reviews.navProfile': 'Hồ sơ',
  'reviews.navProfileAndPosts': 'Hồ sơ & Bài của tôi',
  'reviews.sidebarPost': 'Đăng bài',

  // Notifications
  'reviews.notificationsTitle': 'Thông báo',
  'reviews.notifTwoActors': '{a} và {b}',
  'reviews.notifManyActors': '{a}, {b} và {n} người khác',
  'reviews.notifLiked': 'đã thích bài viết của bạn',
  'reviews.notifFollowed': 'đã theo dõi bạn',
  'reviews.notifCommented': 'đã bình luận',
  'reviews.notifProfileViews': 'người đã xem hồ sơ của bạn trong 24h',
  'reviews.notifSeeWho': 'Xem ai',
  'reviews.followed': 'Đã theo',
  'reviews.followBack': 'Theo dõi lại',
  'reviews.notifsLoadError': 'Không thể tải thông báo. Vui lòng thử lại.',
  'reviews.notifsEmpty': 'Chưa có thông báo nào',
  'reviews.notifsNoNew': 'Không có thông báo mới',

  // Notification sections
  'reviews.sectionJustNow': 'VỪA XONG',
  'reviews.sectionToday': 'HÔM NAY',
  'reviews.sectionThisWeek': 'TUẦN NÀY',

  // Inbox banner + hot places
  'reviews.bannerTitle': 'Tappy gợi ý hôm nay',
  'reviews.bannerPersonalized': 'Gợi ý dựa trên sở thích {styles} của bạn',
  'reviews.bannerDefault': '3 quán bạn bè hay đến đang mở gần bạn',
  'reviews.hotNearYou': 'ĐANG HOT GẦN BẠN 🔥',
  'reviews.hotCount': '{n} lượt',

  // Relative time
  'reviews.agoJustNow': 'vừa xong',
  'reviews.agoMinutes': '{n}p',
  'reviews.agoHours': '{n}g',
  'reviews.agoDays': '{n}n',

  // Feed empty / error states
  'reviews.feedLoadError': 'Không thể tải bài viết. Vui lòng thử lại.',
  'reviews.feedEmptyFollowing': 'Chưa theo dõi ai hoặc họ chưa đăng bài',
  'reviews.feedEmpty': 'Chưa có bài nào',
  'reviews.seeForYou': 'Xem Đề xuất',
  'reviews.postNow': 'Đăng ngay',

  // Explore / search
  'reviews.searchPlaceholderReview': 'Tìm review, địa điểm...',
  'reviews.searchPlaceholderUser': 'Tìm theo tên, email, SĐT...',
  'reviews.searchModePlaces': '📍 Địa điểm & Review',
  'reviews.searchModeUsers': '👤 Người dùng',
  'reviews.searchError': 'Không thể tìm kiếm. Vui lòng thử lại.',
  'reviews.searchNoResults': 'Không tìm thấy kết quả cho "{q}"',
  'reviews.searchResultCount': '{n} kết quả',
  'reviews.searchHintReview': 'Tìm kiếm quán ăn, địa điểm hoặc nội dung bạn muốn xem',
  'reviews.userSearchNoResults': 'Không tìm thấy người dùng nào',
  'reviews.userFollowStats': '{followers} follower · {following} đang follow',
  'reviews.following': 'Đang theo',
  'reviews.follow': 'Theo dõi',
  'reviews.searchHintUser': 'Tìm bạn bè theo tên, email hoặc số điện thoại',

  // Auth prompt
  'reviews.loginToViewProfile': 'Đăng nhập để xem hồ sơ',
}

export const en: Record<string, string> = {
  // Shared fallbacks
  'reviews.anonymous': 'Anonymous',
  'reviews.me': 'Me',

  // Feed tabs
  'reviews.tabFollowing': 'Following',
  'reviews.tabForYou': 'For You',
  'reviews.tabLatest': 'Latest',

  // Action rail
  'reviews.railSave': 'Save',
  'reviews.railShare': 'Share',

  // Post overflow menu
  'reviews.deletePost': 'Delete post',
  'reviews.hidePost': 'Hide post',
  'reviews.deleteConfirmShort': 'Delete?',

  // Comment sheet
  'reviews.commentsTitle': '{n} comments',
  'reviews.commentsLoadError': "Couldn't load comments. Please try again.",
  'reviews.commentsEmpty': 'No comments yet',
  'reviews.commentSendError': "Couldn't post your comment. Please try again.",
  'reviews.commentPlaceholder': 'Add a comment...',
  'reviews.commentSend': 'Post',
  'reviews.commentDelete': 'Delete comment',

  // Share sheet
  'reviews.shareTitle': 'Share with friends',
  'reviews.shareCopy': 'Copy',
  'reviews.shareCopied': 'Copied',
  'reviews.shareAction': 'Share',

  // Profile stats + header
  'reviews.statFollowing': 'Following',
  'reviews.statFollowers': 'Followers',
  'reviews.statPosts': 'Posts',
  'reviews.editProfile': 'Edit profile',
  'reviews.yourPreferences': '✨ Your preferences',

  // Profile tabs
  'reviews.profileTabPosts': 'Posts',
  'reviews.profileTabSaved': 'Saved',
  'reviews.profileTabLiked': 'Liked',

  // Profile states
  'reviews.profileLoadError': "Couldn't load profile. Please try again.",
  'reviews.emptyPosts': 'No posts yet',
  'reviews.emptyPostsCta': 'Create your first post',
  'reviews.emptySaved': 'No saved posts yet',
  'reviews.emptyLiked': 'No liked posts yet',

  // Profile action sheet
  'reviews.deleteConfirm': 'Delete this post?',
  'reviews.sheetViewPost': 'View post',
  'reviews.sheetShowPost': 'Show this post',
  'reviews.sheetHidePost': 'Hide this post',
  'reviews.sheetDeletePost': 'Delete this post',

  // Bottom nav + sidebar
  'reviews.navHome': 'Home',
  'reviews.navDiscover': 'Discover',
  'reviews.navSearch': 'Search',
  'reviews.navInbox': 'Inbox',
  'reviews.navProfile': 'Profile',
  'reviews.navProfileAndPosts': 'Profile & My posts',
  'reviews.sidebarPost': 'Post',

  // Notifications
  'reviews.notificationsTitle': 'Notifications',
  'reviews.notifTwoActors': '{a} and {b}',
  'reviews.notifManyActors': '{a}, {b} and {n} others',
  'reviews.notifLiked': 'liked your post',
  'reviews.notifFollowed': 'followed you',
  'reviews.notifCommented': 'commented',
  'reviews.notifProfileViews': 'people viewed your profile in the last 24h',
  'reviews.notifSeeWho': 'See who',
  'reviews.followed': 'Following',
  'reviews.followBack': 'Follow back',
  'reviews.notifsLoadError': "Couldn't load notifications. Please try again.",
  'reviews.notifsEmpty': 'No notifications yet',
  'reviews.notifsNoNew': 'No new notifications',

  // Notification sections
  'reviews.sectionJustNow': 'JUST NOW',
  'reviews.sectionToday': 'TODAY',
  'reviews.sectionThisWeek': 'THIS WEEK',

  // Inbox banner + hot places
  'reviews.bannerTitle': "Tappy's picks for today",
  'reviews.bannerPersonalized': 'Suggestions based on your {styles} tastes',
  'reviews.bannerDefault': '3 spots your friends love are open near you',
  'reviews.hotNearYou': 'HOT NEAR YOU 🔥',
  'reviews.hotCount': '{n} likes',

  // Relative time
  'reviews.agoJustNow': 'just now',
  'reviews.agoMinutes': '{n}m',
  'reviews.agoHours': '{n}h',
  'reviews.agoDays': '{n}d',

  // Feed empty / error states
  'reviews.feedLoadError': "Couldn't load posts. Please try again.",
  'reviews.feedEmptyFollowing': "You're not following anyone, or they haven't posted yet",
  'reviews.feedEmpty': 'No posts yet',
  'reviews.seeForYou': 'See For You',
  'reviews.postNow': 'Post now',

  // Explore / search
  'reviews.searchPlaceholderReview': 'Search reviews, places...',
  'reviews.searchPlaceholderUser': 'Search by name, email, phone...',
  'reviews.searchModePlaces': '📍 Places & Reviews',
  'reviews.searchModeUsers': '👤 Users',
  'reviews.searchError': "Couldn't search. Please try again.",
  'reviews.searchNoResults': 'No results for "{q}"',
  'reviews.searchResultCount': '{n} results',
  'reviews.searchHintReview': 'Search for restaurants, places, or content you want to see',
  'reviews.userSearchNoResults': 'No users found',
  'reviews.userFollowStats': '{followers} followers · {following} following',
  'reviews.following': 'Following',
  'reviews.follow': 'Follow',
  'reviews.searchHintUser': 'Find friends by name, email, or phone number',

  // Auth prompt
  'reviews.loginToViewProfile': 'Sign in to view profile',
}

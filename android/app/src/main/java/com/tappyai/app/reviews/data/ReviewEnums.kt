package com.tappyai.app.reviews.data

enum class ReviewContentType {
    Photo,
    Video,
}

enum class ReviewSourceType {
    YouTube,
    TikTok,
    Facebook,
    Upload,
}

enum class ReviewFeedType {
    ForYou,
    Latest,
    Following,
}

enum class ReviewNotificationType {
    Like,
    Follow,
    Comment,
    ProfileView,
}

enum class ReviewTab {
    Home,
    Explore,
    Inbox,
    Profile,
}

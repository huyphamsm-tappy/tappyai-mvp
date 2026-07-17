package com.tappyai.app.reviews.data

data class ReviewNotification(
    val id: String,
    val type: String,
    val actorId: String,
    val actorName: String,
    val actorAvatar: String?,
    val text: String,
    val url: String,
    val createdAt: String,
)

data class ReviewHotPlace(
    val placeName: String,
    val count: Int,
)

data class ReviewGroupedNotification(
    val id: String,
    val type: String,
    val url: String,
    val actors: List<NotificationActor>,
    val text: String,
    val commentBody: String?,
    val createdAt: String,
    val count: Int,
)

data class NotificationActor(
    val id: String,
    val name: String,
    val avatar: String?,
)

package com.tappyai.app.reviews.data

data class ReviewNotification(
    val id: String,
    val type: String,
    val actorId: String,
    val actorName: String,
    val actorAvatar: String?,
    /** Backend-formed, already-localized message (API `title`/`body`). */
    val title: String,
    val body: String,
    val url: String,
    /** ISO timestamp when read; null = unread. */
    val readAt: String?,
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
    /** Backend-formed message (API `title`) + optional detail (`body`). */
    val title: String,
    val body: String?,
    /** null = unread (any notification in the group unread). */
    val readAt: String?,
    val createdAt: String,
    val count: Int,
)

data class NotificationActor(
    val id: String,
    val name: String,
    val avatar: String?,
)

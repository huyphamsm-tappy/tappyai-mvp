package com.tappyai.app.reviews.data

data class ReviewNotification(
    val id: String,
    val type: String,
    /** social | deal | explore | system — the four values the API emits; the Inbox filters on it. */
    val category: String,
    val title: String,
    /** Blank when the row has no actor (deal / explore / system rows). */
    val actorId: String,
    val actorName: String,
    val actorAvatar: String?,
    /** The v1 `body`. */
    val text: String,
    /** The v1 `entity_url` (blank when the row opens nothing). */
    val url: String,
    val createdAt: String,
    val readAt: String?,
)

data class ReviewHotPlace(
    val placeName: String,
    val count: Int,
)

data class ReviewGroupedNotification(
    val id: String,
    val type: String,
    val category: String,
    val url: String,
    /** Empty for a non-social row — the web's `groupNotifs` keeps `actors: []` for those. */
    val actors: List<NotificationActor>,
    val title: String,
    val text: String,
    val commentBody: String?,
    val createdAt: String,
    val count: Int,
    /** ANY member of the collapsed stack unread — the web's rule, for the same reason. */
    val unread: Boolean,
) {
    /** `isSocialGroup`: like / follow / comment WITH an actor renders the avatar stack; all else the category glyph. */
    val isSocial: Boolean get() = (type == "like" || type == "follow" || type == "comment") && actors.isNotEmpty()
}

/** The Inbox page: the grouped rows plus the server's unread total. */
data class NotificationInbox(
    val groups: List<ReviewGroupedNotification>,
    val unreadCount: Int,
)

data class NotificationActor(
    val id: String,
    val name: String,
    val avatar: String?,
)

package com.tappyai.app.reviews.data

import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset

fun groupNotifications(
    notifications: List<ReviewNotification>,
): List<ReviewGroupedNotification> {
    val map = linkedMapOf<String, ReviewGroupedNotification>()

    for (n in notifications) {
        val key = when (n.type) {
            "like" -> "like:${n.url}"
            "profile_view" -> "profile_view"
            else -> n.id
        }
        val existing = map[key]
        if (existing != null) {
            val actor = NotificationActor(id = n.actorId, name = n.actorName, avatar = n.actorAvatar)
            val alreadyPresent = existing.actors.any { it.id == n.actorId }
            val updatedActors = if (alreadyPresent) existing.actors else existing.actors + actor
            val newerTimestamp = if (parseIsoMillis(n.createdAt) > parseIsoMillis(existing.createdAt))
                n.createdAt else existing.createdAt
            map[key] = existing.copy(
                actors = updatedActors,
                count = existing.count + 1,
                createdAt = newerTimestamp,
                // The group is unread if ANY notification in it is unread.
                readAt = if (existing.readAt == null || n.readAt == null) null else existing.readAt,
            )
        } else {
            map[key] = ReviewGroupedNotification(
                id = n.id,
                type = n.type,
                url = n.url,
                actors = listOf(NotificationActor(id = n.actorId, name = n.actorName, avatar = n.actorAvatar)),
                title = n.title,
                body = n.body.ifBlank { null },
                readAt = n.readAt,
                createdAt = n.createdAt,
                count = 1,
            )
        }
    }

    return map.values.sortedByDescending { parseIsoMillis(it.createdAt) }
}

fun isShareOnlyName(name: String?): Boolean {
    val trimmed = name?.trim() ?: return true
    return trimmed.isEmpty() || trimmed in SHARE_ONLY_NAMES
}

/** Parse an ISO timestamp to epoch millis; degrades a blank/malformed value to 0L ("just now")
 *  rather than crashing the composable render. Public so the localized [reviewRelativeTime]
 *  composable (ui) can reuse the same robust parsing. */
fun parseIsoMillis(iso: String): Long {
    val s = iso.trim().replace(' ', 'T')
    // The DTOs default a missing `created_at` to "" (kotlinx defaults apply on an absent key),
    // and a malformed value is possible on a backend/migration gap. This runs directly inside
    // Composable render code (comment/notification lists), so any throw here crashes the whole
    // screen. Catch broadly on BOTH parse attempts and degrade to 0L ("just now") rather than
    // crash — mirrors the safe pattern already used in Bookings/Conversations/PriceWatch/Saved.
    if (s.isBlank()) return 0L
    return try {
        OffsetDateTime.parse(s).toInstant().toEpochMilli()
    } catch (_: Exception) {
        try {
            LocalDateTime.parse(s).toInstant(ZoneOffset.UTC).toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }
}

private val SHARE_ONLY_NAMES = setOf("Chia sẻ", "Chia se")

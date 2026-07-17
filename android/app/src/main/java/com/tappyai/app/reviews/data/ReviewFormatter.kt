package com.tappyai.app.reviews.data

import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset

fun formatRelativeTime(createdAt: String, nowMillis: Long): String {
    val createdAtMillis = parseIsoMillis(createdAt)
    // parseIsoMillis degrades a blank/malformed timestamp to 0L specifically so it reads as "just
    // now" (see its own doc comment) — but 0L run through the minutes math below computes a
    // multi-decade delta and falls into the "Nd" branch instead, showing something like "20345d"
    // for exactly the missing-data case this was meant to hide. Short-circuit it directly.
    if (createdAtMillis == 0L) return "just now"
    val minutes = (nowMillis - createdAtMillis) / 60_000
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "${minutes}m"
        minutes < 1440 -> "${minutes / 60}h"
        else -> "${minutes / 1440}d"
    }
}

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
            )
        } else {
            map[key] = ReviewGroupedNotification(
                id = n.id,
                type = n.type,
                url = n.url,
                actors = listOf(NotificationActor(id = n.actorId, name = n.actorName, avatar = n.actorAvatar)),
                text = n.text,
                commentBody = if (n.type == "comment") n.text else null,
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

private fun parseIsoMillis(iso: String): Long {
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

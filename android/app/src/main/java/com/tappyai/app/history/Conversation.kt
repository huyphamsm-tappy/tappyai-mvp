package com.tappyai.app.history

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * A chat conversation summary — mirrors the web `/api/conversations` row the history list renders
 * (`id, title, category, updated_at, messages`), reduced to what the row shows.
 */
data class Conversation(
    val id: String,
    val title: String,
    val category: String,
    val updatedAtMillis: Long,
    val messageCount: Int,
)

/** One stored turn, used only when resuming a conversation into Chat (see `ChatHistoryRepository.getConversationMessages`). */
data class StoredChatMessage(val role: String, val content: String)

/** Category → emoji, mirroring the web `CATEGORIES` map (fallback 💬), for the left tile. */
fun emojiForCategory(category: String): String = when (category) {
    "food" -> "🍜"
    "shopping" -> "🛍️"
    "entertainment" -> "🎭"
    "travel" -> "✈️"
    "spa" -> "💆"
    else -> "💬"
}

/**
 * Localized relative time, mirroring the web `formatRelativeTime`. Only ever called from
 * [ConversationRow] (a Composable), so it resolves strings directly via [stringResource] rather
 * than needing a [com.tappyai.core.common.StringProvider]-backed class.
 */
@Composable
fun formatRelativeTime(pastMillis: Long, nowMillis: Long): String {
    val minutes = ((nowMillis - pastMillis).coerceAtLeast(0)) / 60_000L
    return when {
        minutes < 1 -> stringResource(R.string.history_time_just_now)
        minutes < 60 -> stringResource(R.string.history_time_minutes_ago, minutes)
        minutes < 1_440 -> stringResource(R.string.history_time_hours_ago, minutes / 60)
        else -> {
            val days = minutes / 1_440
            if (days == 1L) {
                stringResource(R.string.history_time_day_ago, days)
            } else {
                stringResource(R.string.history_time_days_ago, days)
            }
        }
    }
}

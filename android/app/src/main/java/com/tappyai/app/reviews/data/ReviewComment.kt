package com.tappyai.app.reviews.data

data class ReviewComment(
    val id: String,
    val body: String,
    val createdAt: String,
    val userId: String,
    val profiles: ReviewProfile?,
    /** Non-null marks a reply to that (root) comment — one-level threading, web parity. */
    val parentCommentId: String? = null,
    /** Per-reaction-key counts, e.g. {"like":2,"love":1}; keys with 0 are omitted. */
    val reactions: Map<String, Int> = emptyMap(),
    /** The caller's single reaction key (one of [COMMENT_REACTION_KEYS]), or null. */
    val myReaction: String? = null,
)

/**
 * The 6 comment reactions in Web order (`ReviewCommentButton.tsx`) — the single Kotlin source for
 * both the picker and the summary chips. Keys mirror the backend `ALLOWED` set exactly; the API
 * rejects anything else. Kept here (domain) so UI and any future mapping share one list.
 */
val COMMENT_REACTIONS: List<Pair<String, String>> = listOf(
    "like" to "👍",
    "love" to "❤️",
    "haha" to "😂",
    "wow" to "😮",
    "sad" to "😢",
    "angry" to "😡",
)

val COMMENT_REACTION_KEYS: Set<String> = COMMENT_REACTIONS.mapTo(LinkedHashSet()) { it.first }

/** Emoji for a reaction key, falling back to 👍 for an unknown key (web `reactionEmoji`). */
fun reactionEmoji(key: String): String = COMMENT_REACTIONS.firstOrNull { it.first == key }?.second ?: "👍"

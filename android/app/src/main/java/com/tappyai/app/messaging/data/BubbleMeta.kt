package com.tappyai.app.messaging.data

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Which bubbles of a conversation carry a sender name and a time — the web's `bubbleMetas` (`src/lib/messaging/bubbles.ts`), same rules, so the two clients read alike.
 *
 * A "run" is consecutive messages of ONE sender with less than [RUN_GAP_MS] between neighbours. A run shows the sender's name ONCE at its start (group threads, other people's
 * messages only — a direct thread has one other person, and your own side needs no name) and the time ONCE at its end, so a burst of five messages is one time, not five.
 */
const val RUN_GAP_MS = 5 * 60_000L

data class BubbleMeta(
    /** Show the sender's name above this bubble. */
    val showName: Boolean,
    /** Show the time under this bubble. */
    val showTime: Boolean,
    /** The sender's name (fallback applied), or null for my own messages. */
    val name: String?,
    /** "14:50" today, "03/11 14:50" on another day (Vietnam time, like the Inbox and the web). Empty if the timestamp is unreadable. */
    val time: String,
)

private val VIETNAM: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")

private fun parseMillis(iso: String): Long? =
    runCatching { java.time.OffsetDateTime.parse(iso.trim().replace(' ', 'T')).toInstant().toEpochMilli() }.getOrNull()

/** "HH:mm" for today (in Vietnam), "dd/MM HH:mm" for any other day. Built by hand (not from a locale pattern) so it is identical on every device and in both languages. */
fun bubbleTimeLabel(iso: String, nowMillis: Long): String {
    val ms = parseMillis(iso) ?: return ""
    val a = ZonedDateTime.ofInstant(Instant.ofEpochMilli(ms), VIETNAM)
    val b = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), VIETNAM)
    val clock = "%02d:%02d".format(a.hour, a.minute)
    return if (a.toLocalDate() == b.toLocalDate()) clock else "%02d/%02d %s".format(a.dayOfMonth, a.monthValue, clock)
}

fun bubbleMetas(
    messages: List<ChatMessage>,
    meId: String?,
    group: Boolean,
    nameOf: (String?) -> String,
    nowMillis: Long = System.currentTimeMillis(),
): List<BubbleMeta> {
    fun sameRun(a: ChatMessage?, b: ChatMessage?): Boolean {
        if (a == null || b == null) return false
        if (a.senderId != b.senderId) return false
        val x = parseMillis(a.createdAt) ?: return false
        val y = parseMillis(b.createdAt) ?: return false
        return kotlin.math.abs(y - x) < RUN_GAP_MS
    }
    return messages.mapIndexed { i, m ->
        val mine = meId != null && m.senderId == meId
        val startsRun = !sameRun(messages.getOrNull(i - 1), m)
        val endsRun = !sameRun(m, messages.getOrNull(i + 1))
        BubbleMeta(
            showName = group && !mine && startsRun,
            showTime = endsRun,
            name = if (mine) null else nameOf(m.senderId),
            time = bubbleTimeLabel(m.createdAt, nowMillis),
        )
    }
}

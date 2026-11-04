package com.tappyai.app.messaging

/**
 * A message notification's `entity_url` is the web link to its conversation: `/profile/notifications?tab=messages&thread=<id>` (optionally with the origin in front).
 * Before this, both Inbox hosts took any `/profile/…` link for a person's profile, so the tap on a message notification opened a profile called "notifications". Pure.
 *
 * Returns the thread id, or null when the link is not a conversation link or the id is not a plain id (a notification row is data the app did not write).
 */
private val THREAD_ID = Regex("^[A-Za-z0-9-]{8,64}$")

fun messageThreadIdFromLink(link: String): String? {
    val withoutOrigin = link.trim().removePrefix("https://").let { if (it != link.trim()) "/" + it.substringAfter('/', "") else it }
    val path = withoutOrigin.substringBefore('?').trimEnd('/')
    if (path != "/profile/notifications") return null
    val query = withoutOrigin.substringAfter('?', "")
    val thread = query.split('&').firstOrNull { it.startsWith("thread=") }?.removePrefix("thread=") ?: return null
    return thread.takeIf { THREAD_ID.matches(it) }
}

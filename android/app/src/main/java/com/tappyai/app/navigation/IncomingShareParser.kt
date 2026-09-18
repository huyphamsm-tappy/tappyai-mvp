package com.tappyai.app.navigation

import com.tappyai.app.home.HomeRoute

/**
 * G1-F — Android Direct Share (inbound). Maps a system share (`ACTION_SEND` of `text/plain`)
 * onto the shell destination that already exists for "ask Tappy about this":
 * [HomeRoute.Chat] with `prefill`, which the chat auto-sends on entry.
 *
 * WHY THIS IS NOT A NEW SURFACE. The web's Web Share Target lands on `/chat?q=…`; Android's
 * share sheet lands on the same chat with the same prompt shape, built by the same rule
 * (mirrored from `src/lib/growth/shareTarget.ts`). No new screen, no new backend, no new
 * quota: a shared link is one ordinary question against the existing chat pipeline.
 *
 * Pure and JVM-testable, like [WebLinkDeepLinkParser] and [ShellDeepLink]: the Activity
 * extracts the intent's action / type / extras and hands plain strings in, so the rules can
 * be tested without Robolectric — the app module has none, and `android.content.Intent` is a
 * stub off-device.
 *
 * Image mime types are deliberately not claimed: the chat's image attachment is a picker
 * flow with its own size and type checks, and a foreign `content://` URI handed straight to
 * it would bypass them. A shared image is a follow-up, not part of this change.
 */
object IncomingShareParser {

    const val ACTION_SEND = "android.intent.action.SEND"
    private const val MAX_PROMPT = 1000
    private val URL = Regex("https?://\\S+", RegexOption.IGNORE_CASE)
    private val CONTROL = Regex("[\\u0000-\\u0008\\u000B-\\u001F]")

    /**
     * The chat destination for an inbound share, or null when the intent is not a text share
     * this app should claim. Null means "open normally", never a crash and never a guess.
     */
    @JvmStatic
    fun parse(action: String?, type: String?, text: String?, subject: String?): HomeRoute.Chat? {
        if (action != ACTION_SEND) return null
        if (type == null || !type.startsWith("text/")) return null
        val prompt = buildPrompt(subject = subject, text = text) ?: return null
        return HomeRoute.Chat(prefill = prompt)
    }

    /**
     * The question Tappy is asked about shared content. Same rule as the web: a URL becomes
     * "tell me about this", plain text is the question itself. Pure.
     */
    @JvmStatic
    fun buildPrompt(subject: String?, text: String?): String? {
        val title = subject?.trim().orEmpty()
        val body = text?.trim().orEmpty()
        val url = URL.find(body)?.value ?: URL.find(title)?.value
        val prompt = when {
            url != null -> {
                val label = when {
                    title.isNotEmpty() && URL.find(title) == null -> title
                    body.isNotEmpty() && body != url && URL.find(body) == null -> body
                    else -> ""
                }
                if (label.isNotEmpty()) "Cho mình biết về: $label\n$url" else "Cho mình biết về link này: $url"
            }
            body.isNotEmpty() -> if (title.isNotEmpty() && title != body) "$title\n$body" else body
            title.isNotEmpty() -> title
            else -> return null
        }
        val cleaned = prompt.replace(CONTROL, " ").trim()
        return if (cleaned.length > MAX_PROMPT) cleaned.take(MAX_PROMPT - 1) + "…" else cleaned
    }
}

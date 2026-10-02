package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.MarkdownNormalize
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Markdown out of card payloads (owner UAT blocker 2026-09-28: literal "**" in answers).
 *
 * The model writes markdown INSIDE the JSON of `[TAPPY_PLAN]` / `[CTA_BUTTONS]` / … ("**4.7⭐"),
 * and every card renders those strings as plain text. So the payload is cleaned ONCE, at decode
 * time in [ChatResponseParser], before any card sees it — the Android mirror of web
 * `plainTextDeep` (`src/lib/chat/markdownNormalize.ts`), with the same key rule: addresses, ids and
 * enums are never rewritten.
 */
internal object CardMarkdown {
    private val NON_PROSE_KEY = Regex(
        """((^|_)(url|urls|link|links|href|uri|image|images|photo|photos|id|ids|key|type|kind|category|icon|currency|basis)$)|([a-z](Url|Urls|Link|Links|Id|Ids|Key|Type|Kind)$)""",
        RegexOption.IGNORE_CASE,
    )
    private val ADDRESS = Regex("""^(https?:|mailto:|tel:)""", RegexOption.IGNORE_CASE)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun strip(el: JsonElement, key: String): JsonElement = when (el) {
        is JsonPrimitive ->
            if (!el.isString || NON_PROSE_KEY.containsMatchIn(key) || ADDRESS.containsMatchIn(el.content)) el
            else JsonPrimitive(MarkdownNormalize.plainText(el.content))
        is JsonArray -> JsonArray(el.map { strip(it, key) })
        is JsonObject -> JsonObject(
            el.entries.associate { (k, v) ->
                (if (k.contains('*') || k.contains('`')) MarkdownNormalize.plainText(k) else k) to strip(v, k)
            },
        )
    }

    /** The payload with markdown stripped from its prose strings; the input unchanged if it is not JSON. */
    fun stripPayload(body: String): String {
        val parsed = runCatching { json.parseToJsonElement(body.trim()) }.getOrNull() ?: return body
        val stripped = strip(parsed, "")
        return if (stripped == parsed) body else stripped.toString()
    }
}

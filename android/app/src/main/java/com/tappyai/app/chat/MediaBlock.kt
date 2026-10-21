package com.tappyai.app.chat

import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * The server's `[TAPPY_MEDIA]` block (CONSULT_V3 layouts, TAPPY_ANSWER_V4): news pictures or a
 * Wikipedia subject card. Kotlin port of web `src/lib/media/mediaHosts.ts` — the allow-lists below
 * must stay equal to it. The block is emitted only behind server flags that default off, but it is
 * persisted with the message, so the client treats it like every other marker: the raw JSON never
 * shows, and nothing the block names is trusted. Every URL is re-checked HERE before it can reach
 * an image loader or a browser intent, so a stored or forged block can never point the app at a
 * host outside the lists.
 */
sealed interface MediaBlock {
    /** One picture of a news layout: the article's own image, its own link, the outlet's name. */
    data class NewsItem(val src: String, val href: String, val label: String, val title: String)

    /** The subject card of a knowledge answer: a Wikipedia summary. */
    data class Entity(val name: String, val summary: String, val image: String?, val href: String)

    data class News(val items: List<NewsItem>) : MediaBlock

    /** One card, or 2–3 side by side for a comparison. */
    data class Entities(val entities: List<Entity>) : MediaBlock
}

object MediaBlocks {
    // News CDNs of the RSS feeds get_news reads, and Wikimedia's file hosts.
    private val IMAGE_HOSTS = listOf(
        Regex("""(^|\.)vnecdn\.net$"""),
        Regex("""(^|\.)tuoitre\.vn$"""),
        Regex("""(^|\.)tuoitre\.com\.vn$"""),
        Regex("""(^|\.)dantri\.com\.vn$"""),
        Regex("""(^|\.)dtrinews\.vn$"""),
        Regex("""^upload\.wikimedia\.org$"""),
        Regex("""^thumb\.wikimedia\.org$"""),
    )

    // Article pages of those outlets, and Wikipedia article pages.
    private val PAGE_HOSTS = listOf(
        Regex("""(^|\.)vnexpress\.net$"""),
        Regex("""(^|\.)tuoitre\.vn$"""),
        Regex("""(^|\.)dantri\.com\.vn$"""),
        Regex("""^(vi|en)\.wikipedia\.org$"""),
    )

    private val WIKI_ARTICLE = Regex("""^https://(vi|en)\.wikipedia\.org/wiki/[^?#\s]+$""")
    private val BLOCK_RE = Regex("""\[TAPPY_MEDIA\]([\s\S]*?)\[/TAPPY_MEDIA\]""", RegexOption.IGNORE_CASE)
    private val PARTIAL_RE = Regex("""\[/?TAPPY_MEDIA\][\s\S]*$""", RegexOption.IGNORE_CASE)
    private val CONTROL_RE = Regex("""[\u0000-\u001f]""")
    private val SPACES_RE = Regex("""\s+""")
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private const val MAX_URL = 1024
    private const val MAX_NEWS_ITEMS = 6
    private const val MAX_ENTITIES = 3

    /** The host of a well-formed https URL without credentials, or null. Never an IP literal or an internal name. */
    private fun safeHttpsHost(raw: String): String? {
        if (raw.length > MAX_URL) return null
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        if (uri.scheme?.lowercase() != "https" || uri.rawUserInfo != null) return null
        val host = uri.host?.lowercase() ?: return null
        if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null
        if (host.contains(':') || host.all { it.isDigit() || it == '.' }) return null
        return host
    }

    fun isAllowedImage(url: String?): Boolean {
        val host = url?.let(::safeHttpsHost) ?: return false
        return IMAGE_HOSTS.any { it.containsMatchIn(host) }
    }

    fun isAllowedPage(url: String?): Boolean {
        val host = url?.let(::safeHttpsHost) ?: return false
        if (PAGE_HOSTS.none { it.containsMatchIn(host) }) return false
        // A Wikipedia link is an article page only.
        return !host.endsWith("wikipedia.org") || WIKI_ARTICLE.matches(url)
    }

    private fun clean(raw: String?, max: Int): String =
        (raw ?: "").replace(CONTROL_RE, " ").replace(SPACES_RE, " ").trim().take(max)

    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

    private fun entityOf(raw: JsonElement?): MediaBlock.Entity? {
        val o = raw as? JsonObject ?: return null
        val name = clean(o.str("name"), 80)
        val summary = clean(o.str("summary"), 700)
        val href = o.str("href")
        if (name.isEmpty() || summary.isEmpty() || !isAllowedPage(href)) return null
        val image = o.str("image")?.takeIf { isAllowedImage(it) }
        return MediaBlock.Entity(name, summary, image, href!!)
    }

    /** Re-validates one decoded block. Anything not allowed is dropped; nothing valid left → null. */
    internal fun sanitize(raw: JsonElement): MediaBlock? {
        val r = raw as? JsonObject ?: return null
        if ((r["v"] as? JsonPrimitive)?.intOrNull != 1) return null
        return when (r.str("kind")) {
            "news" -> {
                val items = (r["items"] as? JsonArray).orEmpty().mapNotNull { x ->
                    val o = x as? JsonObject ?: return@mapNotNull null
                    val src = o.str("src")
                    val href = o.str("href")
                    if (!isAllowedImage(src) || !isAllowedPage(href)) return@mapNotNull null
                    MediaBlock.NewsItem(
                        src = src!!,
                        href = href!!,
                        label = clean(o.str("label"), 40).ifEmpty { safeHttpsHost(href).orEmpty() },
                        title = clean(o.str("title"), 160),
                    )
                }.take(MAX_NEWS_ITEMS)
                items.takeIf { it.isNotEmpty() }?.let(MediaBlock::News)
            }
            "entity" -> entityOf(r["entity"])?.let { MediaBlock.Entities(listOf(it)) }
            "entities" -> {
                val seen = HashSet<String>()
                val entities = (r["entities"] as? JsonArray).orEmpty()
                    .mapNotNull(::entityOf)
                    .filter { seen.add(it.href) }
                    .take(MAX_ENTITIES)
                entities.takeIf { it.isNotEmpty() }?.let(MediaBlock::Entities)
            }
            else -> null
        }
    }

    data class Parsed(val text: String, val blocks: List<MediaBlock>)

    /**
     * Removes every `[TAPPY_MEDIA]` block from [content] — complete, malformed, or still arriving —
     * and returns the valid ones. Stripping never depends on whether the JSON parsed.
     */
    fun parse(content: String): Parsed {
        if (!content.contains("TAPPY_MEDIA]", ignoreCase = true)) return Parsed(content, emptyList())
        val blocks = ArrayList<MediaBlock>()
        val text = BLOCK_RE.replace(content) { m ->
            runCatching { sanitize(json.parseToJsonElement(m.groupValues[1].trim())) }.getOrNull()?.let(blocks::add)
            ""
        }
        return Parsed(PARTIAL_RE.replace(text, "").trimEnd(), blocks)
    }
}

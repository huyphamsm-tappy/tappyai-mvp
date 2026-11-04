package com.tappyai.app.chat

import java.net.URLDecoder

// Owner 01/11 (Android = the web): "nghiêm cấm không được sử dụng nguồn của bất cứ AI nào" - another AI product's answer or chat page (AIHAY at
// ai-hay.vn and its app, ChatGPT, Perplexity, Gemini, Claude...) is never a source. The server already filters every source (web
// src/lib/security/aiSourcePolicy.ts) and its link guard keeps only the links a tool returned; this is the same rule on the phone as a second
// line, for a link that reached the client anyway (an old saved reply, a frame). A port of the web policy: a host list (a domain and every
// subdomain), a few chat paths of general hosts, the app-store pages that name the product, the forms an address really arrives in (scheme-less,
// protocol-relative, wrapped by a redirector, an archive or a page reader). A company's own site (its blog, its announcements) stays a source.
internal object AiSourcePolicy {
    private val HOSTS = listOf(
        "aihay.vn", "aihay.net", "aihay.com", "aihay.ai", "aihay.org", "aihay.app", "ai-hay.vn", "ai-hay.com", "ai-hay.net",
        "chatgpt.com", "chat.openai.com", "perplexity.ai",
        "gemini.google.com", "bard.google.com", "notebooklm.google.com", "aistudio.google.com",
        "claude.ai", "copilot.microsoft.com", "poe.com", "grok.com", "chat.deepseek.com", "you.com", "phind.com", "meta.ai", "character.ai",
        "chat.mistral.ai", "kimi.com", "kimi.ai", "chat.qwen.ai", "duck.ai",
    )
    private val PATHS = listOf("bing.com" to Regex("""^/chat(?:/|$)""", RegexOption.IGNORE_CASE), "huggingface.co" to Regex("""^/chat(?:/|$)""", RegexOption.IGNORE_CASE))
    private val APP_STORES = listOf("play.google.com", "apps.apple.com", "itunes.apple.com", "galaxy.store", "appgallery.huawei.com")
    private val BRAND = Regex("""ai[-_]?hay""", RegexOption.IGNORE_CASE)
    private val URL_RE = Regex("""^(https?)://([^/?#]*)([^?#]*)(?:\?([^#]*))?""", RegexOption.IGNORE_CASE)
    private val SCHEME_RE = Regex("""^[a-z][a-z0-9+.-]*:""", RegexOption.IGNORE_CASE)
    private val BARE_HOST_RE = Regex("""^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#]|$)""", RegexOption.IGNORE_CASE)
    private val GOOGLE_HOST = Regex("""^(?:[a-z0-9-]+\.)*google\.[a-z.]+$""")

    private class Parsed(val host: String, val path: String, val query: String)

    private fun parse(raw: String): Parsed? {
        var s = raw.trim().split(Regex("""\s+""")).firstOrNull().orEmpty()
        if (s.isEmpty()) return null
        if (s.startsWith("//")) s = "https:$s"
        else if (!SCHEME_RE.containsMatchIn(s) && BARE_HOST_RE.containsMatchIn(s)) s = "https://$s"
        val m = URL_RE.find(s) ?: return null
        val authority = m.groupValues[2].substringAfterLast('@')
        val host = (if (authority.startsWith("[")) authority else authority.substringBefore(':')).lowercase().trimEnd('.')
        if (host.isEmpty()) return null
        return Parsed(host, m.groupValues[3], m.groupValues[4])
    }

    private fun onHost(h: String, d: String) = h == d || h.endsWith(".$d")

    private fun param(query: String, name: String): String? = query.split('&').firstNotNullOfOrNull { kv ->
        val k = kv.substringBefore('=')
        if (k == name) runCatching { URLDecoder.decode(kv.substringAfter('=', ""), "UTF-8") }.getOrNull() else null
    }

    /** The address a redirector, an archive or a page reader wraps, or null. Only these known wrappers. */
    private fun innerOf(u: Parsed): String? {
        val h = u.host
        if (GOOGLE_HOST.matches(h) && (u.path == "/url" || u.path.startsWith("/goto"))) {
            val v = param(u.query, "q") ?: param(u.query, "url")
            return v?.takeIf { it.startsWith("http", ignoreCase = true) }
        }
        if (h == "webcache.googleusercontent.com") return Regex("""cache:(?:[\w-]+:)?(https?://.+)$""", RegexOption.IGNORE_CASE).find(param(u.query, "q").orEmpty())?.groupValues?.get(1)
        if (h == "r.jina.ai") return (u.path.removePrefix("/") + if (u.query.isEmpty()) "" else "?${u.query}").takeIf { it.startsWith("http", ignoreCase = true) }
        if (h == "web.archive.org" || h == "archive.org") return Regex("""/web/\d+[a-z_]*/(https?://.*)$""", RegexOption.IGNORE_CASE).find(u.path + if (u.query.isEmpty()) "" else "?${u.query}")?.groupValues?.get(1)
        return null
    }

    /** True when the address is a page of another AI product (its domain, a chat path of a general host, its app's store page, or any of those wrapped). */
    fun isAiProductSource(url: String, depth: Int = 0): Boolean {
        val u = parse(url) ?: return false
        if (HOSTS.any { onHost(u.host, it) }) return true
        if (PATHS.any { (d, re) -> onHost(u.host, d) && re.containsMatchIn(u.path) }) return true
        if (APP_STORES.any { onHost(u.host, it) }) {
            val raw = u.path + if (u.query.isEmpty()) "" else "?${u.query}"
            val decoded = runCatching { URLDecoder.decode(raw, "UTF-8") }.getOrDefault(raw)
            if (BRAND.containsMatchIn(raw) || BRAND.containsMatchIn(decoded)) return true
        }
        if (depth < 2) innerOf(u)?.let { return isAiProductSource(it, depth + 1) }
        return false
    }

    private val MD_LINK = Regex("""\[([^\]\n]*)]\(([^)\s]+)\)""")
    private val BARE_URL = Regex("""https?://[^\s)\]]+""")

    /** The text with a link to an AI product's page reduced to its label and a bare address of one removed; every other link is untouched. */
    fun stripAiLinks(text: String): String {
        if (!text.contains("http", ignoreCase = true) && !text.contains("](")) return text
        val noMd = MD_LINK.replace(text) { m -> if (isAiProductSource(m.groupValues[2])) m.groupValues[1] else m.value }
        return BARE_URL.replace(noMd) { m -> if (isAiProductSource(m.value)) "" else m.value }
    }
}

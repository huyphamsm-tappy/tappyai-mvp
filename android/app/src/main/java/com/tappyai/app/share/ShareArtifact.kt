package com.tappyai.app.share

import com.tappyai.app.chat.TappyPlan
import java.net.URI
import java.text.NumberFormat
import java.util.Locale

/**
 * The one canonical TappyAI share artifact — a port of `src/lib/share/shareArtifact.ts`.
 *
 * 🔑 SAME INPUT, SAME TEXT AS THE WEB. The brochure format is deliberately byte-identical to
 * the web builder for the same `PlacesLiveView`, so a recommendation shared from Android and
 * one shared from the web look like they came from the same product — because they did.
 *
 * 🚨 WHITELIST, NEVER BLACKLIST. [SharedPlace] names every field that may leave the app and
 * [pickPlace] copies exactly those. Provenance, evidence types, ranks, entity ids, `_tappy_*`
 * and conversation ids have no field to land in.
 *
 * 🚨 NO `distanceKm`. It is a fact about the SENDER's position (privacy), so it is not in the
 * whitelist and cannot be shared.
 */
data class ShareArtifact(
    val kind: Kind,
    val title: String,
    val subject: String,
    val text: String,
    /**
     * The brand entry point for a recommendation, or — once the share sheet has published a
     * plan — the plan's own canonical page `https://www.tappyai.com/plan/<shareId>`.
     */
    val url: String,
    val places: List<SharedPlace>,
    /**
     * For a plan: the `[TAPPY_PLAN]` block verbatim, the payload `POST /api/plans/share` takes.
     * Null for a recommendation, and null for a plan that arrived without its block (a restored
     * message), which then cannot be published and says so.
     */
    val planJson: String? = null,
    /** True once [url] is the plan's published page rather than the brand entry point. */
    val isPlanLink: Boolean = false,
) {
    enum class Kind { PLACES, PLAN }
}

data class SharedPlace(
    val name: String,
    val category: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val address: String? = null,
    val phone: String? = null,
    val openingHours: String? = null,
    val priceRangeText: String? = null,
    val reasons: List<String> = emptyList(),
    val links: List<SharedLink> = emptyList(),
    val image: String? = null,
)

data class SharedLink(val kind: String, val url: String, val platform: String? = null)

object ShareArtifactBuilder {
    /** chat_messages.body CHECK constraint on the web Inbox; text handoffs use the same bound. */
    const val INBOX_MAX_BODY = 4000

    private val SHARED_ACTION_KINDS = setOf("maps", "website", "review", "order", "booking", "ticket", "reservation")

    private class Labels(
        val recommends: String, val plan: String, val reviews: String, val why: String,
        val maps: String, val website: String, val review: String, val order: String,
        val booking: String, val ticket: String, val reservation: String,
        val more: String, val footer: String, val people: String, val budget: String,
    )

    private val VI = Labels(
        recommends = "TappyAI gợi ý", plan = "Kế hoạch từ TappyAI", reviews = "đánh giá", why = "Vì sao",
        maps = "Bản đồ", website = "Website", review = "Review", order = "Đặt món",
        booking = "Đặt phòng", ticket = "Mua vé", reservation = "Đặt chỗ",
        more = "và {n} địa điểm khác", footer = "Gợi ý bởi TappyAI · {url}", people = "{n} người", budget = "Ngân sách",
    )
    private val EN = Labels(
        recommends = "TappyAI recommends", plan = "A plan from TappyAI", reviews = "reviews", why = "Why",
        maps = "Maps", website = "Website", review = "Review", order = "Order",
        booking = "Book", ticket = "Tickets", reservation = "Reserve",
        more = "and {n} more", footer = "Recommended by TappyAI · {url}", people = "{n} people", budget = "Budget",
    )

    private fun labels(lang: String) = if (lang.startsWith("en")) EN else VI

    /** Same rule as the web `isSafeHttpsUrl` for what this module needs: https, parseable, has a host. */
    fun isSafeHttpsUrl(raw: String?): Boolean {
        if (raw.isNullOrBlank()) return false
        val u = runCatching { URI(raw) }.getOrNull() ?: return false
        return u.scheme.equals("https", ignoreCase = true) && !u.host.isNullOrBlank()
    }

    fun pickPlace(p: LivePlace): SharedPlace {
        val seen = HashSet<String>()
        val links = p.actions.mapNotNull { a ->
            if (a.kind !in SHARED_ACTION_KINDS) return@mapNotNull null
            if (a.urlKind != "direct") return@mapNotNull null
            if (!isSafeHttpsUrl(a.url) || !seen.add(a.url)) return@mapNotNull null
            SharedLink(kind = a.kind, url = a.url, platform = a.platform)
        }
        return SharedPlace(
            name = p.name,
            category = p.categories.firstOrNull(),
            rating = p.rating,
            ratingCount = p.ratingCount,
            address = p.address,
            phone = p.phone,
            openingHours = p.openingHours,
            priceRangeText = p.priceRangeText,
            reasons = p.reasons.filter { it.isNotBlank() },
            links = links,
            image = p.image?.takeIf { isSafeHttpsUrl(it) },
        )
    }

    private fun linkLabel(l: Labels, link: SharedLink): String {
        val base = when (link.kind) {
            "maps" -> l.maps; "website" -> l.website; "review" -> l.review; "order" -> l.order
            "booking" -> l.booking; "ticket" -> l.ticket; "reservation" -> l.reservation
            else -> link.kind
        }
        val platform = link.platform?.takeIf { it.trim().lowercase() !in GENERIC_PLATFORMS }
        return if (platform != null) "$base ($platform)" else base
    }

    /** Platform names that only restate the link kind — "Website (Official Website)" says nothing twice. */
    private val GENERIC_PLATFORMS = setOf("website", "official website", "maps", "google maps")

    private fun fmtCount(n: Int, lang: String): String =
        NumberFormat.getIntegerInstance(if (lang.startsWith("en")) Locale.US else Locale("vi", "VN")).format(n)

    /** One place as brochure lines — identical layout to the web `placeBlock`. */
    fun placeBlock(p: SharedPlace, index: Int, lang: String): String {
        val l = labels(lang)
        val lines = ArrayList<String>()
        lines += "${index + 1}. ${p.name}"
        val meta = ArrayList<String>()
        p.rating?.let { r ->
            val count = p.ratingCount?.let { " (${fmtCount(it, lang)} ${l.reviews})" } ?: ""
            meta += "★ ${fmtRating(r)}$count"
        }
        p.category?.let { meta += it }
        p.priceRangeText?.let { meta += it }
        if (meta.isNotEmpty()) lines += "   ${meta.joinToString(" · ")}"
        p.address?.let { lines += "   📍 $it" }
        p.openingHours?.let { lines += "   🕐 $it" }
        p.phone?.let { lines += "   ☎ $it" }
        if (p.reasons.isNotEmpty()) lines += "   ${l.why}: ${p.reasons.joinToString(" · ")}"
        for (link in p.links) lines += "   ${linkLabel(l, link)}: ${link.url}"
        return lines.joinToString("\n")
    }

    /** 4.0 prints as "4", 4.5 as "4.5" — the same as JavaScript's number-to-string. */
    private fun fmtRating(r: Double): String =
        if (r == Math.floor(r)) r.toInt().toString() else r.toString()

    private fun footer(l: Labels, url: String) = l.footer.replace("{url}", url.removePrefix("https://").removePrefix("http://"))

    fun placesBrochure(title: String, places: List<SharedPlace>, lang: String, url: String): String {
        val l = labels(lang)
        val parts = ArrayList<String>()
        parts += "${l.recommends}: $title"
        parts += ""
        places.forEachIndexed { i, p -> parts += placeBlock(p, i, lang); parts += "" }
        parts += footer(l, url)
        return parts.joinToString("\n")
    }

    /**
     * The plan brochure. Structure from `days[].items[]`; `shareText` may contribute one
     * introductory line only when it is short and carries no URL.
     */
    fun planBrochure(plan: TappyPlan, lang: String, url: String): String {
        val l = labels(lang)
        val parts = ArrayList<String>()
        parts += "${l.plan}: ${plan.title}"
        val intro = plan.shareText?.trim().orEmpty()
        if (intro.isNotEmpty() && intro.length <= 160 && !Regex("https?://", RegexOption.IGNORE_CASE).containsMatchIn(intro)) parts += intro
        val facts = ArrayList<String>()
        plan.people?.let { facts += l.people.replace("{n}", it.toString()) }
        plan.budgetTotal?.let { facts += "${l.budget}: $it" }
        if (facts.isNotEmpty()) parts += facts.joinToString(" · ")
        parts += ""
        for (day in plan.days) {
            parts += day.label
            for (it in day.items) {
                parts += "  " + listOf(it.time, it.emoji, it.name).filter { s -> s.isNotBlank() }.joinToString(" ")
                it.description?.takeIf { d -> d.isNotBlank() }?.let { d -> parts += "     $d" }
                val extra = ArrayList<String>()
                it.price?.takeIf { s -> s.isNotBlank() }?.let { s -> extra += s }
                it.address?.takeIf { s -> s.isNotBlank() }?.let { s -> extra += "📍 $s" }
                if (extra.isNotEmpty()) parts += "     ${extra.joinToString(" · ")}"
                it.mapsLink?.takeIf { s -> isSafeHttpsUrl(s) }?.let { s -> parts += "     ${l.maps}: $s" }
                it.bookingLink?.takeIf { s -> isSafeHttpsUrl(s) }?.let { s -> parts += "     ${l.booking}: $s" }
            }
            parts += ""
        }
        parts += footer(l, url)
        return parts.joinToString("\n")
    }

    /** Fit within [max] without ever cutting a URL — same strategy as the web `compactBrochure`. */
    fun compactBrochure(title: String, places: List<SharedPlace>, lang: String, url: String, max: Int = INBOX_MAX_BODY): String {
        val full = placesBrochure(title, places, lang, url)
        if (full.length <= max) return full
        val l = labels(lang)
        val head = "${l.recommends}: $title"
        val foot = footer(l, url)
        var kept = places.size
        while (kept > 0) {
            val shown = places.take(kept)
            val more = places.size - kept
            val body = buildList {
                add(head); add("")
                shown.forEachIndexed { i, p -> add(placeBlock(p, i, lang) + "\n") }
                if (more > 0) add(l.more.replace("{n}", more.toString()) + "\n")
                add(foot)
            }.joinToString("\n")
            if (body.length <= max) return body
            kept--
        }
        val p = places.first()
        val slim = SharedPlace(
            name = p.name, address = p.address, rating = p.rating, ratingCount = p.ratingCount, category = p.category,
            links = p.links.filter { it.kind == "maps" }.take(1),
        )
        val more = places.size - 1
        val body = listOf(head, "", placeBlock(slim, 0, lang), "", if (more > 0) l.more.replace("{n}", more.toString()) else "", foot).joinToString("\n")
        return if (body.length <= max) body else listOf(head, "", "1. ${p.name}", "", foot).joinToString("\n").take(max)
    }

    fun buildPlacesArtifact(view: PlacesLiveView, title: String, lang: String): ShareArtifact {
        val url = TappyShare.CANONICAL_ORIGIN
        val places = view.items.map(::pickPlace)
        val l = labels(lang)
        return ShareArtifact(
            kind = ShareArtifact.Kind.PLACES, title = title, subject = "${l.recommends}: $title",
            text = placesBrochure(title, places, lang, url), url = url, places = places,
        )
    }

    fun buildPlanArtifact(plan: TappyPlan, lang: String, planJson: String? = null): ShareArtifact {
        val url = TappyShare.CANONICAL_ORIGIN
        val l = labels(lang)
        return ShareArtifact(
            kind = ShareArtifact.Kind.PLAN, title = plan.title, subject = "${l.plan}: ${plan.title}",
            text = planBrochure(plan, lang, url), url = url, places = emptyList(), planJson = planJson,
        )
    }

    /**
     * The plan artifact once the server has published it: the canonical page is the payload.
     *
     * 🔑 THE LINK IS THE BROCHURE. `/plan/<shareId>` renders the real Tappy Plan brochure with
     * the plan's own photos and dynamic OG metadata, so every platform gets the URL — its own
     * preview machinery does the rest — plus one human line naming the plan. Nothing here
     * re-describes the itinerary: that would be a second brochure, and it would drift.
     *
     * Same text on every channel (ACTION_SEND, mailto, the system sheet, the Inbox) and the
     * exact URL on the url handoffs (Facebook sharer, Zalo plugin, Messenger) and on Copy.
     */
    fun planLinkArtifact(base: ShareArtifact, canonicalUrl: String): ShareArtifact {
        require(base.kind == ShareArtifact.Kind.PLAN) { "planLinkArtifact needs a plan artifact" }
        return base.copy(
            url = canonicalUrl,
            text = "${base.subject}\n$canonicalUrl",
            isPlanLink = true,
        )
    }

    /**
     * Prose → share text (same rules as the web `proseForShare`): emphasis and headings go, a
     * markdown link keeps its destination as `label: url` when it passes the guard, images go.
     */
    fun proseForShare(text: String): String = text
        .replace(Regex("!\\[[^\\]]*]\\([^)]*\\)"), "")
        .replace(Regex("\\*\\*(.*?)\\*\\*"), "$1")
        .replace(Regex("\\*(.*?)\\*"), "$1")
        .replace(Regex("#{1,3}\\s"), "")
        .replace(Regex("\\[([^\\]]+)]\\(([^)\\s]+)\\)")) { m -> if (isSafeHttpsUrl(m.groupValues[2])) "${m.groupValues[1]}: ${m.groupValues[2]}" else m.groupValues[1] }
        .replace(Regex("(^|\\s)(https?://\\S+)")) { m -> if (isSafeHttpsUrl(m.groupValues[2])) m.value else m.groupValues[1] }
        .replace(Regex("[ \\t]+\n"), "\n")
        .replace(Regex("\n{3,}"), "\n\n")
        .trim()

    /** A turn with no card and no plan: the prose, under the TappyAI header. Strictly more than before. */
    fun buildProseArtifact(subject: String, prose: String): ShareArtifact {
        val url = TappyShare.CANONICAL_ORIGIN
        return ShareArtifact(
            kind = ShareArtifact.Kind.PLACES, title = subject, subject = "TappyAI: $subject",
            text = "TappyAI\n\n${proseForShare(prose)}\n\n— TappyAI · tappyai.com", url = url, places = emptyList(),
        )
    }

    /** The Inbox/handoff-safe body: same content, bounded, URLs intact. */
    fun inboxBody(a: ShareArtifact, lang: String): String {
        if (a.kind == ShareArtifact.Kind.PLACES && a.places.isNotEmpty()) return compactBrochure(a.title, a.places, lang, a.url)
        if (a.text.length <= INBOX_MAX_BODY) return a.text
        val lines = a.text.split("\n")
        val foot = lines.last()
        val out = ArrayList<String>()
        var len = foot.length + 1
        for (line in lines.dropLast(1)) {
            if (len + line.length + 1 > INBOX_MAX_BODY) break
            out += line; len += line.length + 1
        }
        return (out + foot).joinToString("\n")
    }
}

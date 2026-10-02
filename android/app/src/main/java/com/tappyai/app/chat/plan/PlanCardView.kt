package com.tappyai.app.chat.plan

import com.tappyai.app.chat.PlanPrice
import com.tappyai.app.chat.TappyPlan

/**
 * Plan card v2 — the pure half (owner 29/09, sample `docs/design/share-layouts/plan-share.png`,
 * "Quy Nhơn 3 ngày 2 đêm"): what the card shows, decided from the [TappyPlan] alone, so it is
 * JVM-testable and the Compose side only draws.
 *
 * Three rules the owner fixed and this file enforces:
 *  1. IMAGES: only the image keys STORED in the plan (`hero_image`, `items[].image`,
 *     `highlights[].image`) are shown, resolved to a URL through the image manifest. The app never
 *     picks, guesses or randomises a picture — a stop's Google `photo_url` is NOT used here. A key
 *     the manifest cannot serve (or no key at all) draws the gradient placeholder of the plan's area.
 *  2. MONEY: only the figures the server wrote. A stop whose price is not an amount reads exactly
 *     [NO_PRICE]; nothing is summed, divided or estimated on the device.
 *  3. ALL FIVE AREAS use the same frame. A non-travel plan is one session ("Tối nay") with times of
 *     day — one day block, the same timeline, overview, highlights and call to action.
 */
enum class PlanArea(val slug: String, val emoji: String) {
    TRAVEL("du-lich", "✈️"),
    FOOD("an-uong", "🍜"),
    ENTERTAINMENT("giai-tri", "🎉"),
    SHOPPING("mua-sam", "🛍️"),
    SPA("spa", "💆");

    companion object {
        /**
         * The server's `domain` first; else the planning intent it already writes into `type`
         * ("trip" → travel, "evening" → entertainment, the mapping of `frameDomainOf`); else travel,
         * the only area that had plan cards before v2.
         */
        fun of(plan: TappyPlan): PlanArea = when (plan.domain?.trim()?.lowercase()) {
            "travel", "hotel", "flight" -> TRAVEL
            "food" -> FOOD
            "entertainment" -> ENTERTAINMENT
            "shopping" -> SHOPPING
            "spa" -> SPA
            else -> when (plan.type?.trim()?.lowercase()) {
                "evening" -> ENTERTAINMENT
                else -> TRAVEL
            }
        }

        fun ofSlug(slug: String): PlanArea? = entries.firstOrNull { it.slug == slug }
    }
}

/**
 * Image keys (owner 29/09): a background is `<mang>-<kieu>-N` (16:9, e.g. `du-lich-bien-1`), a stop
 * type is `diem-<loai>` (1:1, e.g. `diem-hai-san`). Lower-case ASCII, dash-separated — a key is a
 * NAME, never a URL, so a value that is not a well-formed key is treated as absent.
 */
object PlanImageKeys {
    private val SEG = "[a-z0-9]+"
    private val HERO = Regex("^(du-lich|an-uong|giai-tri|mua-sam|spa)(-$SEG)+-[0-9]+$")
    private val STOP = Regex("^diem(-$SEG)+$")

    fun isHero(key: String?): Boolean = key != null && HERO.matches(key)
    fun isStop(key: String?): Boolean = key != null && STOP.matches(key)
    fun isKey(key: String?): Boolean = isHero(key) || isStop(key)

    /** The area a hero key names (`du-lich-bien-1` → TRAVEL), for its placeholder gradient. */
    fun areaOf(key: String?): PlanArea? =
        if (!isHero(key)) null else PlanArea.entries.firstOrNull { key!!.startsWith(it.slug + "-") }
}

const val NO_PRICE = "chưa có giá — hỏi quán"

data class PlanCardView(
    val area: PlanArea,
    /** Hero image key, or null → placeholder. */
    val heroKey: String?,
    val title: String,
    val destination: String?,
    val duration: String?,
    val people: Int?,
    val tagline: String?,
    val days: List<Day>,
    val overview: List<OverviewRow>,
    val highlights: List<Highlight>,
) {
    data class Day(val number: Int, val label: String, val title: String?, val stops: List<Stop>)
    data class Stop(
        val time: String,
        val imageKey: String?,
        val emoji: String,
        val name: String,
        val description: String?,
        val address: String?,
        /** The server's amount, or [NO_PRICE]. */
        val price: String,
        val priced: Boolean,
        val mapsLink: String?,
        val bookingLink: String?,
    )
    enum class OverviewKind { DESTINATION, DURATION, PEOPLE, BUDGET }
    data class OverviewRow(val kind: OverviewKind, val value: String, val sub: String? = null)
    data class Highlight(val label: String, val imageKey: String?)
}

/** At most this many "Điểm nổi bật" tiles (the sample's 2×2 grid). */
const val PLAN_MAX_HIGHLIGHTS = 4

/**
 * The card for [plan]. Prices go through [PlanPrice] (the same projection the parser applies), so a
 * sentinel like "chưa có giá" never lands in a price slot; a stop without an amount reads [NO_PRICE].
 */
fun planCardViewOf(plan: TappyPlan): PlanCardView {
    val area = PlanArea.of(plan)
    val days = plan.days
        .map { d -> d to d.items.filter { it.name.isNotBlank() } }
        .filter { (_, items) -> items.isNotEmpty() }
        .mapIndexed { i, (d, items) ->
            PlanCardView.Day(
                number = i + 1,
                label = d.label.trim(),
                title = d.title?.trim()?.takeIf { it.isNotEmpty() },
                stops = items.map { it ->
                    val amount = PlanPrice.amount(it.price)
                    PlanCardView.Stop(
                        time = it.time.trim(),
                        imageKey = it.image?.trim()?.takeIf(PlanImageKeys::isKey),
                        emoji = it.emoji.ifBlank { "📍" },
                        name = it.name.trim(),
                        description = it.description?.trim()?.takeIf { d -> d.isNotEmpty() },
                        address = it.address?.trim()?.takeIf { a -> a.isNotEmpty() && a != "Xem bản đồ" },
                        price = amount ?: NO_PRICE,
                        priced = amount != null,
                        mapsLink = it.mapsLink?.takeIf { l -> l.startsWith("https://") },
                        bookingLink = it.bookingLink?.takeIf { l -> l.startsWith("https://") },
                    )
                },
            )
        }
    val destination = plan.destination?.trim()?.takeIf { it.isNotEmpty() }
    val duration = plan.duration?.trim()?.takeIf { it.isNotEmpty() }
    val people = plan.people?.takeIf { it > 0 }
    val budget = PlanPrice.amount(plan.budgetTotal)
    val perPerson = PlanPrice.amount(plan.budgetPerPerson)
    val overview = buildList {
        destination?.let { add(PlanCardView.OverviewRow(PlanCardView.OverviewKind.DESTINATION, it)) }
        duration?.let { add(PlanCardView.OverviewRow(PlanCardView.OverviewKind.DURATION, it)) }
        people?.let { add(PlanCardView.OverviewRow(PlanCardView.OverviewKind.PEOPLE, it.toString())) }
        // Only the server's numbers: the total, and its per-person line when the server wrote one.
        budget?.let { add(PlanCardView.OverviewRow(PlanCardView.OverviewKind.BUDGET, it, perPerson)) }
    }
    return PlanCardView(
        area = area,
        heroKey = plan.heroImage?.trim()?.takeIf(PlanImageKeys::isHero),
        title = plan.title.trim(),
        destination = destination,
        duration = duration,
        people = people,
        tagline = (plan.tagline ?: plan.shareText)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 160 && !it.contains("://") },
        days = days,
        overview = overview,
        highlights = plan.highlights.orEmpty()
            .filter { it.label.isNotBlank() }
            .take(PLAN_MAX_HIGHLIGHTS)
            .map { PlanCardView.Highlight(it.label.trim(), it.image?.trim()?.takeIf(PlanImageKeys::isKey)) },
    )
}

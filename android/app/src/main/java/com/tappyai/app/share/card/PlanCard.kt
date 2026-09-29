package com.tappyai.app.share.card

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.tappyai.app.chat.TappyPlan
import java.net.URI
import kotlin.math.ceil
import kotlin.math.min

/**
 * The PLAN share image — port of web `src/lib/share/planCard.ts` (sample #7, "TAPPY PLAN"): navy
 * ground, the plan's own photo as the BACKGROUND of the whole top (or a gradient band when there is
 * none), the eyebrow + title + real counts, a numbered day timeline, "Điểm nổi bật" (≥ 2 photos),
 * the overview box, the blue→violet CTA pill carrying the plan link, and "Được tạo bởi TappyAI".
 *
 * 🚨 THE IMAGE RULE (same as /plan/<id>): a photo appears ONLY when the stop carries a canonical
 * place photo ([isPlanPhotoUrl]). No photo → no image frame, no stock art.
 */
data class PlanCardData(
    val title: String,
    val days: List<Day>,
    val people: Int? = null,
    val budgetTotal: String? = null,
    val summary: String? = null,
) {
    data class Day(val label: String, val items: List<Item>)
    data class Item(val time: String?, val name: String, val description: String?, val address: String?, val photoUrl: String?)
}

private val PHOTO_HOSTS = listOf("googleusercontent.com", "gstatic.com", "ggpht.com")

/** Web `isPlanPhotoUrl`: https on a Google place-photo host — never TappyAI's own media bucket. */
fun isPlanPhotoUrl(value: String?): Boolean {
    if (value.isNullOrBlank() || !value.startsWith("https://")) return false
    val host = runCatching { URI(value).host?.lowercase() }.getOrNull() ?: return false
    return PHOTO_HOSTS.any { host == it || host.endsWith(".$it") }
}

private const val MAX_SUMMARY = 160

/** The snapshot of a chat plan, with the web snapshot's bounds and photo rule. Null when it has no stop. */
fun planCardDataOf(plan: TappyPlan): PlanCardData? {
    val days = plan.days.take(10).mapIndexedNotNull { i, d ->
        val items = d.items.filter { it.name.isNotBlank() }.take(12).map {
            PlanCardData.Item(
                time = it.time.trim().takeIf { t -> t.isNotEmpty() },
                name = it.name.trim(),
                description = it.description?.trim()?.takeIf { t -> t.isNotEmpty() },
                address = it.address?.trim()?.takeIf { t -> t.isNotEmpty() },
                photoUrl = it.photoUrl?.takeIf(::isPlanPhotoUrl),
            )
        }
        if (items.isEmpty()) null else PlanCardData.Day(d.label.trim().ifEmpty { (i + 1).toString() }, items)
    }
    if (days.isEmpty() || plan.title.isBlank()) return null
    val summary = plan.shareText?.trim()?.takeIf { it.isNotEmpty() && it.length <= MAX_SUMMARY && !Regex("https?://", RegexOption.IGNORE_CASE).containsMatchIn(it) }
    return PlanCardData(
        title = plan.title.trim(),
        days = days,
        people = plan.people?.takeIf { it in 1..999 },
        budgetTotal = plan.budgetTotal?.trim()?.takeIf { it.isNotEmpty() },
        summary = summary,
    )
}

/** Plan labels in the viewer's language (web `planBrochureStrings`). */
data class PlanCardStrings(
    val eyebrow: String, val itinerary: String, val overview: String, val highlights: String,
    val days: String, val stops: String, val people: String, val budget: String,
    val cta: String, val madeBy: String, val madeByLine: String, val durationLabel: String, val partyLabel: String,
) {
    companion object {
        val VI = PlanCardStrings("Tappy Plan", "Hành trình", "Tổng quan chuyến đi", "Điểm nổi bật", "{n} ngày", "{n} điểm dừng", "{n} người",
            "Ngân sách ước tính", "Xem kế hoạch đầy đủ trên Tappy", "Được tạo bởi", "Một chuyến đi, theo cách của bạn.", "Thời gian", "Số người")
        val EN = PlanCardStrings("Tappy Plan", "Itinerary", "Trip overview", "Highlights", "{n} days", "{n} stops", "{n} people",
            "Estimated budget", "See the full plan on Tappy", "Created by", "One trip, your way.", "Duration", "Travellers")
        fun of(lang: String) = if (lang == "en") EN else VI
    }
}

/** Web `fill`: "{n} ngày"; English singulars for 1. */
internal fun fillN(template: String, n: Any): String {
    val s = template.replace("{n}", n.toString())
    if (n.toString() != "1") return s
    return s.replace(Regex("\\b(days|stops|people)\\b")) { m -> mapOf("days" to "day", "stops" to "stop", "people" to "person")[m.value] ?: m.value }
}

object PlanCard {
    const val PLAN_CARD_DAYS = 3
    const val PLAN_CARD_STOPS = 4
    private const val W = 1080f
    private const val P = 60f
    private const val TOP_BAR = 120f
    private const val HERO_H = 640f
    private const val PHOTO_HERO_H = 1000f
    private const val STOP_H = 128f
    private const val DAY_HEAD = 96f
    private const val TILE_H = 280f
    private const val TILE_GAP = 24f

    data class Highlight(val name: String, val photo: String)

    /** Web `brochureOf`: distinct stop photos in order (≤ 4); the hero is the first. */
    fun highlightsOf(s: PlanCardData): List<Highlight> {
        val seen = HashSet<String>()
        val out = mutableListOf<Highlight>()
        for (it in s.days.flatMap { d -> d.items }) {
            val ph = it.photoUrl ?: continue
            if (!seen.add(ph)) continue
            out += Highlight(it.name, ph)
            if (out.size == 4) break
        }
        return out
    }

    fun heroBottom(hasPhoto: Boolean): Float = if (hasPhoto) PHOTO_HERO_H else TOP_BAR + HERO_H

    private fun highlightsHeight(n: Int): Float {
        if (n < 2) return 0f
        val rows = ceil(min(n, 4) / 2.0).toInt()
        return 40f + 70f + rows * (TILE_H + 56f) + (rows - 1) * TILE_GAP
    }

    /** Height of the card for a snapshot — pure, so the layout is testable without a canvas. */
    fun height(s: PlanCardData): Int {
        val highlights = highlightsOf(s)
        val days = s.days.take(PLAN_CARD_DAYS)
        val body = days.fold(0f) { h, d -> h + DAY_HEAD + min(d.items.size, PLAN_CARD_STOPS) * STOP_H + (if (d.items.size > PLAN_CARD_STOPS) 44f else 0f) + 24f }
        val moreDays = if (s.days.size > PLAN_CARD_DAYS) 50f else 0f
        val overview = 60f + 3 * 64f + 40f
        return (heroBottom(highlights.isNotEmpty()) + 60f + 70f + body + moreDays + highlightsHeight(highlights.size) + 30f + overview + 40f + 100f + 60f + 110f).toInt()
    }

    private fun pad2(n: Int) = n.toString().padStart(2, '0')

    fun render(context: Context, s: PlanCardData, url: String, str: PlanCardStrings, images: CardImageLoader = HttpCardImageLoader): Bitmap? = runCatching {
        val highlights = highlightsOf(s)
        val hero = highlights.firstOrNull()?.photo
        val dayCount = s.days.size
        val stopCount = s.days.sumOf { it.items.size }
        val H = height(s).toFloat()
        val bmp = Bitmap.createBitmap(W.toInt(), H.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawRect(0f, 0f, W, H, linear(0f, 0f, 0f, H, 0f to Dark.groundDeep, 0.4f to Dark.ground, 1f to Dark.groundEnd))

        val mark = CardAssets.mark(context)
        val heroImg = hero?.let { images.load(it, 1080, 5000) }
        val heroTop = if (hero != null) 0f else TOP_BAR
        val heroBottom = heroBottom(hero != null)

        // ── Hero: the photo as the card's background (poster), else the text-only gradient band ──
        if (heroImg != null) {
            c.drawCover(heroImg, 0f, 0f, W, heroBottom, 0f)
            c.drawRect(0f, 0f, W, 260f, linear(0f, 0f, 0f, 260f, 0f to rgba(7, 10, 18, 0.70f), 1f to rgba(7, 10, 18, 0f)))
            c.drawRect(0f, 0f, W, heroBottom, linear(0f, 0f, 0f, heroBottom, 0f to rgba(7, 10, 18, 0.10f), 0.55f to rgba(7, 10, 18, 0.45f), 1f to Dark.groundDeep))
            c.drawRect(0f, 0f, W, heroBottom, linear(0f, 0f, W, 0f, 0f to rgba(7, 10, 18, 0.60f), 0.6f to rgba(7, 10, 18, 0.15f), 1f to rgba(7, 10, 18, 0f)))
        } else {
            c.drawRect(0f, heroTop, W, heroBottom, linear(0f, heroTop, W, heroBottom, 0f to rgba(59, 130, 246, 0.22f), 1f to rgba(139, 92, 246, 0.22f)))
        }

        // ── Top bar: the lockup ("Tappy" white, "AI" blue) ──
        if (mark != null) c.drawRoundMark(mark, P, 30f, 60f)
        val wp = font(800, 40f, Dark.text)
        c.text("Tappy", P + 76f, 62f, wp, baseline = Baseline.MIDDLE)
        val tw0 = wp.measureText("Tappy")
        wp.color = Color.parseColor("#3391FF")
        c.text("AI", P + 76f + tw0, 62f, wp, baseline = Baseline.MIDDLE)

        // ── Eyebrow, title, counts, summary — bottom-aligned in the hero ──
        val sumP = font(400, 28f, Dark.muted)
        val summary = s.summary?.let { wrapLines(sumP, it, W - P * 2, 2) }.orEmpty()
        val meta = listOfNotNull(fillN(str.days, dayCount), fillN(str.stops, stopCount), s.people?.let { fillN(str.people, it) }).joinToString("   ·   ")
        val titleP = font(800, 76f, Dark.text)
        val title = wrapLines(titleP, s.title, W - P * 2, 2)
        val blockH = 34f + 20f + title.size * 86f + 20f + 40f + (if (summary.isNotEmpty()) 20f + summary.size * 38f else 0f)
        var y = heroBottom - 56f - blockH
        val shadow: (android.text.TextPaint) -> android.text.TextPaint = { p -> if (heroImg != null) p.setShadowLayer(12f, 0f, 4f, rgba(0, 0, 0, 0.55f)); p }
        c.text(str.eyebrow.uppercase().toCharArray().joinToString(" "), P, y + 30f, shadow(font(700, 28f, Dark.eyebrow)))
        y += 34f + 20f
        shadow(titleP)
        for (l in title) { y += 80f; c.text(l, P, y, titleP, maxWidth = W - P * 2) }
        y += 26f
        y += 34f
        c.text(meta, P, y, shadow(font(600, 30f, Dark.text)), maxWidth = W - P * 2)
        if (summary.isNotEmpty()) {
            y += 20f
            shadow(sumP)
            for (l in summary) { y += 38f; c.text(l, P, y, sumP, maxWidth = W - P * 2) }
        }

        // ── Itinerary ──
        y = heroBottom + 60f
        c.text(str.itinerary, P, y + 40f, font(800, 48f, Dark.text))
        y += 70f
        val days = s.days.take(PLAN_CARD_DAYS)
        days.forEachIndexed { di, d ->
            val cx = P + 36f
            val cy = y + 44f
            c.drawCircle(cx, cy, 36f, linear(cx - 36f, cy - 36f, cx + 36f, cy + 36f, 0f to Dark.accentFrom, 1f to Dark.accentTo))
            c.text(pad2(di + 1), cx, cy + 1f, font(800, 30f, Color.WHITE), Align.CENTER, Baseline.MIDDLE)
            val lp = font(700, 34f, Dark.eyebrow)
            c.text(wrapLines(lp, d.label, W - P * 2 - 100f, 1).firstOrNull().orEmpty(), P + 96f, cy, lp, baseline = Baseline.MIDDLE)
            val items = d.items.take(PLAN_CARD_STOPS)
            val lineTop = y + DAY_HEAD
            if (items.isNotEmpty()) c.drawLine(cx, lineTop - 8f, cx, lineTop + items.size * STOP_H - 30f, strokePaint(rgba(59, 130, 246, 0.6f), 3f).apply { strokeCap = android.graphics.Paint.Cap.BUTT })
            items.forEachIndexed { ii, it ->
                val top = lineTop + ii * STOP_H
                c.drawCircle(cx, top + 16f, 8f, fillPaint(Dark.accentFrom))
                var tx = P + 96f
                it.time?.let { t -> c.text(t, tx, top + 28f, font(700, 28f, Dark.text), maxWidth = 110f) }
                tx += 120f
                val img = it.photoUrl?.let { u -> images.load(u, 384, 4000) }
                if (img != null) { c.drawCover(img, tx, top, 150f, 100f, 16f); tx += 170f }
                val tw = W - P - tx
                val np = font(700, 30f, Dark.text)
                c.text(wrapLines(np, it.name, tw, 1).firstOrNull().orEmpty(), tx, top + 28f, np, maxWidth = tw)
                var ly = top + 28f
                it.description?.let { desc ->
                    ly += 36f
                    val dp = font(400, 23f, Dark.muted)
                    c.text(wrapLines(dp, desc, tw, 1).firstOrNull().orEmpty(), tx, ly, dp, maxWidth = tw)
                }
                it.address?.let { addr ->
                    ly += 34f
                    c.drawPin(tx, ly - 20f, 22f, Dark.pin)
                    val ap = font(400, 22f, Dark.faint)
                    c.text(wrapLines(ap, addr, tw - 30f, 1).firstOrNull().orEmpty(), tx + 30f, ly, ap, maxWidth = tw - 30f)
                }
            }
            y = lineTop + items.size * STOP_H
            if (d.items.size > PLAN_CARD_STOPS) {
                c.text("+" + fillN(str.stops, d.items.size - PLAN_CARD_STOPS), P + 96f, y + 10f, font(500, 24f, Dark.faint))
                y += 44f
            }
            y += 24f
        }
        if (s.days.size > PLAN_CARD_DAYS) {
            c.text("+" + fillN(str.days, s.days.size - PLAN_CARD_DAYS), P, y + 20f, font(600, 26f, Dark.eyebrow))
            y += 50f
        }

        // ── Highlights: the plan's own distinct stop photos, 2 columns ──
        if (highlights.size >= 2) {
            val tiles = highlights.take(4)
            y += 40f
            c.text(str.highlights, P, y + 36f, font(800, 40f, Dark.text))
            y += 70f
            val tw = (W - P * 2 - TILE_GAP) / 2f
            tiles.forEachIndexed { i, h ->
                val tx = P + (i % 2) * (tw + TILE_GAP)
                val ty = y + (i / 2) * (TILE_H + 56f + TILE_GAP)
                val img = images.load(h.photo, 640, 4000)
                if (img != null) c.drawCover(img, tx, ty, tw, TILE_H, 24f) else c.drawPath(roundRectPath(tx, ty, tw, TILE_H, 24f), fillPaint(Dark.panel))
                val hp = font(600, 26f, Dark.text)
                c.text(wrapLines(hp, h.name, tw, 1).firstOrNull().orEmpty(), tx, ty + TILE_H + 38f, hp, maxWidth = tw)
            }
            val rows = ceil(tiles.size / 2.0).toInt()
            y += rows * (TILE_H + 56f) + (rows - 1) * TILE_GAP
        }

        // ── Overview box: only real fields ──
        y += 30f
        val rows = mutableListOf(str.durationLabel to "${fillN(str.days, dayCount)} · ${fillN(str.stops, stopCount)}")
        s.people?.let { rows += str.partyLabel to fillN(str.people, it) }
        s.budgetTotal?.let { rows += str.budget to it }
        val boxH = 60f + 3 * 64f + 40f
        val box = roundRectPath(P, y, W - P * 2, boxH, 28f)
        c.drawPath(box, fillPaint(Dark.panel))
        c.drawPath(box, strokePaint(Dark.panelBorder, 2f))
        c.text(str.overview, P + 36f, y + 56f, font(800, 34f, Dark.text))
        rows.take(3).forEachIndexed { i, (k, v) ->
            val ry = y + 60f + 40f + i * 64f
            c.text(k, P + 36f, ry + 24f, font(500, 26f, Dark.muted), maxWidth = 420f)
            c.text(v, P + 480f, ry + 24f, font(700, 26f, Dark.text), maxWidth = W - P * 2 - 520f)
        }
        y += boxH + 40f

        // ── CTA pill + link ──
        c.drawPath(roundRectPath(P + 40f, y, W - P * 2 - 80f, 100f, 50f), linear(P, 0f, W - P, 0f, 0f to Dark.accentFrom, 1f to Dark.accentTo))
        c.text("${str.cta.uppercase()}  →", W / 2f, y + 51f, font(800, 32f, Color.WHITE), Align.CENTER, Baseline.MIDDLE, W - P * 2 - 140f)
        y += 100f + 44f
        c.text(url.replace(Regex("^https?://"), ""), W / 2f, y, font(600, 26f, Dark.eyebrow), Align.CENTER, Baseline.MIDDLE, W - P * 2)
        y += 56f
        c.text("${str.madeBy} TappyAI", W / 2f, y, font(500, 26f, Dark.text), Align.CENTER, Baseline.MIDDLE)
        c.text(str.madeByLine, W / 2f, y + 36f, font(400, 22f, Dark.faint), Align.CENTER, Baseline.MIDDLE)
        bmp
    }.getOrNull()
}

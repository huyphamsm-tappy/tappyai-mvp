package com.tappyai.app.share.card

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Path
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.share.SharedPlace
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The REVIEW, Explore CLIP and SUGGESTION share cards — port of web `src/lib/share/contentCards.ts`
 * (sample #1's light style, 1080×1920). Each card: the lockup at the top, the content on a white
 * rounded panel, a scannable code of the shared link with the website pill, and the blue slogan
 * banner with the hoodie otter at the foot.
 *
 * 🚨 WHAT A CARD MAY SHOW. Only fields the share already carries: a post's own public fields and a
 * suggestion's whitelisted [SharedPlace] fields (never distance). A missing field is not drawn.
 */
data class SharePostCard(
    val kind: Kind,
    val title: String,
    /** A real venue (never the composer's "Chia sẻ" sentinel). */
    val placeName: String? = null,
    val address: String? = null,
    /** 1–5, reviews with a real place only. */
    val rating: Int? = null,
    val excerpt: String? = null,
    val author: String? = null,
    /** First photo (review) or the clip's thumbnail. */
    val image: String? = null,
) {
    enum class Kind { REVIEW, CLIP }
}

const val POST_EXCERPT_MAX = 220
private const val REVIEW_SHARE_TITLE_MAX = 80
private val SHARE_ONLY_NAMES = setOf("Chia sẻ", "Chia se")
private fun isShareOnlyPlaceName(n: String?) = n.isNullOrBlank() || n.trim() in SHARE_ONLY_NAMES

/** Web `reviewShareTitle`: the real place → the caption's first line (≤ 80) → the brand. */
fun reviewShareTitle(placeName: String?, body: String?): String {
    val place = placeName.orEmpty().trim()
    if (place.isNotEmpty() && place !in SHARE_ONLY_NAMES) return place
    val line = body.orEmpty().split('\n').map { it.replace(Regex("\\s+"), " ").trim() }.firstOrNull { it.isNotEmpty() }.orEmpty()
    if (line.isNotEmpty()) return if (line.length > REVIEW_SHARE_TITLE_MAX) line.take(REVIEW_SHARE_TITLE_MAX - 1).trimEnd() + "…" else line
    return "TappyAI"
}

/** Build a post's card from the feed/detail review — web `postCardOf`, the ONE mapping. */
fun postCardOf(review: Review): SharePostCard {
    val kind = if (review.contentType == ReviewContentType.Video) SharePostCard.Kind.CLIP else SharePostCard.Kind.REVIEW
    val realPlace = !isShareOnlyPlaceName(review.placeName)
    val body = review.body.replace(Regex("\\s+"), " ").trim()
    val excerpt = if (body.length > POST_EXCERPT_MAX) body.take(POST_EXCERPT_MAX - 1).trimEnd() + "…" else body
    val firstPhoto = review.photos.orEmpty().firstOrNull { it.startsWith("https://", ignoreCase = true) }
    val thumb = review.thumbnail?.takeIf { it.startsWith("https://", ignoreCase = true) }
    val rating = review.rating.takeIf { it in 1..5 }
    val title = reviewShareTitle(review.placeName, review.body)
    return SharePostCard(
        kind = kind,
        title = title,
        placeName = if (realPlace) review.placeName.trim() else null,
        address = if (realPlace) review.placeAddress?.trim()?.takeIf { it.isNotEmpty() } else null,
        rating = if (kind == SharePostCard.Kind.REVIEW && realPlace) rating else null,
        // The title already IS the caption when there is no place: do not print it twice.
        excerpt = excerpt.takeIf { it.isNotEmpty() && (realPlace || it != title) },
        author = review.profiles?.fullName?.trim()?.takeIf { it.isNotEmpty() },
        image = if (kind == SharePostCard.Kind.CLIP) thumb ?: firstPhoto else firstPhoto ?: thumb,
    )
}

/** The words on a light content card (already localised by the caller). */
data class ContentCardCopy(
    val tagline: String? = null,
    val badge: String,
    val scanTitle: String,
    val slogan: String? = null,
    val sloganSub: String? = null,
    val website: String,
    /** "Đăng bởi {name}". */
    val byline: String? = null,
    /** "+{n} địa điểm khác". */
    val morePlaces: String? = null,
)

/** Vertical plan (px) — every content card is the same frame. */
internal object ContentFrame {
    const val lockupTop = 56f
    const val panelTop = 330f
    const val panelBottom = 1330f
    const val qrRowTop = 1360f
    const val qrRowH = 260f
    const val bannerTop = 1690f
}

private const val W = Size.width.toFloat()
private const val H = Size.height.toFloat()
private const val P = Size.pad

object ContentCards {

    private fun Canvas.paintFrame(context: Context, url: String, copy: ContentCardCopy) {
        paintLightGround(W, H)
        drawLightLockup(CardAssets.mark(context), W, ContentFrame.lockupTop, copy.tagline)

        // Content panel with a soft blue shadow.
        val panelPath = roundRectPath(P, ContentFrame.panelTop, W - P * 2, ContentFrame.panelBottom - ContentFrame.panelTop, Size.panelRadius)
        drawPath(panelPath, fillPaint(Light.panel).apply { setShadowLayer(15f, 0f, 8f, rgba(30, 107, 255, 0.10f)) })
        drawPath(panelPath, strokePaint(Light.panelBorder, 2f))

        // Code row: the code of the SHARED LINK (on the right — the banner otter stands on the left).
        val rowTop = ContentFrame.qrRowTop
        val row = roundRectPath(P, rowTop, W - P * 2, ContentFrame.qrRowH, 32f)
        drawPath(row, fillPaint(Light.panel))
        drawPath(row, strokePaint(Light.panelBorder, 2f))
        val qrSide = 212f
        drawQrBlock(qrMatrix(url), W - P - 28f - qrSide, rowTop + (ContentFrame.qrRowH - qrSide) / 2f, qrSide)
        val colX = P + 40f
        val colW = W - P - 28f - qrSide - 44f - colX
        val sp = font(800, 32f, Light.ink)
        val scan = wrapLines(sp, copy.scanTitle, colW, 2)
        scan.forEachIndexed { i, l -> text(l, colX, rowTop + 58f + i * 42f, sp, baseline = Baseline.MIDDLE, maxWidth = colW) }
        drawWebsitePill(colX + colW / 2f, rowTop + 58f + scan.size * 42f + 24f, copy.website, colW)

        copy.slogan?.trim()?.takeIf { it.isNotEmpty() }?.let {
            drawBanner(CardAssets.mascot(context), P, ContentFrame.bannerTop, W - P * 2, it, copy.sloganSub)
        }
    }

    private enum class Glyph { STAR, PLAY, SPARK }

    private fun Canvas.badge(x: Float, y: Float, label: String, glyph: Glyph) {
        val tp = font(800, 26f, Light.blue)
        val up = label.uppercase()
        val w = tp.measureText(up) + 84f
        val h = 52f
        val path = roundRectPath(x, y, w, h, h / 2f)
        drawPath(path, fillPaint(rgba(255, 255, 255, 0.94f)))
        drawPath(path, strokePaint(Light.pillBorder, 2f))
        val gx = x + 32f
        val gy = y + h / 2f
        when (glyph) {
            Glyph.STAR -> drawStar(gx, gy, 14f, Light.star)
            Glyph.PLAY -> drawPath(Path().apply { moveTo(gx - 8f, gy - 12f); lineTo(gx + 12f, gy); lineTo(gx - 8f, gy + 12f); close() }, fillPaint(Light.blue))
            Glyph.SPARK -> drawStar(gx, gy, 14f, Light.blue)
        }
        text(up, x + 56f, gy, tp, baseline = Baseline.MIDDLE)
    }

    /** A sky block standing in for an absent photo — the quote mark only, no borrowed image. */
    private fun Canvas.quoteBlock(x: Float, y: Float, w: Float, h: Float) {
        drawPath(roundRectPath(x, y, w, h, Size.photoRadius), linear(x, y, x + w, y + h, 0f to Color.parseColor("#DCEBFF"), 1f to Light.sky))
        val qp = font(800, 220f, rgba(30, 107, 255, 0.25f)).apply { typeface = android.graphics.Typeface.create(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD) }
        text("“", x + w / 2f, y + h / 2f + 50f, qp, Align.CENTER, Baseline.MIDDLE)
    }

    /** Title, stars, place, excerpt, byline — below the media, inside the panel. */
    private fun Canvas.postText(card: SharePostCard, copy: ContentCardCopy, top: Float) {
        val x = P + 34f
        val w = W - P * 2 - 68f
        val bottom = ContentFrame.panelBottom - 30f
        val bylineY = bottom - 16f
        var y = top
        val tp = font(800, 46f, Light.ink)
        for (l in wrapLines(tp, card.title, w, 2)) { y += 54f; text(l, x, y, tp, maxWidth = w) }

        card.rating?.let { rating ->
            y += 20f
            for (i in 0 until 5) drawStar(x + 20f + i * 46f, y + 18f, 19f, if (i < rating) Light.star else Light.starOff)
            text("$rating/5", x + 5 * 46f + 12f, y + 19f, font(700, 28f, Light.muted), baseline = Baseline.MIDDLE)
            y += 40f
        }
        val placeLine = card.address ?: card.placeName?.takeIf { it != card.title }.orEmpty()
        if (placeLine.isNotEmpty()) {
            y += 16f
            drawPin(x, y, 28f, Light.blue)
            val pp = font(500, 26f, Light.muted)
            text(wrapLines(pp, placeLine, w - 40f, 1).firstOrNull().orEmpty(), x + 40f, y + 24f, pp, maxWidth = w - 40f)
            y += 30f
        }
        card.excerpt?.let { ex ->
            val ep = font(500, 29f, Light.body)
            val room = floor((bylineY - 30f - (y + 20f)) / 42f).toInt()
            val lines = wrapLines(ep, "“$ex”", w, max(0, min(5, room)))
            y += 12f
            for (l in lines) { y += 42f; text(l, x, y, ep, maxWidth = w) }
        }
        val author = card.author
        val byline = copy.byline
        if (author != null && byline != null) {
            drawCircle(x + 20f, bylineY, 20f, fillPaint(Light.sky))
            text(author.trim().take(1).uppercase(), x + 20f, bylineY + 1f, font(800, 22f, Light.blue), Align.CENTER, Baseline.MIDDLE)
            text(byline.replace("{name}", author), x + 52f, bylineY, font(600, 25f, Light.muted), baseline = Baseline.MIDDLE, maxWidth = w - 52f)
        }
    }

    /** A REVIEW or Explore CLIP card. */
    fun renderPostCard(context: Context, card: SharePostCard, url: String, copy: ContentCardCopy, images: CardImageLoader = HttpCardImageLoader): Bitmap? = runCatching {
        val bmp = Bitmap.createBitmap(Size.width, Size.height, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.paintFrame(context, url, copy)
        val mx = P + 30f
        val my = ContentFrame.panelTop + 30f
        val mw = W - P * 2 - 60f
        val clip = card.kind == SharePostCard.Kind.CLIP
        val mh = if (clip) 560f else 480f
        val img = images.load(card.image, 1080, 5000)
        when {
            img != null -> c.drawCover(img, mx, my, mw, mh, Size.photoRadius)
            clip -> c.drawPath(roundRectPath(mx, my, mw, mh, Size.photoRadius), linear(mx, my, mx + mw, my + mh, 0f to Light.bannerFrom, 1f to Light.bannerTo))
            else -> c.quoteBlock(mx, my, mw, mh)
        }
        if (clip) {
            // The play button: this card stands for a video.
            val cx = mx + mw / 2f
            val cy = my + mh / 2f
            c.drawCircle(cx, cy, 66f, fillPaint(rgba(255, 255, 255, 0.92f)))
            c.drawPath(Path().apply { moveTo(cx - 20f, cy - 32f); lineTo(cx + 34f, cy); lineTo(cx - 20f, cy + 32f); close() }, fillPaint(Light.blue))
        }
        c.badge(mx + 20f, my + 20f, copy.badge, if (clip) Glyph.PLAY else Glyph.STAR)
        c.postText(card, copy, my + mh + 6f)
        bmp
    }.getOrNull()

    // Owner verdict 29/09 (web b16b52d): "lấy tấm 1 và 2" — the first TWO places; the rest go in the "+N" line.
    const val SUGGESTION_MAX_ROWS = 2

    private fun metaOf(p: SharedPlace): String = listOfNotNull(p.category, p.priceRangeText).joinToString("  ·  ")

    /** JS number printing: 4.5 → "4.5", 5.0 → "5". */
    internal fun jsNumber(d: Double): String = if (d == d.roundToInt().toDouble()) d.roundToInt().toString() else d.toString()

    /** The SUGGESTION card: the recommendation's places, as the chat card showed them. */
    fun renderSuggestionCard(context: Context, subject: String, places: List<SharedPlace>, url: String, copy: ContentCardCopy, images: CardImageLoader = HttpCardImageLoader): Bitmap? = runCatching {
        val bmp = Bitmap.createBitmap(Size.width, Size.height, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.paintFrame(context, url, copy)
        val x = P + 34f
        val w = W - P * 2 - 68f
        var y = ContentFrame.panelTop + 34f
        c.badge(x, y, copy.badge, Glyph.SPARK)
        y += 52f
        val tp = font(800, 42f, Light.ink)
        for (l in wrapLines(tp, subject, w, 2)) { y += 54f; c.text(l, x, y, tp, maxWidth = w) }
        y += 30f

        val shown = places.take(SUGGESTION_MAX_ROWS)
        // Owner review 29/09 (web 2aefaf6): with 2 places the rows fill the panel (bigger photos, text centred).
        val avail = ContentFrame.panelBottom - 70f - y
        val rowH = maxOf(176f, minOf(330f, kotlin.math.floor(avail / maxOf(1, shown.size))))
        val thumb = minOf(260f, rowH - 40f)
        shown.forEachIndexed { i, p ->
            val rowTop = y + i * rowH
            val top = rowTop
            val textTop = top + maxOf(0f, (thumb - 124f) / 2f)
            val img = images.load(p.image, 384, 4000)
            if (img != null) c.drawCover(img, x, top, thumb, thumb, 24f)
            else {
                c.drawPath(roundRectPath(x, top, thumb, thumb, 24f), fillPaint(Light.sky))
                c.text((i + 1).toString(), x + thumb / 2f, top + thumb / 2f, font(800, 56f, Light.blue), Align.CENTER, Baseline.MIDDLE)
            }
            val tx = x + thumb + 26f
            val tw = w - thumb - 26f
            val np = font(800, 32f, Light.ink)
            c.text(wrapLines(np, "${i + 1}. ${p.name}", tw, 1).firstOrNull().orEmpty(), tx, textTop + 38f, np, maxWidth = tw)
            var ly = textTop + 80f
            var mx = tx
            p.rating?.let { rating ->
                c.drawStar(mx + 13f, ly - 9f, 14f, Light.star)
                val rp = font(700, 25f, Light.ink)
                val r = jsNumber(rating) + (p.ratingCount?.let { n -> " ($n)" } ?: "")
                c.text(r, mx + 32f, ly, rp)
                mx += 32f + rp.measureText(r) + 18f
            }
            val meta = metaOf(p)
            if (meta.isNotEmpty()) {
                val mp = font(500, 25f, Light.muted)
                c.text(wrapLines(mp, meta, tx + tw - mx, 1).firstOrNull().orEmpty(), mx, ly, mp, maxWidth = tx + tw - mx)
            }
            p.address?.takeIf { it.isNotBlank() }?.let { addr ->
                ly += 40f
                c.drawPin(tx, ly - 22f, 24f, Light.blue)
                val ap = font(500, 23f, Light.muted)
                c.text(wrapLines(ap, addr, tw - 34f, 1).firstOrNull().orEmpty(), tx + 34f, ly, ap, maxWidth = tw - 34f)
            }
            if (i < shown.size - 1) c.drawLine(x, rowTop + rowH - 16f, x + w, rowTop + rowH - 16f, strokePaint(Light.panelBorder, 2f).apply { strokeCap = android.graphics.Paint.Cap.BUTT })
        }
        val more = places.size - shown.size
        if (more > 0 && copy.morePlaces != null) {
            c.text(copy.morePlaces.replace("{n}", more.toString()), x, ContentFrame.panelBottom - 40f, font(700, 26f, Light.blue))
        }
        bmp
    }.getOrNull()
}

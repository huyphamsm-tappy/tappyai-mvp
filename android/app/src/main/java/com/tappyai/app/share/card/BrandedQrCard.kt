package com.tappyai.app.share.card

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The TappyAI QR card (profile QR, and the "Mã QR" layout of an Explore post) — port of web
 * `src/lib/qr/brandedCard.ts` (UAT3-approved, sample #1). Lockup + tagline, the code module by
 * module with its full quiet zone and blue brackets OUTSIDE it, name + caption, the slogan banner
 * with the hoodie otter, the bottom panel ("Tải TappyAI ngay" + Google Play badge │ website pill —
 * owner SL2 29/09; no App Store), and the feature strip. Nothing is ever drawn inside the code.
 */
data class GooglePlayCopy(val badgeTop: String, val titlePre: String, val titlePost: String, val sub: String, val orWebsite: String)

data class BrandedQrOptions(
    val text: String,
    val displayName: String,
    val caption: String,
    val invite: String? = null,
    val tagline: String? = null,
    val slogan: String? = null,
    val sloganSub: String? = null,
    val websiteLabel: String? = null,
    val features: List<String> = emptyList(),
    val website: String? = null,
    val googlePlay: GooglePlayCopy? = null,
    val qrPx: Int = 780,
    val quietModules: Int = 4,
)

object BrandedQrCard {
    private const val WIDTH = 1200
    private const val PAD = 60f
    private const val MARK = 150f
    private const val WORDMARK = 64f
    private const val TAGLINE = 28f
    private const val BRACKET = 64f
    private const val BRACKET_GAP = 20f
    private const val NAME = 58f
    private const val CAPTION = 29f
    private const val BANNER_H = 210f
    private const val MASCOT_H = 360f
    private const val PANEL_H = 190f
    private const val STORE_PANEL_H = 260f
    private const val WEBSITE_PX = 34f
    private const val FEATURE_PX = 21f

    fun render(context: Context, o: BrandedQrOptions): Bitmap? = runCatching {
        val matrix = qrMatrix(o.text)
        val n = matrix.size
        val quiet = o.quietModules
        val modulePx = o.qrPx / (n + quiet * 2)
        val qrSide = (modulePx * (n + quiet * 2)).toFloat()
        val hasName = o.displayName.isNotBlank()
        val tagline = o.tagline?.trim().orEmpty()
        val invite = o.invite?.trim().orEmpty()
        val website = o.website?.trim().orEmpty()
        val slogan = o.slogan?.trim().orEmpty()
        val features = o.features.map { it.trim() }.filter { it.isNotEmpty() }.take(4)
        val play = if (website.isNotEmpty()) o.googlePlay else null
        val panelH = if (play != null) STORE_PANEL_H else PANEL_H
        val width = max(WIDTH.toFloat(), qrSide + (PAD + BRACKET_GAP) * 2)

        val top = PAD
        val lockupH = MARK + 16f + WORDMARK
        val taglineH = if (tagline.isNotEmpty()) 18f + TAGLINE else 0f
        val qrTop = top + lockupH + taglineH + 44f
        val nameTop = qrTop + qrSide + 40f
        val captionTop = nameTop + (if (hasName) NAME + 18f else 0f)
        val captionH = CAPTION + (if (invite.isNotEmpty()) 10f + CAPTION else 0f)
        val bannerTop = captionTop + captionH + (if (slogan.isNotEmpty()) 150f else 40f)
        val panelTop = bannerTop + (if (slogan.isNotEmpty()) BANNER_H + 36f else 0f)
        val featuresTop = panelTop + (if (website.isNotEmpty()) panelH + 30f else 0f)
        val height = featuresTop + (if (features.isNotEmpty()) FEATURE_PX + 36f else 0f) + PAD

        val bmp = Bitmap.createBitmap(width.roundToInt(), height.roundToInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.paintLightGround(width, height)

        // ── Lockup ──
        val markX = ((width - MARK) / 2f).roundToInt().toFloat()
        CardAssets.mark(context)?.let { c.drawRoundMark(it, markX, top, MARK) }
        val wp = font(800, WORDMARK, Light.ink)
        val tappyW = wp.measureText("Tappy")
        val aiW = wp.measureText("AI")
        val wordY = top + MARK + 16f + WORDMARK / 2f
        val x = ((width - tappyW - aiW) / 2f).roundToInt().toFloat()
        c.text("Tappy", x, wordY, wp, baseline = Baseline.MIDDLE)
        wp.color = Light.brandBlue
        c.text("AI", x + tappyW, wordY, wp, baseline = Baseline.MIDDLE)
        if (tagline.isNotEmpty()) c.text(tagline, width / 2f, top + lockupH + 18f + TAGLINE / 2f, font(500, TAGLINE, Light.muted), Align.CENTER, Baseline.MIDDLE, width - PAD * 2)

        // ── The code (module by module, full quiet zone), brackets outside ──
        val qrX = ((width - qrSide) / 2f).roundToInt().toFloat()
        c.drawRect(qrX, qrTop, qrX + qrSide, qrTop + qrSide, fillPaint(Color.WHITE))
        val black = Paint().apply { color = Color.BLACK }
        for (r in 0 until n) for (col in 0 until n) if (matrix[r][col]) {
            val px = qrX + (col + quiet) * modulePx
            val py = qrTop + (r + quiet) * modulePx
            c.drawRect(px, py, px + modulePx, py + modulePx, black)
        }
        c.drawBrackets(qrX - BRACKET_GAP, qrTop - BRACKET_GAP, qrX + qrSide + BRACKET_GAP, qrTop + qrSide + BRACKET_GAP, BRACKET, 9f)

        // ── Name + caption ──
        if (hasName) c.text(o.displayName.trim(), width / 2f, nameTop + NAME / 2f, font(800, NAME, Light.ink), Align.CENTER, Baseline.MIDDLE, width - PAD * 2)
        val capP = font(500, CAPTION, Light.muted)
        c.text(o.caption, width / 2f, captionTop + CAPTION / 2f, capP, Align.CENTER, Baseline.MIDDLE, width - PAD * 2)
        if (invite.isNotEmpty()) c.text(invite, width / 2f, captionTop + CAPTION + 10f + CAPTION / 2f, capP, Align.CENTER, Baseline.MIDDLE, width - PAD * 2)

        // ── Banner ──
        if (slogan.isNotEmpty()) {
            c.drawBanner(CardAssets.mascot(context), PAD, bannerTop, width - PAD * 2, slogan, o.sloganSub, h = BANNER_H, mascotH = MASCOT_H,
                sloganPx = 46f, subPx = 27f, textFrac = 0.62f, mascotInset = 24f, mascotDrop = 8f, sloganY = 0.36f, subY = 0.7f)
        }

        // ── Bottom panel: [get the app + Google Play │] website pill ──
        if (website.isNotEmpty()) {
            val px = PAD
            val pw = width - PAD * 2
            val panel = roundRectPath(px, panelTop, pw, panelH, 32f)
            c.drawPath(panel, fillPaint(Color.WHITE))
            c.drawPath(panel, strokePaint(Light.panelBorder, 2f))
            var colX = px
            var colW = pw
            if (play != null) {
                val leftW = (pw * 0.52f).roundToInt().toFloat()
                c.drawGetAppColumn(play, px + 40f, panelTop, leftW - 60f, panelH)
                c.drawLine(px + leftW, panelTop + 36f, px + leftW, panelTop + panelH - 36f, strokePaint(Light.panelBorder, 2f).apply { strokeCap = Paint.Cap.BUTT })
                colX = px + leftW
                colW = pw - leftW
            }
            val cx = colX + colW / 2f
            val label = (if (play != null) play.orWebsite else o.websiteLabel.orEmpty()).trim()
            if (label.isNotEmpty()) c.text(label, cx, if (play != null) panelTop + 78f else panelTop + 46f, font(600, 27f, Light.ink), Align.CENTER, Baseline.MIDDLE, colW - 40f)
            val sitePx = if (play != null) 29f else WEBSITE_PX
            val inset = if (play != null) 38f else 48f
            val sp = font(700, sitePx, Light.blue)
            val tw = sp.measureText(website)
            val pillW = min(colW - 50f, tw + inset * 2 + 60f)
            val pillH = if (play != null) 72f else 78f
            val pillX = (cx - pillW / 2f).roundToInt().toFloat()
            val pillY = if (play != null) panelTop + 124f else panelTop + 82f
            val pill = roundRectPath(pillX, pillY, pillW, pillH, pillH / 2f)
            c.drawPath(pill, fillPaint(Light.sky))
            c.drawPath(pill, strokePaint(Light.pillBorder, 2f))
            val gy = pillY + pillH / 2f
            c.drawGlobe(pillX + inset, gy, rx = 7f)
            val ax = pillX + pillW - inset
            c.drawPath(Path().apply { moveTo(ax - 16f, gy); lineTo(ax + 12f, gy); moveTo(ax + 2f, gy - 11f); lineTo(ax + 13f, gy); lineTo(ax + 2f, gy + 11f) }, strokePaint(Light.blue, 3.5f))
            c.text(website, pillX + pillW / 2f, gy, sp, Align.CENTER, Baseline.MIDDLE, pillW - inset * 2 - 40f)
        }

        // ── Feature strip ──
        if (features.isNotEmpty()) {
            val iconS = 30f
            val fp = font(500, FEATURE_PX, Light.muted)
            val itemW = features.map { iconS + 10f + fp.measureText(it) }
            val avail = width - PAD * 2
            val scale = min(1f, (avail - 24f * (features.size - 1)) / itemW.sum())
            val gap = (avail - itemW.sumOf { (it * scale).toDouble() }.toFloat()) / max(1, features.size - 1)
            var fx = PAD
            features.forEachIndexed { i, label ->
                val w = itemW[i] * scale
                c.featureIcon(i, fx, featuresTop + (FEATURE_PX + 36f - iconS) / 2f, iconS)
                c.text(label, fx + iconS + 10f, featuresTop + (FEATURE_PX + 36f) / 2f, fp, baseline = Baseline.MIDDLE, maxWidth = w - iconS - 10f)
                fx += w + gap
            }
        }
        bmp
    }.getOrNull()

    private fun Canvas.featureIcon(kind: Int, x: Float, y: Float, s: Float) {
        val p = strokePaint(Light.blue, max(2f, s / 12f))
        val cx = x + s / 2f
        when (kind) {
            0 -> {
                drawPath(roundRectPath(x + s * 0.08f, y + s * 0.14f, s * 0.84f, s * 0.62f, s * 0.2f), p)
                drawPath(Path().apply { moveTo(x + s * 0.3f, y + s * 0.76f); lineTo(x + s * 0.24f, y + s * 0.94f); lineTo(x + s * 0.46f, y + s * 0.76f) }, p)
                for (dx in listOf(-0.2f, 0f, 0.2f)) drawCircle(cx + dx * s, y + s * 0.45f, s * 0.05f, fillPaint(Light.blue))
            }
            1 -> {
                drawPath(Path().apply {
                    arcTo(RectF(cx - s * 0.3f, y + s * 0.1f, cx + s * 0.3f, y + s * 0.7f), 180f, 180f)
                    quadTo(x + s * 0.8f, y + s * 0.62f, cx, y + s * 0.95f)
                    quadTo(x + s * 0.2f, y + s * 0.62f, x + s * 0.2f, y + s * 0.4f)
                }, p)
                drawCircle(cx, y + s * 0.4f, s * 0.1f, p)
            }
            2 -> {
                drawCircle(x + s * 0.36f, y + s * 0.32f, s * 0.15f, p)
                drawArc(RectF(x + s * 0.06f, y + s * 0.65f, x + s * 0.66f, y + s * 1.25f), 207f, 126f, false, p)
                drawCircle(x + s * 0.7f, y + s * 0.36f, s * 0.12f, p)
                drawArc(RectF(x + s * 0.48f, y + s * 0.71f, x + s * 0.96f, y + s * 1.19f), 216f, 117f, false, p)
            }
            else -> {
                p.color = Light.heart
                drawPath(Path().apply {
                    moveTo(cx, y + s * 0.88f)
                    cubicTo(x - s * 0.1f, y + s * 0.45f, x + s * 0.22f, y + s * 0.02f, cx, y + s * 0.3f)
                    cubicTo(x + s * 0.78f, y + s * 0.02f, x + s * 1.1f, y + s * 0.45f, cx, y + s * 0.88f)
                }, p)
            }
        }
    }

    /** "Tải TappyAI ngay", the line under it and the Google Play badge — the panel's left column. */
    private fun Canvas.drawGetAppColumn(play: GooglePlayCopy, x: Float, top: Float, w: Float, h: Float) {
        val titleY = top + 58f
        var tx = x
        val pre = play.titlePre.trim()
        if (pre.isNotEmpty()) {
            val pp = font(700, 34f, Light.ink)
            text(pre, tx, titleY, pp, baseline = Baseline.MIDDLE)
            tx += pp.measureText("$pre ")
        }
        val bp = font(800, 40f, Light.blue)
        text("Tappy", tx, titleY, bp, baseline = Baseline.MIDDLE)
        tx += bp.measureText("Tappy")
        bp.color = Light.brandBlue
        text("AI", tx, titleY, bp, baseline = Baseline.MIDDLE)
        tx += bp.measureText("AI ")
        val post = play.titlePost.trim()
        if (post.isNotEmpty()) text(post, tx, titleY, font(700, 34f, Light.ink), baseline = Baseline.MIDDLE, maxWidth = max(40f, x + w - tx))
        text(play.sub, x, titleY + 46f, font(500, 23f, Light.muted), baseline = Baseline.MIDDLE, maxWidth = w)
        drawGooglePlayBadge(play.badgeTop, x, top + h - 30f - 84f, 84f)
    }

    /** The Google Play badge after Google's badge guidelines. Returns its width. */
    fun Canvas.drawGooglePlayBadge(top: String, x: Float, y: Float, bh: Float): Float {
        val s = bh / 84f
        val small = font(600, (15 * s).roundToInt().toFloat(), Color.WHITE)
        val name = font(500, (36 * s).roundToInt().toFloat(), Color.WHITE)
        val topW = small.measureText(top.uppercase())
        val nameW = name.measureText("Google Play")
        val logo = 44f * s
        val bw = (22 * s + logo + 16 * s + max(topW, nameW) + 24 * s).roundToInt().toFloat()
        val box = roundRectPath(x, y, bw, bh, 12f * s)
        drawPath(box, fillPaint(Color.BLACK))
        drawPath(box, strokePaint(Color.parseColor("#A6A6A6"), max(1.5f, 2f * s)))
        drawPlayLogo(x + 22f * s, y + (bh - logo) / 2f, logo)
        val textX = x + 22f * s + logo + 16f * s
        text(top.uppercase(), textX, y + 31f * s, small)
        text("Google Play", textX, y + 68f * s, name)
        return bw
    }

    /** The four-colour Play triangle in a [size] box. */
    private fun Canvas.drawPlayLogo(x: Float, y: Float, size: Float) {
        val w = size * 0.88f
        fun X(f: Float) = x + (size - w) / 2f + f * w
        fun Y(f: Float) = y + f * size
        fun poly(color: String, pts: List<Pair<Float, Float>>) {
            drawPath(Path().apply { pts.forEachIndexed { i, (px, py) -> if (i == 0) moveTo(X(px), Y(py)) else lineTo(X(px), Y(py)) }; close() }, fillPaint(Color.parseColor(color)))
        }
        save()
        clipPath(Path().apply { moveTo(X(0f), Y(0f)); lineTo(X(1f), Y(0.5f)); lineTo(X(0f), Y(1f)); close() })
        poly("#00A0FF", listOf(0f to 0f, 0.6f to 0.5f, 0f to 1f))
        poly("#00E676", listOf(0f to 0f, 0.78f to 0.39f, 0.6f to 0.5f))
        poly("#FF3A44", listOf(0f to 1f, 0.6f to 0.5f, 0.78f to 0.61f))
        poly("#FFD500", listOf(0.6f to 0.5f, 0.78f to 0.39f, 1f to 0.5f, 0.78f to 0.61f))
        restore()
    }
}

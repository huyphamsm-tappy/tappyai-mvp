package com.tappyai.app.share.card

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import android.text.TextPaint
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.google.zxing.qrcode.encoder.Encoder
import com.tappyai.app.R
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * ONE STYLE for every TappyAI share image — port of web `src/lib/share/cardStyle.ts` (owner picks
 * 29/09, `docs/design/share-layouts/README.md`). Light cards (profile QR, review, Explore clip,
 * suggestion) follow sample #1; the plan card follows sample #7. Every colour and size is a token
 * here, so no card drifts into its own palette; the canvas helpers are shared for the same reason.
 *
 * Canvas-2D semantics the web code relies on, reproduced here: `textBaseline = 'middle'`,
 * `textAlign = 'center'`, and `fillText(text, x, y, maxWidth)` which SQUEEZES a too-wide line
 * horizontally rather than overflowing ([text]).
 */
internal object Light {
    val ink = Color.parseColor("#0B1B3F")
    val body = Color.parseColor("#33415C")
    val muted = Color.parseColor("#4F5B76")
    val blue = Color.parseColor("#1E6BFF")
    val brandBlue = Color.parseColor("#3391FF")
    val sky = Color.parseColor("#EAF3FF")
    val groundTop = Color.parseColor("#FFFFFF")
    val groundMid = Color.parseColor("#F2F7FF")
    val panel = Color.parseColor("#FFFFFF")
    val panelBorder = Color.parseColor("#D8E4FA")
    val pillBorder = Color.parseColor("#B9D2FB")
    val bannerFrom = Color.parseColor("#1453D9")
    val bannerTo = Color.parseColor("#2F8CFF")
    val bannerSub = Color.parseColor("#E3EEFF")
    val star = Color.parseColor("#FFB020")
    val starOff = Color.parseColor("#D5DEEE")
    val heart = Color.parseColor("#F0457A")
}

internal object Dark {
    val ground = Color.parseColor("#0B1220")
    val groundDeep = Color.parseColor("#070A12")
    val groundEnd = Color.parseColor("#14133A")
    val panel = Color.parseColor("#111A2E")
    val panelBorder = rgba(255, 255, 255, 0.08f)
    val text = Color.parseColor("#F4F6FB")
    val muted = rgba(244, 246, 251, 0.70f)
    val faint = rgba(244, 246, 251, 0.50f)
    val eyebrow = Color.parseColor("#8FB8FF")
    val accentFrom = Color.parseColor("#3B82F6")
    val accentTo = Color.parseColor("#8B5CF6")
    val pin = Color.parseColor("#A78BFA")
}

/** Sizes at the rendered scale (px). Content cards are 1080×1920 (9:16 — TikTok photo mode). */
internal object Size {
    const val width = 1080
    const val height = 1920
    const val pad = 60f
    const val panelRadius = 40f
    const val photoRadius = 28f
    const val markSize = 116f
    const val wordmarkPx = 54f
    const val taglinePx = 26f
    const val bracket = 40f
    const val bracketStroke = 7f
    const val bannerH = 170f
    const val mascotH = 300f
}

internal fun rgba(r: Int, g: Int, b: Int, a: Float): Int = Color.argb((a * 255).roundToInt(), r, g, b)

internal enum class Align { LEFT, CENTER }
internal enum class Baseline { ALPHABETIC, MIDDLE }

/** A text paint in the card font: sans-serif at a CSS font weight (100–900), optionally italic. */
internal fun font(weight: Int, px: Float, color: Int = Color.BLACK, italic: Boolean = false): TextPaint =
    TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            Typeface.create(Typeface.SANS_SERIF, weight.coerceIn(1, 1000), italic)
        } else {
            Typeface.create(Typeface.SANS_SERIF, when {
                weight >= 600 && italic -> Typeface.BOLD_ITALIC
                weight >= 600 -> Typeface.BOLD
                italic -> Typeface.ITALIC
                else -> Typeface.NORMAL
            })
        }
        textSize = px
        this.color = color
    }

/**
 * `fillText(s, x, y, maxWidth)` with the canvas alignment/baseline in force. A line wider than
 * [maxWidth] is squeezed horizontally, exactly as the 2D canvas does.
 */
internal fun Canvas.text(s: String, x: Float, y: Float, p: TextPaint, align: Align = Align.LEFT, baseline: Baseline = Baseline.ALPHABETIC, maxWidth: Float? = null) {
    if (s.isEmpty()) return
    val oldScale = p.textScaleX
    val oldAlign = p.textAlign
    val w = p.measureText(s)
    if (maxWidth != null && maxWidth > 0 && w > maxWidth) p.textScaleX = oldScale * (maxWidth / w)
    p.textAlign = if (align == Align.CENTER) Paint.Align.CENTER else Paint.Align.LEFT
    val fm = p.fontMetrics
    val by = if (baseline == Baseline.MIDDLE) y - (fm.ascent + fm.descent) / 2f else y
    drawText(s, x, by, p)
    p.textScaleX = oldScale
    p.textAlign = oldAlign
}

/** Greedy word wrap; the last kept line gets an ellipsis when text was cut (web `wrapLines`). */
internal fun wrapLines(p: Paint, text: String, maxWidth: Float, maxLines: Int): List<String> {
    if (maxLines <= 0) return emptyList()
    val words = text.replace(Regex("\\s+"), " ").trim().split(' ').filter { it.isNotEmpty() }
    val lines = mutableListOf<String>()
    var cur = ""
    var i = 0
    while (i < words.size) {
        val next = if (cur.isNotEmpty()) "$cur ${words[i]}" else words[i]
        if (p.measureText(next) <= maxWidth) { cur = next; i++; continue }
        if (cur.isNotEmpty()) lines.add(cur)
        cur = words[i]
        if (lines.size == maxLines) break
        i++
    }
    if (lines.size < maxLines && cur.isNotEmpty()) { lines.add(cur); cur = "" }
    val cut = i < words.size || cur.isNotEmpty()
    if (cut && lines.isNotEmpty()) {
        var last = lines.last()
        while (last.length > 1 && p.measureText("$last…") > maxWidth) last = last.dropLast(1)
        lines[lines.size - 1] = "${last.trimEnd()}…"
    }
    return lines
}

internal fun roundRectPath(x: Float, y: Float, w: Float, h: Float, r: Float): Path {
    val rr = min(r, min(w / 2f, h / 2f))
    return Path().apply { addRoundRect(RectF(x, y, x + w, y + h), rr, rr, Path.Direction.CW) }
}

internal fun fillPaint(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; style = Paint.Style.FILL }
internal fun strokePaint(color: Int, width: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color; style = Paint.Style.STROKE; strokeWidth = width; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
}

internal fun linear(x0: Float, y0: Float, x1: Float, y1: Float, vararg stops: Pair<Float, Int>): Paint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = LinearGradient(x0, y0, x1, y1, stops.map { it.second }.toIntArray(), stops.map { it.first }.toFloatArray(), Shader.TileMode.CLAMP)
    }

/** Cover-fit a bitmap into a rounded box. */
internal fun Canvas.drawCover(img: Bitmap, x: Float, y: Float, w: Float, h: Float, r: Float) {
    save()
    if (r > 0f) clipPath(roundRectPath(x, y, w, h, r)) else clipRect(x, y, x + w, y + h)
    val iw = img.width.toFloat()
    val ih = img.height.toFloat()
    val s = max(w / iw, h / ih)
    val dw = iw * s
    val dh = ih * s
    drawBitmap(img, null, RectF(x + (w - dw) / 2f, y + (h - dh) / 2f, x + (w + dw) / 2f, y + (h + dh) / 2f), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    restore()
}

/** The light ground: white → sky, opaque edge to edge. */
internal fun Canvas.paintLightGround(w: Float, h: Float) {
    drawRect(0f, 0f, w, h, linear(0f, 0f, 0f, h, 0f to Light.groundTop, 0.55f to Light.groundMid, 1f to Light.sky))
}

/** The lockup: round otter mark over the wordmark ("Tappy" ink, "AI" brand blue), centred. Returns the bottom y. */
internal fun Canvas.drawLightLockup(mark: Bitmap?, width: Float, top: Float, tagline: String?): Float {
    val m = Size.markSize
    val markX = ((width - m) / 2f).roundToInt().toFloat()
    if (mark != null) drawRoundMark(mark, markX, top, m)
    val p = font(800, Size.wordmarkPx, Light.ink)
    val tw = p.measureText("Tappy")
    val aw = p.measureText("AI")
    val wordY = top + m + 10f + Size.wordmarkPx / 2f
    val x = ((width - tw - aw) / 2f).roundToInt().toFloat()
    text("Tappy", x, wordY, p, baseline = Baseline.MIDDLE)
    p.color = Light.brandBlue
    text("AI", x + tw, wordY, p, baseline = Baseline.MIDDLE)
    var bottom = top + m + 10f + Size.wordmarkPx
    val t = tagline?.trim().orEmpty()
    if (t.isNotEmpty()) {
        text(t, width / 2f, bottom + 14f + Size.taglinePx / 2f, font(500, Size.taglinePx, Light.muted), Align.CENTER, Baseline.MIDDLE, width - Size.pad * 2)
        bottom += 14f + Size.taglinePx
    }
    return bottom
}

/** The mark cropped to a circle (centre square of the source). */
internal fun Canvas.drawRoundMark(mark: Bitmap, x: Float, y: Float, size: Float) {
    save()
    clipPath(Path().apply { addCircle(x + size / 2f, y + size / 2f, size / 2f, Path.Direction.CW) })
    val s = min(mark.width, mark.height)
    val src = Rect((mark.width - s) / 2, (mark.height - s) / 2, (mark.width - s) / 2 + s, (mark.height - s) / 2 + s)
    drawBitmap(mark, src, RectF(x, y, x + size, y + size), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    restore()
}

/** The QR matrix of [text] (byte mode, error correction M — as web `encodeQR`). */
internal fun qrMatrix(text: String): Array<BooleanArray> {
    val code = Encoder.encode(text, ErrorCorrectionLevel.M, mapOf(EncodeHintType.CHARACTER_SET to "UTF-8"))
    val m = code.matrix
    return Array(m.height) { r -> BooleanArray(m.width) { c -> m.get(c, r).toInt() == 1 } }
}

/** A scannable code: white square, [quiet] empty modules each side, blue brackets OUTSIDE the quiet zone. */
internal fun Canvas.drawQrBlock(matrix: Array<BooleanArray>, x: Float, y: Float, side: Float, quiet: Int = 4, bracket: Float = Size.bracket, stroke: Float = Size.bracketStroke, gap: Float = 12f) {
    val n = matrix.size
    val modulePx = max(1, (side / (n + quiet * 2)).toInt())
    val real = modulePx * (n + quiet * 2)
    val ox = x + ((side - real) / 2f).toInt()
    val oy = y + ((side - real) / 2f).toInt()
    drawRect(x, y, x + side, y + side, fillPaint(Color.WHITE))
    val black = Paint().apply { color = Color.BLACK; style = Paint.Style.FILL }
    for (r in 0 until n) for (c in 0 until n) if (matrix[r][c]) {
        val px = ox + (c + quiet) * modulePx
        val py = oy + (r + quiet) * modulePx
        drawRect(px, py, px + modulePx, py + modulePx, black)
    }
    drawBrackets(x - gap, y - gap, x + side + gap, y + side + gap, bracket, stroke)
}

internal fun Canvas.drawBrackets(x0: Float, y0: Float, x1: Float, y1: Float, b: Float, stroke: Float) {
    val p = strokePaint(Light.blue, stroke)
    for ((cx, cy, dx, dy) in listOf(floatArrayOf(x0, y0, 1f, 1f), floatArrayOf(x1, y0, -1f, 1f), floatArrayOf(x0, y1, 1f, -1f), floatArrayOf(x1, y1, -1f, -1f)).map { listOf(it[0], it[1], it[2], it[3]) }) {
        drawPath(Path().apply { moveTo(cx, cy + dy * b); lineTo(cx, cy); lineTo(cx + dx * b, cy) }, p)
    }
}

/** The blue slogan band with the hoodie otter standing over its left end. */
internal fun Canvas.drawBanner(mascot: Bitmap?, x: Float, y: Float, w: Float, slogan: String, sub: String?, h: Float = Size.bannerH, mascotH: Float = Size.mascotH, sloganPx: Float = 40f, subPx: Float = 24f, textFrac: Float = 0.63f, mascotInset: Float = 20f, mascotDrop: Float = 6f, subY: Float = 0.7f, sloganY: Float = 0.38f) {
    drawPath(roundRectPath(x, y, w, h, Size.panelRadius), linear(x, 0f, x + w, 0f, 0f to Light.bannerFrom, 1f to Light.bannerTo))
    val textX = x + w * textFrac
    val hasSub = !sub.isNullOrBlank()
    text(slogan, textX, y + h * (if (hasSub) sloganY else 0.5f), font(800, sloganPx, Color.WHITE, italic = true), Align.CENTER, Baseline.MIDDLE, w * 0.6f)
    if (hasSub) text(sub!!.trim(), textX, y + h * subY, font(500, subPx, Light.bannerSub), Align.CENTER, Baseline.MIDDLE, w * 0.6f)
    if (mascot != null) {
        val mw = (mascotH * mascot.width / mascot.height).roundToInt().toFloat()
        drawBitmap(mascot, null, RectF(x + mascotInset, y + h - mascotH + mascotDrop, x + mascotInset + mw, y + h + mascotDrop), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    }
}

/** Globe icon at (gx, gy). */
internal fun Canvas.drawGlobe(gx: Float, gy: Float, rx: Float = 6.5f) {
    val p = strokePaint(Light.blue, 3.5f)
    drawCircle(gx, gy, 16f, p)
    drawOval(RectF(gx - rx, gy - 16f, gx + rx, gy + 16f), p)
    drawLine(gx - 16f, gy, gx + 16f, gy, p)
}

internal fun Canvas.drawArrow(ax: Float, gy: Float) {
    val p = strokePaint(Light.blue, 3.5f)
    drawPath(Path().apply { moveTo(ax - 15f, gy); lineTo(ax + 11f, gy); moveTo(ax + 1f, gy - 10f); lineTo(ax + 12f, gy); lineTo(ax + 1f, gy + 10f) }, p)
}

/** The website pill (globe · host · arrow), centred on [cx]. */
internal fun Canvas.drawWebsitePill(cx: Float, y: Float, website: String, maxW: Float) {
    val tp = font(700, 32f, Light.blue)
    val tw = tp.measureText(website)
    val w = min(maxW, tw + 170f)
    val h = 76f
    val x = (cx - w / 2f).roundToInt().toFloat()
    val path = roundRectPath(x, y, w, h, h / 2f)
    drawPath(path, fillPaint(Light.sky))
    drawPath(path, strokePaint(Light.pillBorder, 2f))
    val gy = y + h / 2f
    drawGlobe(x + 44f, gy)
    drawArrow(x + w - 44f, gy)
    text(website, cx, gy, tp, Align.CENTER, Baseline.MIDDLE, w - 170f)
}

/** A five-point star centred at (cx, cy). */
internal fun Canvas.drawStar(cx: Float, cy: Float, r: Float, fill: Int) {
    val path = Path()
    for (i in 0 until 10) {
        val rad = if (i % 2 == 0) r else r * 0.45f
        val a = -Math.PI / 2 + i * Math.PI / 5
        val px = (cx + rad * Math.cos(a)).toFloat()
        val py = (cy + rad * Math.sin(a)).toFloat()
        if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
    }
    path.close()
    drawPath(path, fillPaint(fill))
}

/** A map pin glyph at (x, y) in an [s] box. */
internal fun Canvas.drawPin(x: Float, y: Float, s: Float, color: Int) {
    val cx = x + s / 2f
    val path = Path().apply {
        arcTo(RectF(cx - s * 0.32f, y + s * 0.38f - s * 0.32f, cx + s * 0.32f, y + s * 0.38f + s * 0.32f), 180f, 180f)
        quadTo(x + s * 0.82f, y + s * 0.62f, cx, y + s)
        quadTo(x + s * 0.18f, y + s * 0.62f, x + s * 0.18f, y + s * 0.38f)
        close()
    }
    drawPath(path, fillPaint(color))
    drawCircle(cx, y + s * 0.38f, s * 0.12f, fillPaint(Color.WHITE))
}

/** The shipped brand assets drawn on cards, decoded once at a sensible size. */
internal object CardAssets {
    @Volatile private var mark: Bitmap? = null
    @Volatile private var mascot: Bitmap? = null

    fun mark(context: Context): Bitmap? = mark ?: decode(context, R.drawable.share_otter_mark, 320).also { mark = it }
    fun mascot(context: Context): Bitmap? = mascot ?: decode(context, R.drawable.share_otter_mascot, 900).also { mascot = it }

    private fun decode(context: Context, res: Int, maxSide: Int): Bitmap? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeResource(context.resources, res, bounds)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        BitmapFactory.decodeResource(context.resources, res, BitmapFactory.Options().apply { inSampleSize = sample })
    }.getOrNull()
}

/**
 * Loads a remote photo for a card: https only, time-boxed, decoded no larger than needed. Null on
 * any failure — a card never waits forever on a photo, and a missing photo is simply not drawn.
 */
fun interface CardImageLoader {
    fun load(url: String?, maxSide: Int, timeoutMs: Int): Bitmap?
}

val HttpCardImageLoader = CardImageLoader { url, maxSide, timeoutMs ->
    if (url.isNullOrBlank() || !url.startsWith("https://")) return@CardImageLoader null
    runCatching {
        val bytes = (URL(url).openConnection() as HttpURLConnection).run {
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            instanceFollowRedirects = true
            try { if (responseCode in 200..299) inputStream.use { it.readBytes() } else null } finally { disconnect() }
        } ?: return@runCatching null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }.getOrNull()
}

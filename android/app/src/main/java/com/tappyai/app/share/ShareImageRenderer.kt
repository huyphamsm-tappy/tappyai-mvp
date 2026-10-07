package com.tappyai.app.share

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import com.tappyai.app.R

/**
 * The branded card image, painted with android.graphics — no dependency.
 *
 * Mirrors the web `renderCardImage.ts`: painted FROM the artifact, so it can only
 * show what is in [SharedPlace]. Photos are NOT fetched here (no network on the
 * render path, and no assumption that a remote host allows it); the image is
 * text-and-brand, which is enough to be recognisably TappyAI. Any failure
 * returns null and the caller shares text — never a prerequisite.
 */
object ShareImageRenderer {
    private const val W = 1080
    private const val PAD = 56f
    private const val MAX_PLACES = 5
    private const val ROW_H = 150f
    private const val HEADER_H = 200f
    private const val FOOTER_H = 90f

    fun render(context: Context, a: ShareArtifact): Bitmap? = try {
        val places = if (a.kind == ShareArtifact.Kind.PLACES) a.places.take(MAX_PLACES) else emptyList()
        val bodyH = if (a.kind == ShareArtifact.Kind.PLACES) places.size * ROW_H + (if (a.places.size > places.size) 44f else 0f) else 0f
        val h = (HEADER_H + maxOf(bodyH, 120f) + FOOTER_H).toInt()
        val bmp = Bitmap.createBitmap(W, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)

        c.drawColor(Color.parseColor("#0B1220"))
        val panel = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#111A2E") }
        c.drawRoundRect(RectF(PAD / 2, PAD / 2, W - PAD / 2, h - PAD / 2), 28f, 28f, panel)

        // Identity strip: the launcher mark (official asset) + the brand name.
        var x = PAD
        runCatching { ContextCompat.getDrawable(context, R.mipmap.ic_launcher)?.toBitmap(56, 56) }.getOrNull()?.let { logo ->
            c.drawBitmap(logo, x, PAD, null); x += 72f
        }
        val title = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 34f; typeface = Typeface.DEFAULT_BOLD }
        c.drawText("TappyAI", x, PAD + 40f, title)

        val subj = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#93C5FD"); textSize = 30f; typeface = Typeface.DEFAULT_BOLD }
        c.drawText(TextUtils.ellipsize(a.subject, subj, W - PAD * 2, TextUtils.TruncateAt.END).toString(), PAD, PAD + 110f, subj)

        var y = HEADER_H
        if (a.kind == ShareArtifact.Kind.PLACES) {
            val rowBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(10, 255, 255, 255) }
            val name = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 28f; typeface = Typeface.DEFAULT_BOLD }
            val meta = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#FBBF24"); textSize = 22f }
            val sub = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#CBD5E1"); textSize = 21f }
            val textW = W - PAD * 2 - 40f
            places.forEachIndexed { i, p ->
                val top = y + i * ROW_H
                c.drawRoundRect(RectF(PAD, top, W - PAD, top + ROW_H - 16f), 18f, 18f, rowBg)
                val tx = PAD + 20f
                c.drawText(TextUtils.ellipsize("${i + 1}. ${p.name}", name, textW, TextUtils.TruncateAt.END).toString(), tx, top + 46f, name)
                val m = buildList {
                    p.rating?.let { add("★ $it" + (p.ratingCount?.let { n -> " ($n)" } ?: "")) }
                    p.category?.let { add(it) }
                    p.priceRangeText?.let { add(it) }
                }.joinToString("  ·  ")
                if (m.isNotEmpty()) c.drawText(TextUtils.ellipsize(m, meta, textW, TextUtils.TruncateAt.END).toString(), tx, top + 80f, meta)
                val s = listOfNotNull(p.address, p.openingHours?.let { "🕐 $it" }, p.phone?.let { "☎ $it" }).joinToString("  ·  ")
                if (s.isNotEmpty()) c.drawText(TextUtils.ellipsize(s, sub, textW, TextUtils.TruncateAt.END).toString(), tx, top + 112f, sub)
            }
            if (a.places.size > places.size) {
                val more = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#94A3B8"); textSize = 22f }
                c.drawText("+${a.places.size - places.size}", PAD + 20f, y + places.size * ROW_H + 24f, more)
            }
        } else {
            val body = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#CBD5E1"); textSize = 24f }
            a.text.split("\n").drop(1).take(8).forEachIndexed { i, l ->
                c.drawText(TextUtils.ellipsize(l, body, W - PAD * 2, TextUtils.TruncateAt.END).toString(), PAD, y + 20f + i * 34f, body)
            }
        }

        val foot = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#64748B"); textSize = 22f }
        c.drawText("TappyAI · ${a.url.removePrefix("https://")}", PAD, h - PAD - 4f, foot)
        bmp
    } catch (_: Exception) {
        null
    }
}

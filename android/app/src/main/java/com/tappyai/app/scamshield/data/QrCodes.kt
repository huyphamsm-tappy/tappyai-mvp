package com.tappyai.app.scamshield.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.InvertedLuminanceSource
import com.google.zxing.LuminanceSource
import com.google.zxing.NotFoundException
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.GlobalHistogramBinarizer
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.EnumMap

/**
 * Scam Shield · QR codes — decoded ON THE DEVICE (ZXing core, already in the app for the profile QR).
 * The picture never leaves the phone: only the LINK a code carries is sent to the link check, and a code that carries something
 * else (text, Wi-Fi, a payment, a contact…) is named and warned about but never acted on.
 */
sealed interface QrPayload {
    /** A web link: goes to the link check. [url] always has a scheme. */
    data class Link(val url: String) : QrPayload

    /** Anything that is not a plain web link. [preview] is the start of the content, for the person to read; it is never sent anywhere. */
    data class Other(val kind: QrKind, val preview: String) : QrPayload
}

enum class QrKind { Text, Wifi, Payment, Contact, Phone, Sms, Email, Location, UnsafeLink }

object QrCodes {

    /** Decodes the first QR code in an ARGB picture. Tries the picture as is, then inverted (light-on-dark codes). */
    fun decode(width: Int, height: Int, argb: IntArray): String? {
        if (width <= 0 || height <= 0 || argb.size < width * height) return null
        val source: LuminanceSource = RGBLuminanceSource(width, height, argb)
        val hints = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java).apply {
            put(DecodeHintType.POSSIBLE_FORMATS, listOf(BarcodeFormat.QR_CODE))
            put(DecodeHintType.TRY_HARDER, true)
            // Codes without an ECI header: UTF-8 is what Vietnamese text (and every modern generator) uses.
            put(DecodeHintType.CHARACTER_SET, "UTF-8")
        }
        val attempts = listOf<() -> BinaryBitmap>(
            { BinaryBitmap(HybridBinarizer(source)) },
            { BinaryBitmap(GlobalHistogramBinarizer(source)) },
            { BinaryBitmap(HybridBinarizer(InvertedLuminanceSource(source))) },
        )
        for (make in attempts) {
            try {
                return QRCodeReader().decode(make(), hints).text
            } catch (_: NotFoundException) {
                // try the next binariser
            } catch (_: com.google.zxing.ChecksumException) {
            } catch (_: com.google.zxing.FormatException) {
            }
        }
        return null
    }

    /** Decodes a QR code from an encoded image (JPEG/PNG/WebP): downsized first (a 12 MP photo is not needed), then tried at two scales. */
    fun decodeImage(bytes: ByteArray, maxSide: Int = 1600): String? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide * 2) sample *= 2
        val full = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        try {
            decodeBitmap(full)?.let { return it }
            // A second try at a smaller size: a very large, very sharp picture can defeat the first binariser.
            val scale = maxSide.toFloat() / maxOf(full.width, full.height)
            if (scale < 1f) {
                val small = Bitmap.createScaledBitmap(full, (full.width * scale).toInt().coerceAtLeast(1), (full.height * scale).toInt().coerceAtLeast(1), true)
                try { return decodeBitmap(small) } finally { if (small !== full) small.recycle() }
            }
            return null
        } finally {
            full.recycle()
        }
    }

    private fun decodeBitmap(bitmap: Bitmap): String? {
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        return decode(w, h, pixels)
    }

    private val HTTP_PREFIX = Regex("""(?i)^https?://""")
    private val PAYMENT_SCHEMES = Regex("""(?i)^(momo|zalopay|vnpay|vietqr|viettelpay|shopeepay|upi|bitcoin|ethereum|paypal|alipays?|weixin)\b""")
    private val BARE_HOST = Regex("""(?i)^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#]\S*)?$""")
    private val ANY_SCHEME = Regex("""(?i)^[a-z][a-z0-9+.-]{1,30}:""")

    /** `true` when [text] parses as an absolute http(s) URL with a host (the web's `new URL(text)` succeeding). */
    private fun parsesAsUrl(text: String): Boolean =
        runCatching { java.net.URI(text) }.getOrNull()?.let { it.scheme != null && !it.host.isNullOrBlank() } == true

    /**
     * What a decoded QR text is. Pure. A web link is checked; everything else is only named and warned about.
     * A 1:1 port of the web's `classifyQrPayload` (`src/lib/scam-shield/qr/payload.ts`, origin/rc/web-uat) — same order, same patterns.
     * Like the web, the preview is the decoded text as read (a Wi-Fi code included): the web shows it, and it is the reader's own scan.
     */
    fun classify(raw: String): QrPayload {
        val text = raw.trim()
        if (text.isEmpty()) return QrPayload.Other(QrKind.Text, "")
        if (HTTP_PREFIX.containsMatchIn(text)) {
            return if (parsesAsUrl(text)) QrPayload.Link(text) else QrPayload.Other(QrKind.Text, preview(text))
        }
        // EMVCo merchant-presented payment QR (VietQR, bank apps): starts with the payload format indicator 000201 + two digits.
        if (Regex("""^000201\d{2}""").containsMatchIn(text)) return QrPayload.Other(QrKind.Payment, preview(text))
        if (text.startsWith("WIFI:", ignoreCase = true)) return QrPayload.Other(QrKind.Wifi, preview(text))
        if (Regex("(?i)^(BEGIN:VCARD|MECARD:|BIZCARD:)").containsMatchIn(text)) return QrPayload.Other(QrKind.Contact, preview(text))
        if (text.startsWith("tel:", ignoreCase = true)) return QrPayload.Other(QrKind.Phone, preview(text))
        if (Regex("(?i)^(smsto?|mms|mmsto):").containsMatchIn(text)) return QrPayload.Other(QrKind.Sms, preview(text))
        if (Regex("(?i)^(mailto:|MATMSG:)").containsMatchIn(text)) return QrPayload.Other(QrKind.Email, preview(text))
        if (text.startsWith("geo:", ignoreCase = true)) return QrPayload.Other(QrKind.Location, preview(text))
        if (PAYMENT_SCHEMES.containsMatchIn(text)) return QrPayload.Other(QrKind.Payment, preview(text))
        // Any other scheme (intent:, market:, javascript:, data:, a custom app link…): never opened from here.
        if (ANY_SCHEME.containsMatchIn(text)) return QrPayload.Other(QrKind.UnsafeLink, preview(text))
        if (BARE_HOST.matches(text)) {
            val candidate = "https://$text"
            if (parsesAsUrl(candidate)) return QrPayload.Link(candidate)
        }
        return QrPayload.Other(QrKind.Text, preview(text))
    }

    private const val PREVIEW_MAX = 500

    private fun preview(text: String): String = if (text.length <= PREVIEW_MAX) text else text.take(PREVIEW_MAX) + "…"
}

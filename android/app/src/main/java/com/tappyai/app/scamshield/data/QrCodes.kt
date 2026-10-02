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

enum class QrKind { Text, Wifi, Payment, Contact, Phone, Sms, Email, Location, Calendar, UnsafeLink }

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

    private val HTTP = Regex("""(?i)^https?://\S+$""")
    private val BARE_WWW = Regex("""(?i)^www\.\S+$""")
    private val UNSAFE_SCHEME = Regex("""(?i)^(intent|javascript|data|file|content|market|android-app|vbscript|blob):""")

    /** What a decoded QR text is. Pure. A web link is checked; everything else is only named and warned about. */
    fun classify(raw: String): QrPayload {
        val text = raw.trim()
        return when {
            HTTP.matches(text) -> QrPayload.Link(text)
            BARE_WWW.matches(text) -> QrPayload.Link("https://$text")
            UNSAFE_SCHEME.containsMatchIn(text) -> QrPayload.Other(QrKind.UnsafeLink, preview(text))
            text.startsWith("WIFI:", ignoreCase = true) -> QrPayload.Other(QrKind.Wifi, previewWifi(text))
            // EMVCo merchant QR (VietQR / Napas / most bank apps) starts with the payload format indicator "000201".
            text.startsWith("000201") || text.contains("A000000727", ignoreCase = true) -> QrPayload.Other(QrKind.Payment, preview(text))
            Regex("""(?i)^(bitcoin|ethereum|litecoin|upi|paypal|zalopay|momo):""").containsMatchIn(text) -> QrPayload.Other(QrKind.Payment, preview(text))
            text.startsWith("BEGIN:VCARD", ignoreCase = true) || text.startsWith("MECARD:", ignoreCase = true) -> QrPayload.Other(QrKind.Contact, preview(text))
            text.startsWith("tel:", ignoreCase = true) -> QrPayload.Other(QrKind.Phone, preview(text))
            Regex("""(?i)^(sms|smsto|mms|mmsto):""").containsMatchIn(text) -> QrPayload.Other(QrKind.Sms, preview(text))
            text.startsWith("mailto:", ignoreCase = true) || text.startsWith("MATMSG:", ignoreCase = true) -> QrPayload.Other(QrKind.Email, preview(text))
            text.startsWith("geo:", ignoreCase = true) -> QrPayload.Other(QrKind.Location, preview(text))
            text.startsWith("BEGIN:VEVENT", ignoreCase = true) -> QrPayload.Other(QrKind.Calendar, preview(text))
            else -> QrPayload.Other(QrKind.Text, preview(text))
        }
    }

    private const val PREVIEW_MAX = 160

    private fun preview(text: String): String = if (text.length <= PREVIEW_MAX) text else text.take(PREVIEW_MAX) + "…"

    /** A Wi-Fi code shows the network name only — never the password it carries. */
    private fun previewWifi(text: String): String {
        val ssid = Regex("""(?i)(?:^|;)S:((?:\\.|[^;\\])*)""").find(text.removePrefix("WIFI:"))?.groupValues?.get(1).orEmpty()
        return ssid.replace(Regex("""\\(.)"""), "$1")
    }
}

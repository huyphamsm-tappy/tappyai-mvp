package com.tappyai.app.scamshield

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.tappyai.app.scamshield.data.QrCodes
import com.tappyai.app.scamshield.data.QrKind
import com.tappyai.app.scamshield.data.QrPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.zip.CRC32
import java.util.zip.Deflater

/**
 * QR codes are decoded ON THE DEVICE (ZXing core). The decoder is exercised on pictures made right here with the same library
 * (plain, light-on-dark, with a quiet margin and noise), and the classifier on the payload shapes real codes carry.
 */
class QrCodesTest {

    private class Pic(val w: Int, val h: Int, val argb: IntArray)

    private fun qr(text: String, size: Int = 360, margin: Int = 4, invert: Boolean = false): Pic {
        val hints = mapOf(EncodeHintType.MARGIN to margin, EncodeHintType.CHARACTER_SET to "UTF-8", EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M)
        val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
        val px = IntArray(size * size) { i ->
            val black = m.get(i % size, i / size)
            val on = if (invert) !black else black
            if (on) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
        }
        return Pic(size, size, px)
    }

    @Test fun `a plain code decodes to exactly the text it carries`() {
        val p = qr("https://example.com/abc?x=1")
        assertEquals("https://example.com/abc?x=1", QrCodes.decode(p.w, p.h, p.argb))
    }

    @Test fun `a long Vietnamese text decodes`() {
        val text = "Thanh toán đơn hàng 4821 — Nguyễn Văn A — 1.250.000đ"
        val p = qr(text, size = 480)
        assertEquals(text, QrCodes.decode(p.w, p.h, p.argb))
    }

    @Test fun `a light-on-dark code decodes too`() {
        val p = qr("https://example.com/inverted", invert = true)
        assertEquals("https://example.com/inverted", QrCodes.decode(p.w, p.h, p.argb))
    }

    @Test fun `a picture with no code decodes to nothing - and never throws`() {
        val blank = Pic(300, 300, IntArray(300 * 300) { 0xFFFFFFFF.toInt() })
        assertNull(QrCodes.decode(blank.w, blank.h, blank.argb))
        val noise = Pic(300, 300, IntArray(300 * 300) { if ((it * 2654435761L % 7L) < 3) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() })
        assertNull(QrCodes.decode(noise.w, noise.h, noise.argb))
        assertNull(QrCodes.decode(0, 0, IntArray(0)))
    }

    @Test fun `a code on a larger photo-like canvas still decodes`() {
        val code = qr("https://example.com/in-a-photo", size = 300, margin = 2)
        val w = 900
        val h = 700
        val canvas = IntArray(w * h) { 0xFF9AA5B1.toInt() }
        for (y in 0 until code.h) for (x in 0 until code.w) canvas[(y + 250) * w + (x + 300)] = code.argb[y * code.w + x]
        assertEquals("https://example.com/in-a-photo", QrCodes.decode(w, h, canvas))
    }

    // ── classification ──

    @Test fun `web links are links, a bare www gets https`() {
        assertEquals(QrPayload.Link("https://a.example/x"), QrCodes.classify("https://a.example/x"))
        assertEquals(QrPayload.Link("http://a.example/x"), QrCodes.classify("  http://a.example/x  "))
        assertEquals(QrPayload.Link("https://www.example.vn/x"), QrCodes.classify("www.example.vn/x"))
    }

    @Test fun `a Wi-Fi code is named and its text is shown as read, like the web`() {
        val p = QrCodes.classify("WIFI:T:WPA;S:Cafe Mo;P:matkhau-bi-mat-123;;") as QrPayload.Other
        assertEquals(QrKind.Wifi, p.kind)
        // Web `ScamShieldView.tsx`: `setQrOther({ kind, text: decoded.text.slice(0, 500) })` — the decoded text, whole.
        assertEquals("WIFI:T:WPA;S:Cafe Mo;P:matkhau-bi-mat-123;;", p.preview)
    }

    @Test fun `a bank payment code is a payment`() {
        val vietqr = "00020101021238570010A000000727012700069704220113VQRQ00001234560208QRIBFTTA53037045405500005802VN62100806Cam on6304ABCD"
        assertEquals(QrKind.Payment, (QrCodes.classify(vietqr) as QrPayload.Other).kind)
        assertEquals(QrKind.Payment, (QrCodes.classify("bitcoin:bc1qxyz?amount=0.1") as QrPayload.Other).kind)
    }

    @Test fun `contacts, phone, sms, mail, location and events are named`() {
        fun kind(s: String) = (QrCodes.classify(s) as QrPayload.Other).kind
        assertEquals(QrKind.Contact, kind("BEGIN:VCARD\nVERSION:3.0\nFN:A\nEND:VCARD"))
        assertEquals(QrKind.Contact, kind("MECARD:N:A;TEL:0900000000;;"))
        assertEquals(QrKind.Phone, kind("tel:+84900000000"))
        assertEquals(QrKind.Sms, kind("smsto:0900000000:xin chao"))
        assertEquals(QrKind.Email, kind("mailto:a@example.com"))
        assertEquals(QrKind.Location, kind("geo:10.77,106.69"))
        // The web's classifier has no calendar kind: any other scheme-looking text is an "app link" (never opened).
        assertEquals(QrKind.UnsafeLink, kind("BEGIN:VEVENT\nSUMMARY:x\nEND:VEVENT"))
        assertEquals(QrKind.Contact, kind("BIZCARD:N:A;;"))
        assertEquals(QrKind.Sms, kind("mms:0900000000"))
        assertEquals(QrKind.Email, kind("MATMSG:TO:a@example.com;SUB:x;BODY:y;;"))
    }

    @Test fun `payment schemes of the web list are payments`() {
        listOf("momo://pay?x=1", "zalopay:abc", "vnpay:xyz", "vietqr:abc", "viettelpay:1", "shopeepay:1", "upi:pay", "paypal:me", "alipay:1", "alipays:1", "weixin:1", "ethereum:0x1")
            .forEach { assertEquals(it, QrKind.Payment, (QrCodes.classify(it) as QrPayload.Other).kind) }
    }

    @Test fun `a bare domain is a link with https, text with spaces is not`() {
        assertEquals(QrPayload.Link("https://nop-phat.vn"), QrCodes.classify("nop-phat.vn"))
        assertEquals(QrPayload.Link("https://shop.example.com/a?b=1"), QrCodes.classify("shop.example.com/a?b=1"))
        assertEquals(QrKind.Text, (QrCodes.classify("xin chào nop-phat.vn") as QrPayload.Other).kind)
        assertEquals(QrKind.Text, (QrCodes.classify("https://not a url") as QrPayload.Other).kind)
        assertEquals(QrKind.Text, (QrCodes.classify("   ") as QrPayload.Other).kind)
    }

    @Test fun `plain text is text, and an app or data scheme is flagged as unsafe`() {
        assertEquals(QrKind.Text, (QrCodes.classify("Xin chào TappyAI") as QrPayload.Other).kind)
        assertEquals(QrKind.UnsafeLink, (QrCodes.classify("intent://scan/#Intent;scheme=zxing;end") as QrPayload.Other).kind)
        assertEquals(QrKind.UnsafeLink, (QrCodes.classify("javascript:alert(1)") as QrPayload.Other).kind)
        assertEquals(QrKind.UnsafeLink, (QrCodes.classify("data:text/html;base64,PGgxPmhpPC9oMT4=") as QrPayload.Other).kind)
    }

    @Test fun `a long payload is previewed cut at 500 characters (web contract)`() {
        val p = QrCodes.classify("x".repeat(800)) as QrPayload.Other
        assertTrue(p.preview.length <= 501)
        assertTrue(p.preview.length > 400)
    }

    // ── fixtures for the emulator run (only when asked) ──

    /** `TAPPY_QR_OUT=<dir>` writes the PNG fixtures used by the e2e flow; with the variable unset this is a no-op. */
    @Test fun `writes the e2e QR fixtures when asked`() {
        val out = System.getenv("TAPPY_QR_OUT") ?: return
        val dir = File(out).apply { mkdirs() }
        val samples = mapOf(
            "qr-link-danger.png" to "http://vietcombank-xacthuc-taikhoan.top/login",
            "qr-link-safe.png" to "https://www.tappyai.com/",
            "qr-text.png" to "Xin chào, đây là mã chỉ chứa chữ",
            "qr-payment.png" to "00020101021238570010A000000727012700069704220113VQRQ00001234560208QRIBFTTA53037045405500005802VN62100806Cam on6304ABCD",
            "qr-wifi.png" to "WIFI:T:WPA;S:Cafe Mo;P:matkhau-bi-mat-123;;",
        )
        for ((name, text) in samples) {
            val pic = qr(text, size = 640, margin = 4)
            File(dir, name).writeBytes(png(pic.w, pic.h, pic.argb))
        }
    }

    /** Minimal 8-bit grayscale PNG (no java.awt on the unit-test classpath). */
    private fun png(w: Int, h: Int, argb: IntArray): ByteArray {
        val raw = ByteArray((w + 1) * h)
        for (y in 0 until h) for (x in 0 until w) raw[y * (w + 1) + 1 + x] = (argb[y * w + x] and 0xFF).toByte()
        val d = Deflater().apply { setInput(raw); finish() }
        val z = ByteArrayOutputStream(); val buf = ByteArray(8192)
        while (!d.finished()) z.write(buf, 0, d.deflate(buf))
        val out = ByteArrayOutputStream()
        fun chunk(type: String, data: ByteArray) {
            val o = DataOutputStream(out); o.writeInt(data.size)
            val t = type.toByteArray(Charsets.US_ASCII); o.write(t); o.write(data)
            val c = CRC32(); c.update(t); c.update(data); o.writeInt(c.value.toInt())
        }
        out.write(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 13, 10, 26, 10))
        val ihdr = ByteArrayOutputStream(); DataOutputStream(ihdr).apply { writeInt(w); writeInt(h); write(byteArrayOf(8, 0, 0, 0, 0)) }
        chunk("IHDR", ihdr.toByteArray()); chunk("IDAT", z.toByteArray()); chunk("IEND", ByteArray(0))
        return out.toByteArray()
    }
}

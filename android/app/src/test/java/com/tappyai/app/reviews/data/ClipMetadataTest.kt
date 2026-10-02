package com.tappyai.app.reviews.data

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer

/**
 * F-099 on Android (parity 2026-09-28): the server refuses a clip at upload completion when its
 * MP4/MOV still carries `udta` / `meta` / XMP or a non-zero creation time (web `clipMetadata.ts`,
 * `findIdentifyingMetadata`). The web neutralises before the PUT; Android had no video upload at all.
 * [ClipMetadata.neutralize] is the same algorithm: metadata boxes retyped to `free` AND zeroed, the
 * mvhd/tkhd/mdhd times zeroed, the file length and every media byte unchanged.
 */
class ClipMetadataTest {

    private fun box(type: String, payload: ByteArray): ByteArray =
        ByteBuffer.allocate(8 + payload.size).putInt(8 + payload.size).put(type.toByteArray(Charsets.ISO_8859_1)).put(payload).array()

    private fun fullBoxV0WithTimes(type: String, creation: Int, modification: Int, rest: Int = 20): ByteArray =
        box(type, ByteBuffer.allocate(4 + 8 + rest).putInt(0).putInt(creation).putInt(modification).array())

    private fun sampleMp4(): ByteArray {
        val udta = box("udta", box("©xyz", "+10.7725+106.6980/".toByteArray()) + box("©mak", "Google".toByteArray()))
        val trak = box("trak", fullBoxV0WithTimes("tkhd", 111, 222) + box("mdia", fullBoxV0WithTimes("mdhd", 333, 444)))
        val moov = box("moov", fullBoxV0WithTimes("mvhd", 555, 666) + trak + udta)
        val out = ByteArrayOutputStream()
        out.write(box("ftyp", "isom\u0000\u0000\u0002\u0000isomiso2mp41".toByteArray(Charsets.ISO_8859_1)))
        out.write(box("mdat", ByteArray(64) { (it * 7).toByte() }))
        out.write(moov)
        return out.toByteArray()
    }

    @Test
    fun `metadata boxes become zeroed free boxes, times are zeroed, nothing else moves`() {
        val original = sampleMp4()
        val f = File.createTempFile("clip", ".mp4").apply { writeBytes(original); deleteOnExit() }
        assertTrue(ClipMetadata.neutralize(f))
        val out = f.readBytes()
        assertEquals("same length — no sample offset may move", original.size, out.size)
        val text = String(out, Charsets.ISO_8859_1)
        assertFalse("no udta left", text.contains("udta"))
        assertFalse("no GPS value left in the bytes", text.contains("+10.7725"))
        assertFalse("no device left", text.contains("Google"))
        assertTrue(text.contains("free"))
        // mdat payload untouched
        val mdatAt = text.indexOf("mdat") + 4
        assertArrayEquals(original.copyOfRange(mdatAt, mdatAt + 64), out.copyOfRange(mdatAt, mdatAt + 64))
        // every time field is zero
        for (t in listOf("mvhd", "tkhd", "mdhd")) {
            val at = text.indexOf(t) + 4 + 4 // type + version/flags
            assertArrayEquals(t, ByteArray(8), out.copyOfRange(at, at + 8))
        }
    }

    @Test
    fun `a file that is not ISO-BMFF is left alone (the server refuses it as unsupported)`() {
        val f = File.createTempFile("clip", ".webm").apply { writeBytes(byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte(), 1, 2, 3, 4, 5, 6, 7, 8)); deleteOnExit() }
        val before = f.readBytes()
        assertFalse(ClipMetadata.neutralize(f))
        assertArrayEquals(before, f.readBytes())
    }
}

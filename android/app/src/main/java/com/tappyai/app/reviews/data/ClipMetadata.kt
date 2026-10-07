package com.tappyai.app.reviews.data

import java.io.File
import java.io.RandomAccessFile

/**
 * F-099 — a clip must not publish where and with what it was filmed. The Android twin of the web's
 * `neutralizeClipMetadata` (src/lib/media/clipMetadata.ts), same algorithm, done IN PLACE on a local
 * copy before the PUT:
 *  - top-level `udta` / `meta` / XMP `uuid` boxes → retyped `free` and their payload zeroed;
 *  - inside `moov`: every `udta` / `meta` likewise, and the creation + modification times of
 *    `mvhd` / `tkhd` / `mdhd` zeroed.
 * Same length, so no `stco` / `co64` sample offset moves and nothing needs re-muxing. Only box headers
 * and the `moov` box are read — never the media data. The server refuses the upload at completion
 * (`findIdentifyingMetadata`) when anything identifying is still there.
 */
object ClipMetadata {
    private const val MAX_MOOV_BYTES = 32 * 1024 * 1024
    private const val MAX_TOP_LEVEL_BOXES = 64
    private val XMP_UUID = intArrayOf(0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac)
    private val CONTAINERS = setOf("moov", "trak", "mdia", "minf", "stbl", "edts", "dinf")
    private val METADATA_BOXES = setOf("udta", "meta")
    private val TIME_BOXES = setOf("mvhd", "tkhd", "mdhd")
    private val FIRST_BOX_TYPES = setOf("ftyp", "wide", "free", "mdat", "moov", "skip", "uuid", "pnot")

    private data class TopBox(val type: String, val offset: Long, val size: Long, val headerLen: Int, val uuid: IntArray?)

    private fun u32(b: ByteArray, o: Int): Long =
        ((b[o].toLong() and 0xff) shl 24) or ((b[o + 1].toLong() and 0xff) shl 16) or ((b[o + 2].toLong() and 0xff) shl 8) or (b[o + 3].toLong() and 0xff)

    private fun typeAt(b: ByteArray, o: Int) = String(b, o, 4, Charsets.ISO_8859_1)

    private fun printable(t: String) = t.all { it.code in 0x20..0x7e || it.code == 0xa9 }

    private fun topLevelBoxes(f: RandomAccessFile): List<TopBox>? {
        val total = f.length()
        val out = mutableListOf<TopBox>()
        var p = 0L
        val h = ByteArray(32)
        while (p + 8 <= total && out.size < MAX_TOP_LEVEL_BOXES) {
            val n = minOf(32L, total - p).toInt()
            f.seek(p); f.readFully(h, 0, n)
            var size = u32(h, 0)
            val type = typeAt(h, 4)
            var headerLen = 8
            if (size == 1L) {
                if (n < 16) return null
                size = (u32(h, 8) shl 32) + u32(h, 12)
                headerLen = 16
            } else if (size == 0L) size = total - p
            if (!printable(type) || size < headerLen || p + size > total) return if (p == 0L) null else out
            val uuid = if (type == "uuid" && n >= headerLen + 16) IntArray(16) { h[headerLen + it].toInt() and 0xff } else null
            out += TopBox(type, p, size, headerLen, uuid)
            p += size
        }
        return if (out.isNotEmpty() && out[0].type in FIRST_BOX_TYPES) out else null
    }

    private fun blank(m: ByteArray, o: Int, size: Int) {
        val header = if (u32(m, o) == 1L) 16 else 8
        "free".toByteArray(Charsets.ISO_8859_1).copyInto(m, o + 4)
        m.fill(0, o + header, o + size)
    }

    private fun walkMoov(m: ByteArray, fn: (type: String, offset: Int, size: Int) -> Boolean) {
        fun walk(start: Int, end: Int) {
            var p = start
            while (p + 8 <= end) {
                var size = u32(m, p)
                val type = typeAt(m, p + 4)
                var header = 8
                if (size == 1L) { size = (u32(m, p + 8) shl 32) + u32(m, p + 12); header = 16 } else if (size == 0L) size = (end - p).toLong()
                if (size < header || p + size > end) return
                val descend = fn(type, p, size.toInt())
                if (descend && type in CONTAINERS) walk(p + header, p + size.toInt())
                p += size.toInt()
            }
        }
        walk(0, m.size)
    }

    private fun zeroTimes(m: ByteArray, offset: Int) {
        val version = m[offset + 8].toInt()
        val base = offset + 12
        val len = if (version == 1) 16 else 8
        if (base + len <= m.size) m.fill(0, base, base + len)
    }

    /** Neutralises [file] in place. False when it is not ISO-BMFF (left untouched; the server refuses it). */
    fun neutralize(file: File): Boolean = RandomAccessFile(file, "rw").use { f ->
        val boxes = topLevelBoxes(f) ?: return false
        for (b in boxes) {
            val isXmp = b.type == "uuid" && b.uuid != null && b.uuid.indices.all { b.uuid[it] == XMP_UUID[it] }
            if (b.type == "moov" && b.size <= MAX_MOOV_BYTES) {
                val m = ByteArray(b.size.toInt())
                f.seek(b.offset); f.readFully(m)
                walkMoov(m) { type, o, size ->
                    when (type) {
                        // Retyping alone would HIDE the values from parsers but leave them in the bytes.
                        in METADATA_BOXES -> { blank(m, o, size); false }
                        in TIME_BOXES -> { zeroTimes(m, o); true }
                        else -> true
                    }
                }
                f.seek(b.offset); f.write(m)
            } else if ((b.type in METADATA_BOXES || isXmp) && b.size <= MAX_MOOV_BYTES) {
                val m = ByteArray(b.size.toInt())
                f.seek(b.offset); f.readFully(m)
                blank(m, 0, b.size.toInt())
                f.seek(b.offset); f.write(m)
            }
        }
        true
    }
}

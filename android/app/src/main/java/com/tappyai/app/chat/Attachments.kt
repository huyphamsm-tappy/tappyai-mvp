package com.tappyai.app.chat

import com.tappyai.app.chat.data.PDF_MIME

/** What a picked file is to the chat (web handleImageSelect: the same limits the server applies, said before sending). */
enum class AttachCheck { Image, Pdf, Unsupported, PdfTooLarge }

private val IMAGE_TYPES = setOf("image/png", "image/jpeg", "image/webp", "image/gif")

/** The largest PDF the server reads (web PDF_MAX_BYTES). */
const val PDF_LIMIT_BYTES = 3_000_000L

/** 02/11, as on the web: a photo PNG / JPG / WEBP / GIF, or a PDF up to 3 MB (the server reads its text); nothing else. */
fun attachmentCheck(mime: String?, sizeBytes: Long?): AttachCheck = when {
    mime in IMAGE_TYPES -> AttachCheck.Image
    mime == PDF_MIME -> if ((sizeBytes ?: 0) > PDF_LIMIT_BYTES) AttachCheck.PdfTooLarge else AttachCheck.Pdf
    else -> AttachCheck.Unsupported
}

/** How many bytes a stream holds, counted only up to [cap] (review 01/11: the length of a file whose provider reports no size). */
fun countBytesUpTo(input: java.io.InputStream, cap: Long): Long {
    val buf = ByteArray(8192)
    var total = 0L
    while (total < cap) {
        val n = input.read(buf, 0, minOf(buf.size.toLong(), cap - total).toInt())
        if (n < 0) break
        total += n
    }
    return total
}

/** The types the picker offers (the same list, so a refused file is rare). */
val ATTACHABLE_TYPES: Array<String> = (IMAGE_TYPES + PDF_MIME).toTypedArray()

package com.tappyai.app.chat

import com.tappyai.app.chat.data.PDF_MIME

/** What a picked file is to the chat (web handleImageSelect: the same limits the server applies, said before sending). */
enum class AttachCheck { Image, Pdf, Unsupported, PdfTooLarge }

private val IMAGE_TYPES = setOf("image/png", "image/jpeg", "image/webp", "image/gif")

/** 02/11, as on the web: a photo PNG / JPG / WEBP / GIF, or a PDF up to 3 MB (the server reads its text); nothing else. */
fun attachmentCheck(mime: String?, sizeBytes: Long?): AttachCheck = when {
    mime in IMAGE_TYPES -> AttachCheck.Image
    mime == PDF_MIME -> if ((sizeBytes ?: 0) > 3_000_000) AttachCheck.PdfTooLarge else AttachCheck.Pdf
    else -> AttachCheck.Unsupported
}

/** The types the picker offers (the same list, so a refused file is rare). */
val ATTACHABLE_TYPES: Array<String> = (IMAGE_TYPES + PDF_MIME).toTypedArray()

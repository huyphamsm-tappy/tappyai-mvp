package com.tappyai.app.scan.data

import kotlinx.serialization.Serializable

/** Wire shape for `POST /api/scan` — matches the backend's `{imageBase64, mimeType}` body
 *  (`src/app/api/scan/route.ts`). [imageBase64] has no `data:` URL prefix (already stripped
 *  client-side); [mimeType] is one of image/jpeg|png|webp|gif, else the server falls back to JPEG. */
@Serializable
data class ScanRequestDto(
    val imageBase64: String,
    val mimeType: String,
)

/** Success shape: `{text}`, the extracted OCR text. On non-2xx the backend returns `{error}`
 *  instead; that arrives as an HTTP error status via [retrofit2.HttpException] — this DTO only
 *  models the success body. */
@Serializable
data class ScanResponseDto(
    val text: String = "",
)

package com.tappyai.app.vietwriter.data

import kotlinx.serialization.Serializable

/** Wire shape for `POST /api/viet-content` — matches the backend's `{topic, platform, tone,
 *  length}` body (`src/app/api/viet-content/route.ts`). All fields but [topic] default
 *  server-side (`facebook`/`youthful`/`medium`) if omitted; this client always sends them
 *  explicitly since the UI always has a selection. */
@Serializable
data class VietWriterRequestDto(
    val topic: String,
    val platform: String,
    val tone: String,
    val length: String,
)

/** Success shape: `{caption, hashtags}`. On non-2xx the backend returns `{error}` instead; that
 *  arrives as an HTTP error status via [retrofit2.HttpException] — this DTO only models the
 *  success body. */
@Serializable
data class VietWriterResponseDto(
    val caption: String = "",
    val hashtags: String = "",
)

package com.tappyai.app.translate.data

import kotlinx.serialization.Serializable

/** Wire shape for `POST /api/translate` — matches the backend's `{text, targetLang}` body. */
@Serializable
data class TranslateRequestDto(
    val text: String,
    val targetLang: String,
)

/** Success shape: `{translation}`. On non-2xx the backend returns `{error, message}` instead;
 *  that arrives as an HTTP error status, which [retrofit2.HttpException] surfaces separately —
 *  this DTO only models the success body. */
@Serializable
data class TranslateResponseDto(
    val translation: String = "",
)

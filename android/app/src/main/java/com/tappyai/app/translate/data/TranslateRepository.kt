package com.tappyai.app.translate.data

import com.tappyai.core.network.NetworkResult

/** Abstraction over the translate backend. The ViewModel depends on this only — never on
 *  Retrofit/OkHttp or the DTOs. Translation itself (the AI call) is entirely server-side. */
interface TranslateRepository {

    /** Translates [text] into the language identified by [targetLang] (a backend-recognized
     *  code, e.g. "vi", "ja", "zh-CN" — see [com.tappyai.app.translate.LANGUAGES]). */
    suspend fun translate(text: String, targetLang: String): NetworkResult<String>
}

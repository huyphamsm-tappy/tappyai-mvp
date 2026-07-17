package com.tappyai.app.scan.data

import com.tappyai.core.network.NetworkResult

/** Abstraction over the scan backend. The ViewModel depends on this only — never on
 *  Retrofit/OkHttp or the DTOs. OCR itself (the vision AI call) is entirely server-side. */
interface ScanRepository {

    /** Extracts text from [imageBase64] (already resized/compressed client-side, no `data:`
     *  prefix), declaring its real type via [mimeType] (`image/jpeg`, `image/png`, etc). */
    suspend fun scan(imageBase64: String, mimeType: String): NetworkResult<String>
}

package com.tappyai.app.scamshield.data

/**
 * Outcome of a Scam Shield check.
 *
 * A dedicated type rather than [com.tappyai.core.network.NetworkResult] because the web keys its
 * error copy off the server's JSON `error` code (`rate_limit`, `qr_no_url`, …), not off the HTTP
 * status — and `NetworkResult.Error` carries only the status. Preserving that code is what lets
 * [ScamShieldErrorMessages] reproduce the web's mapping exactly.
 */
sealed interface ScamShieldOutcome {

    data class Success(val result: ScamShieldResultDto) : ScamShieldOutcome

    /**
     * The server answered with a non-2xx and this `error` code — null when the body was missing
     * or unparseable. Mirrors the web's `ERROR_I18N[data.error]` lookup, including its
     * `data = {}` fallback when the body will not parse.
     */
    data class ServerError(val code: String?) : ScamShieldOutcome

    /**
     * The request never completed — no connectivity, timeout, cancelled socket. This is a
     * distinct case, not a null [ServerError]: the web routes a thrown `fetch` into its `catch`
     * block, which shows *different* copy from an error response with an unknown code.
     */
    data object TransportError : ScamShieldOutcome
}

/** Abstraction over the Scam Shield backend. The ViewModel depends on this only. */
interface ScamShieldRepository {

    /** `POST /api/scam-shield/check` with `{url}` — the URL is sent as typed, trimmed. */
    suspend fun check(url: String): ScamShieldOutcome

    /** `POST /api/scam-shield/qr` with the picked image as a multipart `image` part. */
    suspend fun checkQr(image: ByteArray, mimeType: String): ScamShieldOutcome
}

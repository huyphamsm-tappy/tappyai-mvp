package com.tappyai.app.scamshield.data

import com.tappyai.core.logging.LoggerProvider
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [ScamShieldRepository]. Does no analysis of its own — it posts, reads the
 * response, and hands back either the server's `CheckResult` or the server's error code.
 *
 * Exception handling mirrors core:network's `safeApiCall`: everything is folded into a result
 * except [CancellationException], which is rethrown so coroutine cancellation keeps working.
 */
@Singleton
class RealScamShieldRepository @Inject constructor(
    private val api: ScamShieldApi,
    private val json: Json,
    private val logger: LoggerProvider,
) : ScamShieldRepository {

    override suspend fun check(url: String): ScamShieldOutcome = runCatching {
        api.check(ScamShieldCheckRequestDto(url = url))
    }.fold(::toOutcome, ::toFailure)

    override suspend fun checkQr(image: ByteArray, mimeType: String): ScamShieldOutcome = runCatching {
        val part = MultipartBody.Part.createFormData(
            // Field name must stay "image": the route reads formData.get('image').
            name = "image",
            filename = "qr",
            body = image.toRequestBody(mimeType.toMediaTypeOrNull()),
        )
        api.checkQr(part)
    }.fold(::toOutcome, ::toFailure)

    private fun toOutcome(response: Response<ScamShieldResultDto>): ScamShieldOutcome {
        val body = response.body()
        if (response.isSuccessful && body != null) return ScamShieldOutcome.Success(body)

        // Non-2xx: the route always answers with {error, message}. Read the code the web keys on.
        val raw = try { response.errorBody()?.string() } catch (e: Exception) {
            logger.w(TAG, "Could not read error body: ${e.message}")
            null
        }
        val code = raw?.let {
            try { json.decodeFromString<ScamShieldErrorDto>(it).error } catch (_: Exception) { null }
        }
        return ScamShieldOutcome.ServerError(code)
    }

    private fun toFailure(t: Throwable): ScamShieldOutcome {
        if (t is CancellationException) throw t
        logger.w(TAG, "Scam Shield request failed: ${t.message}")
        // The request itself failed, so no error code exists. Kept distinct from a ServerError
        // with an unknown code because the web shows different copy for the two.
        return ScamShieldOutcome.TransportError
    }

    private companion object {
        const val TAG = "ScamShieldRepository"
    }
}

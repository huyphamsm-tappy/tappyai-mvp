package com.tappyai.features.auth.data

import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.CancellationException

/**
 * `core:network`'s `safeApiCall` (Phase 1A) has fine-grained catch clauses for Retrofit/OkHttp
 * exception types — those don't apply here, since supabase-kt (Ktor-based) throws its own
 * exception hierarchy. Rather than guess at exact Supabase/Ktor exception class names without
 * being able to verify them in this environment, this deliberately stays coarse: preserve
 * [CancellationException] (same reasoning as `safeApiCall`, still critical here), map
 * everything else to [NetworkError.Unknown]. Sharpen this into specific [NetworkError] cases
 * (rate-limited OTP requests, invalid-code errors, etc.) once the real exception types are
 * confirmed against a build.
 */
suspend fun <T> safeAuthCall(call: suspend () -> T): NetworkResult<T> {
    return try {
        NetworkResult.Success(call())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        NetworkResult.Error(NetworkError.Unknown(e))
    }
}

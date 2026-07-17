package com.tappyai.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * The single place a raw Retrofit/OkHttp exception gets mapped into [NetworkResult] — every
 * repository call goes through this instead of each writing its own try/catch. Order matters:
 * [SocketTimeoutException] and [SerializationException] are caught before the broader
 * [IOException]/[Exception] they'd otherwise be swallowed by, and [CancellationException] is
 * explicitly rethrown — it's a subtype of [Exception] on the JVM, so without this it would be
 * silently wrapped into a [NetworkResult.Error] instead of propagating, breaking structured
 * concurrency (a caller's coroutine cancellation would stop actually cancelling the call).
 */
suspend fun <T> safeApiCall(apiCall: suspend () -> T): NetworkResult<T> {
    return try {
        NetworkResult.Success(apiCall())
    } catch (e: HttpException) {
        NetworkResult.Error(NetworkError.Http(code = e.code(), message = e.message()))
    } catch (e: SocketTimeoutException) {
        NetworkResult.Error(NetworkError.Timeout)
    } catch (e: SerializationException) {
        NetworkResult.Error(NetworkError.Serialization(e))
    } catch (e: IOException) {
        NetworkResult.Error(NetworkError.NoConnectivity)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        NetworkResult.Error(NetworkError.Unknown(e))
    }
}

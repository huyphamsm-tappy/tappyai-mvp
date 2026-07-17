package com.tappyai.core.network

/** Every way an API call can fail, mapped from the raw exceptions [safeApiCall] catches —
 *  callers branch on this instead of catching `IOException`/`HttpException`/etc. themselves. */
sealed class NetworkError {
    data class Http(val code: Int, val message: String?) : NetworkError()
    data object NoConnectivity : NetworkError()
    data object Timeout : NetworkError()
    data class Serialization(val throwable: Throwable) : NetworkError()
    data class Unknown(val throwable: Throwable) : NetworkError()
}

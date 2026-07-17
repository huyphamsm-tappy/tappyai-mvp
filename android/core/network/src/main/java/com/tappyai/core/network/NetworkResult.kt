package com.tappyai.core.network

/** Standardizes every API response instead of exposing raw exceptions to callers — see
 *  [safeApiCall] for the one place exceptions get mapped into this. */
sealed class NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class Error(val error: NetworkError) : NetworkResult<Nothing>()
}

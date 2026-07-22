package com.tappyai.app.currency.data

import retrofit2.http.GET

/**
 * Retrofit contract for the rates endpoint. Built from the shared [retrofit2.Retrofit]
 * (core:network). No auth needed — the backend serves the same USD-based rate table to every
 * caller (matches the web, which fetches this with no sign-in).
 */
interface RatesApi {

    @GET("api/rates")
    suspend fun getRates(): RatesResponseDto
}

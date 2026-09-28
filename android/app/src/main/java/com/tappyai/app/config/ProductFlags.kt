package com.tappyai.app.config

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.GET
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The server-owned product flags of `GET /api/config` (`flags` block) that change what Android
 * shows. Today: `publicShare` — the web's SHOW_PUBLIC_SHARE, which hides the "public link" share row.
 *
 * FAIL-CLOSED: every flag reads `false` until the server says otherwise, and stays `false` when the
 * config cannot be fetched — a switched-off sharing control must never reappear because a request
 * failed.
 */
@Serializable
data class ProductFlagsDto(val flags: FlagsDto = FlagsDto())

@Serializable
data class FlagsDto(val publicShare: Boolean = false)

interface ProductFlagsApi {
    @GET("api/config")
    suspend fun getConfig(): ProductFlagsDto
}

@Singleton
class ProductFlagsRepository @Inject constructor(retrofit: Retrofit) {
    private val api = retrofit.create(ProductFlagsApi::class.java)
    private val _publicShare = MutableStateFlow(false)
    val publicShare: StateFlow<Boolean> = _publicShare.asStateFlow()

    /** Re-reads the flags; a failure keeps the last known (initially closed) values. */
    suspend fun refresh() {
        runCatching { api.getConfig() }.onSuccess { _publicShare.value = it.flags.publicShare }
    }
}

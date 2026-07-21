package com.tappyai.app.appconnections.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.GET

/** Backend contract for third-party integrations. Built from the shared singleton Retrofit
 *  (core:network), so the auth interceptor attaches the bearer token. */
interface AppConnectionsApi {
    /** Lists every known provider with its connected state for the current user (auth-only; 401
     *  when signed out). */
    @GET("api/integrations")
    suspend fun getIntegrations(): IntegrationsResponseDto
}

@Serializable
data class IntegrationsResponseDto(
    val integrations: List<IntegrationDto> = emptyList(),
)

@Serializable
data class IntegrationDto(
    val provider: String = "",
    val connected: Boolean = false,
    @SerialName("connected_at") val connectedAt: String? = null,
)

package com.tappyai.app.notifications.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Registers this device's FCM token with the backend.
 *
 * Deliberately the SAME endpoint the web already uses for its push subscriptions
 * (`/api/notifications/subscribe`), and the same `notification_subscriptions` table behind it —
 * the schema was written with `provider` and a JSON payload precisely so a second transport would
 * not need a second contract. Android sends `provider: "fcm"`; the web keeps sending `webpush`.
 *
 * Built from the shared singleton Retrofit (core:network), so the user's existing session rides
 * along. No second authentication mechanism, and no service credential of any kind lives in the
 * app: the FCM token identifies a DEVICE, and the server decides whose device it is from the
 * authenticated session, not from anything the client claims.
 */
interface NotificationSubscriptionApi {
    @POST("api/notifications/subscribe")
    suspend fun subscribe(@Body body: FcmSubscriptionDto)
}

@Serializable
data class FcmSubscriptionDto(
    val token: String,
    val provider: String = PROVIDER_FCM,
) {
    companion object {
        const val PROVIDER_FCM = "fcm"
    }
}

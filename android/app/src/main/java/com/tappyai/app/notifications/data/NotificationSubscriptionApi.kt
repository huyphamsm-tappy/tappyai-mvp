package com.tappyai.app.notifications.data

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
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

/**
 * 🚨 UAT3 (2026-09-27, measured on a Galaxy A12): `provider` was a DEFAULT value and the app's Json
 * does not encode defaults, so the body went out as `{"token":…}` with no provider — the route took
 * the Web Push branch and answered 400 on every registration; no Android device ever subscribed.
 * `@EncodeDefault` makes the field part of the wire contract (pinned by FcmRegistrationTest).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class FcmSubscriptionDto(
    val token: String,
    @EncodeDefault val provider: String = PROVIDER_FCM,
) {
    companion object {
        const val PROVIDER_FCM = "fcm"
    }
}

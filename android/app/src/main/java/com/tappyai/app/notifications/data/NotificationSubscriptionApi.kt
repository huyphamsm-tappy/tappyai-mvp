package com.tappyai.app.notifications.data

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.HTTP
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

    /**
     * Switches THIS device's server-side subscription off (server `DELETE /api/notifications/subscribe`, body
     * `{provider?: 'webpush'|'fcm', credential?: string}`): sets `enabled=false` for the session user's row of that
     * provider, narrowed to this token when `credential` is sent. Retrofit needs [HTTP] for a DELETE with a body.
     * A non-2xx answer throws (so the caller can tell "off" from "not off").
     */
    @HTTP(method = "DELETE", path = "api/notifications/subscribe", hasBody = true)
    suspend fun unsubscribe(@Body body: FcmUnsubscribeDto)
}

/**
 * `credential` is the FCM token (names the device); it is OMITTED when unknown — the app's Json does not encode
 * defaults — because the server answers 400 to a present-but-null credential. Absent = provider-scoped (the one
 * `fcm` row the account holds).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class FcmUnsubscribeDto(
    @EncodeDefault val provider: String = FcmSubscriptionDto.PROVIDER_FCM,
    val credential: String? = null,
)

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

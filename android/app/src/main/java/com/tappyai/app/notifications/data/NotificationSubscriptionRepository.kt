package com.tappyai.app.notifications.data

import com.tappyai.core.logging.LoggerProvider
import com.tappyai.features.auth.data.AuthRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sends the device's FCM token to the backend.
 *
 * Registration failure is logged and swallowed rather than retried or surfaced: a token that did
 * not reach the server means notifications do not arrive yet, which is recoverable — FCM issues a
 * fresh `onNewToken` on reinstall, restore and token rotation, and the app re-registers at every
 * launch anyway. Crashing or blocking the user over it would be a worse outcome than a delay.
 */
@Singleton
class NotificationSubscriptionRepository @Inject constructor(
    private val api: NotificationSubscriptionApi,
    private val logger: LoggerProvider,
    private val auth: AuthRepository,
) {
    suspend fun register(token: String) {
        if (token.isBlank()) return
        // Only an ACCOUNT owns a device: the route refuses no session (401) and an anonymous one (403).
        // FCM's first onNewToken usually arrives before sign-in; that call is skipped here and the
        // device is registered when the session becomes Authenticated (PushRegistration).
        if (!shouldRegister(hasSession = auth.hasSession(), anonymous = auth.isAnonymous())) return
        runCatching { api.subscribe(FcmSubscriptionDto(token = token)) }
            .onFailure { logger.e(TAG, "FCM token registration failed: ${it.message}") }
    }

    /**
     * Turns this device's server-side push OFF. `true` = the server now has it off (or there is nothing to switch
     * off: no account session, or a guest, never registers a device); `false` = the call failed (network, 5xx) —
     * the caller must NOT tell the person it is off. [token] names the device; null = provider-scoped.
     */
    suspend fun unregister(token: String?): Boolean {
        if (!shouldRegister(hasSession = auth.hasSession(), anonymous = auth.isAnonymous())) return true
        return runCatching { api.unsubscribe(FcmUnsubscribeDto(credential = token?.takeIf { it.isNotBlank() })) }
            .onFailure { logger.e(TAG, "FCM unsubscribe failed: ${it.javaClass.simpleName}") }
            .isSuccess
    }

    companion object {
        private const val TAG = "NotificationSubscription"

        /** Pure, unit-tested. */
        fun shouldRegister(hasSession: Boolean, anonymous: Boolean): Boolean = hasSession && !anonymous
    }
}

@Module
@InstallIn(SingletonComponent::class)
object NotificationSubscriptionModule {

    @Provides
    @Singleton
    fun provideNotificationSubscriptionApi(retrofit: Retrofit): NotificationSubscriptionApi =
        retrofit.create(NotificationSubscriptionApi::class.java)
}

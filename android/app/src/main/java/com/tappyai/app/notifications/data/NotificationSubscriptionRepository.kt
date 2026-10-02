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

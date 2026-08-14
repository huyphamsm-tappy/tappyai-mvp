package com.tappyai.app.notifications.data

import com.tappyai.core.logging.LoggerProvider
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
) {
    suspend fun register(token: String) {
        if (token.isBlank()) return
        runCatching { api.subscribe(FcmSubscriptionDto(token = token)) }
            .onFailure { logger.e(TAG, "FCM token registration failed: ${it.message}") }
    }

    private companion object {
        const val TAG = "NotificationSubscription"
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

package com.tappyai.app.notifications.data

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.tappyai.app.notifications.NotificationPreferenceStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Registers this device's FCM token for the signed-in ACCOUNT (UAT3, 2026-09-27).
 *
 * Measured gap: the token was only sent from `onNewToken` (usually the first launch, before any
 * sign-in — refused 401/403) and from the Notifications switch (default ON, so nobody touches it).
 * A signed-in user's device was therefore never registered. AppNavHostViewModel calls this each
 * time the session becomes Authenticated; the switch keeps the final say (OFF → nothing is sent).
 */
@Singleton
class PushRegistration @Inject constructor(
    @ApplicationContext private val context: Context,
    private val subscriptions: NotificationSubscriptionRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun onSignedIn() {
        if (!NotificationPreferenceStore(context).enabled) return
        runCatching {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                val token = if (task.isSuccessful) task.result else null
                if (!token.isNullOrBlank()) scope.launch { subscriptions.register(token) }
            }
        }
    }
}

package com.tappyai.app.notifications

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.tappyai.app.notifications.data.NotificationSubscriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Notifications preferences screen.
 *
 * [pushEnabled] is the "Tappy notifications" preference ([NotificationPreferenceStore]): ON by
 * default, OFF only after the person switched it off, persisted on the device — the same contract
 * as the web's `lib/notifications/preference.ts`. It is NOT the OS permission: the screen reads
 * that separately and never lets one stand in for the other.
 *
 * Turning push ON (explicitly, by the person's own tap) is also when this device is registered
 * with the backend. The default-ON preference registers nothing by itself: FCM's own
 * `onNewToken` already reports the device address at install and rotation, so an explicit tap
 * only re-sends it — nothing is collected here that the transport did not already collect.
 *
 * The Tappy identity SOUND is a different setting entirely and lives in
 * [TappyNotificationPreferences]; nothing here reads or writes it.
 */
@HiltViewModel
class NotificationsViewModel @Inject constructor(
    @ApplicationContext appContext: Context,
    private val subscriptions: NotificationSubscriptionRepository,
) : ViewModel() {
    private val preference = NotificationPreferenceStore(appContext)

    private val _pushEnabled = MutableStateFlow(preference.enabled)
    val pushEnabled: StateFlow<Boolean> = _pushEnabled.asStateFlow()

    /** The person's explicit choice: written as-is, ON or OFF, and kept until they change it. */
    fun setPushEnabled(enabled: Boolean) {
        preference.write(enabled)
        _pushEnabled.value = enabled
        if (enabled) registerDevice()
    }

    /**
     * Asks FCM for this device's token and hands it to the existing subscribe endpoint.
     *
     * Failure is not surfaced: the callback simply does not register. FCM re-issues the token
     * through `onNewToken` on reinstall, restore and rotation, and enabling push again retries —
     * so a transient failure here costs a delay, not the feature.
     */
    private fun registerDevice() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val token = task.result
            if (!task.isSuccessful || token.isNullOrBlank()) return@addOnCompleteListener
            viewModelScope.launch { subscriptions.register(token) }
        }
    }
}

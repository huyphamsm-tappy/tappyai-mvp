package com.tappyai.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.tappyai.app.notifications.data.NotificationSubscriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Notifications preferences screen.
 *
 * Turning push ON is what registers this device with the backend — deliberately not app start.
 * A device address collected from someone who never asked for notifications is data taken without
 * a reason, so the token is fetched at the moment of consent and not before.
 *
 * The Tappy identity SOUND is a different setting entirely and lives in
 * [TappyNotificationPreferences]; nothing here reads or writes it.
 */
@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val subscriptions: NotificationSubscriptionRepository,
) : ViewModel() {
    private val _pushEnabled = MutableStateFlow(false)
    val pushEnabled: StateFlow<Boolean> = _pushEnabled.asStateFlow()

    fun setPushEnabled(enabled: Boolean) {
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

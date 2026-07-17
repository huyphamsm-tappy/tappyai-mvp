package com.tappyai.app.notifications

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * UI-only state for the Notifications preferences screen. Mirrors the web `NotificationSettings`
 * main toggle, but with **no** push engine, permission request, persistence, or backend — flipping
 * the switch only updates this in-memory flag (owner's rule: "toggles are UI only"). Default is
 * off, the honest state for a foundation where nothing is actually subscribed.
 *
 * The web's permission-gated variants (unsupported / denied) are intentionally absent here: they
 * depend on notification-permission logic, which is out of scope for this foundation.
 */
@HiltViewModel
class NotificationsViewModel @Inject constructor() : ViewModel() {
    private val _pushEnabled = MutableStateFlow(false)
    val pushEnabled: StateFlow<Boolean> = _pushEnabled.asStateFlow()

    fun setPushEnabled(enabled: Boolean) {
        _pushEnabled.value = enabled
    }
}

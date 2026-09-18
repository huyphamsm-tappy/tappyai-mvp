package com.tappyai.app.notifications

import android.content.Context
import android.content.SharedPreferences

/**
 * The "Tappy notifications" preference — the Android twin of the web's
 * `lib/notifications/preference.ts` (2026-09-17).
 *
 * ON by default, OFF only when the person switches it off, and then OFF until they switch it
 * back. One key, written only by the user's own action on the Notifications screen.
 *
 * 🚨 THE DEFAULT IS A FALLBACK, NOT A RESET. [resolveNotificationPreference] returns ON only when
 * nothing is stored — a fresh install, a cleared store; a stored OFF survives every launch and
 * every login on this device. Nothing else ever writes ON on the user's behalf.
 *
 * WHAT IT DOES NOT GOVERN — and does not pretend to:
 *   • the OS notification PERMISSION (`POST_NOTIFICATIONS`). That is a system fact, asked for only
 *     by the person's own tap on the Notifications screen ([TappyNotificationPermission]). This
 *     preference never requests, revokes or reads it, in either direction: ON here with the
 *     permission denied means "wanted, but the device blocks delivery", and the screen says so.
 *   • the identity SOUND ([TappyNotificationPreferences.identitySoundEnabled]), which stays
 *     exactly as the user left it whatever happens here.
 *
 * Shares the notifications preference FILE with the sound and the permission bookkeeping, under
 * its own key, and touches neither of theirs.
 */
const val DEFAULT_NOTIFICATIONS_ON = true

/** Pure: the stored choice or the default. `null` = nothing stored. */
fun resolveNotificationPreference(stored: Boolean?): Boolean = stored ?: DEFAULT_NOTIFICATIONS_ON

class NotificationPreferenceStore(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(TappyNotificationPreferences.PREFS_NAME, Context.MODE_PRIVATE)

    /** The explicit choice, or null when the person has never touched the switch. */
    val stored: Boolean?
        get() = if (prefs.contains(KEY_PUSH_ENABLED)) prefs.getBoolean(KEY_PUSH_ENABLED, DEFAULT_NOTIFICATIONS_ON) else null

    /** The resolved preference: the explicit choice, else ON. */
    val enabled: Boolean
        get() = resolveNotificationPreference(stored)

    /** Records the person's choice. The only writer. */
    fun write(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_PUSH_ENABLED, enabled).apply()
    }

    companion object {
        const val KEY_PUSH_ENABLED = "push_enabled"
    }
}

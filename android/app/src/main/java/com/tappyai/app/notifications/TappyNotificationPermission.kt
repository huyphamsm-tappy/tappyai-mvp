package com.tappyai.app.notifications

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * The OS permission that decides whether notifications are DELIVERED at all.
 *
 * Deliberately in its own file, not in [TappyNotifications]: permission and the identity sound are
 * two different things, and a guard in the test suite keeps them from growing into each other. The
 * sound preference must never request, revoke or imply this permission, and this permission must
 * never mutate the sound preference — a user who denies notifications and later allows them should
 * find their chime setting exactly as they left it.
 *
 * Before this existed the app declared no notification permission at all, so on Android 13+ every
 * notification was dropped by the OS and the identity work could never have been heard.
 */
enum class NotificationPermissionAction {
    /** Below Android 13: granted at install time, nothing to ask. */
    NOT_REQUIRED,
    ALREADY_GRANTED,
    /** Ask the OS — the user has not been asked before. */
    REQUEST,
    /**
     * Already asked and not granted. Asking again is worse than useless: Android silently swallows
     * the dialog after the user has declined, so the app would appear to do nothing at all. The
     * honest move is to send them to the system screen where the decision actually lives.
     */
    DIRECT_TO_SETTINGS,
}

object TappyNotificationPermission {

    const val PERMISSION: String = Manifest.permission.POST_NOTIFICATIONS

    /** Android 13 (Tiramisu) is where notifications became a runtime permission. */
    const val REQUIRED_FROM_SDK: Int = Build.VERSION_CODES.TIRAMISU

    /**
     * Pure decision, so it can be tested without a device.
     *
     * Note [alreadyAsked] gates only re-asking; it never suppresses [ALREADY_GRANTED], or a user
     * who granted the permission from system settings after declining once would be sent back to
     * settings forever.
     */
    fun actionFor(sdkInt: Int, granted: Boolean, alreadyAsked: Boolean): NotificationPermissionAction =
        when {
            sdkInt < REQUIRED_FROM_SDK -> NotificationPermissionAction.NOT_REQUIRED
            granted -> NotificationPermissionAction.ALREADY_GRANTED
            alreadyAsked -> NotificationPermissionAction.DIRECT_TO_SETTINGS
            else -> NotificationPermissionAction.REQUEST
        }

    fun isGranted(context: Context): Boolean =
        Build.VERSION.SDK_INT < REQUIRED_FROM_SDK ||
            ContextCompat.checkSelfPermission(context, PERMISSION) == PackageManager.PERMISSION_GRANTED

    fun actionFor(context: Context, alreadyAsked: Boolean): NotificationPermissionAction =
        actionFor(Build.VERSION.SDK_INT, isGranted(context), alreadyAsked)
}

/**
 * Remembers that the OS dialog has been shown once, so the app never fires a request the system
 * will silently drop.
 *
 * Shares the notifications preference FILE but uses its own key, and touches nothing else in it —
 * [TappyNotificationPreferences.KEY_IDENTITY_SOUND] is never read or written here.
 */
class NotificationPermissionState(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(TappyNotificationPreferences.PREFS_NAME, Context.MODE_PRIVATE)

    var hasBeenRequested: Boolean
        get() = prefs.getBoolean(KEY_REQUESTED, false)
        set(value) = prefs.edit().putBoolean(KEY_REQUESTED, value).apply()

    companion object {
        const val KEY_REQUESTED = "notification_permission_requested"
    }
}

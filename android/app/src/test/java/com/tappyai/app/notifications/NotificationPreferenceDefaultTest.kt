package com.tappyai.app.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The "Tappy notifications" preference defaults ON (2026-09-17) — the Android twin of the web's
 * `lib/notifications/preference.ts`. The rule is a pure function plus source pins: nothing stored
 * → ON; an explicit OFF stays OFF; an explicit ON stays ON; the OS permission is a separate fact
 * that never rewrites the preference and is never requested by the default.
 */
class NotificationPreferenceDefaultTest {

    private val dir = File("src/main/java/com/tappyai/app/notifications")
    private fun src(name: String) = File(dir, name).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    // ── The rule ──

    @Test
    fun `nothing stored resolves to ON`() {
        assertTrue(DEFAULT_NOTIFICATIONS_ON)
        assertTrue(resolveNotificationPreference(null))
    }

    @Test
    fun `an explicit OFF stays OFF and an explicit ON stays ON`() {
        assertFalse(resolveNotificationPreference(false))
        assertTrue(resolveNotificationPreference(true))
    }

    // ── The store ──

    @Test
    fun `the store distinguishes nothing-stored from OFF, writes only the explicit choice, under its own key in the shared file`() {
        val s = src("NotificationPreference.kt")
        assertTrue("null when the key is absent — never a default written back", s.contains("if (prefs.contains(KEY_PUSH_ENABLED)) prefs.getBoolean(KEY_PUSH_ENABLED, DEFAULT_NOTIFICATIONS_ON) else null"))
        assertTrue(s.contains("get() = resolveNotificationPreference(stored)"))
        assertEquals("exactly one writer", 1, Regex("""putBoolean\(KEY_PUSH_ENABLED""").findAll(s).count())
        assertEquals("push_enabled", NotificationPreferenceStore.KEY_PUSH_ENABLED)
        assertTrue("its own key, not the sound's or the permission's", NotificationPreferenceStore.KEY_PUSH_ENABLED != TappyNotificationPreferences.KEY_IDENTITY_SOUND && NotificationPreferenceStore.KEY_PUSH_ENABLED != "permission_requested")
        assertFalse("never touches the sound", s.contains("identitySoundEnabled") || s.contains("KEY_IDENTITY_SOUND"))
        assertFalse("never touches the OS permission", s.contains("POST_NOTIFICATIONS") || s.contains("checkSelfPermission") || s.contains("areNotificationsEnabled"))
    }

    // ── The screen and the view model ──

    @Test
    fun `the view model starts from the stored-or-default preference and writes the person's choice as-is`() {
        val vm = src("NotificationsViewModel.kt")
        assertTrue(vm.contains("MutableStateFlow(preference.enabled)"))
        assertFalse("no hardcoded OFF start", vm.contains("MutableStateFlow(false)"))
        val setter = vm.substringAfter("fun setPushEnabled(enabled: Boolean)").substringBefore("\n    }")
        assertTrue("written before anything else, ON or OFF", setter.contains("preference.write(enabled)") && setter.contains("_pushEnabled.value = enabled"))
        assertTrue("device registration only on an explicit ON", setter.contains("if (enabled) registerDevice()"))
        assertFalse("the default never registers a device by itself", vm.contains("init {"))
    }

    @Test
    fun `the OS permission is a separate fact - never rewrites the preference, asked only on the person's tap, shown as its own status line`() {
        val screen = src("NotificationsScreen.kt")
        val callback = screen.substringAfter("ActivityResultContracts.RequestPermission(),").substringBefore("\n    }")
        assertFalse("a denial does not switch the preference OFF", callback.contains("setPushEnabled"))
        assertTrue(callback.contains("osGranted = granted"))
        assertTrue("asked only from the switch going ON or the Allow action", screen.contains("if (wanted && !osGranted) askOs()") && screen.contains("onAllow = askOs"))
        assertFalse("never asked on screen open", screen.contains("LaunchedEffect(Unit) {\n        askOs") || Regex("""LaunchedEffect\([^)]*\)\s*\{\s*requestPermission""").containsMatchIn(screen))
        assertTrue("the switch is the preference", screen.contains("viewModel.setPushEnabled(wanted)"))
        assertTrue("the status line only when ON + blocked", screen.contains("osBlocked = pushEnabled && !osGranted") && screen.contains("R.string.notif_os_blocked") && screen.contains("R.string.notif_os_allow"))
        assertTrue("re-read on resume, after the system settings round-trip", screen.contains("LifecycleResumeEffect(Unit)") && screen.contains("osGranted = TappyNotificationPermission.isGranted(context)"))
        val en = File("src/main/res/values/strings_settings.xml").readText()
        val vi = File("src/main/res/values-vi/strings_settings.xml").readText()
        listOf("notif_os_blocked", "notif_os_allow").forEach { assertTrue(it, en.contains("\"$it\"") && vi.contains("\"$it\"")) }
    }

    // ── Delivery ──

    @Test
    fun `an explicit OFF is honoured at delivery, read at delivery time, and the default changes nothing for an untouched device`() {
        val service = src("TappyFirebaseMessagingService.kt")
        assertTrue(service.contains("if (!NotificationPreferenceStore(applicationContext).enabled) return"))
        assertTrue("the token still registers whatever the preference — the OS permission is what gates delivery, not a stale address", service.substringAfter("fun onNewToken").substringBefore("}").contains("subscriptions.register(token)"))
        assertFalse("the sound layer is untouched", src("TappyNotifications.kt").contains("KEY_PUSH_ENABLED"))
    }
}

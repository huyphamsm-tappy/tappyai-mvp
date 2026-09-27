package com.tappyai.app.notifications

import com.tappyai.app.notifications.data.FcmSubscriptionDto
import com.tappyai.app.notifications.data.NotificationSubscriptionRepository
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * UAT3 (2026-09-27, Galaxy A12): every FCM registration was a 400 — the app's Json does not encode
 * defaults, so `provider: "fcm"` never left the device — and a signed-in device was never
 * registered at all (only onNewToken, before sign-in, and the default-ON switch).
 */
class FcmRegistrationTest {

    /** The same settings as core:network's NetworkModule.provideJson (encodeDefaults left false). */
    private val appJson = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

    @Test
    fun `the wire body carries provider fcm with the app's own Json`() {
        val body = appJson.encodeToString(FcmSubscriptionDto(token = "a".repeat(40)))
        assertTrue(body, body.contains("\"provider\":\"fcm\""))
        assertTrue(body.contains("\"token\":\"${"a".repeat(40)}\""))
    }

    @Test
    fun `only an account registers a device - no session and anonymous are skipped`() {
        assertTrue(NotificationSubscriptionRepository.shouldRegister(hasSession = true, anonymous = false))
        assertFalse(NotificationSubscriptionRepository.shouldRegister(hasSession = false, anonymous = false))
        assertFalse(NotificationSubscriptionRepository.shouldRegister(hasSession = true, anonymous = true))
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    @Test
    fun `the device registers when an account session starts, and the switch keeps the final say`() {
        val nav = File(root(), "app/src/main/java/com/tappyai/app/navigation/AppNavHostViewModel.kt").readText()
        assertTrue(nav.contains("if (it == AuthSessionState.Authenticated) pushRegistration.onSignedIn()"))
        val reg = File(root(), "app/src/main/java/com/tappyai/app/notifications/data/PushRegistration.kt").readText()
        assertTrue(reg.contains("if (!NotificationPreferenceStore(context).enabled) return"))
    }
}

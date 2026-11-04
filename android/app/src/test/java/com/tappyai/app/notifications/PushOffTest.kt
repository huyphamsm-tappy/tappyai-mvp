package com.tappyai.app.notifications

import com.tappyai.app.notifications.data.FcmUnsubscribeDto
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 01/10 — turning «Thông báo Tappy» OFF used to write only the local preference: the server kept pushing to the
 * device (the app just dropped the message). Server contract (`src/app/api/notifications/subscribe/route.ts` DELETE):
 * body `{provider?: 'webpush'|'fcm', credential?: string}`; the user always comes from the session; a present-but-null
 * credential is a 400, so the field must be OMITTED when unknown.
 */
class PushOffTest {

    /** The same settings as core:network's NetworkModule.provideJson (encodeDefaults left false). */
    private val appJson = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

    @Test
    fun `the DELETE body names provider fcm and this device's token`() {
        val body = appJson.encodeToString(FcmUnsubscribeDto(credential = "t".repeat(40)))
        assertTrue(body, body.contains("\"provider\":\"fcm\""))
        assertTrue(body, body.contains("\"credential\":\"${"t".repeat(40)}\""))
    }

    @Test
    fun `with no token the credential field is omitted - never null (the server answers 400 to null)`() {
        val body = appJson.encodeToString(FcmUnsubscribeDto(credential = null))
        assertEquals("{\"provider\":\"fcm\"}", body)
        assertFalse(body.contains("credential"))
    }

    @Test
    fun `OFF is real only once the server has it off`() = runBlocking {
        var asked: String? = "unset"
        assertEquals(PushToggleResult.Off, turnPushOff("tok") { asked = it; true })
        assertEquals("tok", asked)
    }

    @Test
    fun `a failed call is NOT off - the switch stays ON`() = runBlocking {
        assertEquals(PushToggleResult.NotOff, turnPushOff("tok") { false })
        assertEquals(PushToggleResult.NotOff, turnPushOff(null) { false })
    }

    @Test
    fun `an unknown token still asks the server (provider-scoped)`() = runBlocking {
        var called = false
        assertEquals(PushToggleResult.Off, turnPushOff(null) { called = true; it == null })
        assertTrue(called)
    }

    // ── Wiring pins ──
    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String) = File(root(), "app/src/main/java/com/tappyai/app/$rel").readText()

    @Test
    fun `the API is a DELETE with a body, the repository reports failure, and the ViewModel writes OFF only after success`() {
        val api = src("notifications/data/NotificationSubscriptionApi.kt")
        assertTrue(api.contains("@HTTP(method = \"DELETE\", path = \"api/notifications/subscribe\", hasBody = true)"))
        val repo = src("notifications/data/NotificationSubscriptionRepository.kt")
        assertTrue(repo.contains("suspend fun unregister(token: String?): Boolean") && repo.contains(".isSuccess"))
        val vm = src("notifications/NotificationsViewModel.kt")
        val off = vm.substringAfter("PushToggleResult.Off ->").substringBefore("PushToggleResult.NotOff")
        assertTrue("preference OFF only on success", off.contains("preference.write(false)") && off.contains("_pushEnabled.value = false"))
        assertTrue("failure keeps ON and says so", vm.substringAfter("PushToggleResult.NotOff ->").take(60).contains("_offFailed.value = true"))
        // ON again = POST again
        assertTrue(vm.substringAfter("if (enabled) {").substringBefore("return").contains("registerDevice()"))
        val screen = src("notifications/NotificationsScreen.kt")
        assertTrue(screen.contains("notif_off_failed") && screen.contains("enabled = !busy"))
    }

    @Test
    fun `a rotated token does not re-subscribe a device the person switched OFF`() {
        val svc = src("notifications/TappyFirebaseMessagingService.kt")
        val onNew = svc.substringAfter("override fun onNewToken").substringBefore("override fun onMessageReceived")
        assertTrue(onNew.contains("if (!NotificationPreferenceStore(applicationContext).enabled) return"))
        assertTrue(onNew.indexOf("enabled) return") < onNew.indexOf("subscriptions.register"))
    }
}

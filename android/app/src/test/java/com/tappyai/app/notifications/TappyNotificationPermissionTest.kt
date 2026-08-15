package com.tappyai.app.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.navigation.TappyRoute
import java.io.File

/**
 * The notification PERMISSION and the notification CLICK path.
 *
 * Two rules hold this together. Permission decides whether notifications are delivered; the Tappy
 * sound setting decides only whether they chime — neither may reach into the other. And a tapped
 * notification may never speak: the click path has no access to title or body at all, which the
 * source guards below keep true.
 */
class TappyNotificationPermissionTest {

    private val permissionSource =
        File("src/main/java/com/tappyai/app/notifications/TappyNotificationPermission.kt")
    private val clickSource =
        File("src/main/java/com/tappyai/app/notifications/TappyNotificationClick.kt")
    private val notificationsScreen =
        File("src/main/java/com/tappyai/app/notifications/NotificationsScreen.kt")
    private val manifest = File("src/main/AndroidManifest.xml")

    private companion object {
        const val TIRAMISU = 33
    }

    // ---- the permission decision -------------------------------------------

    @Test
    fun `below Android 13 there is nothing to ask`() {
        // The permission did not exist; it is granted at install. Asking would crash on some OEMs.
        for (sdk in listOf(28, 31, 32)) {
            assertEquals(
                "sdk=$sdk",
                NotificationPermissionAction.NOT_REQUIRED,
                TappyNotificationPermission.actionFor(sdk, granted = false, alreadyAsked = false),
            )
        }
    }

    @Test
    fun `on Android 13+ a first-time user is asked`() {
        assertEquals(
            NotificationPermissionAction.REQUEST,
            TappyNotificationPermission.actionFor(TIRAMISU, granted = false, alreadyAsked = false),
        )
    }

    @Test
    fun `the user is never asked twice`() {
        // Android silently swallows the dialog after a decline, so a second request would look to
        // the user like the app did nothing at all. Send them where the decision actually lives.
        assertEquals(
            NotificationPermissionAction.DIRECT_TO_SETTINGS,
            TappyNotificationPermission.actionFor(TIRAMISU, granted = false, alreadyAsked = true),
        )
    }

    @Test
    fun `granting later from system settings is honoured, not overruled by having asked before`() {
        // Otherwise a user who declined once and then allowed it in Settings would be bounced back
        // to Settings forever.
        assertEquals(
            NotificationPermissionAction.ALREADY_GRANTED,
            TappyNotificationPermission.actionFor(TIRAMISU, granted = true, alreadyAsked = true),
        )
    }

    @Test
    fun `the permission is declared in the manifest`() {
        // Undeclared, POST_NOTIFICATIONS can never be granted and Android 13+ drops every
        // notification — which is exactly the state this app was in before.
        assertTrue(manifest.readText().contains("android.permission.POST_NOTIFICATIONS"))
    }

    // ---- permission and the sound setting must not touch each other ---------

    @Test
    fun `the permission layer never mutates the Tappy sound preference`() {
        val src = permissionSource.readText()
        assertTrue("must not read or write the sound key", !src.contains("identitySoundEnabled"))
        // It may name the shared prefs FILE, but must use its own key.
        assertTrue(src.contains("KEY_REQUESTED"))
    }

    @Test
    fun `the permission is asked from the notifications screen, never from the sound toggle`() {
        // Requesting a notification permission because someone changed a SOUND setting would be a
        // prompt the user did not ask for, about something they did not touch.
        val settings = File("src/main/java/com/tappyai/app/profile/SettingsScreen.kt").readText()
        assertTrue("settings must not request permission", !settings.contains("POST_NOTIFICATIONS"))
        assertTrue("settings must not launch a permission request", !settings.contains("rememberLauncherForActivityResult"))
        assertTrue(notificationsScreen.readText().contains("requestPermission.launch"))
    }

    @Test
    fun `the screen reuses the existing permission pattern`() {
        // Same contract the chat mic already uses. A second permission framework would be one more
        // thing to keep correct for no benefit.
        val src = notificationsScreen.readText()
        assertTrue(src.contains("ActivityResultContracts.RequestPermission()"))
    }

    @Test
    fun `a denial is reflected honestly and does not crash`() {
        // Showing the switch ON after a denial promises notifications that can never arrive.
        val src = notificationsScreen.readText()
        assertTrue(src.contains("viewModel.setPushEnabled(granted)"))
        assertTrue("opening settings must not be able to crash", src.contains("runCatching"))
    }

    @Test
    fun `turning push off never asks for or revokes permission`() {
        val src = notificationsScreen.readText()
        val offBranch = src.substringAfter("if (!wanted) {").substringBefore("} else when")
        assertTrue(offBranch.contains("setPushEnabled(false)"))
        assertTrue("must not request on the off path", !offBranch.contains("launch"))
    }

    // ---- the click path ------------------------------------------------------

    @Test
    fun `a click carries a deep link when the payload has one`() {
        val click = TappyNotificationClick.from(mapOf("kind" to "tappy_identity", "link" to "tappyai://group/42"))
        assertEquals("tappyai://group/42", click.link)
        assertEquals(TappyNotificationKind.TAPPY_IDENTITY, click.kind)
    }

    @Test
    fun `missing or malformed metadata never crashes`() {
        // A tapped notification must open the app, whatever the backend sent.
        for (payload in listOf(null, emptyMap(), mapOf("kind" to "tappy_identity"), mapOf("link" to "   "))) {
            val click = TappyNotificationClick.from(payload)
            assertNull("payload=$payload", click.link)
            assertNull(TappyNotificationRouting.destinationFor(click, listOf(StubParser())))
        }
    }

    @Test
    fun `the identity kind routes exactly like a normal notification`() {
        // The identity is a SOUND, not a destination. If the chime could change where a tap lands,
        // two otherwise identical notifications would behave differently.
        val link = "tappyai://group/7"
        val parsers = listOf<DeepLinkParser>(StubParser())
        val normal = TappyNotificationRouting.destinationFor(
            TappyNotificationClick.from(mapOf("link" to link)), parsers,
        )
        val identity = TappyNotificationRouting.destinationFor(
            TappyNotificationClick.from(mapOf("kind" to "tappy_identity", "link" to link)), parsers,
        )
        assertEquals(normal, identity)
        assertEquals(StubRoute(link), normal)
    }

    @Test
    fun `a parser that throws on a hostile link does not become a crash on tap`() {
        val click = TappyNotificationClick.from(mapOf("link" to "tappyai://boom"))
        val destination = TappyNotificationRouting.destinationFor(click, listOf(ThrowingParser(), StubParser()))
        // Falls through to the parser that can handle it rather than propagating.
        assertEquals(StubRoute("tappyai://boom"), destination)
    }

    @Test
    fun `useful payload metadata survives for future FCM work`() {
        val click = TappyNotificationClick.from(
            mapOf("kind" to "tappy_identity", "link" to "tappyai://group/1", "campaign" to "morning_brief"),
        )
        assertEquals(mapOf("campaign" to "morning_brief"), click.metadata)
    }

    @Test
    fun `notification content is never carried into the click path`() {
        // The one field a click handler must never have.
        val click = TappyNotificationClick.from(
            mapOf("link" to "tappyai://group/1", "title" to "Deal!", "body" to "50% off pho"),
        )
        assertTrue("body must not survive", !click.metadata.containsKey("body"))
        assertTrue("title must not survive", !click.metadata.containsKey("title"))
        assertTrue("nothing readable may leak", click.metadata.values.none { it.contains("pho") })
    }

    // ---- the permanent no-content-to-TTS boundary ----------------------------

    @Test
    fun `nothing on the click or permission path can speak`() {
        for (source in listOf(clickSource, permissionSource, notificationsScreen)) {
            val src = source.readText()
            for (forbidden in listOf("TextToSpeech", "speak(", "voice/tts", "SpeechRecognizer")) {
                assertTrue("${source.name} must not reference $forbidden", !src.contains(forbidden))
            }
        }
    }

    @Test
    fun `the speech guard is not vacuous`() {
        // Prove the detector fires on what it bans, so a passing suite means something.
        val offending = """tts.speak(click.metadata["body"], TextToSpeech.QUEUE_FLUSH, null, null)"""
        assertTrue(offending.contains("TextToSpeech"))
        assertTrue(offending.contains("speak("))
        // And prove it tolerates the real file, so it is not passing by accident.
        assertTrue(!clickSource.readText().contains("TextToSpeech"))
    }

    // ---- stubs ---------------------------------------------------------------

    private data class StubRoute(val uri: String) : TappyRoute

    private class StubParser : DeepLinkParser {
        override fun parse(uri: String): TappyRoute = StubRoute(uri)
    }

    private class ThrowingParser : DeepLinkParser {
        override fun parse(uri: String): TappyRoute? = throw IllegalStateException("malformed")
    }
}

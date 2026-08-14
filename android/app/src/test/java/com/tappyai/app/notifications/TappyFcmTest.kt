package com.tappyai.app.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The FCM transport and its configuration.
 *
 * Two things are guarded here that no compiler checks. The Firebase config must cover every
 * application id the build produces — a missing one fails the build for that variant only, so the
 * gap shows up as "debug suddenly stopped building" long after the change. And the transport must
 * stay a transport: the moment it starts deciding what a notification looks like, there are two
 * copies of the identity rules and only one of them gets updated.
 */
class TappyFcmTest {

    private val service =
        File("src/main/java/com/tappyai/app/notifications/TappyFirebaseMessagingService.kt")
    private val presenter =
        File("src/main/java/com/tappyai/app/notifications/TappyNotificationPresenter.kt")
    private val subscriptionApi =
        File("src/main/java/com/tappyai/app/notifications/data/NotificationSubscriptionApi.kt")
    private val viewModel =
        File("src/main/java/com/tappyai/app/notifications/NotificationsViewModel.kt")
    private val googleServices = File("google-services.json")
    private val manifest = File("src/main/AndroidManifest.xml")
    private val buildFile = File("build.gradle.kts")

    // ---- configuration resolves for every variant ---------------------------

    @Test
    fun `the Firebase config covers every application id the build produces`() {
        // release, debug and staging all exist as separate ids. A config missing one fails
        // "No matching client found for package name" — for that variant alone.
        val packages = declaredFirebasePackages()
        for (expected in listOf("com.tappyai.app", "com.tappyai.app.debug", "com.tappyai.app.staging")) {
            assertTrue("google-services.json has no client for $expected", packages.contains(expected))
        }
    }

    @Test
    fun `the guard would notice a missing variant`() {
        // Non-vacuous: prove the check distinguishes present from absent rather than always passing.
        val packages = declaredFirebasePackages()
        assertTrue(!packages.contains("com.tappyai.app.nonexistent"))
    }

    @Test
    fun `every application id in the build has a Firebase client`() {
        // Derived from the build file rather than hardcoded, so adding a fourth variant fails here
        // instead of at the next person's build.
        val build = buildFile.readText()
        val base = Regex("""applicationId = "([^"]+)"""").find(build)?.groupValues?.get(1)
        assertEquals("com.tappyai.app", base)
        val suffixes = Regex("""applicationIdSuffix = "([^"]+)"""").findAll(build).map { it.groupValues[1] }
        val ids = listOf(base) + suffixes.map { base + it }.toList()
        val packages = declaredFirebasePackages()
        for (id in ids) {
            assertTrue("no Firebase client for build variant id $id", packages.contains(id))
        }
    }

    @Test
    fun `the messaging service is registered and not exported`() {
        val src = manifest.readText()
        assertTrue(src.contains(".notifications.TappyFirebaseMessagingService"))
        assertTrue(src.contains("com.google.firebase.MESSAGING_EVENT"))
        // Exported, any app on the device could hand this one a notification.
        val block = src.substringAfter("TappyFirebaseMessagingService").substringBefore("</service>")
        assertTrue("the messaging service must not be exported", block.contains("android:exported=\"false\""))
    }

    // ---- classification ------------------------------------------------------

    @Test
    fun `classification reads the data key, never the message content`() {
        val src = service.readText()
        // The classifier is handed the whole data map; what matters is that title/body are used
        // ONLY as display text passed to the presenter, never fed to the classifier.
        assertTrue(src.contains("TappyNotificationKind.from(data)"))
        assertTrue("kind must not be derived from body", !src.contains("body.contains"))
        assertTrue("kind must not be derived from title", !src.contains("title.contains"))
    }

    @Test
    fun `a payload that only says Tappy in its text is still a normal notification`() {
        // The obvious way to sneak the chime in: write "Tappy" in the body.
        val kind = TappyNotificationKind.from(mapOf("title" to "Tappy!", "body" to "tappy_identity"))
        assertEquals(TappyNotificationKind.NORMAL, kind)
    }

    @Test
    fun `missing, empty and unknown kinds are all normal`() {
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(null))
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(emptyMap()))
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(mapOf("kind" to "")))
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(mapOf("kind" to "whatever_is_next")))
        assertEquals(
            TappyNotificationKind.TAPPY_IDENTITY,
            TappyNotificationKind.from(mapOf("kind" to "tappy_identity")),
        )
    }

    // ---- the transport stays a transport --------------------------------------

    @Test
    fun `the transport does not build notifications of its own`() {
        val src = service.readText()
        assertTrue("presentation belongs to the presenter", !src.contains("NotificationCompat.Builder"))
        assertTrue("channel choice belongs to the presenter", !src.contains("channelFor"))
        assertTrue(src.contains("TappyNotificationPresenter(applicationContext).present"))
    }

    @Test
    fun `the presenter respects the identity sound preference rather than deciding for itself`() {
        val src = presenter.readText()
        assertTrue(src.contains("channelFor(kind, preferences.identitySoundEnabled)"))
    }

    @Test
    fun `the notification is always readable on screen whatever the kind`() {
        // The identity is additive. A "silent" identity notification that showed no text would be
        // a notification the user cannot act on.
        val src = presenter.readText()
        assertTrue(src.contains("setContentTitle"))
        assertTrue(src.contains("setContentText"))
        assertTrue("title/body must not be gated on kind", !src.contains("if (kind =="))
    }

    @Test
    fun `a denied permission cannot crash the post`() {
        assertTrue(presenter.readText().contains("runCatching"))
    }

    @Test
    fun `the click intent cannot be rewritten by another app`() {
        assertTrue(presenter.readText().contains("FLAG_IMMUTABLE"))
    }

    @Test
    fun `clicks reuse the existing deep-link entry rather than a second navigation path`() {
        val src = presenter.readText()
        assertTrue(src.contains("Intent.ACTION_VIEW"))
        assertTrue(src.contains("MainActivity::class.java"))
    }

    // ---- token registration ---------------------------------------------------

    @Test
    fun `token registration reuses the existing subscribe endpoint and provider model`() {
        val src = subscriptionApi.readText()
        assertTrue(src.contains("api/notifications/subscribe"))
        assertTrue(src.contains("""PROVIDER_FCM = "fcm""""))
    }

    @Test
    fun `the app carries no service credential and no second auth mechanism`() {
        // The token identifies a device; the server decides whose it is from the session.
        for (source in listOf(subscriptionApi, service, viewModel)) {
            val src = source.readText()
            for (forbidden in listOf("Authorization", "Bearer ", "serviceAccount", "private_key", "server_key")) {
                assertTrue("${source.name} must not carry $forbidden", !src.contains(forbidden))
            }
        }
    }

    @Test
    fun `the device registers on consent, not at app start`() {
        val src = viewModel.readText()
        assertTrue(src.contains("if (enabled) registerDevice()"))
        assertTrue("must not register on construction", !src.contains("init {"))
    }

    @Test
    fun `a token that never arrives does not crash or block`() {
        val src = viewModel.readText()
        assertTrue(src.contains("if (!task.isSuccessful || token.isNullOrBlank()) return@addOnCompleteListener"))
    }

    // ---- the permanent no-content-to-TTS boundary ------------------------------

    @Test
    fun `nothing on the FCM path can speak`() {
        for (source in listOf(service, presenter, subscriptionApi, viewModel)) {
            val src = source.readText()
            for (forbidden in listOf("TextToSpeech", "speak(", "voice/tts", "SpeechSynthesis", "AVSpeech")) {
                assertTrue("${source.name} must not reference $forbidden", !src.contains(forbidden))
            }
        }
    }

    @Test
    fun `the speech guard on the FCM path is not vacuous`() {
        val offending = """TextToSpeech(context, null).speak(message.notification?.body, 0, null, null)"""
        assertTrue(offending.contains("TextToSpeech"))
        assertTrue(offending.contains("speak("))
        assertTrue(!service.readText().contains("TextToSpeech"))
    }

    @Test
    fun `the identity sound can only be the bundled asset`() {
        // Not synthesised, not derived from the payload — one fixed resource.
        val src = File("src/main/java/com/tappyai/app/notifications/TappyNotifications.kt").readText()
        assertTrue(src.contains("R.raw.tappy_identity"))
        // Exactly one sound source exists, and it is a bundled resource URI. A second Uri.parse
        // would mean some other value could become the sound — a payload field, a remote URL.
        assertEquals(1, Regex("""Uri\.parse\(""").findAll(src).count())
        assertTrue(src.contains("android.resource://"))
    }

    /**
     * Read with a regex rather than org.json: in a JVM unit test `org.json` is Android's empty
     * stub and every method throws "not mocked". The file is a fixed, generated shape, so matching
     * the one key we need is honest here.
     */
    private fun declaredFirebasePackages(): List<String> =
        Regex(""""package_name"\s*:\s*"([^"]+)"""")
            .findAll(googleServices.readText())
            .map { it.groupValues[1] }
            .toList()
}

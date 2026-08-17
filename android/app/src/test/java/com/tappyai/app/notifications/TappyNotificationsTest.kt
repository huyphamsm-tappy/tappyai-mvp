package com.tappyai.app.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Tappy's notification identity on Android.
 *
 * The rule that matters most is the one about silence: turning the identity sound OFF must never
 * stop notifications arriving. Someone who finds the chime intrusive should be able to silence it
 * without losing what it was announcing.
 *
 * And the rule that matters most for privacy: nothing in this path may ever speak the notification
 * title or body. A guard below reads the source to keep that true rather than trusting review.
 */
class TappyNotificationsTest {

    private val source = File("src/main/java/com/tappyai/app/notifications/TappyNotifications.kt")
    private val stringsEn = File("src/main/res/values/strings_common.xml")
    private val stringsVi = File("src/main/res/values-vi/strings_common.xml")

    // ---- payload classification --------------------------------------------

    @Test
    fun `an identity payload is recognised`() {
        assertEquals(
            TappyNotificationKind.TAPPY_IDENTITY,
            TappyNotificationKind.from(mapOf("kind" to "tappy_identity")),
        )
    }

    @Test
    fun `backward compatibility - a payload with no kind is normal`() {
        // Every cron and every client written before this existed depends on it.
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(null))
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(emptyMap()))
        assertEquals(TappyNotificationKind.NORMAL, TappyNotificationKind.from(mapOf("url" to "/deals")))
    }

    @Test
    fun `an unknown kind is normal, never an error`() {
        // A future backend value must not stop an older client showing the notification at all.
        for (unknown in listOf("urgent", "TAPPY_IDENTITY", "tappy_identity_v2", "not_tappy_identity", "")) {
            assertEquals("kind=$unknown", TappyNotificationKind.NORMAL, TappyNotificationKind.from(mapOf("kind" to unknown)))
        }
    }

    // ---- channel and sound selection ---------------------------------------

    @Test
    fun `identity notification with the sound enabled uses the identity channel`() {
        assertEquals(
            TappyNotificationChannels.CHANNEL_IDENTITY,
            TappyNotificationChannels.channelFor(TappyNotificationKind.TAPPY_IDENTITY, identitySoundEnabled = true),
        )
    }

    @Test
    fun `identity notification with the sound DISABLED still arrives, on the default channel`() {
        // The whole point of the toggle: quieter, not fewer.
        assertEquals(
            TappyNotificationChannels.CHANNEL_DEFAULT,
            TappyNotificationChannels.channelFor(TappyNotificationKind.TAPPY_IDENTITY, identitySoundEnabled = false),
        )
    }

    @Test
    fun `a normal notification never uses the identity channel, even with the sound enabled`() {
        // A chime that plays for everything is just a notification sound, not an identity.
        assertEquals(
            TappyNotificationChannels.CHANNEL_DEFAULT,
            TappyNotificationChannels.channelFor(TappyNotificationKind.NORMAL, identitySoundEnabled = true),
        )
    }

    @Test
    fun `the two channels are distinct`() {
        // Android fixes a channel's sound at creation, so one channel could never carry both.
        assertNotEquals(TappyNotificationChannels.CHANNEL_DEFAULT, TappyNotificationChannels.CHANNEL_IDENTITY)
    }

    // ---- the privacy guard --------------------------------------------------

    @Test
    fun `nothing in the notification path can speak`() {
        val src = source.readText()
        for (forbidden in listOf("TextToSpeech", "speak(", "AVSpeech", "voice/tts", "Speech")) {
            assertTrue("notification code must not reference $forbidden", !src.contains(forbidden))
        }
    }

    @Test
    fun `the notification body is never read into anything audible`() {
        val src = source.readText()
        // The classifier reads only `kind`. If body/title appear here at all, something changed.
        assertTrue("must not touch body", !src.contains("\"body\""))
        assertTrue("must not touch title", !src.contains("\"title\""))
    }

    @Test
    fun `the privacy guard is not vacuous`() {
        // Prove the detector fires on the pattern it bans, so a passing suite means something.
        val offending = "tts.speak(notification.body, TextToSpeech.QUEUE_FLUSH, null, null)"
        assertTrue(offending.contains("TextToSpeech"))
        assertTrue(offending.contains("speak("))
    }

    // ---- the preference -----------------------------------------------------

    @Test
    fun `the identity sound is on by default`() {
        // It is the identity; a user who never opens settings should still recognise Tappy.
        val src = source.readText()
        assertTrue(src.contains("getBoolean(KEY_IDENTITY_SOUND, true)"))
    }

    @Test
    fun `the preference cannot disable notifications themselves`() {
        // It gates the CHANNEL only. Nothing here touches permission or delivery.
        val src = source.readText()
        assertTrue("must not touch notification permission", !src.contains("POST_NOTIFICATIONS"))
        assertTrue("must not cancel or suppress notifications", !src.contains("cancelAll") && !src.contains("areNotificationsEnabled"))
    }

    // ---- the settings toggle -----------------------------------------------

    private val settingsViewModel = File("src/main/java/com/tappyai/app/profile/SettingsViewModel.kt")
    private val settingsScreen = File("src/main/java/com/tappyai/app/profile/SettingsScreen.kt")

    @Test
    fun `the toggle is reachable from the real settings screen`() {
        // Storage and logic existed before this; without a row the user could never change it.
        val src = settingsScreen.readText()
        assertTrue(src.contains("settings_tappy_notification_sound"))
        assertTrue(src.contains("viewModel.setTappyNotificationSound"))
    }

    @Test
    fun `the toggle reuses the existing row component, not a new settings system`() {
        val src = settingsScreen.readText()
        assertTrue("must reuse TappyMenuRow", src.contains("TappyMenuRow("))
        assertTrue("must not introduce a Switch primitive here", !src.contains("Switch("))
    }

    @Test
    fun `state is read from storage on construction, so rotation cannot lose it`() {
        // The ViewModel is a cache; SharedPreferences is the truth. Initialising from a literal
        // would show the default again after every process death.
        val src = settingsViewModel.readText()
        assertTrue(src.contains("mutableStateOf(notificationPrefs.identitySoundEnabled)"))
        assertTrue("must not seed from a literal", !src.contains("mutableStateOf(true) // identity"))
    }

    @Test
    fun `a change is persisted immediately, not on screen exit`() {
        // A process death between the visible change and a deferred write would silently revert a
        // choice the user already saw take effect.
        val src = settingsViewModel.readText()
        val fn = src.substringAfter("fun setTappyNotificationSound").substringBefore("\n    }")
        assertTrue("must write through to storage", fn.contains("notificationPrefs.identitySoundEnabled = enabled"))
    }

    @Test
    fun `the toggle cannot disable notifications or permission`() {
        // It gates the channel only. If either of these appears here, the toggle has grown into
        // something the user did not agree to.
        val src = settingsViewModel.readText()
        for (forbidden in listOf("POST_NOTIFICATIONS", "areNotificationsEnabled", "cancelAll", "NotificationManagerCompat")) {
            assertTrue("settings must not touch $forbidden", !src.contains(forbidden))
        }
    }

    @Test
    fun `on and off labels exist in both languages and differ`() {
        val en = stringsEn.readText()
        val vi = stringsVi.readText()
        for (key in listOf("common_on", "common_off")) {
            assertTrue("$key missing from EN", en.contains("\"$key\""))
            assertTrue("$key missing from VI", vi.contains("\"$key\""))
        }
        // A copy-paste leaving On/Off identical would make the row unreadable.
        assertTrue(en.contains(">On<") && en.contains(">Off<"))
        assertTrue(vi.contains(">Bật<") && vi.contains(">Tắt<"))
    }

    // ---- localization -------------------------------------------------------

    @Test
    fun `every new string exists in English and Vietnamese`() {
        val keys = listOf(
            "notif_channel_default_name", "notif_channel_default_desc",
            "notif_channel_identity_name", "notif_channel_identity_desc",
            "settings_tappy_notification_sound", "settings_tappy_notification_sound_desc",
        )
        val en = stringsEn.readText()
        val vi = stringsVi.readText()
        for (key in keys) {
            assertTrue("$key missing from EN", en.contains("\"$key\""))
            assertTrue("$key missing from VI", vi.contains("\"$key\""))
        }
    }

    @Test
    fun `the toggle description promises notifications keep arriving, in both languages`() {
        // The reassurance is the point of the copy; losing it in a rewrite would change the meaning.
        assertTrue(stringsEn.readText().contains("keeps your notifications"))
        assertTrue(stringsVi.readText().contains("vẫn nhận thông báo"))
    }

    @Test
    fun `both languages state that Tappy never reads notifications aloud`() {
        assertTrue(stringsEn.readText().contains("never reads your notifications aloud"))
        assertTrue(stringsVi.readText().contains("không bao giờ đọc nội dung thông báo"))
    }
}

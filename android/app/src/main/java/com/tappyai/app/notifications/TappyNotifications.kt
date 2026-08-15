package com.tappyai.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import com.tappyai.app.R

/**
 * Tappy's notification identity, separated from how notifications arrive.
 *
 * WHY THIS IS NOT A FirebaseMessagingService: applying the Firebase Gradle plugin requires a
 * `google-services.json`, which is owner-only configuration this build does not have — adding it
 * would break `assembleDebug` for everyone. So the part that needs credentials (transport) and the
 * part that does not (deciding what to show and which sound to play) are separate. When FCM is
 * configured, its service parses the payload and calls straight into here; nothing below changes.
 *
 * THE CONTRACT: a notification classified `tappy_identity` plays the chime + "Tappy!" asset. Every
 * other notification behaves exactly as it does today. The title and body are ALWAYS shown
 * visually, whatever the kind — the identity is additive, never a substitute, and Tappy never
 * speaks the content. There is deliberately no code path here that reads `body` into anything
 * audible.
 */
enum class TappyNotificationKind {
    NORMAL,
    TAPPY_IDENTITY;

    companion object {
        private const val IDENTITY_WIRE_VALUE = "tappy_identity"

        /**
         * Reads the kind out of a push payload's `data` map.
         *
         * Anything unrecognised — missing, misspelled, a future value this build has never heard of
         * — is [NORMAL] rather than an error. A notification must still be SHOWN by an older client;
         * refusing it would let a backend release silently stop notifications from appearing.
         */
        @JvmStatic
        fun from(data: Map<String, String>?): TappyNotificationKind =
            if (data?.get("kind") == IDENTITY_WIRE_VALUE) TAPPY_IDENTITY else NORMAL
    }
}

/**
 * Whether the user wants the identity sound.
 *
 * Separate from the OS notification permission on purpose: turning the sound off must NEVER stop
 * notifications arriving. Someone who finds the chime intrusive should be able to silence it
 * without losing the notifications themselves.
 */
class TappyNotificationPreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var identitySoundEnabled: Boolean
        get() = prefs.getBoolean(KEY_IDENTITY_SOUND, true) // on by default — it is the identity
        set(value) = prefs.edit().putBoolean(KEY_IDENTITY_SOUND, value).apply()

    companion object {
        const val PREFS_NAME = "tappy_notifications"
        const val KEY_IDENTITY_SOUND = "identity_sound_enabled"
    }
}

object TappyNotificationChannels {
    /** Ordinary notifications: the system default sound. */
    const val CHANNEL_DEFAULT = "tappy_default"

    /**
     * Identity notifications. A SEPARATE channel because Android bakes a channel's sound in at
     * creation and will not let it change afterwards — one channel could never carry both sounds,
     * and re-creating a channel to swap the sound is silently ignored by the OS.
     */
    const val CHANNEL_IDENTITY = "tappy_identity"

    /** The bundled chime + "Tappy!" asset. No runtime speech synthesis is involved. */
    fun identitySoundUri(context: Context): Uri =
        Uri.parse("android.resource://${context.packageName}/${R.raw.tappy_identity}")

    /**
     * Creates both channels. Safe to call repeatedly — Android ignores a channel that already
     * exists, which is also why a sound change needs a new channel id rather than an edit.
     */
    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_DEFAULT,
                context.getString(R.string.notif_channel_default_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.notif_channel_default_desc)
            }
        )

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_IDENTITY,
                context.getString(R.string.notif_channel_identity_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.notif_channel_identity_desc)
                setSound(
                    identitySoundUri(context),
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build(),
                )
            }
        )
    }

    /**
     * Which channel a notification belongs on.
     *
     * The identity channel is used only when the backend classified the notification AND the user
     * left the sound on. Either condition failing falls back to the default channel — the
     * notification still arrives and is still fully readable, it simply does not announce itself.
     */
    fun channelFor(kind: TappyNotificationKind, identitySoundEnabled: Boolean): String =
        if (kind == TappyNotificationKind.TAPPY_IDENTITY && identitySoundEnabled) {
            CHANNEL_IDENTITY
        } else {
            CHANNEL_DEFAULT
        }
}

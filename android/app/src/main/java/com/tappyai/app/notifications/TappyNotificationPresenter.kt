package com.tappyai.app.notifications

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.tappyai.app.MainActivity
import com.tappyai.app.R

/**
 * Builds and posts a notification. The one place that decides how a Tappy notification looks.
 *
 * Separated from transport on purpose: FCM decides WHEN a notification arrives, this decides WHAT
 * is shown. Anything that later delivers a notification — a second transport, a local reminder —
 * comes through here rather than growing its own presentation, so the identity rules cannot be
 * bypassed by adding a new sender.
 *
 * THE RULES, restated where they are enforced:
 *  - Title and body are shown VISUALLY, always, whatever the kind. The identity chime is additive.
 *  - Nothing here reads title or body into anything audible. There is no speech API on this path.
 *  - The identity channel is used only for a `tappy_identity` notification whose owner left the
 *    sound on; every other case takes the default channel and still arrives.
 */
class TappyNotificationPresenter(private val context: Context) {

    private val preferences = TappyNotificationPreferences(context)

    /**
     * Posts a notification for an already-classified push payload.
     *
     * [title] and [body] are display text and nothing else. They are not parsed, not classified,
     * and never leave this method except into the notification the OS draws.
     */
    fun present(kind: TappyNotificationKind, title: String?, body: String?, click: TappyNotificationClick) {
        TappyNotificationChannels.ensureChannels(context)

        val channelId = TappyNotificationChannels.channelFor(kind, preferences.identitySoundEnabled)
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title ?: context.getString(R.string.app_name))
            .setContentText(body.orEmpty())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.orEmpty()))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(clickIntent(click))
            .build()

        // POST_NOTIFICATIONS may be denied. That is the user's answer, not an error state: the
        // post is simply dropped, and nothing else about the app changes.
        runCatching {
            NotificationManagerCompat.from(context).notify(notificationId(click), notification)
        }
    }

    /**
     * What tapping the notification does.
     *
     * A payload link is opened as an ordinary `ACTION_VIEW` on MainActivity — the exact path an
     * external `tappyai://` link already takes, so notifications reuse the app's existing deep-link
     * handling instead of teaching the notification layer where screens live. With no link, the
     * app just opens.
     */
    private fun clickIntent(click: TappyNotificationClick): PendingIntent {
        val intent = click.link
            ?.let { Intent(Intent.ACTION_VIEW, Uri.parse(it), context, MainActivity::class.java) }
            ?: Intent(context, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

        return PendingIntent.getActivity(
            context,
            notificationId(click),
            intent,
            // IMMUTABLE is required from Android 12 and is right anyway: nothing outside this app
            // should be able to rewrite where a Tappy notification leads.
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * Distinct ids per destination so two notifications about different things do not replace each
     * other, while a repeat about the same thing updates in place rather than stacking.
     */
    private fun notificationId(click: TappyNotificationClick): Int =
        click.link?.hashCode() ?: DEFAULT_NOTIFICATION_ID

    private companion object {
        const val DEFAULT_NOTIFICATION_ID = 1001
    }
}

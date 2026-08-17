package com.tappyai.app.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.tappyai.app.notifications.data.NotificationSubscriptionRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * FCM transport. Receives the message and hands it on — it does not decide what a notification
 * looks like, which channel it uses, or where a tap goes. Those already exist, and duplicating them
 * here is how the two copies would drift until the identity rules held in one place and not the
 * other.
 *
 * WHAT IT READS FROM THE PAYLOAD: `data` only, and from `data` only the routing keys — `kind` and
 * the link. Title and body are passed straight through to the presenter as display text.
 *
 * WHAT IT CANNOT DO: speak. There is no speech API on this path, and the classification never
 * consults the message content — a backend that wanted the chime by writing "Tappy" in the body
 * could not get it. `kind=tappy_identity` is the only way, and all it selects is the pre-recorded
 * asset on the identity channel.
 */
@AndroidEntryPoint
class TappyFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var subscriptions: NotificationSubscriptionRepository

    // The service is torn down as soon as the callback returns, so registration cannot live on
    // its lifecycle; SupervisorJob keeps one failure from cancelling later registrations.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        // Fires on install, restore, app-data clear and rotation — the only reliable moment to
        // learn this device's address.
        scope.launch { subscriptions.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val kind = TappyNotificationKind.from(data)
        val click = TappyNotificationClick.from(data)

        // `notification` is populated only when the backend sent a notification-type payload; a
        // data-only push carries its display text in `data`. Both are read so the transport does
        // not quietly depend on the backend picking one shape forever.
        val title = message.notification?.title ?: data["title"]
        val body = message.notification?.body ?: data["body"]

        TappyNotificationPresenter(applicationContext).present(
            kind = kind,
            title = title,
            body = body,
            click = click,
        )
    }
}

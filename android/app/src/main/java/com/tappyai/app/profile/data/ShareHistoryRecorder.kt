package com.tappyai.app.profile.data

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.IntentSender
import android.os.Build
import android.util.Log
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicInteger

/**
 * The Android success boundary of a share, turned into a "Đã share" history row (2026-09-15).
 *
 * 🔑 THE BOUNDARY. Android's system share is an `ACTION_SEND` chooser: the app never learns
 * whether the receiving app posted anything, but it CAN learn that the user picked a target —
 * `Intent.createChooser(target, title, IntentSender)` delivers `Intent.EXTRA_CHOSEN_COMPONENT`
 * to that sender the moment a target is chosen, and delivers nothing when the sheet is dismissed.
 * That is the most reliable success signal the platform offers, and it is the one this records:
 * a chosen component = a completed share; a dismissed sheet = nothing. The channel stored is
 * `android:<package>` of the chosen app.
 *
 * ONE receiver for the process, registered at runtime on first use (no manifest entry) and kept:
 * every chooser's sender targets the same action and carries the review id, so a chooser the
 * user dismissed leaves nothing behind and cannot fire later. (A receiver per share would stay
 * registered after a dismissed sheet and then ALSO hear the next share's broadcast — measured on
 * the Pixel 8: two rows for one share.) The write itself is `POST /api/reviews/{id}/share`
 * through [ProfileCollectionsRepository] and is fire-and-forget: a refused write (anonymous
 * session → 403, offline) never turns a completed share into an error.
 *
 * Wiring: `shareReview` (`reviews/ui/ReviewShare.kt`) passes [chooserSender] as the third
 * argument of `Intent.createChooser`. That file is in the locked staged set at the time of
 * writing, so the one-line call site lands with it — see the task report.
 */
object ShareHistoryRecorder {

    private const val TAG = "ShareHistoryRecorder"
    private const val ACTION = "com.tappyai.app.action.SHARE_CHOSEN"
    private const val EXTRA_REVIEW_ID = "review_id"
    private val requestCodes = AtomicInteger(1000)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun collectionsRepository(): ProfileCollectionsRepository
    }

    /**
     * An [IntentSender] for `Intent.createChooser(target, title, sender)`: when the chooser
     * reports the chosen component, records one share of [reviewId].
     */
    fun chooserSender(context: Context, reviewId: String): IntentSender {
        val app = context.applicationContext
        ensureReceiver(app)
        // A distinct request code per share so PendingIntents with different extras do not collapse.
        val requestCode = requestCodes.incrementAndGet()
        val intent = Intent(ACTION).setPackage(app.packageName).putExtra(EXTRA_REVIEW_ID, reviewId)
        return PendingIntent.getBroadcast(
            app,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        ).intentSender
    }

    @Volatile private var registered = false

    private fun ensureReceiver(app: Context) {
        if (registered) return
        synchronized(this) {
            if (registered) return
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    val id = intent.getStringExtra(EXTRA_REVIEW_ID) ?: return
                    record(ctx.applicationContext, id, intent.getParcelableExtraCompat(Intent.EXTRA_CHOSEN_COMPONENT))
                }
            }
            val filter = IntentFilter(ACTION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                app.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                app.registerReceiver(receiver, filter)
            }
            registered = true
        }
    }

    /** The channel value for a chosen target — `android:<package>`, or `android:chooser` when the platform withheld it. */
    internal fun channelFor(chosenPackage: String?): String =
        "android:" + (chosenPackage?.takeIf { it.isNotBlank() } ?: "chooser")

    private fun record(app: Context, reviewId: String, chosen: ComponentName?) {
        val repository = runCatching {
            EntryPointAccessors.fromApplication(app, Deps::class.java).collectionsRepository()
        }.getOrElse { e ->
            Log.w(TAG, "No repository for share history: $e"); return
        }
        scope.launch {
            val result = repository.recordShare(reviewId, channelFor(chosen?.packageName))
            if (result !is com.tappyai.core.network.NetworkResult.Success) Log.i(TAG, "Share history not recorded for $reviewId: $result")
        }
    }

    private fun Intent.getParcelableExtraCompat(name: String): ComponentName? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) getParcelableExtra(name, ComponentName::class.java)
        else @Suppress("DEPRECATION") getParcelableExtra(name)
}

package com.tappyai.app

import android.app.Application
import com.tappyai.app.notifications.TappyNotificationChannels
import dagger.hilt.android.HiltAndroidApp

/** Phase 1A: root of the Hilt dependency graph. Every `core:*` module's `@Binds`/`@Provides`
 *  wiring (see each module's own Hilt module) aggregates here. */
@HiltAndroidApp
class TappyAIApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // Create the notification channels up front rather than on the first notification.
        // Android only lists channels that exist, so deferring it means "Tappy notification sound"
        // is missing from the system notification settings until a notification has already
        // arrived — the user cannot adjust it before the first time it plays.
        TappyNotificationChannels.ensureChannels(this)
    }
}

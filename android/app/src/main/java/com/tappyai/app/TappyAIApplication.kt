package com.tappyai.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/** Phase 1A: root of the Hilt dependency graph. Every `core:*` module's `@Binds`/`@Provides`
 *  wiring (see each module's own Hilt module) aggregates here. */
@HiltAndroidApp
class TappyAIApplication : Application()

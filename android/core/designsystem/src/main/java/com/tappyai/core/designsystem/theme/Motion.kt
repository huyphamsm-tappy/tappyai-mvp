package com.tappyai.core.designsystem.theme

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/** Duration tokens from docs/UI_GUIDELINES.md §18. */
object TappyMotion {
    const val MICRO_MS = 150
    const val FADE_MS = 200
    const val SHEET_MS = 300
    const val LOOPING_MS = 1000

    val standardEasing: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
}

/**
 * Mirrors the web guideline's `prefers-reduced-motion` honoring. Android's equivalent system
 * setting is the animator duration scale (Settings > Accessibility > Remove animations sets
 * this to 0). Returns true when non-essential motion should be skipped/shortened.
 */
@Composable
fun rememberIsReducedMotionPreferred(): Boolean {
    val context = LocalContext.current
    return isAnimatorDurationScaleZero(context)
}

private fun isAnimatorDurationScaleZero(context: Context): Boolean {
    val scale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    return scale == 0f
}

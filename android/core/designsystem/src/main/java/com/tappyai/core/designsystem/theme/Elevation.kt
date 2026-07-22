package com.tappyai.core.designsystem.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * docs/UI_GUIDELINES.md §8: restrained, layered elevation. Dark mode should bias toward
 * borders + tonal-surface elevation rather than heavy shadow (shadows read poorly on dark
 * surfaces) — components should prefer [TappyElevation.flat] + a border color from the
 * ColorScheme's `outline` when `isSystemInDarkTheme()` is true, reserving [low]/[medium] for
 * light theme. Never stack two elevation levels on one element.
 */
object TappyElevation {
    val flat: Dp = 0.dp
    val low: Dp = 1.dp
    val medium: Dp = 3.dp
    val high: Dp = 6.dp
    val peak: Dp = 12.dp
}

package com.tappyai.core.designsystem.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * 4dp base unit, matching docs/UI_GUIDELINES.md §6's Tailwind scale
 * ({1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12} × 4px). Always reference these tokens instead of
 * one-off `Dp` literals in feature code.
 */
object TappySpacing {
    val xs: Dp = 4.dp
    val sm: Dp = 6.dp
    val md: Dp = 8.dp
    val lg: Dp = 12.dp
    val xl: Dp = 16.dp
    val xxl: Dp = 20.dp
    val xxxl: Dp = 24.dp
    val huge: Dp = 32.dp
    val massive: Dp = 40.dp
    val giant: Dp = 48.dp
}

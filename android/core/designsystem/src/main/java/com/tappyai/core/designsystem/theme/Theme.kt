package com.tappyai.core.designsystem.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalContext

/**
 * Root theme for the app. Wraps [MaterialTheme] with the TappyAI palette (Color.kt),
 * Inter-based type scale selected by window width (Type.kt), and shape system (Shape.kt).
 *
 * Dynamic color (Android 12+/API 31+) is used when available, matching the brief's "Dynamic
 * Color support" requirement, falling back to the fixed brand palette below API 31 — the
 * fallback is not a degraded experience, it's simply the brand's own designed palette.
 *
 * Spacing ([TappySpacing]), elevation ([TappyElevation]) and container widths
 * ([TappyContainers]) are plain static tokens, not theme-provided — they don't vary by
 * light/dark or dynamic color, so wrapping them in a CompositionLocal would be unneeded
 * indirection for values every call site can already import directly.
 */
@Composable
fun TappyAITheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val useDynamicColor = dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val colorScheme = when {
        useDynamicColor && darkTheme -> dynamicDarkColorScheme(LocalContext.current)
        useDynamicColor && !darkTheme -> dynamicLightColorScheme(LocalContext.current)
        darkTheme -> TappyDarkColors
        else -> TappyLightColors
    }

    val isExpandedWidth = currentWindowWidthClass() != TappyWindowWidthClass.Compact

    // Category-accent palette (CategoryColor.kt) is brand-fixed and only varies by light/dark, so
    // it follows [darkTheme] rather than dynamic color — provided here as the one place feature
    // code reads it from (via `tappyCategoryColors`).
    val categoryColors = if (darkTheme) TappyCategoryColorsDark else TappyCategoryColorsLight

    MaterialTheme(
        colorScheme = colorScheme,
        typography = tappyTypography(isExpandedWidth),
        shapes = TappyMaterialShapes,
    ) {
        CompositionLocalProvider(LocalTappyCategoryColors provides categoryColors) {
            content()
        }
    }
}

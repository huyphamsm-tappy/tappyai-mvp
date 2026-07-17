package com.tappyai.core.designsystem.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic per-category accent colors — the app's ONE place for the color-coded category hues the
 * web uses (blue location, orange food, red avoid, …). Feature code must read these via
 * [tappyCategoryColors] instead of hardcoding hex, so the palette stays theme-safe (light + dark)
 * and consistent app-wide. This is the only file allowed to name these hex values.
 *
 * Each [TappyCategoryColor] carries [accent] (for an icon) plus a soft [container]/[onContainer]
 * pair (for a tag chip), mirroring the web's `text-*-500` icon + `bg-*-50 text-*-700` chip.
 */
@Immutable
data class TappyCategoryColor(val accent: Color, val container: Color, val onContainer: Color)

@Immutable
data class TappyCategoryColors(
    val blue: TappyCategoryColor,
    val purple: TappyCategoryColor,
    val amber: TappyCategoryColor,
    val pink: TappyCategoryColor,
    val orange: TappyCategoryColor,
    val green: TappyCategoryColor,
    val red: TappyCategoryColor,
)

internal val TappyCategoryColorsLight = TappyCategoryColors(
    blue = TappyCategoryColor(Color(0xFF2563EB), Color(0xFFEFF6FF), Color(0xFF1D4ED8)),
    purple = TappyCategoryColor(Color(0xFF9333EA), Color(0xFFF5F3FF), Color(0xFF7E22CE)),
    amber = TappyCategoryColor(0xFFD97706.let(::Color), Color(0xFFFEF3C7), Color(0xFFB45309)),
    pink = TappyCategoryColor(Color(0xFFDB2777), Color(0xFFFCE7F3), Color(0xFFBE185D)),
    orange = TappyCategoryColor(Color(0xFFEA580C), Color(0xFFFFF7ED), Color(0xFFC2410C)),
    green = TappyCategoryColor(Color(0xFF16A34A), Color(0xFFF0FDF4), Color(0xFF15803D)),
    red = TappyCategoryColor(Color(0xFFDC2626), Color(0xFFFEF2F2), Color(0xFFB91C1C)),
)

internal val TappyCategoryColorsDark = TappyCategoryColors(
    blue = TappyCategoryColor(Color(0xFF60A5FA), Color(0xFF17335C), Color(0xFFBFDBFE)),
    purple = TappyCategoryColor(Color(0xFFC084FC), Color(0xFF3B1D5C), Color(0xFFE9D5FF)),
    amber = TappyCategoryColor(Color(0xFFFBBF24), Color(0xFF422E10), Color(0xFFFDE68A)),
    pink = TappyCategoryColor(Color(0xFFF472B6), Color(0xFF4A1733), Color(0xFFFBCFE8)),
    orange = TappyCategoryColor(Color(0xFFFB923C), Color(0xFF43230C), Color(0xFFFED7AA)),
    green = TappyCategoryColor(Color(0xFF4ADE80), Color(0xFF12351F), Color(0xFFBBF7D0)),
    red = TappyCategoryColor(Color(0xFFF87171), Color(0xFF441A1A), Color(0xFFFECACA)),
)

/** The [TappyCategoryColors] provided by [TappyAITheme] for the current light/dark mode. */
val LocalTappyCategoryColors = staticCompositionLocalOf { TappyCategoryColorsLight }

/** Read the current theme's category-accent palette from feature code (never hardcode hex). */
val tappyCategoryColors: TappyCategoryColors
    @Composable
    @ReadOnlyComposable
    get() = LocalTappyCategoryColors.current

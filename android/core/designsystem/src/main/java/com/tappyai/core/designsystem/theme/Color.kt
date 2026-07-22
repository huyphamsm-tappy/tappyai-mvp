package com.tappyai.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * Base palette, translated 1:1 from docs/UI_GUIDELINES.md (#007AFF primary / #FF9500 accent).
 * #FF9500 requires dark foreground text/icons on top of it (WCAG AA fails with white — see
 * TappyOnAccentLight below), matching the guideline's explicit contrast callout.
 */
object TappyPalette {
    val Blue500 = Color(0xFF007AFF)
    val Blue600 = Color(0xFF0062CC)
    val Blue700 = Color(0xFF004999)
    val Blue100 = Color(0xFFD6E8FF)

    val Orange500 = Color(0xFFFF9500)
    val Orange600 = Color(0xFFCC7700)
    val Orange100 = Color(0xFFFFE7C2)

    val Red500 = Color(0xFFE5484D)
    val Red600 = Color(0xFFB93A3E)

    val Neutral0 = Color(0xFFFFFFFF)
    val Neutral50 = Color(0xFFF7F8FA)
    val Neutral100 = Color(0xFFEFF1F4)
    val Neutral200 = Color(0xFFE1E4E9)
    val Neutral400 = Color(0xFF9AA1AC)
    val Neutral600 = Color(0xFF5B6472)
    val Neutral800 = Color(0xFF262A31)
    val Neutral900 = Color(0xFF15171B)
    val Neutral950 = Color(0xFF0B0C0E)
}

/**
 * Fixed (non-dynamic) light ColorScheme fields. Used as the fallback on API < 31 and as the
 * seed structure for dynamic color on API 31+.
 * On-accent text is dark ([TappyPalette.Neutral900]), not white — #FF9500 fails WCAG AA
 * contrast with white text; this is the one deliberate deviation from Material's usual
 * white-on-filled-color convention, carried over from the web design system.
 */
val TappyLightColors = androidx.compose.material3.lightColorScheme(
    primary = TappyPalette.Blue500,
    onPrimary = TappyPalette.Neutral0,
    primaryContainer = TappyPalette.Blue100,
    onPrimaryContainer = TappyPalette.Blue700,
    secondary = TappyPalette.Orange500,
    onSecondary = TappyPalette.Neutral900,
    secondaryContainer = TappyPalette.Orange100,
    onSecondaryContainer = TappyPalette.Orange600,
    error = TappyPalette.Red500,
    onError = TappyPalette.Neutral0,
    background = TappyPalette.Neutral0,
    onBackground = TappyPalette.Neutral900,
    surface = TappyPalette.Neutral0,
    onSurface = TappyPalette.Neutral900,
    surfaceVariant = TappyPalette.Neutral50,
    onSurfaceVariant = TappyPalette.Neutral600,
    outline = TappyPalette.Neutral200,
    outlineVariant = TappyPalette.Neutral100,
)

val TappyDarkColors = androidx.compose.material3.darkColorScheme(
    primary = TappyPalette.Blue500,
    onPrimary = TappyPalette.Neutral0,
    primaryContainer = TappyPalette.Blue700,
    onPrimaryContainer = TappyPalette.Blue100,
    secondary = TappyPalette.Orange500,
    onSecondary = TappyPalette.Neutral900,
    secondaryContainer = TappyPalette.Orange600,
    onSecondaryContainer = TappyPalette.Orange100,
    error = TappyPalette.Red500,
    onError = TappyPalette.Neutral900,
    background = TappyPalette.Neutral950,
    onBackground = TappyPalette.Neutral0,
    surface = TappyPalette.Neutral900,
    onSurface = TappyPalette.Neutral0,
    surfaceVariant = TappyPalette.Neutral800,
    onSurfaceVariant = TappyPalette.Neutral400,
    outline = TappyPalette.Neutral600,
    outlineVariant = TappyPalette.Neutral800,
)

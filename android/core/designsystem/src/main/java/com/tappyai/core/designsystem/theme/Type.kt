package com.tappyai.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// NOTE: docs/UI_GUIDELINES.md specifies Inter. The Compose "downloadable Google Fonts"
// provider (androidx.compose.ui.text.googlefonts.GoogleFont.Provider) is the idiomatic way
// to pull it in without vendoring font binaries, but it requires a
// `com_google_android_gms_fonts_certs` XML certificate-array resource whose exact byte
// content must come verbatim from Android's official "Fonts in XML" documentation — that is
// not something to hand-type from memory, since a wrong certificate silently breaks font
// resolution at runtime rather than failing at compile time. Phase 0 intentionally uses the
// system default sans-serif as a placeholder so nothing here is unverified. Swap this for
// either (a) the GoogleFont provider with the cert array copied verbatim from
// https://developer.android.com/develop/ui/compose/text/fonts#downloadable-fonts, or
// (b) real Inter .ttf/.otf files under `src/main/res/font/`, before shipping.
val InterFontFamily = FontFamily.SansSerif

/**
 * All sizes are `sp`, never `dp` — required so the system Dynamic Font Size / font-scale
 * accessibility setting actually scales this text (a `dp`-sized TextStyle would silently
 * ignore the user's font-scale preference).
 *
 * Compose has no equivalent of CSS `clamp()`; the closest faithful port of the web
 * guidelines' fluid type scale is two coordinated, discrete scales selected by
 * [TappyWindowWidthClass] (see WindowSize.kt) — see [tappyTypography] below.
 * This is the compact-window scale (phones); [expandedTypography] is the tablet/ChromeOS one.
 */
private val compactTypography = Typography(
    displayLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 23.sp),
    bodyLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 25.sp),
    bodyMedium = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodySmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelSmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

/** Expanded-window (tablet portrait+, ChromeOS) scale — one step up per role, mirroring the
 *  web guideline's `clamp(min, preferred, max)` growing gently on larger viewports. */
private val expandedTypography = Typography(
    displayLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp),
    headlineLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp),
    bodyLarge = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 27.sp),
    bodyMedium = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodySmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelSmall = TextStyle(fontFamily = InterFontFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

fun tappyTypography(isExpandedWidth: Boolean): Typography =
    if (isExpandedWidth) expandedTypography else compactTypography

package com.tappyai.app.explore

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import java.util.Locale

/**
 * The V3 Explore (Khám phá) tokens — the approved video-feed mockup (`V3-Mockup.png/…05_11_01`).
 *
 * Explore is a full-bleed video surface and the mockup draws it in the night palette only, so
 * unlike Home these do not follow the system appearance: a light chrome over a playing clip is
 * what the reference specifically does not do. The values are the same night tokens Home V3 uses
 * (`V3DarkPalette`), copied rather than read through Home's theme so Explore cannot flip to
 * daylight when Home's composition local is swapped.
 */
internal object ExploreV3 {
    /** Header and tab-row ground — the near-black navy behind the wordmark. */
    val Background = Color(0xFF050814)
    /** The circular header buttons' fill and the rail buttons' translucent ground. */
    val Surface = Color(0xFF0F1730)
    val Outline = Color(0xFF26314F)
    /** The active tab's underline and the Explore accent. */
    val Purple = Color(0xFF7C5CFF)
    val OnSurface = Color(0xFFEEF1FB)
    val OnSurfaceVariant = Color(0xFF98A2C4)
    /** The location pin's orange — the brand spark. */
    val BrandSpark = Color(0xFFFF9500)
    /** The action rail's rounded translucent tile behind each icon. */
    val RailTile = Color(0x33FFFFFF)
    val RailTileBorder = Color(0x1FFFFFFF)

    // ── Immersive Explore (reference "TappyAI — Immersive AI Discovery", 2026-09-13) ──
    /** Floating controls' glass: near-black at ~55%, with a thin light border. */
    val Glass = Color(0x8C0B1020)
    val GlassBorder = Color(0x33FFFFFF)
    /** The selected segment of the discovery control — the reference's indigo fill. */
    val SegmentSelected = Color(0xFF2F3E93)
    /** The "AI" of the wordmark — the brand blue of the V3 palette (HomeV3 `blue`). */
    val BrandBlue = Color(0xFF1877E8)
    /** The Hỏi Tappy ring and the dock's active halo — the accent at low alpha. */
    val Glow = Color(0x4D7C5CFF)
    /** Body/tagline text over the video. */
    val OnVideoSecondary = Color(0xE6FFFFFF)
    val OnVideoMuted = Color(0xB3FFFFFF)
    /** The floating dock: its height, its side margin and how far it sits above the nav inset. */
    val DockHeight = 70.dp
    val DockMargin = 16.dp
    val DockLift = 24.dp
    /** What a full-bleed feed must keep clear at the bottom so its overlays sit above the dock. */
    val DockClearance = DockHeight + DockLift + 8.dp
}

/**
 * A count the way the mockup prints it beside a rail icon — `12.4K`, `266`, `1.2M`.
 *
 * One decimal, trailing `.0` dropped (`12K`, not `12.0K`), a dot as the separator regardless of
 * locale because the reference shows one and the string sits beside an icon, not in prose.
 * Below a thousand the number is printed as is.
 */
internal fun compactCount(n: Int): String {
    if (n < 1_000) return n.toString()
    val (value, suffix) = if (n < 1_000_000) n / 1_000.0 to "K" else n / 1_000_000.0 to "M"
    val rounded = Math.round(value * 10) / 10.0
    val text = if (rounded == Math.floor(rounded)) rounded.toLong().toString() else String.format(Locale.ROOT, "%.1f", rounded)
    return text + suffix
}

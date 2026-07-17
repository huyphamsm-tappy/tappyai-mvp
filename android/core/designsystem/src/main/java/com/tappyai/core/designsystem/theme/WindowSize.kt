package com.tappyai.core.designsystem.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Coarse window-width classes, computed from the current window's dp width
 * ([LocalConfiguration], not the physical device type) — this is what makes the same
 * three buckets correctly cover phones, foldables (unfolded), tablets in portrait/landscape,
 * split-screen, and ChromeOS resizable windows uniformly: a ChromeOS app window simply
 * reports as [Expanded] like a wide tablet window would, with no device-specific branching.
 *
 * Deliberately not the `androidx.compose.material3.windowsizeclass` / `material3-adaptive`
 * APIs yet (pinned in the version catalog for Phase 2, where real multi-pane screens using
 * `ListDetailPaneScaffold` need them) — this module has no Activity to call
 * `calculateWindowSizeClass(activity)` against, and a config-width read is sufficient for
 * token selection.
 */
enum class TappyWindowWidthClass { Compact, Medium, Expanded }

@Composable
@ReadOnlyComposable
fun currentWindowWidthClass(): TappyWindowWidthClass {
    val widthDp = LocalConfiguration.current.screenWidthDp
    return when {
        widthDp < 600 -> TappyWindowWidthClass.Compact
        widthDp < 840 -> TappyWindowWidthClass.Medium
        else -> TappyWindowWidthClass.Expanded
    }
}

/**
 * dp max-widths mirroring docs/UI_GUIDELINES.md §4's web container strategy, for centering
 * content on tablet/ChromeOS/expanded windows instead of stretching a phone layout edge to
 * edge. Feature screens should wrap their content in `Modifier.widthIn(max = ...)` (or the
 * eventual `ListDetailPaneScaffold` panes) using the token matching their content type.
 */
object TappyContainers {
    val compact: Dp = 448.dp // auth, single-focus dialogs, narrow forms
    val content: Dp = 768.dp // reading/detail/settings/profile, chat conversation
    val wide: Dp = 1024.dp // dashboard-style multi-section pages
    val feed: Dp = 1280.dp // explore feed grid
    val full: Dp = 1536.dp // full-bleed sections, hard cap so 2K/4K/ChromeOS don't over-stretch
}

/**
 * Accessibility floor, per Android's own guidance (larger than the web guideline's 44px):
 * every interactive component must resolve to at least this touch target size, even if its
 * visible surface is smaller (via padding) — enforced in core:designsystem components rather
 * than left to each feature screen to remember.
 */
val TappyMinTouchTarget: Dp = 48.dp

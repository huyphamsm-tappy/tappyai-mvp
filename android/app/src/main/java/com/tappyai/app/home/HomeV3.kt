package com.tappyai.app.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.notifications.UnreadBadge
import com.tappyai.core.designsystem.theme.TappyPalette
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * One V3 Home palette, in the two appearances the system can ask for.
 *
 * The V3 look is carried by these tokens rather than by hard-coded colours in the screen, so the
 * whole Home surface changes appearance by swapping the instance — see [V3HomeTheme].
 */
internal data class V3Palette(
    /** Page ground — the darkest (or lightest) surface in the composition. */
    val background: Color,
    /** Raised cards and rails sitting on [background]. */
    val surface: Color,
    /** Secondary fills — thumbnails, icon tiles, inactive chips. */
    val surfaceVariant: Color,
    /** The AI accent. Also the community-video rail's play badge. */
    val purple: Color,
    /** The companion accent used for links and secondary highlights. */
    val blue: Color,
    val onSurface: Color,
    val onSurfaceVariant: Color,
    val outline: Color,
    /** The brand sparkle glyph's orange, as in the master mockup's wordmark. */
    val brandSpark: Color,
    /** The hero's AI-presence wash behind the mascot. */
    val heroGlow: Color,
    /** The bottom bar's active pill and its icon, on Home only. */
    val navIndicator: Color,
    val navOnIndicator: Color,
    /** The bottom bar's own background. */
    val navContainer: Color,
)

/** The mockup's night palette: near-black navy grounds, luminous accents. */
private val V3DarkPalette = V3Palette(
    background = Color(0xFF050814),
    surface = Color(0xFF0F1730),
    surfaceVariant = Color(0xFF18213D),
    purple = Color(0xFF7C5CFF),
    blue = Color(0xFF3391FF),
    onSurface = Color(0xFFEEF1FB),
    onSurfaceVariant = Color(0xFF98A2C4),
    outline = Color(0xFF26314F),
    brandSpark = Color(0xFFFF9500),
    heroGlow = Color(0xFF3391FF).copy(alpha = 0.32f),
    // The mockup's active pill: a saturated purple tint with a bright lavender glyph.
    navIndicator = Color(0xFF3A2C86),
    navOnIndicator = Color(0xFFDCD3FF),
    navContainer = Color(0xFF0A1020),
)

/**
 * The same composition in daylight.
 *
 * The grounds come from the app's own light scale ([TappyPalette]) so Home sits beside the other
 * tabs instead of inventing a second light theme; only the V3 accents (purple/blue/orange) carry
 * over unchanged, because they are the identity rather than the appearance.
 */
private val V3LightPalette = V3Palette(
    background = TappyPalette.Neutral50,
    surface = TappyPalette.Neutral0,
    surfaceVariant = TappyPalette.Neutral100,
    purple = Color(0xFF6B47FF),
    blue = Color(0xFF1877E8),
    onSurface = TappyPalette.Neutral900,
    onSurfaceVariant = TappyPalette.Neutral600,
    outline = TappyPalette.Neutral200,
    brandSpark = Color(0xFFFF9500),
    heroGlow = Color(0xFF3391FF).copy(alpha = 0.14f),
    navIndicator = Color(0xFFE7E0FF),
    navOnIndicator = Color(0xFF4C2FCF),
    navContainer = TappyPalette.Neutral0,
)

private val LocalV3Palette = staticCompositionLocalOf { V3DarkPalette }

/**
 * The V3 Home tokens, read from whichever [V3Palette] [V3HomeTheme] installed.
 *
 * Every property is a composable read of [LocalV3Palette], so a screen that writes
 * `HomeV3.Background` follows the system light/dark setting without knowing it exists.
 */
internal object HomeV3 {
    val Background: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.background
    val Surface: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.surface
    val SurfaceVariant: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.surfaceVariant
    val Purple: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.purple
    val Blue: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.blue
    val OnSurface: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.onSurface
    val OnSurfaceVariant: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.onSurfaceVariant
    val Outline: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.outline
    val BrandSpark: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.brandSpark
    val HeroGlow: Color @Composable @ReadOnlyComposable get() = LocalV3Palette.current.heroGlow

    /** Accent sweep for the primary AI action. Purple → blue in both appearances. */
    val ActionGradient: Brush
        @Composable @ReadOnlyComposable get() =
            Brush.linearGradient(listOf(LocalV3Palette.current.purple, LocalV3Palette.current.blue))
}

private fun V3Palette.toColorScheme(dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = purple,
        onPrimary = Color.White,
        secondary = blue,
        onSecondary = Color.White,
        background = background,
        onBackground = onSurface,
        surface = surface,
        onSurface = onSurface,
        surfaceVariant = surfaceVariant,
        onSurfaceVariant = onSurfaceVariant,
        // NavigationBar/NavigationBarItem take their colours from these roles by default, so
        // setting them here turns the Home bar's active pill purple WITHOUT touching
        // TappyBottomNavBar — the shared component, its items and its callbacks are untouched,
        // and every other tab keeps the app theme. `surfaceContainer` is the bar's own background.
        secondaryContainer = navIndicator,
        onSecondaryContainer = navOnIndicator,
        surfaceContainer = navContainer,
        outline = outline,
        outlineVariant = outline,
    )
}

/**
 * Applies the V3 Home appearance to [content] and nothing else.
 *
 * Scoped rather than global on purpose: `MaterialTheme` is a composition-local override, so the
 * scheme reaches exactly the subtree passed here — the Home tab's landing content and the chrome
 * the shell draws for it. Typography and shapes are inherited untouched from the app theme, so
 * this changes colour only.
 *
 * Which appearance it picks is read from the theme it is nested in, not from
 * [isSystemInDarkTheme]. Two earlier revisions got this wrong in different ways: the first pinned
 * Home to the dark palette unconditionally, so the light/dark switch visibly did nothing here; the
 * second queried the system directly, which ignores `MainActivity`'s in-app override
 * (`darkTheme ?: isSystemInDarkTheme()`) — with that override set, every other screen followed it
 * while Home kept answering to the system, so Home could stay light in a dark app. Reading the
 * inherited `ColorScheme` makes Home follow whatever `TappyAITheme` actually resolved, from any
 * source, with no second source of truth to drift.
 */
@Composable
internal fun V3HomeTheme(content: @Composable () -> Unit) {
    val dark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    val palette = if (dark) V3DarkPalette else V3LightPalette
    CompositionLocalProvider(LocalV3Palette provides palette) {
        MaterialTheme(
            colorScheme = palette.toColorScheme(dark),
            typography = MaterialTheme.typography,
            shapes = MaterialTheme.shapes,
            content = content,
        )
    }
}

/**
 * The V3 Home header: the approved TappyAI lockup on the left, a search and a notification
 * button on the right.
 *
 * The master mockup drew the brand as a sparkle glyph beside "Tappy" "AI" as two Text composables,
 * and that is what shipped while the artwork was unavailable. The lockup itself arrived 2026-09-08
 * and replaces all three: the mascot and the wordmark are both inside the image.
 *
 * Replaces the shell's generic [com.tappyai.core.designsystem.component.TappyAppBar] for the Home
 * landing only; every other tab and every Home sub-screen keeps the standard app bar. Both buttons
 * route to tabs that already own those surfaces — Explore hosts `ReviewsRoute.Search`, Profile
 * hosts Notifications — because both live inside another tab's nested NavHost that this
 * NavController cannot address directly.
 *
 * The mockup also shows a red unread dot on the bell. There is no unread state anywhere in the
 * Android app (`NotificationsViewModel` is a push-preferences toggle and `ReviewNotification`
 * carries no read flag), so the dot is deliberately absent rather than faked.
 */
@Composable
internal fun HomeV3TopBar(
    isDarkTheme: Boolean,
    onToggleDarkTheme: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenNotifications: () -> Unit,
    /** The Inbox's unread count for the bell's badge (web `V3Shell` bell); 0 draws nothing. */
    unreadCount: Int = 0,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(HomeV3.Background)
            // TappyAppBar (which this replaces on Home) is a TopAppBar and consumes the status
            // bar inset itself; a plain Row does not, so it must be applied here or the brand
            // draws under the clock.
            .statusBarsPadding()
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        // The approved lockup, as ONE image: the mascot and the TappyAI wordmark are both inside
        // the artwork, so there is no sparkle glyph and no separate wordmark Text beside it.
        //
        // Drawn untinted at its own aspect ratio (the asset is square, 1024x1024, RGBA with a
        // transparent ground) so it reads identically on the light and dark header. Bounded to the
        // SAME 44dp the three circular header actions already use: the row was already that tall,
        // so the header's height is unchanged, and at a smaller bound the wordmark inside the
        // artwork stops being legible.
        //
        // It keeps the spoken name the two Text composables used to give TalkBack, built from the
        // same two brand strings rather than a new one.
        Image(
            painter = painterResource(R.drawable.tappyai_logo),
            contentDescription = stringResource(R.string.home_v3_brand_tappy) +
                stringResource(R.string.home_v3_brand_ai),
            contentScale = ContentScale.Fit,
            modifier = Modifier.height(44.dp),
        )
        Spacer(modifier = Modifier.weight(1f))
        // The app-wide light/dark switch, in the same 44dp circular button the other two header
        // affordances use. It shows the destination, not the current state — a moon while the app
        // is light means "go dark" — and it drives MainActivity's single theme value, so Chat,
        // Explore, Deals and Profile change with it. First in the trio so search and the bell keep
        // the trailing positions they already had.
        HeaderAction(
            onClick = onToggleDarkTheme,
            contentDescription = stringResource(
                if (isDarkTheme) R.string.home_v3_theme_to_light else R.string.home_v3_theme_to_dark,
            ),
        ) {
            Icon(
                imageVector = if (isDarkTheme) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                contentDescription = null,
                tint = HomeV3.OnSurface,
                modifier = Modifier.size(21.dp),
            )
        }
        HeaderAction(
            onClick = onOpenSearch,
            contentDescription = stringResource(R.string.home_v3_search),
        ) {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = HomeV3.OnSurface,
                modifier = Modifier.size(21.dp),
            )
        }
        HeaderAction(
            onClick = onOpenNotifications,
            contentDescription = stringResource(R.string.home_v3_notifications),
        ) {
            Box {
                Icon(
                    imageVector = Icons.Filled.NotificationsNone,
                    contentDescription = null,
                    tint = HomeV3.OnSurface,
                    modifier = Modifier.size(21.dp),
                )
                UnreadBadge(count = unreadCount)
            }
        }
    }
}

/** A 44dp circular header button — comfortably tappable, and it speaks its own label. */
@Composable
private fun HeaderAction(
    onClick: () -> Unit,
    contentDescription: String,
    icon: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            // Lightweight: a translucent disc and a faint hairline, not three heavy buttons.
            .background(HomeV3.Surface.copy(alpha = 0.55f))
            .border(1.dp, HomeV3.Outline.copy(alpha = 0.6f), CircleShape)
            .clickable(onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

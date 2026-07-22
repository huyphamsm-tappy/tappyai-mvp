package com.tappyai.app.home

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Person
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R
import kotlinx.serialization.Serializable

/**
 * The nested routes for the five top-level shell tabs. Deliberately *not* `TappyRoute`
 * (core:navigation's app-level marker): these are internal to `HomeShellScreen`'s own nested
 * NavController and are never emitted through `TappyNavigator` — they're a private navigation
 * space inside the post-auth shell, not app-wide routable destinations. `@Serializable` is all
 * Navigation Compose's type-safe `composable<T>()` needs.
 */
sealed interface HomeRoute {
    @Serializable data object Home : HomeRoute
    @Serializable data class Chat(
        val category: String? = null,
        val conversationId: String? = null,
        // A message to pre-fill and auto-send on entry (the web's `/chat?q=…`), used when arriving
        // from a "ask Tappy about this" shortcut. Null for a plain new/resumed chat.
        val prefill: String? = null,
    ) : HomeRoute
    @Serializable data object Explore : HomeRoute
    @Serializable data object Deals : HomeRoute
    @Serializable data object Profile : HomeRoute
}

/**
 * Single source of truth for the shell's five top-level destinations (route + title + icon),
 * per the Phase 1C.1 refinement. Both the navigation chrome (bottom bar / rail) and the nested
 * NavHost read from this one enum:
 *  - the chrome renders [title]/[icon] as `TappyNavItem`s, in `entries` order,
 *  - the NavHost registers each [route] and maps the current back-stack entry back to a tab,
 *  - selection is derived from the current route (not tracked separately), so the two can
 *    never drift out of sync.
 *
 * Order here *is* the on-screen tab order (bottom bar left→right, rail top→bottom) and each
 * tab's `ordinal` doubles as its selection index — keep additions/reorderings intentional.
 *
 * `Icons.AutoMirrored.Filled.Chat` (not `Icons.Filled.Chat`) is used deliberately: the plain
 * variant is deprecated in favour of the auto-mirrored one, which flips correctly for RTL
 * locales (the app is multi-language per MFS 6.11).
 *
 * [contentDescription] is the explicit TalkBack label the nav chrome speaks for each tab (MFS
 * 6.10 Accessibility). It's an intentional, separate field rather than reusing [title] so the
 * spoken form can diverge from the visible text later (e.g. a localized or fuller phrase)
 * without touching layout; for now they read the same, which is the correct tab name to speak.
 */
enum class HomeTab(
    val route: HomeRoute,
    @StringRes val titleRes: Int,
    val icon: ImageVector,
) {
    Home(HomeRoute.Home, R.string.home_tab_home, Icons.Filled.Home),
    Chat(HomeRoute.Chat(), R.string.home_tab_chat, Icons.AutoMirrored.Filled.Chat),
    Explore(HomeRoute.Explore, R.string.home_tab_explore, Icons.Filled.Explore),
    Deals(HomeRoute.Deals, R.string.home_tab_deals, Icons.Filled.LocalOffer),
    Profile(HomeRoute.Profile, R.string.home_tab_profile, Icons.Filled.Person),
}

/** The tab's display name — also used as its TalkBack content description (MFS 6.10). */
@Composable
fun HomeTab.title(): String = stringResource(titleRes)

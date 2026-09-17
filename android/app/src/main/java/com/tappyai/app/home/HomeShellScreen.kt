package com.tappyai.app.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tappyai.app.chat.ChatScreen
import com.tappyai.app.deals.DealsScreen
import com.tappyai.app.explore.ExploreTab
import com.tappyai.app.explore.ExploreFloatingDock
import com.tappyai.app.explore.ExploreV3
import com.tappyai.app.profile.ProfileTab
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyAppBar
import com.tappyai.core.designsystem.component.TappyBottomNavBar
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyNavItem
import com.tappyai.core.designsystem.component.TappyNavRail
import com.tappyai.core.designsystem.theme.TappyWindowWidthClass
import com.tappyai.core.designsystem.theme.currentWindowWidthClass

/**
 * The post-auth application shell (Phase 1C.1). Owns the top-level navigation chrome and a
 * nested [NavHost] over the five [HomeTab] destinations. Responsive by window width, not device
 * type (see `currentWindowWidthClass`): a bottom bar on Compact/Medium windows (phones,
 * split-screen), a side rail on Expanded windows (tablets, foldables, ChromeOS) — same tabs,
 * relocated. Theme flows automatically from the `TappyAITheme` wrapping this in `MainActivity`;
 * nothing here hardcodes colors.
 *
 * Selection is *derived* from the nested nav back stack rather than tracked in a separate
 * variable, so the chrome and the NavHost can't drift: [HomeTab] is the single source of truth
 * for route, title, and icon alike.
 */
@Composable
fun HomeShellScreen(
    /** Navigates to the root graph's Login destination. The shell builds its own NavController
     *  for the tabs, so anything inside it needs this routed down from `AppNavHost`. */
    onSignIn: () -> Unit = {},
    /** The resolved app theme, and the toggle for it, both owned by `MainActivity`. The Home
     *  header renders the switch; nothing here decides or stores the theme. */
    isDarkTheme: Boolean = false,
    onToggleDarkTheme: () -> Unit = {},
    viewModel: HomeShellViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    // P4-14 — a notification asked for a destination inside this shell.
    //
    // The deep-link layer cannot navigate here: [HomeRoute] is private to this screen by design.
    // So it leaves the destination in [PendingShellDestination] and navigates to the shell; the
    // shell reads it once, on composition, and drives its OWN NavController. Ownership of this
    // navigation space never leaves this file.
    //
    // Consumed rather than observed: a tap is a one-shot event, and re-reading it on a later
    // recomposition would silently yank a user who had since navigated somewhere else.
    LaunchedEffect(Unit) {
        viewModel.consumePendingDestination()?.let { navController.navigate(it) }
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    // Exact match, so it is null on a route that is not a tab; the nav bar's highlight and the
    // standard app bar's title keep the long-standing fallback — a sub-route still reads as
    // "inside Home", exactly as before V3.
    val matchedTab = HomeTab.entries.firstOrNull { tab ->
        backStackEntry?.destination?.hasRoute(tab.route::class) == true
    }
    val currentTab = matchedTab ?: HomeTab.Home

    // Which tabs are currently showing a nested screen. See [ReportNestedScreen]: each tab's own
    // host writes its entry, and a tab with no entry is simply not nested.
    val nestedByTab = remember { mutableStateMapOf<HomeTab, Boolean>() }
    // Explore reports "nested" even at its landing (it owns its header), so the immersive feed
    // is told apart by the raw past-the-landing report instead.
    val pastLandingByTab = remember { mutableStateMapOf<HomeTab, Boolean>() }
    val showsOwnHeader = nestedByTab[currentTab] == true

    // The V3 chrome belongs to the Home LANDING alone. Matching the tab is not enough on its own:
    // the Home tab owns a nested NavHost, so from out here Translate, Scan, Tarot, Games, Split
    // Bill, Music, Recommendations… are all still `HomeRoute.Home`, and gating on the tab wrapped
    // each of them in the dark palette while its own content stayed light. The SAME report the
    // nested-screen mechanism already delivers answers this — Home's host reports `true` the
    // moment anything is pushed above its landing — so no second "at landing" signal is needed.
    val isHomeTab = matchedTab == HomeTab.Home && nestedByTab[HomeTab.Home] != true

    /**
     * The Explore LANDING (the feed) is immersive: the clip runs under the status bar and under
     * the floating dock (reference "TappyAI — Immersive AI Discovery"). Nested Explore screens
     * (profiles, search, the clip pager…) keep normal insets and sit above the dock. Same
     * nested-screen report that [isHomeTab] reads.
     */
    val isExploreImmersive = currentTab == HomeTab.Explore && pastLandingByTab[HomeTab.Explore] != true

    /**
     * True while Chat's voice-listening state owns the surface.
     *
     * The listening scene is a full-bleed dark environment (V3 mockup 05_50_23) and a light "Chat"
     * title bar sitting on top of it belongs to neither design. Same shape as the nested-screen
     * report: the child reports, the shell chooses its chrome. Deliberately NOT saveable — it must
     * never survive a process restart into a state where the bar is gone and nothing is listening.
     */
    var chatImmersive by remember { mutableStateOf(false) }

    val isExpanded = currentWindowWidthClass() == TappyWindowWidthClass.Expanded
    // Read as a raw inset rather than the experimental WindowInsets.isImeVisible, so this does
    // not depend on opt-in API. Non-zero bottom == the keyboard is taking screen space.
    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val navItems = HomeTab.entries.map {
        val label = it.title()
        TappyNavItem(label = label, icon = it.icon, contentDescription = label)
    }

    Row(modifier = Modifier.fillMaxSize()) {
        if (isExpanded) {
            TappyNavRail(
                items = navItems,
                selectedIndex = currentTab.ordinal,
                onSelect = { index -> navController.selectTab(HomeTab.entries[index]) },
            )
        }
        Scaffold(
            // weight(1f), not fillMaxSize(): inside the Row the rail must take its intrinsic
            // width first and the Scaffold fills only the remainder — fillMaxSize() here would
            // demand the whole row width and push the rail off-screen. Works with or without
            // the rail present (Compact/Medium has no rail, weight still fills the row).
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
            // While the listening scene owns the surface it paints its own status-bar area, so the
            // Scaffold must stop reserving one — otherwise a light strip sits above a full-bleed
            // dark scene. Every other state keeps the default insets untouched.
            contentWindowInsets = if (chatImmersive || isExploreImmersive) WindowInsets(0, 0, 0, 0) else ScaffoldDefaults.contentWindowInsets,
            // Explore is the V3 night surface from the status bar down (mockup 05_11_01). Its own
            // header starts below the inset the Scaffold reserves, so the Scaffold paints that
            // band in Explore's ground rather than the theme's — otherwise a grey strip sits above
            // the brand header. Every other tab keeps the theme background it always had.
            containerColor = if (currentTab == HomeTab.Explore) ExploreV3.Background else MaterialTheme.colorScheme.background,
            // Home carries the V3 identity header (brand + theme toggle + search + notifications);
            // every other tab keeps the standard app bar. The shell titles a TAB, and a nested
            // screen already draws its own header with a back arrow and its real name, so the
            // shell steps out of the way rather than stacking a second — and wrong — title above
            // it. The listening scene draws its own top inset and runs to the status bar.
            topBar = {
                if (chatImmersive) Unit
                else if (isHomeTab) {
                    V3HomeTheme {
                        HomeV3TopBar(
                            isDarkTheme = isDarkTheme,
                            onToggleDarkTheme = onToggleDarkTheme,
                            // Explore owns `ReviewsRoute.Search`, Profile owns Notifications;
                            // both sit in another tab's nested NavHost that this NavController
                            // cannot address directly, so each button selects the owning tab.
                            onOpenSearch = { navController.selectTab(HomeTab.Explore) },
                            onOpenNotifications = { navController.selectTab(HomeTab.Profile) },
                        )
                    }
                } else if (!showsOwnHeader) {
                    TappyAppBar(title = currentTab.title())
                }
            },
            bottomBar = {
                // Collapsed while the IME is up. The bar would be BEHIND the keyboard anyway
                // (measured: bar at y=1360..1467, IME top at y=928), but Scaffold still reserves
                // its height in innerPadding, and ChatScreen adds imePadding() on top of that —
                // so the composer was pushed a further ~251px and left a dead band of background
                // between the input and the keyboard. Nothing is lost by hiding a bar the user
                // cannot see or reach, and the messages get that space back while typing.
                if (!isExpanded && !imeVisible) {
                    // The same TappyBottomNavBar, same items, same tab architecture — only the
                    // palette changes, and only while the Home landing is showing, so the other
                    // tabs keep the app theme they have always had. The Explore tab wears the
                    // reference design's floating glass dock (same items, same indices, same
                    // onSelect); on the feed it floats over the clip, on nested Explore screens
                    // it floats over their ground.
                    val bar: @Composable () -> Unit = {
                        TappyBottomNavBar(
                            items = navItems,
                            selectedIndex = currentTab.ordinal,
                            onSelect = { index -> navController.selectTab(HomeTab.entries[index]) },
                        )
                    }
                    when {
                        currentTab == HomeTab.Explore -> ExploreFloatingDock(
                            items = navItems,
                            selectedIndex = currentTab.ordinal,
                            onSelect = { index -> navController.selectTab(HomeTab.entries[index]) },
                        )
                        // Home wears the V3 palette and the mockup's hairline where the bar meets the
                        // page; the bar itself (items, indices, onSelect) is the same component.
                        isHomeTab -> V3HomeTheme {
                            Column {
                                HorizontalDivider(thickness = 1.dp, color = HomeV3.Outline)
                                bar()
                            }
                        }
                        else -> bar()
                    }
                }
            },
        ) { innerPadding ->
            if (uiState is UiState.Loading) {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    TappyLoadingIndicator()
                }
            } else {
                CompositionLocalProvider(
                    LocalNestedScreenReporter provides { tab, nested -> nestedByTab[tab] = nested },
                    LocalPastLandingReporter provides { tab, past -> pastLandingByTab[tab] = past },
                ) {
                NavHost(
                    navController = navController,
                    startDestination = HomeRoute.Home,
                    // The immersive feed takes the whole surface and keeps its own clearance for
                    // the dock (ExploreV3.DockClearance); every other screen is padded above it.
                    modifier = if (isExploreImmersive) Modifier else Modifier.padding(innerPadding),
                ) {
                    composable<HomeRoute.Home> {
                        HomeTabHost(
                            onNavigateToTab = { tab -> navController.selectTab(tab) },
                            onOpenChatWithPrefill = { prefill ->
                                navController.navigateToChatWithPrefill(prefill)
                            },
                            onOpenChatWithCategory = { category ->
                                navController.navigateToChatWithCategory(category)
                            },
                            onOpenConversation = { conversationId ->
                                navController.navigateToConversation(conversationId)
                            },
                        )
                    }
                    composable<HomeRoute.Chat> { ChatScreen(onImmersiveChanged = { chatImmersive = it }) }
                    composable<HomeRoute.Explore> {
                        ExploreTab(
                            onEditProfile = { navController.selectTab(HomeTab.Profile) },
                            onSignIn = onSignIn,
                            // ✦ Hỏi Tappy: the same Chat-with-prefill navigation Home and Deals
                            // use — the native `/chat?q=` bridge, one prompt per clip.
                            onAskTappy = { prefill -> navController.navigateToChatWithPrefill(prefill) },
                        )
                    }
                    composable<HomeRoute.Deals> {
                        // The Deals V3 "ask Tappy" affordances route through the SAME prefill
                        // navigation Home already uses. Passing the existing callback is what makes
                        // them real; without it the screen draws no CTA rather than a dead one.
                        DealsScreen(
                            onAskTappy = { prefill -> navController.navigateToChatWithPrefill(prefill) },
                        )
                    }
                    composable<HomeRoute.Profile> {
                        ProfileTab(
                            onOpenChat = { navController.selectTab(HomeTab.Chat) },
                            onOpenHome = { navController.selectTab(HomeTab.Home) },
                            onResumeConversation = { conversationId ->
                                navController.navigateToConversation(conversationId)
                            },
                            onSignIn = onSignIn,
                        )
                    }
                }
                }
            }
        }
    }
}

/**
 * Standard bottom-nav reselect behavior: switch tabs without stacking duplicates, pop back to
 * the shell's start destination while saving each tab's own back stack, and restore it on
 * return — so re-tapping the current tab is a no-op and tab state survives switching.
 */
private fun NavHostController.selectTab(tab: HomeTab) {
    navigate(tab.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Opens a specific past conversation on the Chat tab. Deliberately *not* [selectTab]: that helper's
 * `restoreState = true` would resurrect whatever the Chat tab's previous saved back stack was
 * (e.g. an unrelated in-progress chat), instead of the requested conversation. Resuming must always
 * land on the requested conversation, so this pops the Chat tab's saved state away and pushes a
 * fresh instance carrying the id.
 */
private fun NavHostController.navigateToConversation(conversationId: String) {
    navigate(HomeRoute.Chat(conversationId = conversationId)) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
    }
}

/**
 * Opens the Chat tab on a fresh conversation pre-filled with [prefill], which the ChatViewModel
 * auto-sends once — the native equivalent of the web's `/chat?q=…` (used by the recommendations
 * "ask Tappy about this place" shortcut). Same fresh-instance rationale as [navigateToConversation]:
 * a restored Chat back stack would ignore the prompt, so this pushes a new entry carrying it.
 */
private fun NavHostController.navigateToChatWithPrefill(prefill: String) {
    navigate(HomeRoute.Chat(prefill = prefill)) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
    }
}

/**
 * Opens the Chat tab scoped to a content [category] — the native equivalent of the web home's
 * category pill `/chat?category=<id>` (HomeRoute.Chat carries the `category`). Same fresh-instance
 * rationale as [navigateToChatWithPrefill]: a restored Chat back stack would ignore the category.
 */
private fun NavHostController.navigateToChatWithCategory(category: String) {
    navigate(HomeRoute.Chat(category = category)) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
    }
}

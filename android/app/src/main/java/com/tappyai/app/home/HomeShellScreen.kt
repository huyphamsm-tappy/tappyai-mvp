package com.tappyai.app.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tappyai.app.chat.ChatScreen
import com.tappyai.app.explore.ExploreTab
import com.tappyai.app.maps.MapsScreen
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
    viewModel: HomeShellViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentTab = HomeTab.entries.firstOrNull { tab ->
        backStackEntry?.destination?.hasRoute(tab.route::class) == true
    } ?: HomeTab.Home

    val isExpanded = currentWindowWidthClass() == TappyWindowWidthClass.Expanded
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
            topBar = { TappyAppBar(title = currentTab.title()) },
            bottomBar = {
                if (!isExpanded) {
                    TappyBottomNavBar(
                        items = navItems,
                        selectedIndex = currentTab.ordinal,
                        onSelect = { index -> navController.selectTab(HomeTab.entries[index]) },
                    )
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
                NavHost(
                    navController = navController,
                    startDestination = HomeRoute.Home,
                    modifier = Modifier.padding(innerPadding),
                ) {
                    composable<HomeRoute.Home> {
                        HomeTabHost(
                            onNavigateToTab = { tab -> navController.selectTab(tab) },
                            onOpenChatWithPrefill = { prefill ->
                                navController.navigateToChatWithPrefill(prefill)
                            },
                        )
                    }
                    composable<HomeRoute.Chat> { ChatScreen() }
                    composable<HomeRoute.Explore> { ExploreTab() }
                    composable<HomeRoute.Maps> { MapsScreen() }
                    composable<HomeRoute.Profile> {
                        ProfileTab(
                            onOpenChat = { navController.selectTab(HomeTab.Chat) },
                            onOpenHome = { navController.selectTab(HomeTab.Home) },
                            onResumeConversation = { conversationId ->
                                navController.navigateToConversation(conversationId)
                            },
                        )
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

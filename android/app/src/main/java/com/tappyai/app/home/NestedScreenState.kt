package com.tappyai.app.home

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

/**
 * Whether a tab is currently showing a NESTED screen rather than its own landing screen.
 *
 * 🚨 THE SHELL WAS TITLING EVERY SCREEN AFTER ITS TAB. Each of the three content tabs hosts its own
 * NavHost — Home reaches sixteen sub-screens (Translate, Scam Shield, Scan, Split bill…), Profile
 * reaches Saved / History / Price tracking / Settings, Explore reaches Notifications and Search. The
 * shell's app bar read `currentTab.title()`, which is the only thing it could see, so Translate was
 * captioned "Home" and Notifications "Explore". Every one of those screens already draws its own
 * header with a back arrow, so the user got two headers and the top one was wrong.
 *
 * The shell cannot inspect a nested NavController — that is the point of the nesting, and reaching
 * into it would put this file in charge of navigation it does not own. So the hosts REPORT instead:
 * one boolean per tab, written by the host that knows, read by the shell that needs it.
 *
 * Keyed by tab rather than held as a single flag so switching tabs cannot leave a stale `true`
 * behind: a tab that is not composed simply has no entry, which reads as "not nested".
 */
val LocalNestedScreenReporter = staticCompositionLocalOf<(HomeTab, Boolean) -> Unit> { { _, _ -> } }

/**
 * Reports, for [tab], whether [navController] has navigated past its start destination.
 *
 * Call it from a tab's nested host, next to its `rememberNavController()`. `previousBackStackEntry`
 * is the whole test: non-null means something was pushed on top of the landing screen.
 */
@Composable
fun ReportNestedScreen(
    tab: HomeTab,
    navController: NavHostController,
    /**
     * True for a tab whose LANDING screen already draws its own top chrome.
     *
     * Explore is the one: its feed is a full-bleed dark surface carrying its own search, bell and
     * For You / Following / Latest row — the same shape web ships, where `/reviews` renders its own
     * navigation and the global bar steps aside. A light "Explore" title bar above it is a second,
     * competing chrome system, and it was sitting there.
     */
    landingOwnsHeader: Boolean = false,
) {
    val entry by navController.currentBackStackEntryAsState()
    val report = LocalNestedScreenReporter.current
    LaunchedEffect(entry, landingOwnsHeader) {
        report(tab, landingOwnsHeader || navController.previousBackStackEntry != null)
    }
}

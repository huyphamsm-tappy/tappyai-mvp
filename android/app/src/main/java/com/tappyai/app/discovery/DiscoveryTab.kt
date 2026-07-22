package com.tappyai.app.discovery

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

/**
 * The Explore tab's content: the Discovery Foundation. Hosts its own nested NavHost so the hub
 * can drill into a category screen with its own back stack, without touching the app shell or
 * the other tabs. (Replaces the former Explore placeholder — the future social feed is deferred.)
 */
@Composable
fun DiscoveryTab() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = DiscoveryRoute.Hub) {
        composable<DiscoveryRoute.Hub> {
            DiscoveryHubScreen(
                onOpenGroup = { group -> navController.navigate(DiscoveryRoute.Category(group.id)) },
            )
        }
        composable<DiscoveryRoute.Category> {
            DiscoveryCategoryScreen(onBack = { navController.popBackStack() })
        }
    }
}

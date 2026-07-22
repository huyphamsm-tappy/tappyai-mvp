package com.tappyai.app.recommendations

import com.tappyai.core.navigation.TappyRoute
import kotlinx.serialization.Serializable

/**
 * Routes for the personalized recommendations flow ("✨ Gợi ý cho bạn"), a single full screen
 * reached from the Home launchpad — the native equivalent of the web's `/recommendations` page.
 * Nested inside the Home tab's own NavHost (same as Music/Deals), so it drills in with its own
 * back stack without disturbing the shell or other tabs.
 */
sealed interface RecommendationsRoute : TappyRoute {
    @Serializable
    data object Main : RecommendationsRoute
}

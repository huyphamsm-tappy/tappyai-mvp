package com.tappyai.app.reviews.ui

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.tappyai.app.music.MusicRoute
import com.tappyai.app.music.SoundDetailScreen
import com.tappyai.app.profile.CopyrightPolicyScreen

@Composable
fun ReviewsNavHost(onBack: (() -> Unit)? = null) {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = ReviewsRoute.Feed) {
        composable<ReviewsRoute.Feed> {
            ReviewsFeedScreen(
                onReviewClick = { reviewId ->
                    navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                },
                onCompose = { navController.navigate(ReviewsRoute.Composer) },
                onNotifications = { navController.navigate(ReviewsRoute.Notifications) },
                onSearch = { navController.navigate(ReviewsRoute.Search) },
                onOpenSound = { trackId -> navController.navigate(MusicRoute.SoundDetail(trackId)) },
                onBack = onBack,
            )
        }

        // "Use this sound" page, reached from a feed clip's music disc (web parity). Reuses the
        // Music feature's SoundDetailScreen; its sub-navigations resolve within this graph.
        composable<MusicRoute.SoundDetail> {
            SoundDetailScreen(
                onBack = { navController.popBackStack() },
                onOpenCopyrightPolicy = { navController.navigate(MusicRoute.CopyrightPolicy) },
                onOpenReview = { reviewId -> navController.navigate(ReviewsRoute.Detail(reviewId = reviewId)) },
            )
        }
        composable<MusicRoute.CopyrightPolicy> {
            CopyrightPolicyScreen(onBack = { navController.popBackStack() })
        }

        composable<ReviewsRoute.Detail> { entry ->
            val route = entry.toRoute<ReviewsRoute.Detail>()
            ReviewDetailScreen(
                reviewId = route.reviewId,
                onAvatarClick = { userId ->
                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable<ReviewsRoute.AuthorProfile> { entry ->
            val route = entry.toRoute<ReviewsRoute.AuthorProfile>()
            ReviewProfileScreen(
                userId = route.userId,
                onReviewClick = { review ->
                    navController.navigate(ReviewsRoute.Detail(reviewId = review.id))
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable<ReviewsRoute.Composer> {
            ReviewComposerHost(onBack = { navController.popBackStack() })
        }

        composable<ReviewsRoute.Notifications> {
            ReviewNotificationsScreen(
                onNotificationClick = { notification ->
                    when {
                        notification.url.startsWith("/reviews/") -> {
                            val reviewId = notification.url.removePrefix("/reviews/")
                            navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                        }
                        notification.url.startsWith("/profile/") -> {
                            val userId = notification.url.removePrefix("/profile/")
                            navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                        }
                        notification.url.startsWith("/users/") -> {
                            val userId = notification.url.removePrefix("/users/")
                            navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                        }
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable<ReviewsRoute.Search> {
            ReviewSearchScreen(
                onResultClick = { review ->
                    navController.navigate(ReviewsRoute.Detail(reviewId = review.id))
                },
                onOpenProfile = { userId ->
                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                },
                onBack = { navController.popBackStack() },
            )
        }
    }
}

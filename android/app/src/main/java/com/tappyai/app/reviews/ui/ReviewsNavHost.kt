package com.tappyai.app.reviews.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.tappyai.app.music.SoundSheet
import com.tappyai.app.reviews.data.ReviewFeedType

/** Nav-result key: a screen asks the feed to switch tab (see the Inbox digest banner). */
private const val FEED_TYPE_RESULT = "reviews_feed_type"

@Composable
fun ReviewsNavHost(
    onBack: (() -> Unit)? = null,
    // Edit-profile leaves the reviews NavHost for the app-shell account tab (web: /profile). The
    // shell wires this to switch to the "Tôi" tab.
    onEditProfile: () -> Unit = {},
) {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = ReviewsRoute.Feed) {
        composable<ReviewsRoute.Feed> { entry ->
            // A screen higher in the stack (the Inbox digest banner) can ask the feed to switch tab
            // by writing here before popping — the nav-result idiom. Cleared once applied.
            val requested by entry.savedStateHandle
                .getStateFlow<String?>(FEED_TYPE_RESULT, null)
                .collectAsState()
            LaunchedEffect(requested) {
                if (requested != null) entry.savedStateHandle[FEED_TYPE_RESULT] = null
            }
            ReviewsFeedScreen(
                onReviewClick = { reviewId ->
                    navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                },
                onAuthorClick = { userId ->
                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                },
                onCompose = { navController.navigate(ReviewsRoute.Composer) },
                onNotifications = { navController.navigate(ReviewsRoute.Notifications) },
                onSearch = { navController.navigate(ReviewsRoute.Search) },
                onBack = onBack,
                requestedFeedType = requested?.let { ReviewFeedType.Following },
                // Web parity: tapping a clip's music disc opens the compact SoundSheet.
                onMusicDiscClick = { trackId ->
                    navController.navigate(ReviewsRoute.SoundSheet(trackId = trackId))
                },
            )
        }

        composable<ReviewsRoute.SoundSheet> {
            SoundSheet(onDismiss = { navController.popBackStack() })
        }

        // Self Profile (owner decision): no feed/header entry point — the post avatar/name/username
        // open the AUTHOR's profile, not this. Kept registered so a future "Tôi"-tab entry can reach
        // it; not navigated to from within the feed.
        composable<ReviewsRoute.SelfProfile> {
            SelfProfileScreen(
                onReviewClick = { reviewId ->
                    navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                },
                onEditProfile = onEditProfile,
                onBack = { navController.popBackStack() },
            )
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
                // Web's digest banner hands off to the Following feed: hand the feed a nav result
                // asking it to select that tab, then pop back to it.
                onOpenDigest = {
                    navController.previousBackStackEntry
                        ?.savedStateHandle?.set(FEED_TYPE_RESULT, "following")
                    navController.popBackStack()
                },
            )
        }

        composable<ReviewsRoute.Search> {
            ReviewSearchScreen(
                onResultClick = { review ->
                    navController.navigate(ReviewsRoute.Detail(reviewId = review.id))
                },
                onUserClick = { userId ->
                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                },
                onBack = { navController.popBackStack() },
            )
        }
    }
}

package com.tappyai.app.reviews.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewFeedType
import com.tappyai.app.home.HomeTab
import com.tappyai.app.messaging.ThreadScreen
import com.tappyai.app.notifications.InboxScreen
import com.tappyai.app.notifications.NotificationsScreen
import com.tappyai.app.home.ReportNestedScreen

/** Nav-result key: a screen higher in the stack asks the feed to switch tab. */
private const val FEED_TYPE_RESULT = "reviews_feed_type"

/**
 * Nav-result key: Edit Profile tells the profile it must re-read the server. Needed because a
 * destination LEAVES composition while the next one is up, so the profile's `ReloadOnResume`
 * sees a fresh first resume on return and — correctly — skips it; the flag is what says
 * "something may have changed". Set on every exit from Edit Profile: the avatar uploads on pick,
 * before Save, so Back can be a change too.
 */
private const val PROFILE_CHANGED_RESULT = "reviews_self_profile_changed"

@Composable
fun ReviewsNavHost(
    onBack: (() -> Unit)? = null,
    // Kept for the shell's call site; no longer used. Explore's own profile is edited INSIDE
    // Explore (`ReviewsRoute.EditProfile`, owner revision 2026-09-12) — "Sửa hồ sơ" must not leave
    // for the app's Tôi tab.
    @Suppress("UNUSED_PARAMETER") onEditProfile: () -> Unit = {},
    /**
     * ✦ Hỏi Tappy: hands the shell a ready prompt about one clip to open Chat with — the native
     * equivalent of the web's `/chat?q=` bridge (`bridge.promptEntity`). Null hides the action.
     */
    onAskTappy: ((String) -> Unit)? = null,
    /** The Inbox's sign-in state for a guest — routed up to the root graph's Login. Null hides the button. */
    onSignIn: (() -> Unit)? = null,
) {
    val navController = rememberNavController()
    val context = LocalContext.current
    // The prompt is built here, where the string resource and the shell callback meet: the
    // subject is the clip's place (web parity) or, failing that, its caption (askTappySubject).
    val askTappy: ((Review) -> Unit)? = onAskTappy?.let { ask ->
        { review ->
            askTappySubject(review)?.let { subject ->
                ask(context.getString(R.string.reviews_ask_tappy_prefill, subject))
            }
        }
    }

    ReportNestedScreen(HomeTab.Explore, navController, landingOwnsHeader = true)

    NavHost(navController = navController, startDestination = ReviewsRoute.Feed) {
        composable<ReviewsRoute.Feed> { entry ->
            // A screen higher in the stack can ask the feed to switch tab by writing here before
            // popping — the nav-result idiom. Cleared once applied.
            val requested by entry.savedStateHandle
                .getStateFlow<String?>(FEED_TYPE_RESULT, null)
                .collectAsState()
            LaunchedEffect(requested) {
                if (requested != null) entry.savedStateHandle[FEED_TYPE_RESULT] = null
            }
            // The feed has no route to Detail of its own any more: the rail's comment button opens
            // the comment sheet over the pager (ReviewCommentSheet), and a tap on the clip is
            // play/pause. Detail is still reached from the profiles, notifications and deep links.
            ReviewsFeedScreen(
                onAuthorClick = { userId ->
                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                },
                onCompose = { navController.navigate(ReviewsRoute.Composer) },
                onNotifications = { navController.navigate(ReviewsRoute.Notifications) },
                onSearch = { navController.navigate(ReviewsRoute.Search) },
                // Explore → My Profile (V3): the feed header's person button.
                onProfile = { navController.navigate(ReviewsRoute.SelfProfile) },
                onBack = onBack,
                requestedFeedType = requested?.let { ReviewFeedType.Following },
                onAskTappy = askTappy,
            )
        }

        // Self Profile (V3, 2026-09-12): reached from the feed header's person button. A post's
        // avatar/name/username still open the AUTHOR's profile, as the owner decided earlier.
        composable<ReviewsRoute.SelfProfile> { entry ->
            val changed by entry.savedStateHandle
                .getStateFlow(PROFILE_CHANGED_RESULT, false)
                .collectAsState()
            SelfProfileScreen(
                reloadRequested = changed,
                onReloadHandled = { entry.savedStateHandle[PROFILE_CHANGED_RESULT] = false },
                // A tile opens the profile's clip pager on that clip (own posts = userId null).
                onReviewClick = { reviewId ->
                    navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))
                },
                // A tile in a personal collection opens the clip in THAT collection's surface, as the
                // Tôi hub does: own/hidden posts page `/mine` (the pager includes hidden rows), saved
                // pages `/saved`; liked and shared have no pager source, so they open the detail.
                onCollectionReviewClick = { collection, reviewId ->
                    when (collection) {
                        CreatorProfileTab.Posts, CreatorProfileTab.Hidden ->
                            navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))
                        CreatorProfileTab.Saved ->
                            navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId, saved = true))
                        CreatorProfileTab.Liked, CreatorProfileTab.Shared ->
                            navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                    }
                },
                // Explore → My Profile → Sửa hồ sơ → Edit Profile → Save → My Profile. Never the Tôi tab.
                onEditProfile = { navController.navigate(ReviewsRoute.EditProfile) },
                onBack = { navController.popBackStack() },
                onSearch = { navController.navigate(ReviewsRoute.Search) },
                onNotifications = { navController.navigate(ReviewsRoute.Notifications) },
                onCompose = { navController.navigate(ReviewsRoute.Composer) },
                onSignIn = onSignIn,
            )
        }

        composable<ReviewsRoute.EditProfile> {
            val leave = {
                navController.previousBackStackEntry?.savedStateHandle?.set(PROFILE_CHANGED_RESULT, true)
                navController.popBackStack()
            }
            SelfProfileEditScreen(
                onBack = { leave() },
                // Saved: back to the profile, which re-reads the server (see PROFILE_CHANGED_RESULT).
                onSaved = { leave() },
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

        // Any other creator's profile (feed avatar/handle, search result, notification) — the same
        // V3 layout as Self Profile; when the server says it is the viewer's own, the screen IS
        // Self Profile (edit, not follow), so the edit result flag is read here as well.
        composable<ReviewsRoute.AuthorProfile> { entry ->
            val route = entry.toRoute<ReviewsRoute.AuthorProfile>()
            val changed by entry.savedStateHandle
                .getStateFlow(PROFILE_CHANGED_RESULT, false)
                .collectAsState()
            ReviewProfileScreen(
                userId = route.userId,
                // A tile opens THIS author's clip pager on that clip — only their posts are paged.
                onReviewClick = { reviewId ->
                    navController.navigate(ReviewsRoute.ProfileClips(userId = route.userId, startReviewId = reviewId))
                },
                // The viewer's own profile (server `is_self`) pages its OWN posts — `/api/reviews/mine`,
                // exactly as Explore → My Profile does — never the public `?userId=` feed.
                onSelfReviewClick = { reviewId ->
                    navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))
                },
                // A tile in a personal collection opens the clip in THAT collection's surface, as the
                // Tôi hub does: own/hidden posts page `/mine` (the pager includes hidden rows), saved
                // pages `/saved`; liked and shared have no pager source, so they open the detail.
                onCollectionReviewClick = { collection, reviewId ->
                    when (collection) {
                        CreatorProfileTab.Posts, CreatorProfileTab.Hidden ->
                            navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))
                        CreatorProfileTab.Saved ->
                            navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId, saved = true))
                        CreatorProfileTab.Liked, CreatorProfileTab.Shared ->
                            navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                    }
                },
                onBack = { navController.popBackStack() },
                onSearch = { navController.navigate(ReviewsRoute.Search) },
                onNotifications = { navController.navigate(ReviewsRoute.Notifications) },
                onEditProfile = { navController.navigate(ReviewsRoute.EditProfile) },
                onCompose = { navController.navigate(ReviewsRoute.Composer) },
                reloadRequested = changed,
                onReloadHandled = { entry.savedStateHandle[PROFILE_CHANGED_RESULT] = false },
            )
        }

        // Profile → clip pager (web ClipViewer). Pushed above the profile: Back returns to the
        // grid (which reloads on resume, so a clip deleted or hidden here disappears from it).
        composable<ReviewsRoute.ProfileClips> { entry ->
            val route = entry.toRoute<ReviewsRoute.ProfileClips>()
            ProfileClipsScreen(
                startReviewId = route.startReviewId,
                onAuthorClick = { userId ->
                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                },
                onAskTappy = askTappy,
                onBack = { navController.popBackStack() },
            )
        }

        composable<ReviewsRoute.Composer> {
            ReviewComposerHost(onBack = { navController.popBackStack() })
        }

        // The Inbox (V3, 2026-09-17): the same screen the Tôi tab hosts (`ProfileRoute.Inbox`), so
        // the bell in Explore and the bell on Home open one Inbox. A row opens by its `entity_url`.
        composable<ReviewsRoute.Notifications> {
            InboxScreen(
                onBack = { navController.popBackStack() },
                onOpenNotification = { notification ->
                    when {
                        notification.url.startsWith("/reviews/") -> {
                            val reviewId = notification.url.removePrefix("/reviews/").substringBefore('?')
                            navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))
                        }
                        notification.url.startsWith("/profile/") -> {
                            val userId = notification.url.removePrefix("/profile/").substringBefore('?')
                            navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                        }
                        notification.url.startsWith("/users/") -> {
                            val userId = notification.url.removePrefix("/users/").substringBefore('?')
                            navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))
                        }
                    }
                },
                onOpenSettings = { navController.navigate(ReviewsRoute.NotificationSettings) },
                onSignIn = onSignIn,
                onOpenThread = { threadId -> navController.navigate(ReviewsRoute.MessageThread(threadId)) },
            )
        }

        composable<ReviewsRoute.NotificationSettings> {
            NotificationsScreen(onBack = { navController.popBackStack() })
        }

        composable<ReviewsRoute.MessageThread> {
            ThreadScreen(onBack = { navController.popBackStack() })
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

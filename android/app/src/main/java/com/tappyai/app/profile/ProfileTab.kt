package com.tappyai.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import com.tappyai.app.R
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navigation
import androidx.navigation.toRoute
import com.tappyai.app.account.AccountEditScreen
import com.tappyai.app.account.AccountScreen
import com.tappyai.app.account.AccountViewModel
import com.tappyai.app.appconnections.AppConnectionsScreen
import com.tappyai.app.bookings.BookingsScreen
import com.tappyai.app.history.ChatHistoryScreen
import com.tappyai.app.preferences.PreferencesScreen
import com.tappyai.app.membership.MembershipScreen
import com.tappyai.app.memory.MemoryScreen
import com.tappyai.app.myreviews.MyReviewsScreen
import com.tappyai.app.groupdining.GroupDiningScreen
import com.tappyai.app.messaging.ThreadScreen
import com.tappyai.app.notifications.InboxScreen
import com.tappyai.app.notifications.NotificationsScreen
import com.tappyai.app.planner.PlannerScreen
import com.tappyai.app.pricetracking.PriceTrackingScreen
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.ui.ProfileClipsScreen
import com.tappyai.app.reviews.ui.ReviewComposerHost
import com.tappyai.app.reviews.ui.askTappySubject
import com.tappyai.app.reviews.ui.ReviewDetailScreen
import com.tappyai.app.reviews.ui.ReviewProfileScreen
import com.tappyai.app.saved.SavedScreen
import com.tappyai.app.servicedetail.ServiceDetailScreen
import com.tappyai.app.social.SocialScreen
import com.tappyai.app.home.HomeTab
import com.tappyai.app.home.ReportNestedScreen

/**
 * The Profile tab's content. Hosts its own nested NavHost (Hub → Settings → Notifications; Hub →
 * Membership; Hub/Settings → What-Tappy-Knows; Hub → Saved) so each screen drills in with its own
 * back stack, without touching the app shell or other tabs. [onOpenChat]/[onOpenHome] are forwarded
 * from the shell so empty-state actions ("Start chat", "Explore now") can switch top-level tabs.
 *
 * `MyReviewsComposer`/`ReviewDetail`/`AuthorProfile` re-host the Reviews feature's own screens
 * (`internal` in `:app`, so directly reusable here) as destinations on *this* NavHost — My
 * Reviews' "Post your first review" and Saved's review rows need real navigation targets, but
 * they live in a different tab's independent nested NavHost, so the only clean way to reach them
 * is a second set of routes here rather than crossing NavControllers.
 */
@Composable
fun ProfileTab(
    onOpenChat: () -> Unit,
    onOpenHome: () -> Unit,
    onResumeConversation: (String) -> Unit,
    /** Routed up to `AppNavHost` — this tab's NavController is nested and cannot reach the
     *  root graph's Login destination. Forwarded to both Profile and Settings. */
    onSignIn: () -> Unit,
    /** The Planner's "Lập kế hoạch": Chat with the planner prompt pre-filled (web `/chat?q=`). */
    onOpenChatWithPrefill: (String) -> Unit = { onOpenChat() },
    /** Following's "Khám phá cộng đồng" and History's empty-state action → the Explore tab. */
    onOpenExplore: () -> Unit = onOpenHome,
    /** Home's bell: the shell selects this tab and asks for the Inbox; consumed once it is open. */
    openInboxRequest: Boolean = false,
    onInboxRequestHandled: () -> Unit = {},
) {
    val navController = rememberNavController()
    val context = LocalContext.current
    LaunchedEffect(openInboxRequest) {
        if (openInboxRequest) {
            navController.navigate(ProfileRoute.Inbox) { launchSingleTop = true }
            onInboxRequestHandled()
        }
    }
    // ✦ Hỏi Tappy from the pager — the same prompt the Explore graph builds (`askTappySubject`).
    val askTappy: (Review) -> Unit = { review ->
        askTappySubject(review)?.let { subject ->
            onOpenChatWithPrefill(context.getString(R.string.reviews_ask_tappy_prefill, subject))
        }
    }
    // The V3 landing draws its own header ("Tôi" + blurb + mascot), so the shell's title bar
    // steps aside at the landing exactly as it does for Explore; nested screens keep their own.
    ReportNestedScreen(HomeTab.Profile, navController, landingOwnsHeader = true)

    NavHost(navController = navController, startDestination = ProfileRoute.Hub) {
        composable<ProfileRoute.Hub> {
            ProfileScreen(
                onOpenSettings = { navController.navigate(ProfileRoute.Settings) },
                onOpenMembership = { navController.navigate(ProfileRoute.Membership) },
                onOpenTappyKnows = { navController.navigate(ProfileRoute.TappyKnows) },
                onOpenChatHistory = { navController.navigate(ProfileRoute.ChatHistory) },
                onOpenSaved = { navController.navigate(ProfileRoute.Saved) },
                onOpenBookings = { navController.navigate(ProfileRoute.Bookings) },
                onOpenPreferences = { navController.navigate(ProfileRoute.Preferences) },
                onOpenMyReviews = { navController.navigate(ProfileRoute.MyReviews) },
                onOpenGroupDining = { navController.navigate(ProfileRoute.GroupDining) },
                onOpenPriceTracking = { navController.navigate(ProfileRoute.PriceTracking) },
                onOpenAccount = { navController.navigate(ProfileRoute.AccountGraph) },
                onOpenAppConnections = { navController.navigate(ProfileRoute.AppConnections) },
                // The privacy card: the same destination Settings' "Chính sách bảo mật" opens.
                onOpenPrivacy = { navController.navigate(ProfileRoute.Privacy) },
                onSignIn = onSignIn,
                onOpenPlanner = { navController.navigate(ProfileRoute.Planner) },
                onOpenSocial = { navController.navigate(ProfileRoute.Social) },
                // The Account graph's edit screen — navigating to the nested destination builds
                // the graph (and its start) underneath, so Back lands on Account as it always has.
                onEditProfile = { navController.navigate(ProfileRoute.AccountEdit) },
                // A tile opens the clip in ITS collection's pager: own posts and hidden posts page
                // `/mine` (the pager includes hidden rows), saved pages `/saved`. Liked and Shared
                // have no pager source in the (staged, untouched) Reviews ViewModel, so they open
                // the existing detail screen instead — never a second viewer.
                onOpenReview = { collection, reviewId ->
                    when (collection) {
                        ProfileContentTab.Posts, ProfileContentTab.Hidden ->
                            navController.navigate(ProfileRoute.ProfileClips(userId = null, startReviewId = reviewId))
                        ProfileContentTab.Saved ->
                            navController.navigate(ProfileRoute.ProfileClips(userId = null, startReviewId = reviewId, saved = true))
                        ProfileContentTab.Liked, ProfileContentTab.Shared, ProfileContentTab.Places ->
                            navController.navigate(ProfileRoute.ReviewDetail(reviewId))
                    }
                },
                onOpenCreator = { userId -> navController.navigate(ProfileRoute.AuthorProfile(userId)) },
                onCompose = { navController.navigate(ProfileRoute.MyReviewsComposer) },
            )
        }
        // The Explore feature's clip pager, over the self profile's own collections (see the route).
        composable<ProfileRoute.ProfileClips> { entry ->
            val route = entry.toRoute<ProfileRoute.ProfileClips>()
            ProfileClipsScreen(
                startReviewId = route.startReviewId,
                onAuthorClick = { userId -> navController.navigate(ProfileRoute.AuthorProfile(userId)) },
                onAskTappy = askTappy,
                onBack = { navController.popBackStack() },
            )
        }
        composable<ProfileRoute.Planner> {
            PlannerScreen(
                onBack = { navController.popBackStack() },
                onOpenConversation = onResumeConversation,
                onPlanWithTappy = onOpenChatWithPrefill,
            )
        }
        composable<ProfileRoute.Social> {
            SocialScreen(
                onBack = { navController.popBackStack() },
                onOpenProfile = { userId -> navController.navigate(ProfileRoute.AuthorProfile(userId)) },
                onOpenExplore = onOpenExplore,
                onSignIn = onSignIn,
            )
        }
        composable<ProfileRoute.AppConnections> {
            AppConnectionsScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Settings> {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onSignIn = onSignIn,
                onOpenNotifications = { navController.navigate(ProfileRoute.Notifications) },
                onOpenTappyKnows = { navController.navigate(ProfileRoute.TappyKnows) },
                onOpenGuide = { navController.navigate(ProfileRoute.Guide) },
                onOpenTerms = { navController.navigate(ProfileRoute.Terms) },
                onOpenPrivacy = { navController.navigate(ProfileRoute.Privacy) },
            )
        }
        composable<ProfileRoute.Guide> {
            HowToUseScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Terms> {
            TermsOfServiceScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Privacy> {
            PrivacyPolicyScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Notifications> {
            NotificationsScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Inbox> {
            InboxScreen(
                onBack = { navController.popBackStack() },
                onOpenNotification = { notification ->
                    when {
                        notification.url.startsWith("/reviews/") ->
                            navController.navigate(ProfileRoute.ReviewDetail(notification.url.removePrefix("/reviews/").substringBefore('?')))
                        notification.url.startsWith("/profile/") ->
                            navController.navigate(ProfileRoute.AuthorProfile(notification.url.removePrefix("/profile/").substringBefore('?')))
                        notification.url.startsWith("/users/") ->
                            navController.navigate(ProfileRoute.AuthorProfile(notification.url.removePrefix("/users/").substringBefore('?')))
                    }
                },
                onOpenSettings = { navController.navigate(ProfileRoute.Notifications) },
                onSignIn = onSignIn,
                onOpenThread = { threadId -> navController.navigate(ProfileRoute.MessageThread(threadId)) },
            )
        }
        composable<ProfileRoute.MessageThread> {
            ThreadScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Membership> {
            MembershipScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.TappyKnows> {
            MemoryScreen(onBack = { navController.popBackStack() }, onStartChat = onOpenChat)
        }
        composable<ProfileRoute.ChatHistory> {
            ChatHistoryScreen(
                onBack = { navController.popBackStack() },
                onStartChat = onOpenChat,
                onResumeConversation = onResumeConversation,
                onOpenPlanner = { navController.navigate(ProfileRoute.Planner) },
                onOpenExplore = onOpenExplore,
            )
        }
        composable<ProfileRoute.Saved> {
            SavedScreen(
                onBack = { navController.popBackStack() },
                // The web's empty-state link is `/reviews` — the Explore tab, not Home.
                onExploreNow = onOpenExplore,
                onOpenReview = { reviewId -> navController.navigate(ProfileRoute.ReviewDetail(reviewId)) },
                onOpenPlace = { fav ->
                    navController.navigate(
                        ProfileRoute.ServiceDetail(
                            serviceId = serviceSlug(fav.name),
                            name = fav.name,
                            address = fav.address,
                            type = fav.type,
                            placeId = fav.placeId,
                        ),
                    )
                },
            )
        }
        composable<ProfileRoute.ServiceDetail> {
            ServiceDetailScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Bookings> {
            BookingsScreen(onBack = { navController.popBackStack() }, onExploreNow = onOpenHome)
        }
        composable<ProfileRoute.Preferences> {
            PreferencesScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.MyReviews> {
            MyReviewsScreen(
                onBack = { navController.popBackStack() },
                onCreateReview = { navController.navigate(ProfileRoute.MyReviewsComposer) },
            )
        }
        composable<ProfileRoute.MyReviewsComposer> {
            ReviewComposerHost(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.ReviewDetail> { entry ->
            val route = entry.toRoute<ProfileRoute.ReviewDetail>()
            ReviewDetailScreen(
                reviewId = route.reviewId,
                onAvatarClick = { userId -> navController.navigate(ProfileRoute.AuthorProfile(userId)) },
                onBack = { navController.popBackStack() },
            )
        }
        composable<ProfileRoute.AuthorProfile> { entry ->
            val route = entry.toRoute<ProfileRoute.AuthorProfile>()
            ReviewProfileScreen(
                userId = route.userId,
                // The screen now hands up the review id (Explore's author profile went V3 on
                // 2026-09-13 and shares this composable); this graph still opens its own detail.
                onReviewClick = { reviewId -> navController.navigate(ProfileRoute.ReviewDetail(reviewId)) },
                onBack = { navController.popBackStack() },
            )
        }
        composable<ProfileRoute.GroupDining> {
            GroupDiningScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.PriceTracking> {
            PriceTrackingScreen(
                onBack = { navController.popBackStack() },
                onOpenChat = onOpenChat,
            )
        }
        navigation<ProfileRoute.AccountGraph>(startDestination = ProfileRoute.Account) {
            composable<ProfileRoute.Account> { entry ->
                val graphEntry = remember(entry) {
                    navController.getBackStackEntry<ProfileRoute.AccountGraph>()
                }
                val viewModel: AccountViewModel = hiltViewModel(graphEntry)
                AccountScreen(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onEditProfile = { navController.navigate(ProfileRoute.AccountEdit) },
                )
            }
            composable<ProfileRoute.AccountEdit> { entry ->
                val graphEntry = remember(entry) {
                    navController.getBackStackEntry<ProfileRoute.AccountGraph>()
                }
                val viewModel: AccountViewModel = hiltViewModel(graphEntry)
                AccountEditScreen(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

/**
 * Slugifies a place name into the service id — a byte-for-byte port of the web's `buildServiceUrl`
 * slug (`toLowerCase → spaces to '-' → strip non [a-z0-9-] → first 40 chars → 'place' if empty`).
 * Kept identical so a booking's `service_id` matches across web and Android for the same place.
 */
private fun serviceSlug(name: String): String =
    name.lowercase()
        .replace(Regex("\\s+"), "-")
        .replace(Regex("[^a-z0-9-]"), "")
        .take(40)
        .ifEmpty { "place" }

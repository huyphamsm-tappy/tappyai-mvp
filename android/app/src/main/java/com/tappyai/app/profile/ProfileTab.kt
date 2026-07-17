package com.tappyai.app.profile

import androidx.compose.runtime.Composable
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
import com.tappyai.app.notifications.NotificationsScreen
import com.tappyai.app.pricetracking.PriceTrackingScreen
import com.tappyai.app.reviews.ui.ReviewComposerHost
import com.tappyai.app.reviews.ui.ReviewDetailScreen
import com.tappyai.app.reviews.ui.ReviewProfileScreen
import com.tappyai.app.saved.SavedScreen
import com.tappyai.app.servicedetail.ServiceDetailScreen

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
) {
    val navController = rememberNavController()
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
            )
        }
        composable<ProfileRoute.AppConnections> {
            AppConnectionsScreen(onBack = { navController.popBackStack() })
        }
        composable<ProfileRoute.Settings> {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onOpenNotifications = { navController.navigate(ProfileRoute.Notifications) },
                onOpenTappyKnows = { navController.navigate(ProfileRoute.TappyKnows) },
                onOpenTerms = { navController.navigate(ProfileRoute.Terms) },
                onOpenPrivacy = { navController.navigate(ProfileRoute.Privacy) },
            )
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
            )
        }
        composable<ProfileRoute.Saved> {
            SavedScreen(
                onBack = { navController.popBackStack() },
                onExploreNow = onOpenHome,
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
                onReviewClick = { review -> navController.navigate(ProfileRoute.ReviewDetail(review.id)) },
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

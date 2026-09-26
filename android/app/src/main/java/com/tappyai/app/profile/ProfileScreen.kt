package com.tappyai.app.profile

import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Cable
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.account.AccountProfile
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyComingSoonSheet
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

// ── Tôi — the V3 profile landing (2026-09-14) ─────────────────────────────────────────────────
//
// The same surface, the same twelve ways out of it, in the V3 dress the rest of the app now
// wears (Home, Explore, Smart Tools): the V3 palette that follows the system appearance, a real
// header with the official mascot, the account state as a hero card, sign-in as a secondary
// card for guests, the Account rows in one grouped card with a coloured icon tile each, a
// privacy card, and the Settings entry — over the SAME ViewModel, routes and callbacks as before.
//
// 🚨 NOTHING ROUTES ANYWHERE NEW. Every row calls the callback the tab already passed; the one
// added card, "Quyền riêng tư & Bảo mật", opens `ProfileRoute.Privacy` — a destination this
// tab's graph has always registered and Settings has always linked ("Chính sách bảo mật").
// No field is shown that `GET /api/profile` does not return (name, email, avatar); a guest sees
// the same placeholder identity as before, never an invented one.

// Matching key kept separate from the localized display title (which changes with the app
// language) — see ChatCategory.kt for the same icon+labelRes enum shape this mirrors.
private enum class ProfileMenuItem(
    val icon: ImageVector,
    @StringRes val titleRes: Int,
    @StringRes val subtitleRes: Int,
    /** The icon tile's colour — contextual, one per destination, as the V3 reference. */
    val tint: Color,
) {
    Account(Icons.Filled.Person, R.string.profile_menu_account, R.string.profile_menu_account_desc, Color(0xFF14B58A)),
    ChatHistory(Icons.AutoMirrored.Filled.Message, R.string.profile_menu_chat_history, R.string.profile_menu_chat_history_desc, Color(0xFF3B82F6)),
    Bookings(Icons.Filled.CalendarMonth, R.string.profile_menu_bookings, R.string.profile_menu_bookings_desc, Color(0xFFF97316)),
    Preferences(Icons.Filled.Favorite, R.string.profile_menu_preferences, R.string.profile_menu_preferences_desc, Color(0xFFEF4462)),
    Saved(Icons.Filled.Bookmark, R.string.profile_menu_saved, R.string.profile_menu_saved_desc, Color(0xFF7C5CFF)),
    PriceTracking(Icons.AutoMirrored.Filled.TrendingUp, R.string.profile_menu_price_tracking, R.string.profile_menu_price_tracking_desc, Color(0xFF0E9F6E)),
    /** The web's `accountRows()` entry for `/planner` (`v3.nav.planner` / `v3.planner.subtitle`). */
    Planner(Icons.Filled.CalendarMonth, R.string.planner_nav_title, R.string.planner_subtitle, Color(0xFF8B5CF6)),
    /** The web shell's `v3.nav.following` → `/social`; Android has no nav row, so it lives here. */
    Social(Icons.Filled.Group, R.string.social_nav_title, R.string.social_tagline, Color(0xFF2563EB)),
    TappyKnows(Icons.Filled.Lightbulb, R.string.profile_menu_tappy_knows, R.string.profile_menu_tappy_knows_desc, Color(0xFFD9A50B)),
    AppConnections(Icons.Filled.Cable, R.string.profile_menu_app_connections, R.string.profile_menu_app_connections_desc, Color(0xFF06B6D4)),
    MyReviews(Icons.Filled.Star, R.string.profile_menu_my_reviews, R.string.profile_menu_my_reviews_desc, Color(0xFFF59E0B)),
    GroupDining(Icons.Filled.Group, R.string.profile_menu_group_dining, R.string.profile_menu_group_dining_desc, Color(0xFFEC4899)),
    UpgradeToPro(Icons.Filled.WorkspacePremium, R.string.profile_menu_upgrade_to_pro, R.string.profile_menu_upgrade_to_pro, Color(0xFFF59E0B)),
}

@Composable
private fun ProfileMenuItem.title(): String = stringResource(titleRes)

// Web parity 2026-07-11: the Pro upsell is HIDDEN app-wide during the free test phase
// (mirrors web ProfileView's `SHOW_PRO_UPGRADE = false` — no legal entity for payments yet).
// Flip to true together with the web flag when Pro launches; MembershipScreen stays intact.
private const val SHOW_PRO_UPGRADE = false

// Order + labels + icons mirror the web `ProfileView` "Account" section exactly.
private val ACCOUNT_ITEMS = buildList {
    add(ProfileMenuItem.Account)
    add(ProfileMenuItem.ChatHistory)
    add(ProfileMenuItem.Bookings)
    add(ProfileMenuItem.Preferences)
    add(ProfileMenuItem.Saved)
    add(ProfileMenuItem.PriceTracking)
    add(ProfileMenuItem.Planner)
    add(ProfileMenuItem.Social)
    add(ProfileMenuItem.TappyKnows)
    add(ProfileMenuItem.AppConnections)
    add(ProfileMenuItem.MyReviews)
    add(ProfileMenuItem.GroupDining)
    if (SHOW_PRO_UPGRADE) add(ProfileMenuItem.UpgradeToPro)
}

private val CardShape = RoundedCornerShape(20.dp)
private val TileShape = RoundedCornerShape(12.dp)

/**
 * Profile landing — matches the web `ProfileView` section order: profile hero → sign-in card
 * (guests only) → "Account" menu section (10 rows; +1 "Upgrade to Pro" row gated OFF by
 * [SHOW_PRO_UPGRADE], web parity) → privacy card → "Settings" entry. **No fake user**: the hero
 * shows the signed-in profile's name, email and avatar, or the placeholder identity ("Your
 * profile" / "Sign in to personalize"). The QR button opens the real [QrProfileSheet] when a user
 * id exists; every row drills into its real screen through the callback the tab passes.
 */
@Composable
fun ProfileScreen(
    onOpenSettings: () -> Unit,
    /** Navigates to the root graph's Login destination (see `AppNavHost`). */
    onSignIn: () -> Unit,
    onOpenMembership: () -> Unit,
    onOpenTappyKnows: () -> Unit,
    onOpenChatHistory: () -> Unit,
    onOpenSaved: () -> Unit,
    onOpenBookings: () -> Unit,
    onOpenPreferences: () -> Unit,
    onOpenMyReviews: () -> Unit,
    onOpenGroupDining: () -> Unit,
    onOpenPriceTracking: () -> Unit,
    onOpenAccount: () -> Unit,
    onOpenAppConnections: () -> Unit,
    /** The privacy card → `ProfileRoute.Privacy`, the privacy policy this graph always hosted. */
    onOpenPrivacy: () -> Unit = {},
    /** AI Planner (web `/planner`) and Following / Followers (web `/social`). */
    onOpenPlanner: () -> Unit = {},
    onOpenSocial: () -> Unit = {},
    /** The hero's "Chỉnh sửa hồ sơ" — the existing Account edit screen (web `/profile/edit`). */
    onEditProfile: () -> Unit = onOpenAccount,
    /** A tile in a collection → that clip in the collection's own pager / detail; a Following row → that creator. */
    onOpenReview: (ProfileContentTab, String) -> Unit = { _, _ -> },
    onOpenCreator: (String) -> Unit = {},
    /** "Đăng bài mới" → the review composer this graph already hosts. */
    onCompose: () -> Unit = onOpenMyReviews,
    viewModel: ProfileViewModel = hiltViewModel(),
    contentViewModel: ProfileHubContentViewModel = hiltViewModel(),
) {
    var comingSoonFeature by remember { mutableStateOf<String?>(null) }
    var showQrSheet by remember { mutableStateOf(false) }

    V3HomeTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(HomeV3.Background)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth()
                    .padding(horizontal = TappySpacing.xl)
                    .padding(top = TappySpacing.md, bottom = TappySpacing.xxl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
            ) {
                ProfileV3Header()

                val qrFeatureName = stringResource(R.string.profile_qr_feature_name)
                val onShowQr = { if (viewModel.userId != null) showQrSheet = true else comingSoonFeature = qrFeatureName }
                if (viewModel.isAnonymous) {
                    // Guests: the account card and, right under it, the sign-in affordance — the
                    // web's `GuestProfileView`, which renders no content tabs and no stats.
                    ProfileHeroCard(profile = viewModel.profile, onShowQr = onShowQr)
                    SignInCard(onClick = onSignIn)
                } else {
                    // Signed in: the web `/profile` hero, content tabs and side panels.
                    ProfileHeroV3(
                        profile = viewModel.profile,
                        stats = contentViewModel.stats,
                        likes = contentViewModel.likes,
                        isPremium = contentViewModel.isPremium,
                        onEditProfile = onEditProfile,
                        onShowQr = onShowQr,
                    )
                    ProfileContentV3(
                        tab = contentViewModel.tab,
                        onSelectTab = contentViewModel::selectTab,
                        posts = contentViewModel.posts,
                        liked = contentViewModel.liked,
                        saved = contentViewModel.saved,
                        hidden = contentViewModel.hidden,
                        shared = contentViewModel.shared,
                        places = contentViewModel.places,
                        loading = contentViewModel.tabLoading,
                        failed = contentViewModel.tabFailed,
                        onCompose = onCompose,
                        onOpenReview = onOpenReview,
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    MenuSectionHeader(stringResource(R.string.profile_section_account))
                    ProfileGroupCard {
                        ACCOUNT_ITEMS.forEachIndexed { index, item ->
                            if (index > 0) HorizontalDivider(color = HomeV3.Outline, modifier = Modifier.padding(start = 72.dp))
                            ProfileV3Row(
                                item = item,
                                // Every item drills into a real screen; matched by the stable enum
                                // key (not the localized title) so this keeps working once the app
                                // language changes.
                                onClick = when (item) {
                                    ProfileMenuItem.UpgradeToPro -> onOpenMembership
                                    ProfileMenuItem.TappyKnows -> onOpenTappyKnows
                                    ProfileMenuItem.ChatHistory -> onOpenChatHistory
                                    ProfileMenuItem.Saved -> onOpenSaved
                                    ProfileMenuItem.Bookings -> onOpenBookings
                                    ProfileMenuItem.Preferences -> onOpenPreferences
                                    ProfileMenuItem.MyReviews -> onOpenMyReviews
                                    ProfileMenuItem.PriceTracking -> onOpenPriceTracking
                                    ProfileMenuItem.GroupDining -> onOpenGroupDining
                                    ProfileMenuItem.Account -> onOpenAccount
                                    ProfileMenuItem.AppConnections -> onOpenAppConnections
                                    ProfileMenuItem.Planner -> onOpenPlanner
                                    ProfileMenuItem.Social -> onOpenSocial
                                },
                            )
                        }
                    }
                }

                PrivacyCard(onClick = onOpenPrivacy)

                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    MenuSectionHeader(stringResource(R.string.profile_section_settings))
                    ProfileGroupCard {
                        ProfileV3Row(
                            icon = Icons.Filled.Settings,
                            tint = HomeV3.OnSurfaceVariant,
                            title = stringResource(R.string.profile_settings_row_title),
                            subtitle = stringResource(R.string.profile_settings_subtitle),
                            onClick = onOpenSettings,
                        )
                    }
                }

                if (!viewModel.isAnonymous) {
                    ProfileInfoCard(profile = viewModel.profile, onEdit = onEditProfile)
                    ProfileStatsCard(
                        posts = contentViewModel.posts?.size,
                        videos = contentViewModel.videoCount,
                        likes = contentViewModel.likes,
                        savedPosts = contentViewModel.saved?.size,
                        savedPlaces = contentViewModel.places?.size,
                        conversations = contentViewModel.conversationCount,
                    )
                    ProfileFollowingCard(following = contentViewModel.following, onOpenPerson = onOpenCreator, onSeeAll = onOpenSocial)
                    ProfileQrCard(onShowQr = onShowQr)
                }
            }
        }
    }

    comingSoonFeature?.let { feature ->
        TappyComingSoonSheet(
            featureName = feature,
            description = stringResource(R.string.coming_soon_description, feature),
            onDismiss = { comingSoonFeature = null },
        )
    }

    val userId = viewModel.userId
    if (showQrSheet && userId != null) {
        // The name as stored (web: `userInfo.full_name`), or the sheet's default.
        QrProfileSheet(userId = userId, name = viewModel.profile?.fullName, onDismiss = { showQrSheet = false })
    }
}

/**
 * "Tôi" + the blurb, with the official mascot on the right — the waving pose (`tappy_wave`,
 * the pose library's "default AI avatar / overview" pose, the one Home's hero also uses), the
 * closest official pose to "your profile"; no pose is drawn or generated for this screen.
 */
@Composable
private fun ProfileV3Header() {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f).padding(end = TappySpacing.lg)) {
            Text(
                text = stringResource(R.string.home_tab_profile),
                color = HomeV3.OnSurface,
                fontSize = 32.sp,
                lineHeight = 36.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.profile_v3_subtitle),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 14.sp,
                lineHeight = 19.sp,
                modifier = Modifier.padding(top = TappySpacing.sm),
            )
        }
        Image(
            painter = painterResource(R.drawable.tappy_wave),
            contentDescription = null,
            modifier = Modifier.size(116.dp).offset(x = 8.dp),
        )
    }
}

/**
 * The account state, as the surface's hero: a blue V3 gradient card. Signed in → the real
 * avatar, name and email; otherwise the placeholder identity and the sign-in blurb. The QR
 * button is the card's action, exactly as before (real sheet with a user id, "coming soon"
 * without one).
 */
@Composable
private fun ProfileHeroCard(profile: AccountProfile?, onShowQr: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(Brush.linearGradient(listOf(Color(0xFF1D5FE0), Color(0xFF0B1F52))))
            .border(1.dp, Color.White.copy(alpha = 0.12f), CardShape)
            .padding(TappySpacing.xl),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (profile != null) {
            // Signed-in user: real avatar (image or name-initials), matching the web header.
            TappyAvatar(
                name = profile.fullName,
                imageUrl = profile.avatarUrl,
                size = TappyAvatarSize.ProfileCard,
            )
        } else {
            // Not yet loaded / session missing — neutral person icon, no fabricated identity.
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color(0xFF3B82F6)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Person, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = profile?.fullName?.takeIf { it.isNotBlank() }
                    ?: stringResource(R.string.profile_header_title),
                color = Color.White,
                fontSize = 20.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = profile?.email?.takeIf { it.isNotBlank() }
                    ?: stringResource(R.string.profile_header_subtitle),
                color = Color.White.copy(alpha = 0.82f),
                fontSize = 13.sp,
                lineHeight = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
            // Conversation-count pill intentionally hidden until real data exists.
        }
        IconButton(
            onClick = onShowQr,
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.16f)),
        ) {
            Icon(
                imageVector = Icons.Filled.QrCode2,
                contentDescription = stringResource(R.string.profile_qr_button_content_description),
                tint = Color.White,
            )
        }
    }
}

/**
 * The guest's way in — a purple V3 card, the existing sign-in copy and action. Shared with the
 * V3 Settings screen (its own existing copy, `settings_sign_in_desc`): one card, two surfaces.
 */
@Composable
internal fun SignInCard(onClick: () -> Unit, subtitle: String = stringResource(R.string.profile_sign_in_desc)) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(Brush.linearGradient(listOf(Color(0xFF6B47E6), Color(0xFF2A1A66))))
            .border(1.dp, Color.White.copy(alpha = 0.12f), CardShape)
            .clickable(onClick = onClick)
            .padding(TappySpacing.xl),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.Login, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.settings_sign_in),
                color = Color.White,
                fontSize = 18.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = subtitle,
                color = Color.White.copy(alpha = 0.82f),
                fontSize = 13.sp,
                lineHeight = 17.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        ChevronDisc()
    }
}

/**
 * Privacy & security, as its own card: the shield, the copy, the way in — `ProfileRoute.Privacy`,
 * the privacy policy screen this graph has always registered.
 */
@Composable
private fun PrivacyCard(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(Brush.linearGradient(listOf(Color(0xFF12305E), Color(0xFF0C1735))))
            .border(1.dp, Color(0xFF3391FF).copy(alpha = 0.35f), CardShape)
            .clickable(onClick = onClick)
            .padding(TappySpacing.xl),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF2563EB)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Shield, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.profile_privacy_card_title),
                color = Color.White,
                fontSize = 17.sp,
                lineHeight = 21.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.profile_privacy_card_subtitle),
                color = Color.White.copy(alpha = 0.78f),
                fontSize = 13.sp,
                lineHeight = 17.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        ChevronDisc()
    }
}

/** The grouped container the Account rows and the Settings row sit in: rounded, bordered, flat.
 *  Shared with the V3 Settings screen's groups. */
@Composable
internal fun ProfileGroupCard(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, CardShape),
    ) { content() }
}

@Composable
private fun ProfileV3Row(item: ProfileMenuItem, onClick: () -> Unit) {
    ProfileV3Row(
        icon = item.icon,
        tint = item.tint,
        title = item.title(),
        subtitle = stringResource(item.subtitleRes),
        onClick = onClick,
    )
}

/** One row: a coloured icon tile, title, one-line blurb, chevron. The whole row is the target. */
@Composable
private fun ProfileV3Row(icon: ImageVector, tint: Color, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClickLabel = title, onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(TileShape)
                .background(tint),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = HomeV3.OnSurface,
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                color = HomeV3.OnSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 1.dp),
            )
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(22.dp))
    }
}

/** The chevron in a translucent disc — the hero cards' way in, as on the V3 tool cards. */
@Composable
private fun ChevronDisc() {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
    }
}

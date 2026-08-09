package com.tappyai.app.profile

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Cable
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.account.AccountProfile
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyComingSoonSheet
import com.tappyai.core.designsystem.component.TappyMenuRow
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

// Matching key kept separate from the localized display title (which changes with the app
// language) — see ChatCategory.kt for the same icon+labelRes enum shape this mirrors.
private enum class ProfileMenuItem(
    val icon: ImageVector,
    @StringRes val titleRes: Int,
    @StringRes val descRes: Int,
) {
    Account(Icons.Filled.Person, R.string.profile_menu_account, R.string.profile_menu_account_desc),
    ChatHistory(Icons.AutoMirrored.Filled.Message, R.string.profile_menu_chat_history, R.string.profile_menu_chat_history_desc),
    Bookings(Icons.Filled.CalendarMonth, R.string.profile_menu_bookings, R.string.profile_menu_bookings_desc),
    Preferences(Icons.Filled.FavoriteBorder, R.string.profile_menu_preferences, R.string.profile_menu_preferences_desc),
    Saved(Icons.Filled.BookmarkBorder, R.string.profile_menu_saved, R.string.profile_menu_saved_desc),
    PriceTracking(Icons.AutoMirrored.Filled.TrendingDown, R.string.profile_menu_price_tracking, R.string.profile_menu_price_tracking_desc),
    TappyKnows(Icons.Filled.Psychology, R.string.profile_menu_tappy_knows, R.string.profile_menu_tappy_knows_desc),
    AppConnections(Icons.Filled.Cable, R.string.profile_menu_app_connections, R.string.profile_menu_app_connections_desc),
    MyProfile(Icons.Filled.AccountCircle, R.string.profile_menu_my_profile, R.string.profile_menu_my_profile_desc),
    MyReviews(Icons.Filled.StarBorder, R.string.profile_menu_my_reviews, R.string.profile_menu_my_reviews_desc),
    GroupDining(Icons.Filled.Group, R.string.profile_menu_group_dining, R.string.profile_menu_group_dining_desc),
    UpgradeToPro(Icons.Filled.WorkspacePremium, R.string.profile_menu_upgrade_to_pro, R.string.profile_menu_upgrade_to_pro_desc),
}

@Composable
private fun ProfileMenuItem.title(): String = stringResource(titleRes)

@Composable
private fun ProfileMenuItem.description(): String = stringResource(descRes)

// Web parity 2026-07-11: the Pro upsell is HIDDEN app-wide during the free test phase
// (mirrors web ProfileView's `SHOW_PRO_UPGRADE = false` — no legal entity for payments yet).
// Flip to true together with the web flag when Pro launches; MembershipScreen stays intact.
private const val SHOW_PRO_UPGRADE = false

// Web parity 2026-07-17 (owner product decision): App Connections entry point HIDDEN app-wide
// (mirrors web ProfileView's `SHOW_APP_CONNECTIONS = false` + /api/config `showAppConnections`).
// Only the menu entry point is gated off — AppConnectionsScreen, its route, and the backend stay
// intact. Flip to true together with the web flag to re-enable.
private const val SHOW_APP_CONNECTIONS = false

// Order + labels + icons mirror the web `ProfileView` "Account" section exactly.
private val ACCOUNT_ITEMS = buildList {
    add(ProfileMenuItem.Account)
    add(ProfileMenuItem.ChatHistory)
    add(ProfileMenuItem.Bookings)
    add(ProfileMenuItem.Preferences)
    add(ProfileMenuItem.Saved)
    add(ProfileMenuItem.PriceTracking)
    add(ProfileMenuItem.TappyKnows)
    if (SHOW_APP_CONNECTIONS) add(ProfileMenuItem.AppConnections)
    add(ProfileMenuItem.MyProfile)
    add(ProfileMenuItem.MyReviews)
    add(ProfileMenuItem.GroupDining)
    if (SHOW_PRO_UPGRADE) add(ProfileMenuItem.UpgradeToPro)
}

/**
 * Profile landing — matches the web `ProfileView` section order: profile header card → "Account"
 * menu section (10 rows; +1 "Upgrade to Pro" row gated OFF by [SHOW_PRO_UPGRADE], web parity) →
 * "Settings" entry. The header shows the real signed-in user's name/email/avatar (`GET
 * /api/profile`, same data + endpoint [com.tappyai.app.account.AccountViewModel] already uses for
 * the Account screen) via [ProfileViewModel.profile] — degrading to the neutral "Sign in to
 * personalize" placeholder only while loading or on a load failure, never a fabricated identity.
 * The conversation-count pill is hidden entirely (no data source for it yet). "Settings" navigates
 * for real; the QR button opens the real [QrProfileSheet] (the shell only reaches this screen when
 * authenticated, so the signed-in user's id is available); every other row still opens a
 * [TappyComingSoonSheet].
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
    onOpenMyProfile: (String) -> Unit,
    onOpenGroupDining: () -> Unit,
    onOpenPriceTracking: () -> Unit,
    onOpenAccount: () -> Unit,
    onOpenAppConnections: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    var comingSoonFeature by remember { mutableStateOf<String?>(null) }
    var showQrSheet by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            val qrFeatureName = stringResource(R.string.profile_qr_feature_name)
            ProfileHeaderCard(
                profile = viewModel.profile,
                onShowQr = {
                    if (viewModel.userId != null) showQrSheet = true else comingSoonFeature = qrFeatureName
                },
            )

            // Guests get a sign-in affordance right under the header — the most discoverable
            // point on the surface they already visit to see "who am I". Settings carries the
            // same action, but two taps deeper. Authenticated users never see this card, so
            // their Profile is byte-identical to before.
            if (viewModel.isAnonymous) {
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    TappyMenuRow(
                        icon = Icons.AutoMirrored.Filled.Login,
                        title = stringResource(R.string.settings_sign_in),
                        subtitle = stringResource(R.string.profile_sign_in_desc),
                        onClick = onSignIn,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                MenuSectionHeader(stringResource(R.string.profile_section_account))
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    ACCOUNT_ITEMS.forEachIndexed { index, item ->
                        if (index > 0) HorizontalDivider()
                        TappyMenuRow(
                            icon = item.icon,
                            title = item.title(),
                            // Web parity: every row shows a description subtitle (ProfileView
                            // MenuItem `description=`), not just the label.
                            subtitle = item.description(),
                            // Every item currently drills into a real screen; matched by the
                            // stable enum key (not the localized title) so this keeps working
                            // once the app language changes.
                            onClick = when (item) {
                                ProfileMenuItem.UpgradeToPro -> onOpenMembership
                                ProfileMenuItem.TappyKnows -> onOpenTappyKnows
                                ProfileMenuItem.ChatHistory -> onOpenChatHistory
                                ProfileMenuItem.Saved -> onOpenSaved
                                ProfileMenuItem.Bookings -> onOpenBookings
                                ProfileMenuItem.Preferences -> onOpenPreferences
                                ProfileMenuItem.MyReviews -> onOpenMyReviews
                                // Opens the viewing self-profile (ReviewProfileScreen isSelf) via
                                // the existing AuthorProfile route — id from the signed-in user.
                                ProfileMenuItem.MyProfile -> ({ val id = viewModel.userId; if (id != null) onOpenMyProfile(id) })
                                ProfileMenuItem.PriceTracking -> onOpenPriceTracking
                                ProfileMenuItem.GroupDining -> onOpenGroupDining
                                ProfileMenuItem.Account -> onOpenAccount
                                ProfileMenuItem.AppConnections -> onOpenAppConnections
                            },
                        )
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                MenuSectionHeader(stringResource(R.string.profile_section_settings))
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    TappyMenuRow(
                        icon = Icons.Filled.Settings,
                        title = stringResource(R.string.profile_settings_row_title),
                        subtitle = stringResource(R.string.profile_settings_subtitle),
                        onClick = onOpenSettings,
                    )
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
        QrProfileSheet(userId = userId, name = null, onDismiss = { showQrSheet = false })
    }
}

@Composable
private fun ProfileHeaderCard(profile: AccountProfile?, onShowQr: () -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (profile != null) {
                // Certification-sprint fix: real identity, same data already fetched for the
                // Account screen (GET /api/profile) — was previously never wired to this header.
                TappyAvatar(
                    name = profile.fullName,
                    imageUrl = profile.avatarUrl,
                    size = TappyAvatarSize.ProfileCard,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = profile.fullName,
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    // Web parity: the email truncates to one line (ProfileView `truncate`) rather
                    // than wrapping.
                    Text(
                        text = profile.email,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            } else {
                // Loading, or the load failed — never fabricate an identity (UI Consistency
                // Baseline v1), same neutral placeholder this card has always shown.
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(TappyShapes.card)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(32.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = stringResource(R.string.profile_header_title), style = MaterialTheme.typography.titleLarge)
                    Text(
                        text = stringResource(R.string.profile_header_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onShowQr) {
                Icon(
                    imageVector = Icons.Filled.QrCode2,
                    contentDescription = stringResource(R.string.profile_qr_button_content_description),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

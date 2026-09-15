package com.tappyai.app.reviews.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.explore.ExploreV3
import com.tappyai.app.explore.compactCount
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappySpacing

private val SelfTextPrimary = Color(0xFFFFFFFF)
private val SelfTextSecondary = Color(0xFF98A2C4)
private val SelfDivider = Color(0xFF26314F)
private val SelfTileBg = Color(0xFF0F1730)
private val SelfPremium = Color(0xFFFBBF24)

/**
 * The ONE creator-profile UI (V3, mockup 05_17_48). [SelfProfileScreen] draws the signed-in user's
 * own profile; [ReviewProfileScreen] draws any other creator's — reached from a feed avatar, a
 * search result or a notification — through the same [CreatorProfileContent], so the two can only
 * differ in data and in the primary action ([CreatorPrimaryAction]: "Sửa hồ sơ" for self, Theo dõi
 * for others). Before 2026-09-13 the other-creator profile was a separate, older layout
 * (`ReviewProfileSection.kt`, now deleted).
 *
 * The signed-in user's own profile inside Explore — the V3 self profile (mockup 05_17_48) over
 * the data the screen already had: identity and follow counters from `GET /api/users/{me}`, the
 * user's own posts from `GET /api/reviews/mine` (hidden ones included), and the membership row
 * for the Premium badge. Explore's night chrome throughout, like the feed it is reached from.
 *
 * Row for row against the mockup: back + the brand lockup + search + bell; avatar beside name,
 * handle and the Premium badge; the stat row; the bio; the action row — "Sửa hồ sơ" (→ this
 * profile's own Edit Profile screen, `ReviewsRoute.EditProfile`), a link button that shares the
 * web profile URL, and a compose button for a new post; the "Bài viết" | "Đã lưu" segments; then
 * the 3-column clip grid, each tile with its play badge and view count. "Đã lưu" is the caller's
 * saved reviews from `GET /api/reviews/saved` (self-only by construction; a tile pages the saved
 * list, `ProfileClips(saved = true)`) — drawn ONLY on the self profile, and only where a host
 * wires [onSavedReviewClick]; another creator's profile never shows anyone's saves.
 *
 * What is NOT drawn, and why (no invented data, no dead buttons):
 *  - city — no field anywhere; the bio IS drawn, from `GET /api/profile`;
 *  - the avatar's camera badge and the header's gear — the avatar is changed on the Edit Profile
 *    screen that "Sửa hồ sơ" opens (`ReviewsRoute.EditProfile`), and Explore has no settings;
 *  - the "Đã thích" segment and the bookmark button — the web reads likes straight from Supabase
 *    and Android has no API for them (owner decision, unchanged; "Đã lưu" has one, see above);
 *  - the bell's unread dot — no unread state exists in the app.
 */
@Composable
internal fun SelfProfileScreen(
    onReviewClick: (String) -> Unit,
    onEditProfile: () -> Unit,
    onBack: () -> Unit,
    /**
     * A "Đã lưu" tile tapped: page the saved list on that clip (`ProfileClips(saved = true)`).
     * Null hides the segment altogether (a host with no route for the saved pager, e.g. the Me
     * tab's nested profile) — the grid is never drawn without a way to open its rows.
     */
    onSavedReviewClick: ((String) -> Unit)? = null,
    onSearch: () -> Unit = {},
    onNotifications: () -> Unit = {},
    onCompose: () -> Unit = {},
    /** True when Edit Profile was just left — the nav host's result flag; re-read the server. */
    reloadRequested: Boolean = false,
    onReloadHandled: () -> Unit = {},
    viewModel: SelfProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    // Reflow the grid after a clip is deleted/hidden elsewhere and the user returns — mirrors web
    // ProfileTab refetching. The ViewModel's init already covers the first load.
    ReloadOnResume { viewModel.load() }
    // Back from Edit Profile: the saved name/bio/avatar must be what the screen shows.
    LaunchedEffect(reloadRequested) {
        if (reloadRequested) {
            onReloadHandled()
            viewModel.load()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ExploreV3.Background),
    ) {
        CreatorProfileTopBar(onBack = onBack, onSearch = onSearch, onNotifications = onNotifications)

        when {
            uiState.isLoading && uiState.profile == null ->
                TappyLoadingIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            uiState.error != null && uiState.profile == null ->
                TappyErrorState(
                    title = stringResource(R.string.reviews_profile_error_title),
                    message = uiState.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = viewModel::load,
                )
            else -> {
                val facts = selfProfileFacts(uiState.profile, uiState.posts, uiState.isPro, uiState.bio)
                CreatorProfileContent(
                    facts = facts,
                    posts = uiState.posts,
                    primaryAction = CreatorPrimaryAction.Edit(onEdit = onEditProfile),
                    showCompose = true,
                    onShareLink = { uiState.userId?.let { id -> shareProfileLink(context, id) } },
                    onCompose = onCompose,
                    onReviewClick = onReviewClick,
                    saved = onSavedReviewClick?.let { open ->
                        CreatorSavedSection(rows = uiState.saved, onReviewClick = open, onRetry = viewModel::load)
                    },
                    emptyState = {
                        TappyEmptyState(
                            icon = Icons.Filled.RateReview,
                            title = stringResource(R.string.reviews_self_empty_title),
                            message = stringResource(R.string.reviews_self_empty_message),
                            actionText = stringResource(R.string.reviews_feed_post_now),
                            onAction = onCompose,
                            titleColor = SelfTextPrimary,
                            contentColor = SelfTextSecondary,
                        )
                    },
                )
            }
        }
    }
}

/**
 * Another creator's profile — `ReviewsRoute.AuthorProfile`, reached from a feed avatar/handle, a
 * search result or a notification. The SAME V3 layout as [SelfProfileScreen] through
 * [CreatorProfileContent]; only the data and the primary action differ:
 *  - identity + follow counters from `GET /api/users/{id}` and their posts from
 *    `GET /api/reviews/feed?userId=` ([ReviewProfileViewModel], unchanged — follow included);
 *  - the primary action is Theo dõi / Đang theo dõi (optimistic, reverted on failure, as before);
 *  - no compose button, no bio, no Premium — `/api/users/{id}` carries neither a bio nor a
 *    membership, so none is drawn rather than invented;
 *  - `postCount` is the server's `review_count`; likes are summed over the loaded rows, as the
 *    previous layout did ([creatorProfileFacts]).
 *
 * 🔑 When the server says the profile is the viewer's own (`is_self`), this IS the self profile
 * and draws exactly [SelfProfileScreen] — bio, Premium, "Sửa hồ sơ" → `ReviewsRoute.EditProfile`,
 * and the reload after editing — never a Follow button for oneself. The server's flag decides,
 * not the route or a client-side id comparison.
 */
@Composable
internal fun ReviewProfileScreen(
    userId: String,
    onReviewClick: (String) -> Unit,
    onBack: () -> Unit,
    /**
     * A tile tapped while the server says this profile is the viewer's own. The self profile's
     * clips come from `/api/reviews/mine` (`ProfileClips(userId = null)`), not from the public
     * `?userId=` feed [onReviewClick] would page — so every self entry point pages the same rows.
     * Null (the Me tab's nested profile) keeps [onReviewClick] for both.
     */
    onSelfReviewClick: ((String) -> Unit)? = null,
    /** Forwarded to [SelfProfileScreen] when the server says `is_self`; never used for another creator. */
    onSavedReviewClick: ((String) -> Unit)? = null,
    onSearch: () -> Unit = {},
    onNotifications: () -> Unit = {},
    onEditProfile: () -> Unit = {},
    onCompose: () -> Unit = {},
    reloadRequested: Boolean = false,
    onReloadHandled: () -> Unit = {},
    viewModel: ReviewProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(userId) { viewModel.load(userId) }
    // Reflow the clip grid after a clip is deleted/hidden elsewhere (e.g. the pager) and the user
    // returns here — mirrors web ProfileTab refetching and MyReviews' resume-reload.
    ReloadOnResume { viewModel.retry() }
    val context = LocalContext.current
    val profile = uiState.profile

    if (profile?.isSelf == true) {
        SelfProfileScreen(
            onReviewClick = onSelfReviewClick ?: onReviewClick,
            onSavedReviewClick = onSavedReviewClick,
            onEditProfile = onEditProfile,
            onBack = onBack,
            onSearch = onSearch,
            onNotifications = onNotifications,
            onCompose = onCompose,
            reloadRequested = reloadRequested,
            onReloadHandled = onReloadHandled,
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ExploreV3.Background),
    ) {
        CreatorProfileTopBar(onBack = onBack, onSearch = onSearch, onNotifications = onNotifications)

        when {
            uiState.isLoading && profile == null ->
                TappyLoadingIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            uiState.error != null && profile == null ->
                TappyErrorState(
                    title = stringResource(R.string.reviews_profile_error_title),
                    message = uiState.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = viewModel::retry,
                )
            profile != null -> {
                CreatorProfileContent(
                    facts = creatorProfileFacts(profile, uiState.reviews),
                    posts = uiState.reviews,
                    primaryAction = CreatorPrimaryAction.Follow(
                        isFollowing = profile.isFollowing,
                        isToggling = uiState.isTogglingFollow,
                        onToggle = viewModel::toggleFollow,
                    ),
                    showCompose = false,
                    onShareLink = { shareProfileLink(context, userId) },
                    onCompose = {},
                    onReviewClick = onReviewClick,
                    emptyState = {
                        TappyEmptyState(
                            icon = Icons.Filled.RateReview,
                            title = stringResource(R.string.reviews_profile_empty_title),
                            message = stringResource(R.string.reviews_profile_empty_message),
                            titleColor = SelfTextPrimary,
                            contentColor = SelfTextSecondary,
                        )
                    },
                )
            }
        }
    }
}

/** The one primary action of the profile's action row: the owner edits, everyone else follows. */
internal sealed interface CreatorPrimaryAction {
    data class Edit(val onEdit: () -> Unit) : CreatorPrimaryAction
    data class Follow(val isFollowing: Boolean, val isToggling: Boolean, val onToggle: () -> Unit) : CreatorPrimaryAction
}

/** The profile's grid segments. [Saved] exists only on the self profile (see [CreatorSavedSection]). */
internal enum class CreatorProfileTab { Posts, Saved }

/**
 * The self profile's "Đã lưu" segment: [rows] from `GET /api/reviews/saved` (null while unknown
 * or when that call failed → an error state with [onRetry]), a tile opening [onReviewClick].
 * Absent (null) on another creator's profile — their saves are private and never requested.
 */
internal data class CreatorSavedSection(
    val rows: List<Review>?,
    val onReviewClick: (String) -> Unit,
    val onRetry: () -> Unit,
)

/**
 * The profile body both screens draw: the header ([CreatorProfileHeader]) spanning the grid,
 * then the 3-column clip grid of [PostGridTile]s, or [emptyState] when there are no posts.
 * Identical geometry for self and other — the approved Self Profile V3 appearance is the spec.
 * With a [saved] section the header's segments switch the SAME grid between the posts and the
 * saved rows; the selection survives rotation and the pager round-trip.
 */
@Composable
private fun CreatorProfileContent(
    facts: SelfProfileFacts,
    posts: List<Review>,
    primaryAction: CreatorPrimaryAction,
    showCompose: Boolean,
    onShareLink: () -> Unit,
    onCompose: () -> Unit,
    onReviewClick: (String) -> Unit,
    emptyState: @Composable () -> Unit,
    saved: CreatorSavedSection? = null,
) {
    var selectedTab by rememberSaveable { mutableStateOf(CreatorProfileTab.Posts) }
    val tab = if (saved == null) CreatorProfileTab.Posts else selectedTab
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = TappySpacing.xl, end = TappySpacing.xl, bottom = TappySpacing.xxl),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            CreatorProfileHeader(
                facts = facts,
                primaryAction = primaryAction,
                showCompose = showCompose,
                onShareLink = onShareLink,
                onCompose = onCompose,
                selectedTab = tab,
                showSaved = saved != null,
                onTabSelected = { selectedTab = it },
            )
        }
        when (tab) {
            CreatorProfileTab.Posts -> {
                if (posts.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) { emptyState() }
                }
                items(items = posts, key = { it.id }) { review ->
                    PostGridTile(review = review, onClick = { onReviewClick(review.id) })
                }
            }
            CreatorProfileTab.Saved -> {
                val rows = saved?.rows
                when {
                    rows == null -> item(span = { GridItemSpan(maxLineSpan) }) {
                        TappyErrorState(
                            title = stringResource(R.string.reviews_profile_error_title),
                            message = stringResource(R.string.reviews_error_generic),
                            retryText = stringResource(R.string.common_try_again),
                            onRetry = saved?.onRetry ?: {},
                        )
                    }
                    rows.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        TappyEmptyState(
                            icon = Icons.Filled.BookmarkBorder,
                            title = stringResource(R.string.reviews_self_saved_empty_title),
                            message = stringResource(R.string.reviews_self_saved_empty_message),
                            titleColor = SelfTextPrimary,
                            contentColor = SelfTextSecondary,
                        )
                    }
                    else -> items(items = rows, key = { "saved:" + it.id }) { review ->
                        PostGridTile(review = review, onClick = { saved.onReviewClick(review.id) })
                    }
                }
            }
        }
    }
}

/** Back + the lockup + search + bell: the feed's V3 header with a back arrow, on a nested screen. */
@Composable
private fun CreatorProfileTopBar(onBack: () -> Unit, onSearch: () -> Unit, onNotifications: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = TappySpacing.xs, end = TappySpacing.xl, top = TappySpacing.md, bottom = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = SelfTextPrimary)
        }
        Image(
            painter = painterResource(R.drawable.tappyai_logo),
            contentDescription = stringResource(R.string.home_v3_brand_tappy) +
                stringResource(R.string.home_v3_brand_ai),
            contentScale = ContentScale.Fit,
            modifier = Modifier.height(44.dp),
        )
        Spacer(modifier = Modifier.weight(1f))
        SelfHeaderAction(onClick = onSearch, contentDescription = stringResource(R.string.reviews_search_label)) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = ExploreV3.OnSurface, modifier = Modifier.size(21.dp))
        }
        SelfHeaderAction(onClick = onNotifications, contentDescription = stringResource(R.string.reviews_notifications_label)) {
            Icon(Icons.Filled.NotificationsNone, contentDescription = null, tint = ExploreV3.OnSurface, modifier = Modifier.size(21.dp))
        }
    }
}

@Composable
private fun SelfHeaderAction(onClick: () -> Unit, contentDescription: String, icon: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(ExploreV3.Surface)
            .border(1.dp, ExploreV3.Outline, CircleShape)
            .clickable(onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/**
 * The identity block, stat row, bio, action row and "Bài viết" segment — shared by self and other.
 * [primaryAction] is the wide button; the compose button is drawn only for [showCompose] (self);
 * the bio and the Premium badge are drawn only when [facts] carry them.
 */
@Composable
private fun CreatorProfileHeader(
    facts: SelfProfileFacts,
    primaryAction: CreatorPrimaryAction,
    showCompose: Boolean,
    onShareLink: () -> Unit,
    onCompose: () -> Unit,
    selectedTab: CreatorProfileTab = CreatorProfileTab.Posts,
    showSaved: Boolean = false,
    onTabSelected: (CreatorProfileTab) -> Unit = {},
) {
    val displayName = facts.displayName ?: stringResource(R.string.reviews_anonymous_name)

    Column(modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.md)) {
        // Identity: the avatar beside the name, handle and Premium badge (mockup 05_17_48).
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(ExploreV3.Purple, ExploreV3.Outline)))
                    .padding(2.dp),
                contentAlignment = Alignment.Center,
            ) {
                TappyAvatar(
                    name = displayName,
                    imageUrl = facts.avatarUrl,
                    size = TappyAvatarSize.ProfileHero,
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                )
            }
            Spacer(modifier = Modifier.width(TappySpacing.xl))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = displayName,
                    color = SelfTextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = facts.handle,
                    color = SelfTextSecondary,
                    fontSize = 15.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
                // Only for a real `is_pro: true` from the membership row — never assumed.
                if (facts.isPro == true) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                        modifier = Modifier.padding(top = TappySpacing.md),
                    ) {
                        Icon(Icons.Filled.WorkspacePremium, contentDescription = null, tint = SelfPremium, modifier = Modifier.size(20.dp))
                        Text(
                            text = stringResource(R.string.reviews_self_premium),
                            color = SelfPremium,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }

        // The stat row. Four, not the mockup's three: "Bài viết" is the count the screen always
        // had and it is real, so it stays beside the mockup's Following / Followers / Likes.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = TappySpacing.xxl)
                .height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Stat(value = compactCount(facts.followingCount), label = stringResource(R.string.reviews_self_stat_following), modifier = Modifier.weight(1f))
            StatDivider()
            Stat(value = compactCount(facts.followerCount), label = stringResource(R.string.reviews_self_stat_followers), modifier = Modifier.weight(1f))
            StatDivider()
            Stat(value = compactCount(facts.postCount), label = stringResource(R.string.reviews_profile_stat_posts), modifier = Modifier.weight(1f))
            StatDivider()
            Stat(value = compactCount(facts.totalLikes), label = stringResource(R.string.reviews_profile_stat_likes), modifier = Modifier.weight(1f))
        }

        // The bio, when the user wrote one (mockup: the line under the stats).
        facts.bio?.let { bio ->
            Text(
                text = bio,
                color = SelfTextPrimary,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = TappySpacing.xl),
            )
        }

        // The action row: the wide primary and the square icon actions (mockup 05_17_48).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = TappySpacing.xxl),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            when (primaryAction) {
                is CreatorPrimaryAction.Edit -> PrimaryAction(
                    icon = Icons.Filled.PersonOutline,
                    text = stringResource(R.string.reviews_self_edit_profile),
                    filled = false,
                    enabled = true,
                    onClick = primaryAction.onEdit,
                    modifier = Modifier.weight(1f),
                )
                // Theo dõi is the filled (purple) call to action; Đang theo dõi the quiet outline —
                // the same distinction the previous layout drew. Disabled while the toggle is in flight.
                is CreatorPrimaryAction.Follow -> PrimaryAction(
                    icon = if (primaryAction.isFollowing) Icons.Filled.Check else Icons.Filled.PersonAdd,
                    text = stringResource(if (primaryAction.isFollowing) R.string.reviews_profile_following else R.string.reviews_profile_follow),
                    filled = !primaryAction.isFollowing,
                    enabled = !primaryAction.isToggling,
                    onClick = primaryAction.onToggle,
                    modifier = Modifier.weight(1f),
                )
            }
            SquareAction(icon = Icons.Filled.Link, contentDescription = stringResource(R.string.reviews_self_share_link), onClick = onShareLink)
            if (showCompose) {
                SquareAction(icon = Icons.Filled.EditNote, contentDescription = stringResource(R.string.reviews_self_new_post), onClick = onCompose)
            }
        }

        // The segments: "Bài viết", and on the self profile "Đã lưu" (`/api/reviews/saved`). The
        // mockup's "Đã thích" has no Android API (see the class doc) and is not drawn.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = TappySpacing.xxxl, bottom = TappySpacing.lg),
            horizontalArrangement = Arrangement.Center,
        ) {
            ProfileSegment(
                text = stringResource(R.string.reviews_self_tab_posts),
                selected = selectedTab == CreatorProfileTab.Posts,
                onClick = { onTabSelected(CreatorProfileTab.Posts) },
            )
            if (showSaved) {
                ProfileSegment(
                    text = stringResource(R.string.reviews_self_tab_saved),
                    selected = selectedTab == CreatorProfileTab.Saved,
                    onClick = { onTabSelected(CreatorProfileTab.Saved) },
                )
            }
        }
    }
}

/** One grid segment: accent text and underline when selected, muted text otherwise. */
@Composable
private fun ProfileSegment(text: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(IntrinsicSize.Max)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Tab,
                onClick = onClick,
            ),
    ) {
        Text(
            text = text,
            color = if (selected) ExploreV3.Purple else SelfTextSecondary,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = TappySpacing.xxl),
        )
        Box(
            modifier = Modifier
                .padding(top = TappySpacing.md)
                .fillMaxWidth()
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(if (selected) ExploreV3.Purple else Color.Transparent),
        )
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        Text(text = value, color = SelfTextPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(text = label, color = SelfTextSecondary, fontSize = 13.sp, maxLines = 1, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
private fun StatDivider() {
    Box(modifier = Modifier.width(1.dp).height(32.dp).background(SelfDivider))
}

/** The wide primary button of the action row — outline (as "Sửa hồ sơ" always was) or filled purple. */
@Composable
private fun PrimaryAction(
    icon: ImageVector,
    text: String,
    filled: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (filled) ExploreV3.Purple else ExploreV3.Surface)
            .border(1.dp, if (filled) ExploreV3.Purple else ExploreV3.Outline, RoundedCornerShape(14.dp))
            .clickable(enabled = enabled, onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = SelfTextPrimary, modifier = Modifier.size(20.dp))
        Text(
            text = text,
            color = SelfTextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun SquareAction(icon: ImageVector, contentDescription: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(ExploreV3.Surface)
            .border(1.dp, ExploreV3.Outline, RoundedCornerShape(14.dp))
            .clickable(onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = SelfTextPrimary, modifier = Modifier.size(22.dp))
    }
}

/**
 * One clip of the grid: the thumbnail (or first photo) on a 9:16 rounded tile, a play badge with
 * the view count in the bottom-left corner (mockup 05_17_48). The count is drawn only when the
 * row carries one; a text-only post shows its opening words instead of a photo, and a hidden post
 * keeps its veil so the author can tell.
 */
@Composable
private fun PostGridTile(review: Review, onClick: () -> Unit) {
    val photoUrl = review.thumbnail ?: review.photos?.firstOrNull()
    Box(
        modifier = Modifier
            .aspectRatio(9f / 16f)
            .clip(RoundedCornerShape(12.dp))
            .background(SelfTileBg)
            .clickable(onClick = onClick),
    ) {
        if (photoUrl != null) {
            TappyImage(url = photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        } else if (review.contentType != ReviewContentType.Video) {
            Text(
                text = review.body,
                color = SelfTextSecondary,
                fontSize = 11.sp,
                maxLines = 5,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(TappySpacing.sm),
            )
        }
        // The bottom scrim keeps the badge legible on a bright frame.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(56.dp)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x99000000)))),
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = TappySpacing.md, bottom = TappySpacing.md),
        ) {
            if (review.contentType == ReviewContentType.Video) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            review.viewCount?.let { views ->
                Text(
                    text = compactCount(views),
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 2.dp),
                )
            }
        }
        if (review.isHidden) {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.VisibilityOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/**
 * The link button: shares the user's web profile URL (`/users/{id}`, the same route the feed's
 * author links and notifications resolve) through the system share sheet — no in-app UI, no
 * backend call.
 */
private fun shareProfileLink(context: Context, userId: String) {
    val url = BuildConfig.WEB_APP_URL.trimEnd('/') + "/users/" + userId
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, context.getString(R.string.reviews_self_share_text, url))
    }
    context.startActivity(Intent.createChooser(sendIntent, context.getString(R.string.reviews_self_share_link)))
}

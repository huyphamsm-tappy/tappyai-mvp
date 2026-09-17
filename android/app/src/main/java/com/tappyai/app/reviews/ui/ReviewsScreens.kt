package com.tappyai.app.reviews.ui

import android.widget.Toast
import com.tappyai.app.music.MusicPickerSheet
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.lerp
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.explore.ExploreV3
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewFeedType
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import androidx.compose.runtime.saveable.listSaver
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.launch

private val ScreenBackground = Color(0xFF000000)
private val ScreenTextPrimary = Color(0xFFFFFFFF)
private val ScreenIconColor = Color(0xFFFFFFFF)

@Composable
internal fun ReviewsFeedScreen(
    onAuthorClick: (String) -> Unit,
    onCompose: () -> Unit,
    onNotifications: () -> Unit,
    onSearch: () -> Unit,
    /** Opens the signed-in user's own profile (`ReviewsRoute.SelfProfile`). */
    onProfile: () -> Unit = {},
    onBack: (() -> Unit)? = null,
    /** Set when another screen asks the feed to switch tab — web parity: the Inbox digest banner
     *  hands off to the Following feed. Applied once, then cleared by the nav host. */
    requestedFeedType: ReviewFeedType? = null,
    /** Opens the compact SoundSheet for a clip's attached track (web: the feed music disc). */
    onMusicDiscClick: (String) -> Unit = {},
    /**
     * ✦ Hỏi Tappy: opens Chat pre-filled with the question about the given clip — the native
     * `/chat?q=` bridge the Deals and Home surfaces already use. Null hides the rail action.
     */
    onAskTappy: ((Review) -> Unit)? = null,
    viewModel: ReviewsFeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val reviews = uiState.reviews
    val pagerState = rememberPagerState(pageCount = { reviews.size })

    LaunchedEffect(requestedFeedType) {
        requestedFeedType?.let { viewModel.onFeedTypeChange(it) }
    }

    // Immersive Explore (reference "TappyAI — Immersive AI Discovery", 2026-09-13): the video is
    // the canvas, edge to edge under the status bar and under the floating dock; the brand
    // header and the discovery segment FLOAT over it at the top. The pager fills the whole box;
    // each card keeps ExploreV3.DockClearance free at the bottom for the dock.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ExploreV3.Background),
    ) {
        when {
            uiState.isInitialLoading && reviews.isEmpty() -> {
                TappyLoadingIndicator(modifier = Modifier.align(Alignment.Center))
            }
            uiState.error != null && reviews.isEmpty() -> {
                TappyErrorState(
                    title = stringResource(R.string.reviews_feed_error_title),
                    message = uiState.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = { viewModel.refresh() },
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            reviews.isEmpty() -> {
                FeedEmptyState(
                    feedType = uiState.feedType,
                    onSeeForYou = { viewModel.onFeedTypeChange(ReviewFeedType.ForYou) },
                    onCompose = onCompose,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            else -> {
                // The pager, card, audio default, comment sheet and analytics — shared with the
                // profile clip pager (ReviewClipPager.kt); moved there unchanged.
                ReviewClipPager(
                    reviews = reviews,
                    pagerState = pagerState,
                    currentUserId = uiState.currentUserId,
                    viewModel = viewModel,
                    onAuthorClick = onAuthorClick,
                    onMusicDiscClick = onMusicDiscClick,
                    onAskTappy = onAskTappy,
                    bottomClearance = ExploreV3.DockClearance,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        // The floating chrome, drawn last so it sits over the clip.
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .statusBarsPadding(),
        ) {
            FeedTopBar(
                onBack = onBack,
                onCompose = onCompose,
                onSearch = onSearch,
                onNotifications = onNotifications,
                onProfile = onProfile,
            )
            FeedTabs(
                selected = uiState.feedType,
                onSelect = viewModel::onFeedTypeChange,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

/**
 * A profile's clips as a full-height vertical pager — web parity `ClipViewer({ posts, startIndex })`
 * (reviews/ProfileTab.tsx), reached from the Self Profile and Author Profile grids
 * (`ReviewsRoute.ProfileClips`). Before this a grid tile opened `ReviewsRoute.Detail`, a single
 * clip with no way to the next one but Back (UAT 2026-09-13).
 *
 * The rows are the profile's own — [ReviewsFeedViewModel] reads [ReviewsFeedSource.Profile] from
 * the route and calls the grid's endpoint (`getMine()` / `getFeed(userId=…)`), never the discovery
 * feed — and the pager is [ReviewClipPager], the feed's own block, so card, player, sound, rail,
 * comment sheet and analytics are exactly the feed's. The pager is composed only once the list
 * has loaded, with `initialPage` = the tapped clip's row (or 0 when that clip is gone), so the
 * tapped clip is the first thing on screen and no watch is recorded for a clip never shown.
 */
@Composable
internal fun ProfileClipsScreen(
    startReviewId: String,
    onAuthorClick: (String) -> Unit,
    onMusicDiscClick: (String) -> Unit,
    onBack: () -> Unit,
    onAskTappy: ((Review) -> Unit)? = null,
    viewModel: ReviewsFeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val reviews = uiState.reviews

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ScreenBackground),
    ) {
        ScreenHeader(
            title = stringResource(
                if (viewModel.source == ReviewsFeedSource.Saved) R.string.reviews_self_tab_saved else R.string.reviews_profile_stat_posts,
            ),
            onBack = onBack,
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(ScreenBackground),
        ) {
            when {
                uiState.isInitialLoading && reviews.isEmpty() -> {
                    TappyLoadingIndicator(modifier = Modifier.align(Alignment.Center))
                }
                uiState.error != null && reviews.isEmpty() -> {
                    TappyErrorState(
                        title = stringResource(R.string.reviews_feed_error_title),
                        message = uiState.error,
                        retryText = stringResource(R.string.common_try_again),
                        onRetry = { viewModel.refresh() },
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                reviews.isEmpty() -> {
                    TappyEmptyState(
                        icon = Icons.Filled.RateReview,
                        title = stringResource(R.string.reviews_detail_unavailable_title),
                        message = stringResource(R.string.reviews_detail_unavailable_message),
                    )
                }
                else -> {
                    // The list is here: start on the tapped clip. `rememberPagerState` is saveable,
                    // so a later change of `initialPage` (never expected) would not move it.
                    val pagerState = rememberPagerState(
                        initialPage = initialPageFor(reviews, startReviewId),
                        pageCount = { reviews.size },
                    )
                    ReviewClipPager(
                        reviews = reviews,
                        pagerState = pagerState,
                        currentUserId = uiState.currentUserId,
                        viewModel = viewModel,
                        onAuthorClick = onAuthorClick,
                        onMusicDiscClick = onMusicDiscClick,
                        onAskTappy = onAskTappy,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }
}

/**
 * The discovery segment of the reference design: a centered floating pill — translucent
 * near-black, thin light border — holding exactly the three real feeds, the selected one drawn
 * as the indigo pill with white text. Same [ReviewFeedType]s, same `onSelect`, same backend
 * queries behind each as before; only the dress changed.
 *
 * Three segments, not five: `Food` / `Travel` / `Life` would need a category filter the feed
 * endpoint does not have, so they are not drawn rather than wired to a fake query.
 */
@Composable
private fun FeedTabs(
    selected: ReviewFeedType,
    onSelect: (ReviewFeedType) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(50))
            .background(ExploreV3.Glass)
            .border(1.dp, ExploreV3.GlassBorder, RoundedCornerShape(50))
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FeedTab(
            label = stringResource(R.string.reviews_tab_for_you),
            selected = selected == ReviewFeedType.ForYou,
            onClick = { onSelect(ReviewFeedType.ForYou) },
        )
        FeedTab(
            label = stringResource(R.string.reviews_tab_following),
            selected = selected == ReviewFeedType.Following,
            onClick = { onSelect(ReviewFeedType.Following) },
        )
        FeedTab(
            label = stringResource(R.string.reviews_tab_latest),
            selected = selected == ReviewFeedType.Latest,
            onClick = { onSelect(ReviewFeedType.Latest) },
        )
    }
}

@Composable
private fun FeedTab(label: String, selected: Boolean, onClick: () -> Unit) {
    // The selection slides between segments as a colour change, nothing more — the reference is restrained.
    val fill by animateColorAsState(if (selected) ExploreV3.SegmentSelected else Color.Transparent, label = "segment-fill")
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(fill)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (selected) ExploreV3.OnSurface else ExploreV3.OnVideoMuted,
            fontSize = 15.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

/** Feed empty state, tab-specific to match the web: Following → "not following" + See For You;
 *  Latest → no posts + See For You; For You → no posts + Post now. */
@Composable
private fun FeedEmptyState(
    feedType: ReviewFeedType,
    onSeeForYou: () -> Unit,
    onCompose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (feedType) {
        ReviewFeedType.Following -> TappyEmptyState(
            icon = Icons.Filled.Group,
            title = stringResource(R.string.reviews_feed_empty_following),
            actionText = stringResource(R.string.reviews_feed_see_for_you),
            onAction = onSeeForYou,
            modifier = modifier,
        )
        ReviewFeedType.Latest -> TappyEmptyState(
            icon = Icons.Filled.RateReview,
            title = stringResource(R.string.reviews_feed_empty_title),
            actionText = stringResource(R.string.reviews_feed_see_for_you),
            onAction = onSeeForYou,
            modifier = modifier,
        )
        ReviewFeedType.ForYou -> TappyEmptyState(
            icon = Icons.Filled.RateReview,
            title = stringResource(R.string.reviews_feed_empty_title),
            actionText = stringResource(R.string.reviews_feed_post_now),
            onAction = onCompose,
            modifier = modifier,
        )
    }
}

/**
 * The floating brand header of the reference design: the TAPPYAI wordmark with the ✦ spark and
 * the "Discover something better" tagline on the left; three glass circles — search, bell,
 * profile — on the right. It floats over the clip (no opaque bar), below the status bar.
 *
 * The "+" is Create Post (owner ruling 2026-09-13: the header keeps its own "+", distinct from the
 * rail avatar's follow badge). No unread dot on the bell: there is no unread state anywhere in the
 * Android app, so none is drawn.
 *
 * The person button opens the user's OWN profile inside Explore (`SelfProfile`); a post's
 * avatar and handle keep opening the AUTHOR's profile.
 */
@Composable
private fun FeedTopBar(
    onBack: (() -> Unit)?,
    onCompose: () -> Unit,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = TappySpacing.xl, end = TappySpacing.xl, top = 24.dp, bottom = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = ScreenIconColor)
            }
        }
        Column {
            // The approved brand lockup: "Tappy" white + "AI" brand blue, with a little depth, and
            // the official mascot (the "searching" pose from the owner's pose library,
            // public/tappy/searching.png → drawable tappy_searching) beside it as one element.
            Row(verticalAlignment = Alignment.CenterVertically) {
                BrandWordmark3D()
                Image(
                    painter = painterResource(R.drawable.tappy_searching),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .padding(start = 4.dp)
                        .size(40.dp),
                )
            }
            Text(
                text = stringResource(R.string.reviews_feed_tagline),
                color = ExploreV3.OnVideoMuted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        // Create Post — the header's own "+", separate from the rail avatar's follow badge.
        ExploreHeaderAction(onClick = onCompose, contentDescription = stringResource(R.string.reviews_tab_compose)) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = ExploreV3.OnSurface, modifier = Modifier.size(22.dp))
        }
        ExploreHeaderAction(onClick = onSearch, contentDescription = stringResource(R.string.reviews_search_label)) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = ExploreV3.OnSurface, modifier = Modifier.size(22.dp))
        }
        ExploreHeaderAction(onClick = onNotifications, contentDescription = stringResource(R.string.reviews_notifications_label)) {
            Icon(Icons.Filled.NotificationsNone, contentDescription = null, tint = ExploreV3.OnSurface, modifier = Modifier.size(22.dp))
        }
        ExploreHeaderAction(onClick = onProfile, contentDescription = stringResource(R.string.reviews_self_profile_open)) {
            Icon(Icons.Filled.PersonOutline, contentDescription = null, tint = ExploreV3.OnSurface, modifier = Modifier.size(22.dp))
        }
    }
}

/**
 * The dimensional TappyAI wordmark of the approved branding — "Tappy" white, "AI" brand blue.
 *
 * 🚨 There is no official standalone wordmark asset in the repository (the only wordmarks are
 * baked into the full lockups `public/branding/otter-logo.png` / `drawable/tappyai_logo.png`,
 * which must not be cropped — docs/branding/LOGO_MIGRATION_PLAN.md), so the depth is drawn here:
 * a short extrusion of darker layers stepping down behind the top face, a slightly lighter face,
 * and one soft contact shadow underneath. A layered build, not a drop shadow. Swap for the
 * official wordmark asset the moment Design supplies one.
 */
@Composable
private fun BrandWordmark3D() {
    val tappy = stringResource(R.string.home_v3_brand_tappy)
    val ai = stringResource(R.string.home_v3_brand_ai)
    val style = LocalTextStyle.current.copy(fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.ExtraBold)
    val layers = 7
    Box {
        // The extrusion: the same glyphs stepped down-and-right seven times, darker the deeper —
        // the letters' sides, lit from the upper left. The deepest layer also throws the soft
        // contact shadow that lifts the whole mark off the video.
        for (i in layers downTo 1) {
            val t = i / layers.toFloat()
            Text(
                text = buildAnnotatedString {
                    withStyle(SpanStyle(color = lerp(WordmarkTappySideNear, WordmarkTappySideFar, t))) { append(tappy) }
                    withStyle(SpanStyle(color = lerp(WordmarkAiSideNear, WordmarkAiSideFar, t))) { append(ai) }
                },
                style = if (i == layers) style.copy(shadow = Shadow(color = Color(0xCC000000), offset = Offset(2f, 8f), blurRadius = 12f)) else style,
                modifier = Modifier.offset(x = (i * 0.45f).dp, y = (i * 0.85f).dp),
            )
        }
        // A thin bright rim just above the face — the lit top edge of each letter.
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = Color.White)) { append(tappy) }
                withStyle(SpanStyle(color = WordmarkAiRim)) { append(ai) }
            },
            style = style,
            modifier = Modifier.offset(y = (-0.7f).dp),
        )
        // The face: a top-to-bottom sheen (bright at the top, a touch cooler at the base), which
        // is what makes the letters read as a solid, polished slab rather than flat type.
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(brush = Brush.verticalGradient(listOf(Color.White, WordmarkTappyFaceBase)))) { append(tappy) }
                withStyle(SpanStyle(brush = Brush.verticalGradient(listOf(WordmarkAiFaceTop, WordmarkAiFaceBase)))) { append(ai) }
            },
            style = style,
        )
    }
}

private val WordmarkTappyFaceBase = Color(0xFFD6DDF0)
private val WordmarkTappySideNear = Color(0xFFAEB8D6)
private val WordmarkTappySideFar = Color(0xFF3F4A68)
private val WordmarkAiRim = Color(0xFF9CCBFF)
private val WordmarkAiFaceTop = Color(0xFF5FAEFF)
private val WordmarkAiFaceBase = Color(0xFF1877E8)
private val WordmarkAiSideNear = Color(0xFF0F5CB8)
private val WordmarkAiSideFar = Color(0xFF052A58)

/** A 48dp glass circle over the video — translucent near-black, thin light border, white glyph. */
@Composable
private fun ExploreHeaderAction(
    onClick: () -> Unit,
    contentDescription: String,
    icon: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(ExploreV3.Glass)
            .border(1.dp, ExploreV3.GlassBorder, CircleShape)
            .clickable(onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

@Composable
internal fun ReviewDetailScreen(
    reviewId: String,
    onAvatarClick: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: ReviewDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(reviewId) { viewModel.load(reviewId) }
    val context = LocalContext.current
    val shareScope = rememberCoroutineScope()
    val nowMillis = System.currentTimeMillis()
    val review = uiState.review
    // Id of the comment whose emoji picker is open (only one at a time), or null.
    var reactionPickerFor by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is DetailEvent.CommentFailed ->
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ScreenBackground)
            // 🚨 Without this the comment composer is unusable. MainActivity declares
            // `adjustResize` and calls `enableEdgeToEdge()`, which is a deliberate pair: the window
            // does NOT pan, and each screen consumes the IME inset itself so it is subtracted
            // exactly once (see ImeInsetContractTest). ChatScreen does that; this screen never did,
            // so opening the keyboard left the composer where it was — measured on SM-A127F at
            // y=1418..1465 with the IME top at y≈930, i.e. entirely behind the keyboard. The user
            // could not see what they were typing and could not reach Send.
            //
            // It belongs on the Column rather than on the input bar: the Column shrinks, so the
            // LazyColumn above gives up the height instead and the comments stay scrollable. The
            // shell already hides the bottom nav while the IME is up, so there is nothing to
            // overlap once the composer moves.
            .imePadding(),
    ) {
        ScreenHeader(title = stringResource(R.string.reviews_detail_title), onBack = onBack)
        if (review == null) {
            if (uiState.isLoadingReview) {
                TappyLoadingIndicator(modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = TappySpacing.xxl))
            } else {
                TappyEmptyState(
                    icon = Icons.Filled.RateReview,
                    title = stringResource(R.string.reviews_detail_unavailable_title),
                    message = stringResource(R.string.reviews_detail_unavailable_message),
                )
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f)) {
                item(key = "review-card") {
                    // The card must have a BOUNDED height here: ReviewCard fills its parent, but a
                    // LazyColumn measures items with unbounded height, so `fillMaxSize` collapsed the
                    // media surface to 0px (black) while the overlays — which have intrinsic size —
                    // still drew. A 9:16 box (the clip's shape, as in the feed) gives the media real
                    // bounds so the video/photo actually renders, and comments scroll below it.
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(9f / 16f),
                    ) {
                        ReviewCard(
                            review = review,
                            isMe = false,
                            // The detail shows a single clip that is always on-screen, so it must be
                            // the active one — without this the upload-video surface stays paused
                            // (plays only when `active`), i.e. the clip never plays here.
                            active = true,
                            audioUnlocked = true,
                            onLike = { viewModel.toggleLike() },
                            onSave = { viewModel.toggleSave() },
                            onComment = {},
                            onShare = { shareScope.launch { shareReview(context, review) } },
                            onAvatarClick = { onAvatarClick(review.userId) },
                            onDelete = {},
                            onHide = {},
                        )
                    }
                }
                // Web parity: the attached-music card sits under the clip on the detail view, with
                // its own play/pause honoring the review's saved startSec + volume.
                uiState.attachedTrack?.let { track ->
                    item(key = "attached-music") {
                        ReviewMusicCard(
                            track = track,
                            startSec = review.music?.startSec ?: 0,
                            volume = (review.music?.volume ?: 1.0).toFloat(),
                        )
                    }
                }
                reviewCommentItems(
                    comments = uiState.comments,
                    nowMillis = nowMillis,
                    currentUserId = uiState.currentUserId,
                    reactionPickerFor = reactionPickerFor,
                    onDeleteComment = viewModel::deleteComment,
                    onReply = { comment ->
                        reactionPickerFor = null
                        viewModel.startReply(comment)
                    },
                    onToggleReactionPicker = { id -> reactionPickerFor = if (reactionPickerFor == id) null else id },
                    onReact = { id, key ->
                        reactionPickerFor = null
                        viewModel.toggleReaction(id, key)
                    },
                )
            }
            ReviewCommentInputBar(
                isPosting = uiState.isPostingComment,
                onSend = viewModel::postComment,
                replyingToName = uiState.replyingTo?.profiles?.fullName
                    ?: uiState.replyingTo?.let { stringResource(R.string.reviews_comment_default_user) },
                onCancelReply = viewModel::cancelReply,
            )
        }
    }
}

/**
 * Runs [onResume] on every ON_RESUME *after* the first (each screen's initial load already covers
 * the first), so a profile's clip grid reflows after a clip is deleted or hidden elsewhere without
 * the user manually retrying. Shared by [ReviewProfileScreen] and SelfProfileScreen; mirrors the
 * MyReviews resume-reload pattern.
 */
@Composable
internal fun ReloadOnResume(onResume: () -> Unit) {
    val current = rememberUpdatedState(onResume)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        var isFirstResume = true
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (isFirstResume) isFirstResume = false else current.value()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

@Composable
internal fun ReviewNotificationsScreen(
    onNotificationClick: (ReviewGroupedNotification) -> Unit,
    onBack: () -> Unit,
    onOpenDigest: () -> Unit = {},
    viewModel: ReviewNotificationsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val nowMillis = System.currentTimeMillis()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ScreenBackground),
    ) {
        ScreenHeader(title = stringResource(R.string.reviews_notifications_label), onBack = onBack)
        when {
            uiState.isLoading && uiState.notifications.isEmpty() -> {
                TappyLoadingIndicator()
            }
            uiState.error != null && uiState.notifications.isEmpty() -> {
                TappyErrorState(
                    title = stringResource(R.string.reviews_notifications_error_title),
                    message = uiState.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = { viewModel.load() },
                )
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    // Web parity: the AI-digest banner sits above the notification list.
                    item(key = "inbox-digest-banner") { InboxDigestBanner(onClick = onOpenDigest) }
                    reviewNotificationItems(
                        notifications = uiState.notifications,
                        nowMillis = nowMillis,
                        onNotificationClick = onNotificationClick,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ReviewSearchScreen(
    onResultClick: (Review) -> Unit,
    onBack: () -> Unit,
    onUserClick: (String) -> Unit = {},
    viewModel: ReviewSearchViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ScreenBackground),
    ) {
        ScreenHeader(title = stringResource(R.string.reviews_search_label), onBack = onBack)
        ReviewSearchBar(
            query = uiState.query,
            onQueryChange = viewModel::onQueryChange,
            modifier = Modifier.padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        )
        ReviewSearchModeTabs(selected = uiState.mode, onSelect = viewModel::onModeChange)
        when {
            uiState.isSearching -> {
                TappyLoadingIndicator()
            }
            uiState.error != null -> {
                TappyErrorState(
                    title = stringResource(R.string.reviews_search_error_title),
                    message = uiState.error,
                    retryText = null,
                    onRetry = null,
                )
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    when (uiState.mode) {
                        ReviewSearchMode.Reviews -> reviewSearchItems(results = uiState.results, onResultClick = onResultClick)
                        ReviewSearchMode.Users -> userSearchItems(
                            users = uiState.userResults,
                            onUserClick = onUserClick,
                            onFollowToggle = viewModel::toggleFollow,
                        )
                    }
                }
            }
        }
    }
}

/** Review photo cap — same value the composer screen and ViewModel enforce (backend caps at 6). */
private const val MAX_COMPOSER_PHOTOS = 6

/**
 * Keeps the safety-gate notice across rotation and process death.
 *
 * Worth the eight lines: the notice is delivered exactly once, as a one-shot event. If the
 * activity is recreated while the dialog is up, an unsaved value would leave the author with a
 * post they were never told was held — and no way to ever be told, because the event has already
 * been consumed.
 */
private val ComposerHeldNoticeSaver = listSaver<ComposerEvent.Held?, Any>(
    save = { it?.let { n -> listOf(n.title, n.detail, n.assertsViolation) } ?: emptyList() },
    restore = {
        if (it.size < 3) null
        else ComposerEvent.Held(it[0] as String, it[1] as String, it[2] as Boolean)
    },
)

@Composable
internal fun ReviewComposerHost(
    onBack: () -> Unit,
    viewModel: ReviewComposerViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    // System photo picker (no runtime permission). Multi-select capped at the review photo limit;
    // the ViewModel additionally trims to the remaining slots and enforces per-file size/type.
    val pickPhotos = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(MAX_COMPOSER_PHOTOS),
    ) { uris -> viewModel.onPhotosPicked(uris) }
    // rememberSaveable so a multi-paragraph draft (body/rating/place + the disclosure toggles)
    // survives rotation and process-death — with plain remember the user silently lost the entire
    // review they were writing on any config change. ComposerMediaMode is a plain enum (Serializable),
    // which rememberSaveable's default saver persists via the Bundle without a custom Saver.
    var body by rememberSaveable { mutableStateOf("") }
    var rating by rememberSaveable { mutableStateOf(0) }
    // Seeded from the route when reached via a booking's Review button, so the user doesn't retype
    // the venue they just visited; still freely editable, and empty for a normal compose.
    var placeName by rememberSaveable { mutableStateOf(viewModel.prefilledPlaceName.orEmpty()) }
    var mediaMode by rememberSaveable { mutableStateOf(ComposerMediaMode.Photo) }
    // Expanded up-front for a booking review so the pre-filled venue is visible rather than hidden
    // behind a collapsed disclosure.
    var showPlaceInput by rememberSaveable { mutableStateOf(viewModel.prefilledPlaceName != null) }
    var showRating by rememberSaveable { mutableStateOf(false) }
    // The in-composer music picker (web MusicPickerSheet). The attached track itself now lives in the
    // ViewModel's uiState, so add/replace/remove/trim all go through the ViewModel.
    var showMusicPicker by rememberSaveable { mutableStateOf(false) }
    // The safety gate's outcome when it did not publish. A dialog rather than a Toast, and
    // deliberately: a Toast is dismissible by looking away, and this is the only moment the author
    // is told their post is not public. The web gives this its own screen for the same reason.
    var heldNotice by rememberSaveable(stateSaver = ComposerHeldNoticeSaver) {
        mutableStateOf<ComposerEvent.Held?>(null)
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ComposerEvent.Posted -> {
                    // Not stringResource() — this runs inside LaunchedEffect's suspend lambda, not a
                    // @Composable context; context.getString() resolves the same localized resource.
                    Toast.makeText(context, context.getString(R.string.reviews_composer_posted_toast), Toast.LENGTH_SHORT).show()
                    onBack()
                }
                // 🚨 No success Toast and no immediate onBack(). The post was stored but is not
                // public, and both of those would tell the author it went live.
                is ComposerEvent.Held -> heldNotice = event
                is ComposerEvent.Failed -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    heldNotice?.let { notice ->
        TappyDialog(
            // Server text, rendered verbatim and already in the app's language. Nothing here
            // re-words it, and nothing here decides what it means.
            title = notice.title,
            message = notice.detail,
            confirmText = stringResource(R.string.reviews_moderation_acknowledge),
            onConfirm = { heldNotice = null; onBack() },
            onDismiss = { heldNotice = null; onBack() },
            // No "Cancel": there is nothing to cancel. The post is already stored and already
            // held, so a two-button dialog would imply a choice the author does not have.
            dismissText = null,
        )
    }

    ReviewComposerScreen(
        body = body,
        onBodyChange = { body = it },
        rating = rating,
        onRatingChange = { rating = it },
        placeName = placeName,
        onPlaceNameChange = { placeName = it },
        mediaMode = mediaMode,
        onMediaModeChange = { mediaMode = it },
        showPlaceInput = showPlaceInput,
        onTogglePlaceInput = { showPlaceInput = !showPlaceInput },
        showRating = showRating,
        onToggleRating = { showRating = !showRating },
        onBack = onBack,
        onPost = { viewModel.submit(body = body, rating = rating, placeName = placeName) },
        attachedSoundTitle = uiState.attachedTrackTitle,
        onRemoveSound = viewModel::onRemoveSound,
        onAddMusic = { showMusicPicker = true },
        photoUrls = uiState.photoUrls,
        isUploadingPhoto = uiState.isUploadingPhoto,
        onPickPhotos = {
            pickPhotos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        },
        onRemovePhoto = viewModel::onRemovePhoto,
        linkUrl = uiState.linkUrl,
        onLinkUrlChange = viewModel::onLinkUrlChanged,
        linkSourceType = uiState.linkSourceType,
        linkThumbnailUrl = uiState.linkThumbnailUrl,
        isFetchingLinkMeta = uiState.isFetchingLinkMeta,
    )

    if (showMusicPicker) {
        MusicPickerSheet(
            onSelect = { trackId, title, startSec, volume ->
                viewModel.onMusicSelected(trackId, title, startSec, volume)
                showMusicPicker = false
            },
            onDismiss = { showMusicPicker = false },
        )
    }
}

@Composable
private fun ScreenHeader(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = ScreenIconColor)
        }
        Text(
            text = title,
            color = ScreenTextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

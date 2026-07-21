package com.tappyai.app.reviews.ui

import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.tappyai.app.music.MusicPickerSheet
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Notifications
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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewFeedType
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.isShareOnlyName
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappySpacing

private val ScreenBackground = Color(0xFF000000)
private val ScreenTextPrimary = Color(0xFFFFFFFF)
private val ScreenIconColor = Color(0xFFFFFFFF)

@Composable
internal fun ReviewsFeedScreen(
    onReviewClick: (String) -> Unit,
    onAuthorClick: (String) -> Unit,
    onCompose: () -> Unit,
    onNotifications: () -> Unit,
    onSearch: () -> Unit,
    onBack: (() -> Unit)? = null,
    /** Set when another screen asks the feed to switch tab — web parity: the Inbox digest banner
     *  hands off to the Following feed. Applied once, then cleared by the nav host. */
    requestedFeedType: ReviewFeedType? = null,
    /** Opens the compact SoundSheet for a clip's attached track (web: the feed music disc). */
    onMusicDiscClick: (String) -> Unit = {},
    viewModel: ReviewsFeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val reviews = uiState.reviews
    val context = LocalContext.current
    val pagerState = rememberPagerState(pageCount = { reviews.size })

    LaunchedEffect(requestedFeedType) {
        requestedFeedType?.let { viewModel.onFeedTypeChange(it) }
    }

    // Advance pagination as the user swipes toward the end of the loaded pages.
    LaunchedEffect(pagerState.currentPage) {
        viewModel.onPageSettled(pagerState.currentPage)
    }

    // Explore clips autoplay WITH sound immediately (product requirement 2026-07-20). Unlike a
    // browser <video>, ExoPlayer has no muted-until-gesture autoplay restriction, so audio is on
    // from the first frame — the user never has to Pause→Play to hear it. The single tap is
    // play/pause only. rememberSaveable keeps the flag across config changes.
    var audioUnlocked by rememberSaveable { mutableStateOf(true) }

    // Watch-time analytics: when the settled clip changes (swipe or first load) finalize the previous
    // clip's watch (posts to /interact when ≥3s) and start timing the new one — the same behaviour as
    // the web's behaviorTracker, driven by the pager's settled page instead of an IntersectionObserver.
    val activeReview = reviews.getOrNull(pagerState.settledPage)
    LaunchedEffect(activeReview?.id) {
        viewModel.onActiveReviewChanged(activeReview)
    }
    DisposableEffect(Unit) {
        onDispose { viewModel.flushWatch() }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
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
                FeedEmptyState(
                    feedType = uiState.feedType,
                    onSeeForYou = { viewModel.onFeedTypeChange(ReviewFeedType.ForYou) },
                    onCompose = onCompose,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            else -> {
                VerticalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                    beyondViewportPageCount = 1,
                ) { page ->
                    val review = reviews[page]
                    ReviewCard(
                        review = review,
                        isMe = uiState.currentUserId != null && review.userId == uiState.currentUserId,
                        active = pagerState.settledPage == page,
                        audioUnlocked = audioUnlocked,
                        onVideoDuration = { viewModel.onVideoDuration(review.id, it) },
                        onRequestAudioUnlock = { audioUnlocked = true },
                        onLike = { viewModel.toggleLike(review) },
                        onSave = { viewModel.toggleSave(review) },
                        onComment = { onReviewClick(review.id) },
                        onShare = { shareReview(context, review) },
                        onAvatarClick = { onAuthorClick(review.userId) },
                        onDelete = { viewModel.deleteReview(review) },
                        onHide = { viewModel.hideReview(review) },
                        // Web parity: the disc opens the SoundSheet for the clip's attached track.
                        onMusicDiscClick = review.music?.trackId
                            ?.takeIf { it.isNotBlank() }
                            ?.let { trackId -> { onMusicDiscClick(trackId) } },
                    )
                }
            }
        }

        Column(modifier = Modifier.align(Alignment.TopCenter)) {
            FeedTopBar(
                onBack = onBack,
                onSearch = onSearch,
                onNotifications = onNotifications,
            )
            FeedTabs(
                selected = uiState.feedType,
                onSelect = viewModel::onFeedTypeChange,
                onCompose = onCompose,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

/** For You / Following / Latest tab switcher, centered under the feed's top bar — mirrors the web's
 *  top-of-feed tab row (active tab bold + underlined). */
@Composable
private fun FeedTabs(
    selected: ReviewFeedType,
    onSelect: (ReviewFeedType) -> Unit,
    onCompose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Android-only top nav (owner-approved): a "Đăng bài" action tab is the single post entry point
    // (the floating + was removed), followed by the three feed filters in the owner's order.
    Row(
        modifier = modifier.padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FeedActionTab(
            label = stringResource(R.string.reviews_tab_compose),
            onClick = onCompose,
        )
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

/** The "Đăng bài" action tab — always full-opacity (never a selected feed state); opens the
 *  composer. Replaces the removed floating "+" so posting has a single entry point. */
@Composable
private fun FeedActionTab(label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
    ) {
        Text(
            text = label,
            color = ScreenTextPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun FeedTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
    ) {
        Text(
            text = label,
            color = if (selected) ScreenTextPrimary else ScreenTextPrimary.copy(alpha = 0.6f),
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        )
        if (selected) {
            Box(
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(width = 16.dp, height = 2.dp)
                    .background(ScreenTextPrimary),
            )
        }
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

@Composable
private fun FeedTopBar(
    onBack: (() -> Unit)?,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = ScreenIconColor)
            }
        } else {
            Spacer(modifier = Modifier.size(48.dp))
        }
        // No "Bài viết" title (owner decision + web parity: the feed header is just the tab row
        // below + the action icons).
        Row {
            IconButton(onClick = onSearch) {
                Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.reviews_search_label), tint = ScreenIconColor)
            }
            IconButton(onClick = onNotifications) {
                Icon(Icons.Filled.Notifications, contentDescription = stringResource(R.string.reviews_notifications_label), tint = ScreenIconColor)
            }
        }
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
            .background(ScreenBackground),
    ) {
        ScreenHeader(title = stringResource(R.string.reviews_detail_title), onBack = onBack)
        if (review == null) {
            TappyEmptyState(
                icon = Icons.Filled.RateReview,
                title = stringResource(R.string.reviews_detail_unavailable_title),
                message = stringResource(R.string.reviews_detail_unavailable_message),
            )
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
                            onShare = { shareReview(context, review) },
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
internal fun ReviewProfileScreen(
    userId: String,
    onReviewClick: (Review) -> Unit,
    onBack: () -> Unit,
    viewModel: ReviewProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(userId) { viewModel.load(userId) }
    // Reflow the clip grid after a clip is deleted/hidden elsewhere (e.g. the feed) and the user
    // returns here — mirrors web ProfileTab refetching and MyReviews' resume-reload.
    ReloadOnResume { viewModel.retry() }
    val profile = uiState.profile

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ScreenBackground),
    ) {
        ScreenHeader(title = profile?.fullName ?: stringResource(R.string.reviews_profile_fallback_title), onBack = onBack)
        when {
            uiState.isLoading && profile == null -> {
                TappyLoadingIndicator()
            }
            uiState.error != null && profile == null -> {
                TappyErrorState(
                    title = stringResource(R.string.reviews_profile_error_title),
                    message = uiState.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = { viewModel.retry() },
                )
            }
            profile != null -> {
                // 3-column clip-thumbnail grid (mirrors web ProfileTab): the header spans all
                // columns, then the author's posted clips render as tappable thumbnails.
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        ReviewProfileHeader(
                            profile = profile,
                            reviewCount = uiState.reviews.size,
                            totalLikes = uiState.reviews.sumOf { it.likeCount },
                            totalSaves = uiState.reviews.sumOf { it.saveCount ?: 0 },
                            isTogglingFollow = uiState.isTogglingFollow,
                            onToggleFollow = viewModel::toggleFollow,
                        )
                    }
                    if (uiState.reviews.isEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            TappyEmptyState(
                                icon = Icons.Filled.RateReview,
                                title = stringResource(R.string.reviews_profile_empty_title),
                                message = stringResource(R.string.reviews_profile_empty_message),
                            )
                        }
                    } else {
                        gridItems(items = uiState.reviews, key = { it.id }) { review ->
                            ReviewClipTile(review = review, onClick = { onReviewClick(review) })
                        }
                    }
                }
            }
        }
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

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ComposerEvent.Posted -> {
                    // Not stringResource() — this runs inside LaunchedEffect's suspend lambda, not a
                    // @Composable context; context.getString() resolves the same localized resource.
                    Toast.makeText(context, context.getString(R.string.reviews_composer_posted_toast), Toast.LENGTH_SHORT).show()
                    onBack()
                }
                is ComposerEvent.Failed -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
            }
        }
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

/**
 * Fires the system share sheet with the review's text. There is no backend share endpoint and no
 * production web domain configured in the app, so this shares the place + body (+ source link if
 * the review has one) rather than a canonical review URL. Uses ACTION_SEND — a system overlay, not
 * an in-app UI change.
 */
private fun shareReview(context: Context, review: Review) {
    val text = buildString {
        if (review.placeName.isNotBlank() && !isShareOnlyName(review.placeName)) {
            append(review.placeName)
            append("\n")
        }
        if (review.body.isNotBlank()) append(review.body)
        val source = review.sourceUrl
        if (!source.isNullOrBlank()) {
            append("\n")
            append(source)
        }
    }.trim().ifBlank { review.placeName.ifBlank { context.getString(R.string.reviews_share_fallback_text) } }

    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(sendIntent, context.getString(R.string.reviews_action_share)))
}

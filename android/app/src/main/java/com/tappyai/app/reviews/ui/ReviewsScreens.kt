package com.tappyai.app.reviews.ui

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.ChatBubble
import androidx.compose.material3.HorizontalDivider
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyBottomSheet
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
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
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.isShareOnlyName
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyMinTouchTarget
import com.tappyai.core.designsystem.theme.TappySpacing

private val ScreenBackground = Color(0xFF000000)
private val ScreenTextPrimary = Color(0xFFFFFFFF)
private val ScreenIconColor = Color(0xFFFFFFFF)

@Composable
internal fun ReviewsFeedScreen(
    onReviewClick: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onCompose: () -> Unit,
    onNotifications: () -> Unit,
    onSearch: () -> Unit,
    onOpenSound: (String) -> Unit,
    onBack: (() -> Unit)? = null,
    viewModel: ReviewsFeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val reviews = uiState.reviews
    val context = LocalContext.current
    val pagerState = rememberPagerState(pageCount = { reviews.size })
    var pendingDelete by remember { mutableStateOf<Review?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    // Back-restore by CLIP ID, not pager index (web-parity contract §5.3): the trending feed
    // re-orders between fetches, so after a process-death reload the saved index would land on the
    // wrong clip. Capture the restore target once, then jump to that id's CURRENT index as soon as
    // the list is available. `didRestore` is a plain remember (not saveable) so a fresh composition
    // after process death re-runs the restore. Only after restoring do we start persisting the
    // settled clip, otherwise the initial page-0 settle would overwrite the saved target.
    val restoreClipId = remember { viewModel.restoreClipId }
    var didRestore by remember { mutableStateOf(false) }
    LaunchedEffect(reviews) {
        if (!didRestore && reviews.isNotEmpty()) {
            if (restoreClipId != null) {
                val index = reviews.indexOfFirst { it.id == restoreClipId }
                if (index > 0) pagerState.scrollToPage(index)
            }
            didRestore = true
        }
    }

    // Advance pagination as the user swipes toward the end, and persist the settled clip id.
    LaunchedEffect(pagerState.currentPage, reviews.size) {
        viewModel.onPageSettled(pagerState.currentPage)
        if (didRestore) {
            reviews.getOrNull(pagerState.currentPage)?.let { viewModel.onActiveClipChanged(it.id) }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.messages.collect { message ->
            snackbarHostState.showSnackbar(message = message, duration = SnackbarDuration.Short)
        }
    }

    // Re-read the unread count whenever the feed resumes — in particular when returning from the
    // notifications inbox, which marks all read server-side. The bell badge then clears immediately,
    // no app restart or manual refresh needed (web parity: markAllRead → unreadCount 0).
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.refreshUnreadNotifications()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold(
        containerColor = ScreenBackground,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        // Immersive full-bleed feed (TikTok/web): the bottom-nav shell already insets its content
        // for the status/navigation bars, so this inner Scaffold must NOT re-apply them — doing so
        // double-padded the feed and letterboxed the video with black strips top + bottom. The feed
        // fills the shell's content slot; the overlays carry their own safe-area padding.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(ScreenBackground),
            // Round-3 audit fix: unlike every other content screen in the app, this had no width cap
            // — on a tablet/Expanded window the full-bleed card stretched edge-to-edge. The web itself
            // always centers and caps this feed (src/app/reviews/page.tsx, max-w-container-compact +
            // mx-auto, even on desktop), so this isn't conditional on window size either.
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(modifier = Modifier.fillMaxHeight().widthIn(max = TappyContainers.compact)) {
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
                    // Web parity: the Following tab with no follows shows a "not following anyone"
                    // empty state instead of the generic one (mirrors the backend's
                    // `empty: 'not_following_anyone'` short-circuit).
                    val isFollowingEmpty = uiState.feedType == FeedType.Following
                    TappyEmptyState(
                        icon = Icons.Filled.RateReview,
                        title = stringResource(
                            if (isFollowingEmpty) R.string.reviews_feed_following_empty_title else R.string.reviews_feed_empty_title,
                        ),
                        message = stringResource(
                            if (isFollowingEmpty) R.string.reviews_feed_following_empty_message else R.string.reviews_feed_empty_message,
                        ),
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                else -> {
                    VerticalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                        beyondViewportPageCount = 1,
                        // Stable key by review id so paging appends/optimistic removes don't remap
                        // pages onto the wrong card (and don't reset each card's ExoPlayer state).
                        key = { reviews[it].id },
                    ) { page ->
                        val review = reviews[page]
                        ReviewCard(
                            review = review,
                            isMe = uiState.currentUserId != null && review.userId == uiState.currentUserId,
                            onLike = { viewModel.toggleLike(review) },
                            onSave = { viewModel.toggleSave(review) },
                            onComment = { onReviewClick(review.id) },
                            onShare = { shareReview(context, review) },
                            // Web parity (reviews/page.tsx:407,436): avatar + @handle open the
                            // author's profile (/users/{id}), NOT the review detail.
                            onAvatarClick = { onOpenProfile(review.userId) },
                            onDelete = { pendingDelete = review },
                            onHide = { viewModel.hide(review) },
                            // Only the settled current page plays its video (web parity: `active`).
                            active = page == pagerState.currentPage,
                            resolveSoundUrl = viewModel::resolveAttachedSoundUrl,
                            // "Use this sound" disc (web parity): shows on every upload video;
                            // tap opens the sound page when the clip has a registered track.
                            onMusicDiscClick = { review.music?.trackId?.let(onOpenSound) },
                        )
                    }
                }
            }

            FeedTopBar(
                onBack = onBack,
                onSearch = onSearch,
                onNotifications = onNotifications,
                onCompose = onCompose,
                feedType = uiState.feedType,
                onFeedTypeChange = viewModel::onFeedTypeChange,
                unreadCount = uiState.unreadNotifications,
                modifier = Modifier.align(Alignment.TopCenter),
            )
            }
        }
    }

    pendingDelete?.let { review ->
        TappyDialog(
            title = stringResource(R.string.myreviews_delete_dialog_title),
            message = stringResource(R.string.myreviews_delete_dialog_message, review.placeName),
            confirmText = stringResource(R.string.myreviews_delete_confirm),
            onConfirm = { viewModel.delete(review); pendingDelete = null },
            onDismiss = { pendingDelete = null },
        )
    }
}

@Composable
private fun FeedTopBar(
    onBack: (() -> Unit)?,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onCompose: () -> Unit,
    feedType: FeedType,
    onFeedTypeChange: (FeedType) -> Unit,
    unreadCount: Int = 0,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // No leading spacer on the feed (onBack == null): the tabs left-align like the web mobile
        // header, leaving room for all four labels + the search/bell icons on a 360dp screen.
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = ScreenIconColor)
            }
        }
        // Web parity (WEB-EXPLORE-HEADER-001): Đăng bài | Đang theo dõi | Đề xuất | Mới nhất.
        // "Đăng bài" is the compose action (first, always highlighted, no underline); the other
        // three are the feed filters.
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FeedTab(stringResource(R.string.reviews_feed_post_cta), selected = false, onClick = onCompose, isAction = true)
            FeedTab(stringResource(R.string.reviews_feed_tab_following), feedType == FeedType.Following) { onFeedTypeChange(FeedType.Following) }
            FeedTab(stringResource(R.string.reviews_feed_tab_foryou), feedType == FeedType.ForYou) { onFeedTypeChange(FeedType.ForYou) }
            FeedTab(stringResource(R.string.reviews_feed_tab_latest), feedType == FeedType.Latest) { onFeedTypeChange(FeedType.Latest) }
        }
        Row {
            IconButton(onClick = onSearch) {
                Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.reviews_search_label), tint = ScreenIconColor)
            }
            // Web parity (BottomNav/NotificationProvider): the bell carries an unread-count badge.
            BadgedBox(
                badge = {
                    if (unreadCount > 0) {
                        Badge {
                            Text(if (unreadCount > 99) "99+" else unreadCount.toString())
                        }
                    }
                },
            ) {
                IconButton(onClick = onNotifications) {
                    Icon(Icons.Filled.Notifications, contentDescription = stringResource(R.string.reviews_notifications_label), tint = ScreenIconColor)
                }
            }
        }
    }
}

@Composable
private fun FeedTab(label: String, selected: Boolean, isAction: Boolean = false, onClick: () -> Unit) {
    // isAction = the "Đăng bài" compose entry: an action, not a filter, so it is always full
    // opacity and never takes the selected-tab underline (web parity, WEB-EXPLORE-HEADER-001).
    val highlighted = selected || isAction
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            // Accessibility: keep the tap area ≥48dp tall even though the label + underline is small.
            .defaultMinSize(minHeight = TappyMinTouchTarget)
            .padding(horizontal = TappySpacing.xs),
    ) {
        Text(
            text = label,
            color = if (highlighted) ScreenTextPrimary else Color(0x99FFFFFF),
            fontSize = 12.sp,
            fontWeight = if (highlighted) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
        )
        // Active-tab underline (web `border-b-2 border-white`). Actions never take it.
        Box(
            modifier = Modifier
                .padding(top = 2.dp)
                .size(width = 16.dp, height = 2.dp)
                .background(if (selected && !isAction) ScreenTextPrimary else Color.Transparent),
        )
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
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
    var showComments by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ReviewDetailEvent.Removed -> onBack()
                is ReviewDetailEvent.Error -> Toast.makeText(context, event.message, Toast.LENGTH_SHORT).show()
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(DetailPageBackground)) {
        if (review == null) {
            Column(modifier = Modifier.fillMaxSize()) {
                ScreenHeader(title = stringResource(R.string.reviews_detail_title), onBack = onBack)
                TappyEmptyState(
                    icon = Icons.Filled.RateReview,
                    title = stringResource(R.string.reviews_detail_unavailable_title),
                    message = stringResource(R.string.reviews_detail_unavailable_message),
                )
            }
        } else {
            // Web parity (reviews/[id]/ReviewDetailView): 55vh hero with a gradient overlay
            // carrying rating pills + place + address + author, a content card that reads over
            // it, and a fixed right action bar. Comments open in a sheet (web comment drawer).
            val heroHeight = (LocalConfiguration.current.screenHeightDp * 0.55f).dp
            Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Box(modifier = Modifier.fillMaxWidth().height(heroHeight)) {
                    ReviewMediaBackground(review = review, active = true, resolveSoundUrl = viewModel::resolveAttachedSoundUrl)
                    Box(
                        modifier = Modifier.fillMaxSize().background(
                            Brush.verticalGradient(0f to Color.Transparent, 0.5f to Color(0x33000000), 1f to Color(0xE0000000)),
                        ),
                    )
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.align(Alignment.TopStart).padding(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.common_back),
                            tint = Color.White,
                        )
                    }
                    Column(
                        modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = 20.dp, end = 72.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (review.rating > 0) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                DetailPill(text = "${"★".repeat(review.rating)} ${review.rating}/5", bg = Color(0xD9FF6B35))
                                ratingLabelText(review.rating)?.let { DetailPill(text = it, bg = Color(0x26FFFFFF)) }
                            }
                        }
                        if (!isShareOnlyName(review.placeName)) {
                            Text(
                                text = review.placeName,
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black,
                                lineHeight = 28.sp,
                            )
                        }
                        review.placeAddress?.takeIf { it.isNotBlank() }?.let { addr ->
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Color(0xB3FFFFFF), modifier = Modifier.size(14.dp))
                                Text(addr, color = Color(0xB3FFFFFF), fontSize = 13.sp)
                            }
                        }
                        Row(
                            modifier = Modifier.clickable { onAvatarClick(review.userId) },
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            TappyAvatar(
                                name = review.profiles?.fullName ?: "",
                                imageUrl = review.profiles?.avatarUrl,
                                size = TappyAvatarSize.ListRow,
                                modifier = Modifier.size(28.dp),
                            )
                            Text(
                                text = review.profiles?.fullName ?: stringResource(R.string.reviews_detail_anonymous),
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            val ago = timeAgoText(review.createdAt, nowMillis)
                            if (ago.isNotEmpty()) {
                                Text("· $ago", color = Color(0x99FFFFFF), fontSize = 12.sp)
                            }
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                        .background(DetailCardBackground)
                        .padding(horizontal = 20.dp, vertical = 24.dp),
                ) {
                    if (review.body.isNotBlank()) {
                        Text(review.body, color = Color(0xE6FFFFFF), fontSize = 16.sp, lineHeight = 26.sp, modifier = Modifier.padding(end = 44.dp))
                    } else {
                        Text(stringResource(R.string.reviews_detail_no_body), color = Color(0x80FFFFFF), fontSize = 14.sp)
                    }
                    if (!isShareOnlyName(review.placeName)) {
                        Spacer(modifier = Modifier.height(20.dp))
                        HorizontalDivider(color = Color(0x14FFFFFF))
                        Spacer(modifier = Modifier.height(16.dp))
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0x14FF6B35))
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = "${stringResource(R.string.reviews_detail_cta_prompt)} ${review.placeName}?",
                                color = Color(0xB3FFFFFF),
                                fontSize = 14.sp,
                            )
                            Text(
                                text = "🤖 " + stringResource(R.string.reviews_detail_ask_tappy),
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(Color(0xFFFF6B35))
                                    .padding(horizontal = 20.dp, vertical = 10.dp),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(96.dp))
                }
            }

            Column(
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                ReviewActionButton(
                    icon = if (review.likedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    label = review.likeCount.toString(),
                    contentDescription = stringResource(R.string.reviews_action_like_count, review.likeCount),
                    tint = if (review.likedByMe) Color(0xFFFE2C55) else Color.White,
                    onClick = { viewModel.toggleLike() },
                )
                ReviewActionButton(
                    icon = Icons.Outlined.ChatBubble,
                    label = review.commentCount.toString(),
                    contentDescription = stringResource(R.string.reviews_action_comment_count, review.commentCount),
                    tint = Color.White,
                    onClick = { showComments = true },
                )
                ReviewActionButton(
                    icon = if (review.savedByMe) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                    label = stringResource(R.string.reviews_action_save),
                    contentDescription = stringResource(R.string.reviews_action_save),
                    tint = if (review.savedByMe) Color(0xFFFBBF24) else Color.White,
                    onClick = { viewModel.toggleSave() },
                )
                ReviewActionButton(
                    icon = Icons.Filled.Share,
                    label = stringResource(R.string.reviews_action_share),
                    contentDescription = stringResource(R.string.reviews_action_share),
                    tint = Color.White,
                    onClick = { shareReview(context, review) },
                )
            }
        }
    }

    if (showComments && review != null) {
        TappyBottomSheet(onDismiss = { showComments = false }) {
            ReviewCommentsHeader(count = review.commentCount)
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
                reviewCommentItems(
                    comments = uiState.comments,
                    nowMillis = nowMillis,
                    currentUserId = uiState.currentUserId,
                    onDeleteComment = { viewModel.deleteComment(it) },
                    onReplyComment = { viewModel.startReply(it) },
                    onReactComment = { commentId, key -> viewModel.reactToComment(commentId, key) },
                    totalCount = review.commentCount,
                )
            }
            ReviewCommentComposer(
                value = uiState.commentInput,
                canPost = uiState.canPostComment,
                isPosting = uiState.isPostingComment,
                onValueChange = viewModel::onCommentInputChange,
                onSend = viewModel::postComment,
                replyingToName = uiState.replyingTo?.let {
                    it.profiles?.fullName ?: stringResource(R.string.reviews_comment_default_user)
                },
                onCancelReply = viewModel::cancelReply,
            )
        }
    }
}

private val DetailPageBackground = Color(0xFF0A0A0A)
private val DetailCardBackground = Color(0xFF111111)

@Composable
private fun DetailPill(text: String, bg: Color) {
    Text(
        text = text,
        color = Color.White,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun ratingLabelText(rating: Int): String? = when (rating) {
    1 -> stringResource(R.string.reviews_detail_rating_1)
    2 -> stringResource(R.string.reviews_detail_rating_2)
    3 -> stringResource(R.string.reviews_detail_rating_3)
    4 -> stringResource(R.string.reviews_detail_rating_4)
    5 -> stringResource(R.string.reviews_detail_rating_5)
    else -> null
}

@Composable
private fun timeAgoText(createdAt: String, nowMillis: Long): String {
    val then = runCatching { java.time.Instant.parse(createdAt).toEpochMilli() }
        .recoverCatching { java.time.OffsetDateTime.parse(createdAt).toInstant().toEpochMilli() }
        .getOrNull() ?: return ""
    val mins = ((nowMillis - then) / 60000L).toInt().coerceAtLeast(0)
    return when {
        mins < 1 -> stringResource(R.string.reviews_detail_time_just_now)
        mins < 60 -> stringResource(R.string.reviews_detail_time_minutes_ago, mins)
        mins < 1440 -> stringResource(R.string.reviews_detail_time_hours_ago, mins / 60)
        mins < 43200 -> stringResource(R.string.reviews_detail_time_days_ago, mins / 1440)
        else -> stringResource(R.string.reviews_detail_time_months_ago, mins / 43200)
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
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    reviewProfileItems(
                        profile = profile,
                        reviews = uiState.reviews,
                        onReviewClick = onReviewClick,
                        isFollowLoading = uiState.isFollowLoading,
                        onToggleFollow = { viewModel.toggleFollow() },
                    )
                }
            }
        }
    }
}

@Composable
internal fun ReviewNotificationsScreen(
    onNotificationClick: (ReviewGroupedNotification) -> Unit,
    onBack: () -> Unit,
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
    onOpenProfile: (String) -> Unit,
    onBack: () -> Unit,
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
        // Places | Users segment (web parity).
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = TappySpacing.xl),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            SearchSegmentTab(stringResource(R.string.reviews_search_segment_places), uiState.mode == SearchMode.Places) { viewModel.onModeChange(SearchMode.Places) }
            SearchSegmentTab(stringResource(R.string.reviews_search_segment_users), uiState.mode == SearchMode.Users) { viewModel.onModeChange(SearchMode.Users) }
        }
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
            uiState.mode == SearchMode.Places -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    reviewSearchItems(results = uiState.results, onResultClick = onResultClick)
                }
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(items = uiState.userResults, key = { it.userId ?: it.hashCode().toString() }) { user ->
                        UserResultRow(
                            user = user,
                            onClick = { user.userId?.let(onOpenProfile) },
                            onToggleFollow = { viewModel.toggleFollow(user) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchSegmentTab(label: String, selected: Boolean, onClick: () -> Unit) {
    androidx.compose.material3.FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, style = MaterialTheme.typography.labelMedium) },
    )
}

@Composable
private fun UserResultRow(user: com.tappyai.app.reviews.data.ReviewProfile, onClick: () -> Unit, onToggleFollow: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        com.tappyai.core.designsystem.component.TappyAvatar(
            name = user.fullName ?: "",
            imageUrl = user.avatarUrl,
            size = com.tappyai.core.designsystem.component.TappyAvatarSize.ListRow,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = user.fullName?.ifBlank { null } ?: stringResource(R.string.reviews_comment_default_user),
                color = ScreenTextPrimary,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = stringResource(R.string.reviews_search_follower_count, user.followerCount),
                color = Color(0xB3FFFFFF),
                style = MaterialTheme.typography.labelSmall,
            )
        }
        if (!user.isSelf) {
            com.tappyai.core.designsystem.component.TappyButton(
                text = stringResource(if (user.isFollowing) R.string.reviews_profile_following else R.string.reviews_profile_follow),
                onClick = onToggleFollow,
                variant = if (user.isFollowing) com.tappyai.core.designsystem.component.TappyButtonVariant.Ghost else com.tappyai.core.designsystem.component.TappyButtonVariant.Primary,
                size = com.tappyai.core.designsystem.component.TappyButtonSize.Small,
            )
        }
    }
}

@Composable
internal fun ReviewComposerHost(
    onBack: () -> Unit,
    viewModel: ReviewComposerViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
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
    // Local-only "did the user dismiss the attached-sound chip" flag — the sound itself lives in
    // the ViewModel's SavedStateHandle-derived attachedTrackId (read-only, no setter needed), so
    // this just tells submit() whether to include it, without needing a mutable copy.
    var soundIncluded by rememberSaveable { mutableStateOf(true) }

    val videoState by viewModel.videoState.collectAsStateWithLifecycle()
    val photoState by viewModel.photoState.collectAsStateWithLifecycle()
    val urlState by viewModel.urlState.collectAsStateWithLifecycle()
    // Latest body, read inside the remembered picker callback without capturing a stale value —
    // sent to /api/explore/process as the AI caption input, exactly like the web.
    val currentBody by rememberUpdatedState(body)
    // System Photo Picker, video-only — no storage permission needed (parity with the Scan screen's
    // image picker). The picked content Uri is streamed straight to the upload endpoint.
    val videoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) viewModel.onVideoPicked(uri, currentBody) }
    // Multi-image picker for the Photo tab — 6 = MAX_PHOTOS_PER_REVIEW (the VM also enforces the cap).
    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(6),
    ) { uris -> if (uris.isNotEmpty()) viewModel.onPhotosPicked(uris) }

    // Auto-fill the caption with the AI suggestion when the user hasn't typed one (matches the web,
    // which sets `body` to the AI caption only if the field is empty). Keyed on the suggestion so it
    // runs once per new suggestion and never clobbers text the user types afterward.
    LaunchedEffect(videoState.suggestedCaption) {
        val suggestion = videoState.suggestedCaption
        if (suggestion.isNotBlank() && body.isBlank()) body = suggestion
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
        onPost = { viewModel.submit(body = body, rating = rating, placeName = placeName, mode = mediaMode, includeSound = soundIncluded) },
        attachedSoundTitle = viewModel.attachedTrackTitle?.takeIf { soundIncluded },
        onRemoveSound = { soundIncluded = false },
        videoState = videoState,
        onPickVideo = {
            videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
        },
        onCancelVideo = viewModel::cancelVideoUpload,
        onRetryVideo = viewModel::retryVideoUpload,
        onRemoveVideo = viewModel::removeVideo,
        photoState = photoState,
        onPickPhotos = {
            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        },
        onRemovePhoto = viewModel::removePhoto,
        urlState = urlState,
        onUrlChange = { viewModel.onUrlChanged(it, currentBody) },
    )
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

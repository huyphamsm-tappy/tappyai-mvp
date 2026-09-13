package com.tappyai.app.reviews.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tappyai.app.reviews.data.Review

/**
 * The vertical clip pager — the block that used to live inline in [ReviewsFeedScreen], moved here
 * unchanged so a profile can page its own clips with the same card, player, rail, comment sheet
 * and analytics (web parity: the feed's Post and the profile's ClipViewer share one component).
 *
 * Owns exactly what the feed's pager owned:
 *  - [VerticalPager] over [reviews] with `beyondViewportPageCount = 1`, each page a [ReviewCard]
 *    whose `active` is the settled page (autoplay), `isMe` per row (own-post overflow);
 *  - `audioUnlocked` — clips autoplay WITH sound immediately (product requirement 2026-07-20);
 *    unlike a browser `<video>`, ExoPlayer has no muted-until-gesture restriction, so audio is on
 *    from the first frame and the single tap is play/pause only; rememberSaveable across config
 *    changes;
 *  - `commentsFor` → [ReviewCommentSheet] over the pager (the pager stays composed and on its
 *    page; the sheet's dismiss writes the server's count into that one row);
 *  - pagination on settle ([ReviewsFeedViewModel.onPageSettled]) and watch-time analytics
 *    ([ReviewsFeedViewModel.onActiveReviewChanged] / `flushWatch` on dispose) — the same behaviour
 *    as the web's behaviorTracker, driven by the settled page.
 *
 * Which rows [reviews] are — the discovery feed or one profile's clips — is the ViewModel's
 * [ReviewsFeedSource]; the pager does not know or care.
 */
@Composable
internal fun ReviewClipPager(
    reviews: List<Review>,
    pagerState: PagerState,
    currentUserId: String?,
    viewModel: ReviewsFeedViewModel,
    onAuthorClick: (String) -> Unit,
    onMusicDiscClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** ✦ Hỏi Tappy for the tapped row — the Chat prefill bridge; null hides the rail action. */
    onAskTappy: ((Review) -> Unit)? = null,
    /** Kept free under each card's overlays — the floating dock on the feed, nothing elsewhere. */
    bottomClearance: Dp = 0.dp,
) {
    val context = LocalContext.current

    // Advance pagination as the user swipes toward the end of the loaded pages.
    LaunchedEffect(pagerState.currentPage) {
        viewModel.onPageSettled(pagerState.currentPage)
    }

    var audioUnlocked by rememberSaveable { mutableStateOf(true) }

    // The clip whose comment sheet is open, or null. The sheet is drawn over the pager — the pager
    // stays composed and on its page, so closing the sheet leaves the user on the same clip and the
    // next swipe is the next clip (web parity: CommentDrawer over the feed). Only the rail's comment
    // button lands here; a tap on the clip is play/pause.
    var commentsFor by rememberSaveable { mutableStateOf<String?>(null) }

    // Watch-time analytics: when the settled clip changes (swipe or first load) finalize the previous
    // clip's watch (posts to /interact when ≥3s) and start timing the new one.
    val activeReview = reviews.getOrNull(pagerState.settledPage)
    LaunchedEffect(activeReview?.id) {
        viewModel.onActiveReviewChanged(activeReview)
    }
    DisposableEffect(Unit) {
        onDispose { viewModel.flushWatch() }
    }

    Box(modifier = modifier) {
        VerticalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
            beyondViewportPageCount = 1,
        ) { page ->
            val review = reviews[page]
            ReviewCard(
                review = review,
                isMe = currentUserId != null && review.userId == currentUserId,
                active = pagerState.settledPage == page,
                audioUnlocked = audioUnlocked,
                onVideoDuration = { viewModel.onVideoDuration(review.id, it) },
                onRequestAudioUnlock = { audioUnlocked = true },
                onLike = { viewModel.toggleLike(review) },
                onSave = { viewModel.toggleSave(review) },
                onComment = { commentsFor = review.id },
                onShare = { shareReview(context, review) },
                onAvatarClick = { onAuthorClick(review.userId) },
                onFollow = { viewModel.toggleFollow(review) },
                onDelete = { viewModel.deleteReview(review) },
                onHide = { viewModel.hideReview(review) },
                // Web parity: the disc opens the SoundSheet for the clip's attached track.
                onMusicDiscClick = review.music?.trackId
                    ?.takeIf { it.isNotBlank() }
                    ?.let { trackId -> { onMusicDiscClick(trackId) } },
                onAskTappy = onAskTappy?.let { ask -> { ask(review) } },
                bottomClearance = bottomClearance,
            )
        }
        commentsFor?.let { reviewId ->
            ReviewCommentSheet(
                reviewId = reviewId,
                onDismiss = { count ->
                    // The server's count for that one row; the pager is untouched.
                    if (count != null) viewModel.setCommentCount(reviewId, count)
                    commentsFor = null
                },
            )
        }
    }
}

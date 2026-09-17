package com.tappyai.app.reviews.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing

private val SheetBackground = Color(0xFF000000)
private val SheetScrim = Color(0x99000000)
private val SheetDragHandle = Color(0xFF666666)

/** The sheet takes this share of the screen so the clip stays visible above it, as on the web. */
private const val SHEET_HEIGHT_FRACTION = 0.75f

/**
 * The feed's comment drawer — web parity `CommentDrawer` (reviews/feedShared.tsx): a modal sheet
 * mounted INSIDE [ReviewsFeedScreen], over the still-composed [androidx.compose.foundation.pager.VerticalPager],
 * so closing it lands on the same clip and the next swipe is the next clip. Before this the rail's
 * comment button navigated to `ReviewsRoute.Detail`, a full-screen route that replaced the feed;
 * the only way on was Back (UAT 2026-09-13). Tapping the clip itself still opens Detail.
 *
 * Nothing new underneath: the list, item, reply chip, reaction picker and composer are the detail
 * screen's [reviewCommentItems]/[ReviewCommentInputBar], and the state is the detail screen's
 * [ReviewDetailViewModel], keyed per review so two clips commented on in one session don't share
 * a comment list. [onDismiss] receives the review's comment count as the server last reported it
 * (post/delete update it; null when the review is not in the repository cache) so the feed row can
 * take it — the web hands the same number back through `onAdded(id, count)`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReviewCommentSheet(
    reviewId: String,
    onDismiss: (commentCount: Int?) -> Unit,
    viewModel: ReviewDetailViewModel = hiltViewModel(key = "comments:$reviewId"),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(reviewId) { viewModel.load(reviewId) }
    val context = LocalContext.current
    val nowMillis = System.currentTimeMillis()
    // Id of the comment whose emoji picker is open (only one at a time), or null — as in Detail.
    var reactionPickerFor by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is DetailEvent.CommentFailed ->
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    val dismiss = { onDismiss(uiState.review?.commentCount) }
    ModalBottomSheet(
        onDismissRequest = dismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = SheetBackground,
        scrimColor = SheetScrim,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = TappySpacing.md)
                    .size(width = 32.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(SheetDragHandle),
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(SHEET_HEIGHT_FRACTION)
                // Same reason as ReviewDetailScreen: the window is adjustResize + edge-to-edge, so the
                // sheet consumes the IME inset itself — the composer rises above the keyboard and the
                // list above it keeps its scroll.
                .imePadding(),
        ) {
            LazyColumn(modifier = Modifier.weight(1f)) {
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

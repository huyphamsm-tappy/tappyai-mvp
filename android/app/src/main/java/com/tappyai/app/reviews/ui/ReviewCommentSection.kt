package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.reviews.data.COMMENT_REACTIONS
import com.tappyai.app.reviews.data.ReviewComment
import com.tappyai.app.reviews.data.SEED_COMMENTS
import com.tappyai.app.reviews.data.formatRelativeTime
import com.tappyai.app.reviews.data.reactionEmoji
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyMinTouchTarget
import com.tappyai.core.designsystem.theme.TappySpacing

private val CommentBackground = Color(0xFF000000)
private val CommentTextPrimary = Color(0xFFFFFFFF)
private val CommentTextSecondary = Color(0xB3FFFFFF)
private val CommentDivider = Color(0x33FFFFFF)
private val CommentHeaderText = Color(0xFFFFFFFF)
// Web parity: an active reaction turns the "React" action pink.
private val CommentReactionActive = Color(0xFFEC4899)

@Composable
internal fun ReviewCommentsHeader(count: Int) {
    Column {
        HorizontalDivider(color = CommentDivider, thickness = 0.5.dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.reviews_comments_header_title),
                color = CommentHeaderText,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "$count",
                color = CommentTextSecondary,
                fontSize = 14.sp,
            )
        }
        HorizontalDivider(color = CommentDivider, thickness = 0.5.dp)
    }
}

@Composable
internal fun ReviewCommentItem(
    comment: ReviewComment,
    nowMillis: Long,
    canDelete: Boolean = false,
    isReply: Boolean = false,
    onDelete: () -> Unit = {},
    onReply: () -> Unit = {},
    onReact: (String) -> Unit = {},
) {
    var pickerOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            // Web parity: a reply indents (`ml-10`) under its thread root.
            .padding(
                start = TappySpacing.xl + if (isReply) 40.dp else 0.dp,
                end = TappySpacing.xl,
                top = TappySpacing.lg,
                bottom = TappySpacing.lg,
            ),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        TappyAvatar(
            name = comment.profiles?.fullName ?: "",
            imageUrl = comment.profiles?.avatarUrl,
            // Replies use a smaller avatar than top-level comments (web: 26px vs 32px).
            size = if (isReply) TappyAvatarSize.Inline else TappyAvatarSize.ListRow,
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = comment.profiles?.fullName ?: stringResource(R.string.reviews_comment_default_user),
                    color = CommentTextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = formatRelativeTime(comment.createdAt, nowMillis),
                    color = CommentTextSecondary,
                    fontSize = 12.sp,
                )
            }
            Text(
                text = comment.body,
                color = CommentTextPrimary,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            // Reaction summary + React/Reply actions (web parity).
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val total = comment.reactions.values.sum()
                if (total > 0) {
                    ReactionSummary(reactions = comment.reactions, total = total)
                }
                CommentActionText(
                    text = stringResource(R.string.reviews_comment_react),
                    leadingEmoji = comment.myReaction?.let { reactionEmoji(it) },
                    highlighted = comment.myReaction != null,
                    onClick = { pickerOpen = !pickerOpen },
                )
                CommentActionText(
                    text = stringResource(R.string.reviews_comment_reply),
                    onClick = onReply,
                )
            }
            if (pickerOpen) {
                ReactionPicker(onPick = { key ->
                    onReact(key)
                    pickerOpen = false
                })
            }
        }
        // Web parity (page.tsx:130): the author can delete their own comment.
        if (canDelete) {
            IconButton(onClick = onDelete, modifier = Modifier.size(TappyMinTouchTarget)) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.reviews_comment_delete),
                    tint = CommentTextSecondary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/** A compact text action ("React"/"Reply") under a comment, with an optional leading emoji and a
 *  highlighted (pink) state when the user has an active reaction — mirrors the web action buttons. */
@Composable
private fun CommentActionText(
    text: String,
    onClick: () -> Unit,
    leadingEmoji: String? = null,
    highlighted: Boolean = false,
) {
    Row(
        modifier = Modifier.clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingEmoji != null) Text(text = leadingEmoji, fontSize = 13.sp)
        Text(
            text = text,
            color = if (highlighted) CommentReactionActive else CommentTextSecondary,
            fontSize = 12.sp,
            fontWeight = if (highlighted) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

/** Up to 3 distinct reaction emoji (most-used first) + the total count — the web summary chip. */
@Composable
private fun ReactionSummary(reactions: Map<String, Int>, total: Int) {
    val topEmoji = reactions.entries
        .sortedByDescending { it.value }
        .take(3)
        .joinToString(separator = "") { reactionEmoji(it.key) }
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = topEmoji, fontSize = 13.sp)
        Text(text = "$total", color = CommentTextSecondary, fontSize = 12.sp)
    }
}

/** Horizontal row of the 6 reaction emoji; tapping one applies it and closes the picker. */
@Composable
private fun ReactionPicker(onPick: (String) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        COMMENT_REACTIONS.forEach { (key, emoji) ->
            Text(
                text = emoji,
                fontSize = 22.sp,
                modifier = Modifier
                    .clickable { onPick(key) }
                    .padding(TappySpacing.xs),
            )
        }
    }
}

/**
 * Bottom composer bar for posting a comment — mirrors the web comment drawer's inline input + send
 * (`page.tsx:141`, maxLength 300). Send is enabled only for non-blank input within the cap; while a
 * post is in flight it shows a spinner in place of the send icon.
 */
@Composable
internal fun ReviewCommentComposer(
    value: String,
    canPost: Boolean,
    isPosting: Boolean,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    replyingToName: String? = null,
    onCancelReply: () -> Unit = {},
) {
    HorizontalDivider(color = CommentDivider, thickness = 0.5.dp)
    // Reply banner (web: "Đang trả lời {name}" + cancel) shown above the input while replying.
    if (replyingToName != null) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(CommentBackground)
                .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.reviews_comment_replying_to, replyingToName),
                color = CommentTextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onCancelReply, modifier = Modifier.size(TappyMinTouchTarget)) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.reviews_comment_reply_cancel),
                    tint = CommentTextSecondary,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(CommentBackground)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TappyTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = stringResource(R.string.reviews_comment_input_placeholder),
            modifier = Modifier.weight(1f),
        )
        IconButton(
            onClick = onSend,
            enabled = canPost,
            modifier = Modifier.size(TappyMinTouchTarget),
        ) {
            if (isPosting) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = CommentTextPrimary)
            } else {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = stringResource(R.string.reviews_comment_send),
                    tint = if (canPost) CommentTextPrimary else CommentTextSecondary,
                )
            }
        }
    }
}

internal fun LazyListScope.reviewCommentItems(
    comments: List<ReviewComment>,
    nowMillis: Long,
    currentUserId: String? = null,
    onDeleteComment: (String) -> Unit = {},
    onReplyComment: (ReviewComment) -> Unit = {},
    onReactComment: (String, String) -> Unit = { _, _ -> },
    // Web parity (reviews/page.tsx:171): the header shows the review's AUTHORITATIVE total comment
    // count, not the number of rows loaded (the fetch is capped at 50). Falls back to the loaded
    // size when the total isn't known (e.g. the preview).
    totalCount: Int? = null,
) {
    item(key = "comments-header") {
        ReviewCommentsHeader(count = totalCount ?: comments.size)
    }
    // Backend returns replies FLATTENED (non-null parent_comment_id); group client-side and render
    // each top-level comment followed by its replies (web `ReviewCommentButton.tsx`).
    val topLevel = comments.filter { it.parentCommentId == null }
    val repliesByParent = comments.filter { it.parentCommentId != null }.groupBy { it.parentCommentId }
    topLevel.forEach { parent ->
        item(key = parent.id) {
            ReviewCommentItem(
                comment = parent,
                nowMillis = nowMillis,
                canDelete = currentUserId != null && parent.userId == currentUserId,
                isReply = false,
                onDelete = { onDeleteComment(parent.id) },
                onReply = { onReplyComment(parent) },
                onReact = { key -> onReactComment(parent.id, key) },
            )
        }
        repliesByParent[parent.id]?.forEach { reply ->
            item(key = reply.id) {
                ReviewCommentItem(
                    comment = reply,
                    nowMillis = nowMillis,
                    canDelete = currentUserId != null && reply.userId == currentUserId,
                    isReply = true,
                    onDelete = { onDeleteComment(reply.id) },
                    onReply = { onReplyComment(reply) },
                    onReact = { key -> onReactComment(reply.id, key) },
                )
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 600)
@Composable
private fun ReviewCommentSectionPreview() {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .background(CommentBackground),
    ) {
        reviewCommentItems(
            comments = SEED_COMMENTS,
            nowMillis = System.currentTimeMillis(),
        )
    }
}

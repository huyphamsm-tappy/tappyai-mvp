package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.tappyai.app.reviews.data.ReviewComment
import com.tappyai.app.reviews.data.SEED_COMMENTS
import com.tappyai.app.reviews.data.formatRelativeTime
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.theme.TappySpacing

private val CommentBackground = Color(0xFF000000)
private val CommentTextPrimary = Color(0xFFFFFFFF)
private val CommentTextSecondary = Color(0xB3FFFFFF)
private val CommentDivider = Color(0x33FFFFFF)
private val CommentHeaderText = Color(0xFFFFFFFF)
private val CommentAccent = Color(0xFFFE2C55)
private val CommentPlaceholder = Color(0x66FFFFFF)
private val CommentReactionBarBg = Color(0xFF2A2A2A)
private val CommentReplyChipBg = Color(0xFF1A1A1A)

/** Backend caps a comment at 300 chars (POST /api/reviews/{id}/comments) — enforce it client-side too. */
private const val MAX_COMMENT_LEN = 300

/** Reply avatars are indented so a thread reads as nested under its parent (one-level, web parity). */
private val ReplyIndent = 36.dp

/**
 * Reaction keys paired with their emoji. Keys MUST mirror the web's `ALLOWED` set
 * (`src/app/api/comments/[commentId]/reactions/route.ts`) so a reaction added on one platform
 * renders on the other. New reactions are a one-line addition here — the backend stores free text.
 */
internal val COMMENT_REACTIONS: List<Pair<String, String>> = listOf(
    "like" to "👍",   // 👍
    "love" to "❤️",   // ❤️
    "haha" to "😂",   // 😂
    "wow" to "😮",    // 😮
    "sad" to "😢",    // 😢
    "angry" to "😡",  // 😡
)

private fun reactionEmoji(key: String): String =
    COMMENT_REACTIONS.firstOrNull { it.first == key }?.second ?: COMMENT_REACTIONS.first().second

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
    isOwn: Boolean = false,
    isReply: Boolean = false,
    showReactionPicker: Boolean = false,
    onDelete: () -> Unit = {},
    onReply: () -> Unit = {},
    onToggleReactionPicker: () -> Unit = {},
    onReact: (String) -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = TappySpacing.xl + if (isReply) ReplyIndent else 0.dp,
                end = TappySpacing.xl,
                top = TappySpacing.lg,
                bottom = TappySpacing.lg,
            ),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.Top,
    ) {
        TappyAvatar(
            name = comment.profiles?.fullName ?: "",
            imageUrl = comment.profiles?.avatarUrl,
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
            // Action row: react (+ reply on top-level) + reaction summary.
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val reactPrefix = comment.myReaction?.let { reactionEmoji(it) + " " } ?: ""
                Text(
                    text = reactPrefix + stringResource(R.string.reviews_comment_react),
                    color = if (comment.myReaction != null) CommentAccent else CommentTextSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable { onToggleReactionPicker() },
                )
                Text(
                    text = stringResource(R.string.reviews_comment_reply),
                    color = CommentTextSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable { onReply() },
                )
                val total = comment.reactions.values.sum()
                if (total > 0) {
                    val emojis = comment.reactions.entries
                        .filter { it.value > 0 }
                        .take(3)
                        .joinToString("") { reactionEmoji(it.key) }
                    Text(
                        text = "$emojis $total",
                        color = CommentTextSecondary,
                        fontSize = 12.sp,
                    )
                }
            }
            // Emoji picker, shown inline below the action row (LazyColumn-safe, no popup z-order issues).
            if (showReactionPicker) {
                Row(
                    modifier = Modifier
                        .padding(top = TappySpacing.xs)
                        .background(CommentReactionBarBg, RoundedCornerShape(20.dp))
                        .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    COMMENT_REACTIONS.forEach { (key, emoji) ->
                        Text(
                            text = emoji,
                            fontSize = 20.sp,
                            modifier = Modifier
                                .clickable { onReact(key) }
                                .padding(horizontal = 2.dp),
                        )
                    }
                }
            }
        }
        // Own-comment delete (web parity: trash on your own comments only). Server also enforces
        // ownership, so this affordance is purely to expose the action to the author.
        if (isOwn) {
            IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                Icon(
                    imageVector = Icons.Outlined.Delete,
                    contentDescription = stringResource(R.string.reviews_comment_delete),
                    tint = CommentTextSecondary,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

/**
 * Emits the comment list into a [LazyColumn]: a header, then each top-level comment immediately
 * followed by its replies (one-level threading, mirroring the web CommentDrawer). [reactionPickerFor]
 * is the id of the comment whose emoji picker is open (or null); toggling is hoisted so only one
 * picker is open at a time.
 */
internal fun LazyListScope.reviewCommentItems(
    comments: List<ReviewComment>,
    nowMillis: Long,
    currentUserId: String? = null,
    reactionPickerFor: String? = null,
    onDeleteComment: (String) -> Unit = {},
    onReply: (ReviewComment) -> Unit = {},
    onToggleReactionPicker: (String) -> Unit = {},
    onReact: (String, String) -> Unit = { _, _ -> },
) {
    item(key = "comments-header") {
        ReviewCommentsHeader(count = comments.size)
    }
    val topLevel = comments.filter { it.parentCommentId == null }
    val repliesByParent = comments.filter { it.parentCommentId != null }.groupBy { it.parentCommentId }
    topLevel.forEach { comment ->
        item(key = comment.id) {
            ReviewCommentItem(
                comment = comment,
                nowMillis = nowMillis,
                isOwn = currentUserId != null && comment.userId == currentUserId,
                isReply = false,
                showReactionPicker = reactionPickerFor == comment.id,
                onDelete = { onDeleteComment(comment.id) },
                onReply = { onReply(comment) },
                onToggleReactionPicker = { onToggleReactionPicker(comment.id) },
                onReact = { key -> onReact(comment.id, key) },
            )
        }
        repliesByParent[comment.id]?.forEach { reply ->
            item(key = reply.id) {
                ReviewCommentItem(
                    comment = reply,
                    nowMillis = nowMillis,
                    isOwn = currentUserId != null && reply.userId == currentUserId,
                    isReply = true,
                    showReactionPicker = reactionPickerFor == reply.id,
                    onDelete = { onDeleteComment(reply.id) },
                    onReply = { onReply(reply) },
                    onToggleReactionPicker = { onToggleReactionPicker(reply.id) },
                    onReact = { key -> onReact(reply.id, key) },
                )
            }
        }
    }
}

/**
 * Fixed comment composer pinned below the comment list on the detail screen. Holds its own draft
 * (rememberSaveable, survives rotation), caps input at [MAX_COMMENT_LEN] like the backend, and
 * calls [onSend] with the trimmed text — clearing the field immediately. While [isPosting] the send
 * control shows a spinner and is disabled so a double-tap can't double-post. When [replyingToName]
 * is non-null a "Replying to …" chip sits above the field (dismiss via [onCancelReply]).
 */
@Composable
internal fun ReviewCommentInputBar(
    isPosting: Boolean,
    onSend: (String) -> Unit,
    modifier: Modifier = Modifier,
    replyingToName: String? = null,
    onCancelReply: () -> Unit = {},
) {
    var draft by rememberSaveable { mutableStateOf("") }
    Column(modifier = modifier.background(CommentBackground)) {
        HorizontalDivider(color = CommentDivider, thickness = 0.5.dp)
        if (replyingToName != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CommentReplyChipBg)
                    .padding(start = TappySpacing.xl, end = TappySpacing.md, top = TappySpacing.xs, bottom = TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.reviews_comment_replying_to, replyingToName),
                    color = CommentTextSecondary,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onCancelReply, modifier = Modifier.size(28.dp)) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = stringResource(R.string.reviews_comment_cancel_reply),
                        tint = CommentTextSecondary,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            TextField(
                value = draft,
                onValueChange = { if (it.length <= MAX_COMMENT_LEN) draft = it },
                placeholder = {
                    Text(
                        text = stringResource(R.string.reviews_comment_input_hint),
                        color = CommentPlaceholder,
                        fontSize = 14.sp,
                    )
                },
                singleLine = true,
                colors = TextFieldDefaults.colors(
                    focusedTextColor = CommentTextPrimary,
                    unfocusedTextColor = CommentTextPrimary,
                    cursorColor = CommentAccent,
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                modifier = Modifier.weight(1f),
            )
            val canSend = draft.isNotBlank() && !isPosting
            IconButton(
                onClick = {
                    val text = draft.trim()
                    if (text.isNotEmpty()) {
                        onSend(text)
                        draft = ""
                    }
                },
                enabled = canSend,
            ) {
                if (isPosting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = CommentAccent)
                } else {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.reviews_comment_send),
                        tint = if (canSend) CommentAccent else CommentTextSecondary,
                    )
                }
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

package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
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

/** Backend caps a comment at 300 chars (POST /api/reviews/{id}/comments) — enforce it client-side too. */
private const val MAX_COMMENT_LEN = 300

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
internal fun ReviewCommentItem(comment: ReviewComment, nowMillis: Long) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        TappyAvatar(
            name = comment.profiles?.fullName ?: "",
            imageUrl = comment.profiles?.avatarUrl,
            size = TappyAvatarSize.ListRow,
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
        }
    }
}

internal fun LazyListScope.reviewCommentItems(
    comments: List<ReviewComment>,
    nowMillis: Long,
) {
    item(key = "comments-header") {
        ReviewCommentsHeader(count = comments.size)
    }
    items(items = comments, key = { it.id }) { comment ->
        ReviewCommentItem(comment = comment, nowMillis = nowMillis)
    }
}

/**
 * Fixed comment composer pinned below the comment list on the detail screen. Holds its own draft
 * (rememberSaveable, survives rotation), caps input at [MAX_COMMENT_LEN] like the backend, and
 * calls [onSend] with the trimmed text — clearing the field immediately. While [isPosting] the send
 * control shows a spinner and is disabled so a double-tap can't double-post.
 */
@Composable
internal fun ReviewCommentInputBar(
    isPosting: Boolean,
    onSend: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var draft by rememberSaveable { mutableStateOf("") }
    Column(modifier = modifier.background(CommentBackground)) {
        HorizontalDivider(color = CommentDivider, thickness = 0.5.dp)
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

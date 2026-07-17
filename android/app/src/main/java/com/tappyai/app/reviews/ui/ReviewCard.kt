package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.ChatBubble
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.app.reviews.data.isShareOnlyName
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyMinTouchTarget

// -- Review always-dark palette --------------------------------------------------
private val ReviewBackground = Color(0xFF000000)
private val ReviewBackgroundGradient = Color(0xFF1F2937)
private val ReviewTextPrimary = Color(0xFFFFFFFF)
private val ReviewTextSecondary = Color(0xE6FFFFFF)
private val ReviewIconMuted = Color(0xCCFFFFFF)
private val ReviewLabelColor = Color(0xFFFFFFFF)
private val ReviewGradientTop = Color(0xCC000000)
private val ReviewGradientBottom = Color(0x33000000)
private val ReviewOverlayDark = Color(0x80000000)
private val ReviewOverlayBorder = Color(0x4DFFFFFF)
private val LikeRed = Color(0xFFFE2C55)
private val SaveAmber = Color(0xFFFBBF24)
private val StarAmber = Color(0xFFF59E0B)

@Composable
fun ReviewCard(
    review: Review,
    isMe: Boolean,
    onLike: () -> Unit,
    onSave: () -> Unit,
    onComment: () -> Unit,
    onShare: () -> Unit,
    onAvatarClick: () -> Unit,
    onDelete: () -> Unit,
    onHide: () -> Unit,
    modifier: Modifier = Modifier,
    onMusicDiscClick: (() -> Unit)? = null,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ReviewBackground),
    ) {
        ReviewMediaBackground(review = review)

        if (isMe) {
            ReviewOverflowMenu(
                onDelete = onDelete,
                onHide = onHide,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = 16.dp, top = 48.dp),
            )
        }

        ReviewActionRail(
            review = review,
            onAvatarClick = onAvatarClick,
            onLike = onLike,
            onComment = onComment,
            onSave = onSave,
            onShare = onShare,
            onMusicDiscClick = onMusicDiscClick,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 12.dp, bottom = 96.dp),
        )

        ReviewBottomOverlay(
            review = review,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 12.dp, end = 80.dp, bottom = 80.dp),
        )
    }
}

@Composable
private fun ReviewMediaBackground(review: Review) {
    Box(modifier = Modifier.fillMaxSize()) {
        when {
            review.contentType == ReviewContentType.Video -> {
                ReviewVideoPlaceholder(thumbnail = review.thumbnail)
            }
            !review.photos.isNullOrEmpty() -> {
                if (review.photos.size == 1) {
                    TappyImage(
                        url = review.photos[0],
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    ReviewPhotoCarousel(
                        photos = review.photos,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            else -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                colors = listOf(ReviewBackgroundGradient, ReviewBackground),
                                start = Offset(0f, 0f),
                                end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                            ),
                        ),
                )
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.0f to ReviewGradientTop,
                        0.3f to Color.Transparent,
                        1.0f to ReviewGradientBottom,
                    ),
                ),
        )
    }
}

@Composable
private fun ReviewVideoPlaceholder(thumbnail: String?) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        if (thumbnail != null) {
            TappyImage(
                url = thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(ReviewBackground),
            )
        }
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = ReviewIconMuted,
            modifier = Modifier.size(64.dp),
        )
    }
}

@Composable
private fun ReviewActionRail(
    review: Review,
    onAvatarClick: () -> Unit,
    onLike: () -> Unit,
    onComment: () -> Unit,
    onSave: () -> Unit,
    onShare: () -> Unit,
    onMusicDiscClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Box(
            modifier = Modifier.clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onAvatarClick,
            ),
            contentAlignment = Alignment.BottomCenter,
        ) {
            TappyAvatar(
                name = review.profiles?.fullName ?: "",
                imageUrl = review.profiles?.avatarUrl,
                size = TappyAvatarSize.HeaderUser,
                modifier = Modifier.size(48.dp),
            )
        }

        ReviewActionButton(
            icon = if (review.likedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            label = review.likeCount.toString(),
            tint = if (review.likedByMe) LikeRed else ReviewTextPrimary,
            onClick = onLike,
        )

        ReviewActionButton(
            icon = Icons.Outlined.ChatBubble,
            label = review.commentCount.toString(),
            tint = ReviewTextPrimary,
            onClick = onComment,
        )

        ReviewActionButton(
            icon = if (review.savedByMe) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
            label = stringResource(R.string.reviews_action_save),
            tint = if (review.savedByMe) SaveAmber else ReviewTextPrimary,
            onClick = onSave,
        )

        ReviewActionButton(
            icon = Icons.Filled.Share,
            label = stringResource(R.string.reviews_action_share),
            tint = ReviewTextPrimary,
            onClick = onShare,
        )

        if (review.music?.origin != null && onMusicDiscClick != null) {
            ReviewMusicDiscIcon(onClick = onMusicDiscClick)
        }
    }
}

@Composable
private fun ReviewActionButton(
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        // The visual icon+label stack stays its natural size; this only grows the invisible tap
        // target to the app's 48dp floor — the most-tapped surface in the app (main feed's
        // like/comment/save/share row) was previously as narrow as its 28dp icon.
        modifier = Modifier
            .defaultMinSize(minWidth = TappyMinTouchTarget, minHeight = TappyMinTouchTarget)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = label,
            color = ReviewLabelColor,
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun ReviewMusicDiscIcon(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(ReviewOverlayDark)
            .drawBehind {
                drawCircle(
                    color = ReviewOverlayBorder,
                    radius = size.minDimension / 2,
                    style = Stroke(width = 2.dp.toPx()),
                )
            }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.MusicNote,
            contentDescription = null,
            tint = ReviewTextPrimary,
            modifier = Modifier.size(16.dp),
        )
    }
}

@Composable
private fun ReviewBottomOverlay(
    review: Review,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        val displayName = review.profiles?.fullName
        if (displayName != null) {
            val handle = "@${displayName.lowercase().replace(" ", ".")}"
            Text(
                text = handle,
                color = ReviewTextPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(6.dp))
        }

        if (review.body.isNotBlank()) {
            Text(
                text = review.body,
                color = ReviewTextPrimary,
                fontSize = 14.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 18.sp,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        if (!isShareOnlyName(review.placeName)) {
            ReviewPlaceChip(
                placeName = review.placeName,
                rating = review.rating,
            )
        }
    }
}

@Composable
private fun ReviewPlaceChip(
    placeName: String,
    rating: Int,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = Icons.Filled.LocationOn,
            contentDescription = null,
            tint = ReviewIconMuted,
            modifier = Modifier.size(14.dp),
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = placeName,
            color = ReviewTextSecondary,
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (rating > 0) {
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "★".repeat(rating),
                color = StarAmber,
                fontSize = 12.sp,
            )
        }
    }
}

// -- Previews: one per review type -----------------------------------------------

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewCardSinglePhotoPreview() {
    ReviewCard(
        review = SEED_REVIEWS[2],
        isMe = false,
        onLike = {}, onSave = {}, onComment = {}, onShare = {},
        onAvatarClick = {}, onDelete = {}, onHide = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewCardCarouselPreview() {
    ReviewCard(
        review = SEED_REVIEWS[0],
        isMe = false,
        onLike = {}, onSave = {}, onComment = {}, onShare = {},
        onAvatarClick = {}, onDelete = {}, onHide = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewCardVideoPreview() {
    ReviewCard(
        review = SEED_REVIEWS[1],
        isMe = false,
        onLike = {}, onSave = {}, onComment = {}, onShare = {},
        onAvatarClick = {}, onDelete = {}, onHide = {},
        onMusicDiscClick = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewCardTextOnlyPreview() {
    ReviewCard(
        review = SEED_REVIEWS[3],
        isMe = true,
        onLike = {}, onSave = {}, onComment = {}, onShare = {},
        onAvatarClick = {}, onDelete = {}, onHide = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewCardShareOnlyPreview() {
    ReviewCard(
        review = SEED_REVIEWS[7],
        isMe = false,
        onLike = {}, onSave = {}, onComment = {}, onShare = {},
        onAvatarClick = {}, onDelete = {}, onHide = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewCardMusicPreview() {
    ReviewCard(
        review = SEED_REVIEWS[6],
        isMe = false,
        onLike = {}, onSave = {}, onComment = {}, onShare = {},
        onAvatarClick = {}, onDelete = {}, onHide = {},
        onMusicDiscClick = {},
    )
}

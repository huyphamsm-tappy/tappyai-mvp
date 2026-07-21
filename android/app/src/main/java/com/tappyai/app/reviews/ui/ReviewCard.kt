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
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay

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
    // Feed video playback: [active] is true only for the current pager page (drives autoplay);
    // [audioUnlocked] follows the feed's first-tap audio permission; [onVideoDuration] reports the
    // clip length (seconds) for watch analytics; [onRequestAudioUnlock] fires on a tap of the clip.
    active: Boolean = false,
    audioUnlocked: Boolean = false,
    onVideoDuration: (Float) -> Unit = {},
    onRequestAudioUnlock: () -> Unit = {},
) {
    // Feed gestures (mirrors the web Post gesture layer): single-tap toggles play/pause (and unlocks
    // audio on first tap), double-tap likes + shows a center heart-pop burst. Reset per review so a
    // recycled pager page doesn't inherit the previous clip's paused/burst state.
    var paused by remember(review.id) { mutableStateOf(false) }
    var heartBurstKey by remember(review.id) { mutableIntStateOf(0) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ReviewBackground),
    ) {
        ReviewMediaBackground(
            review = review,
            active = active,
            audioUnlocked = audioUnlocked,
            paused = paused,
            onVideoDuration = onVideoDuration,
            onRequestAudioUnlock = onRequestAudioUnlock,
        )

        // Tap/double-tap layer. Sits above the media but below the action rail/overflow (composed
        // after), so the rail's own buttons still receive their taps. detectTapGestures passes drag
        // events through, so the vertical pager and photo carousel underneath keep working.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(review.id) {
                    detectTapGestures(
                        onTap = {
                            onRequestAudioUnlock()
                            paused = !paused
                        },
                        onDoubleTap = {
                            if (!review.likedByMe) onLike()
                            heartBurstKey++
                        },
                    )
                },
        )

        if (paused && review.contentType == ReviewContentType.Video) {
            // Circular badge (mirrors web: w-16 h-16 bg-white/20 rounded-full + solid white play
            // icon) so the pause indicator stays visible over bright video frames.
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(32.dp),
                )
            }
        }

        HeartBurst(triggerKey = heartBurstKey, modifier = Modifier.align(Alignment.Center))

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
            onAuthorClick = onAvatarClick,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 12.dp, end = 80.dp, bottom = 80.dp),
        )
    }
}

@Composable
private fun ReviewMediaBackground(
    review: Review,
    active: Boolean,
    audioUnlocked: Boolean,
    paused: Boolean,
    onVideoDuration: (Float) -> Unit,
    onRequestAudioUnlock: () -> Unit,
) {
    val videoUrl = review.mediaUrl
    Box(modifier = Modifier.fillMaxSize()) {
        when {
            review.contentType == ReviewContentType.Video && videoUrl != null -> {
                ReviewFeedVideo(
                    mediaUrl = videoUrl,
                    thumbnail = review.thumbnail,
                    sourceType = review.sourceType,
                    sourceUrl = review.sourceUrl,
                    active = active,
                    audioUnlocked = audioUnlocked,
                    paused = paused,
                    onDuration = onVideoDuration,
                    onRequestAudioUnlock = onRequestAudioUnlock,
                )
            }
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

/**
 * Center heart-pop burst shown on a double-tap like — mirrors the web's `animate-heart-pop`
 * (`heartPop` keyframes: scale 0.8→1.3→1.0 while fading in, then fade out; ~0.7s total). Composed
 * unconditionally (Animatable/effect are stable); the icon only draws while the burst is visible.
 */
@Composable
private fun HeartBurst(triggerKey: Int, modifier: Modifier = Modifier) {
    val scale = remember { Animatable(1f) }
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(triggerKey) {
        if (triggerKey == 0) return@LaunchedEffect
        alpha.snapTo(1f)
        scale.snapTo(0.8f)
        scale.animateTo(1.3f, animationSpec = tween(150))
        scale.animateTo(1.0f, animationSpec = tween(180))
        delay(200)
        alpha.animateTo(0f, animationSpec = tween(220))
    }
    if (alpha.value > 0f) {
        Icon(
            imageVector = Icons.Filled.Favorite,
            contentDescription = null,
            tint = LikeRed,
            modifier = modifier
                .size(112.dp)
                .graphicsLayer {
                    scaleX = scale.value
                    scaleY = scale.value
                    this.alpha = alpha.value
                },
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
    onAuthorClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        val displayName = review.profiles?.fullName
        if (displayName != null) {
            val handle = "@${displayName.lowercase().replace(" ", ".")}"
            // Web parity: the author handle (like the avatar) opens the author's profile
            // (web feed links avatar + handle to /users/[id]).
            Text(
                text = handle,
                color = ReviewTextPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable(onClick = onAuthorClick),
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

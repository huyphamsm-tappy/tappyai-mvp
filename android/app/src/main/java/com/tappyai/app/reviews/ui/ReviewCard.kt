package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.explore.ExploreV3
import com.tappyai.app.explore.compactCount
import com.tappyai.app.ProductFlags
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
private val ReviewIconMuted = Color(0xCCFFFFFF)
private val ReviewLabelColor = Color(0xFFFFFFFF)
private val ReviewGradientTop = Color(0x99000000)
private val ReviewGradientBottom = Color(0x99000000)
private val LikeRed = Color(0xFFFE2C55)
private val SaveAmber = Color(0xFFFBBF24)

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
    /**
     * ✦ Hỏi Tappy (reference design): opens Chat pre-filled with a question about THIS clip —
     * the web's `/chat?q=` bridge (`bridge.promptEntity`, AskTappyButton.tsx). Null hides it.
     */
    onAskTappy: (() -> Unit)? = null,
    /**
     * The rail avatar's "+" badge: follow / unfollow this post's author directly, staying on the
     * clip (`POST /api/users/{id}/follow`). Null hides the badge (Detail, previews).
     */
    onFollow: (() -> Unit)? = null,
    /**
     * The like COUNT's own tap (web `LikeListSheet`, 2026-09-17): who those people are. It is the
     * number's control, never the heart's — the heart stays [onLike]. Null leaves the count inert.
     */
    onOpenLikes: (() -> Unit)? = null,
    /** Space kept free under the rail and the caption — the floating dock's height on the feed. */
    bottomClearance: Dp = 0.dp,
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
            // Circular badge (web: bg-white/20 rounded-full + solid white play icon) so the pause
            // indicator stays visible over bright video frames; sized as the V3 mockup draws it.
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(40.dp),
                )
            }
        }

        HeartBurst(triggerKey = heartBurstKey, modifier = Modifier.align(Alignment.Center))

        // Reference design ("TappyAI — Immersive AI Discovery"): everything floats over the
        // full-bleed video. The rail hugs the right edge and ends above the dock; the creator
        // block sits bottom-left at the same baseline; the content block (place pill, title,
        // description) sits above the creator block, left, mid-lower screen.
        ReviewActionRail(
            review = review,
            isMe = isMe,
            onAvatarClick = onAvatarClick,
            onFollow = onFollow,
            onLike = onLike,
            onOpenLikes = onOpenLikes,
            onComment = onComment,
            onAskTappy = onAskTappy,
            onShare = onShare,
            onSave = onSave,
            onDelete = onDelete,
            onHide = onHide,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 12.dp, bottom = bottomClearance + 56.dp),
        )

        // Owner revision (approved mockup, 2026-09-13): the caption is NOT a headline over the
        // middle of the clip — it sits lower-left with the creator: place pill (when the post has a
        // real place), avatar + handle, the caption on two lines, then the sound pill. The centre
        // of the video stays clear.
        ReviewCreatorBlock(
            review = review,
            onAuthorClick = onAvatarClick,
            onSoundClick = onMusicDiscClick,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 16.dp, end = 96.dp, bottom = bottomClearance + 40.dp),
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
                        0.28f to Color.Transparent,
                        0.55f to Color.Transparent,
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

/**
 * The floating interaction rail of the reference design, top to bottom: the creator's avatar
 * (ring + "+" — opens the author's profile, where the real Follow button lives; the feed rows
 * carry no follow state), Like with its count, Comment with its count, ✦ Hỏi Tappy with the
 * accent ring, Share, and More. Each action is a translucent circle with a white glyph and a
 * restrained label; only Hỏi Tappy carries the accent.
 *
 * More holds what the reference has no slot for but the product has: Save / Unsave (the feed's
 * only save entry, `saved_by_me` is real) and, on the viewer's own post, Delete and Hide (the
 * overflow that used to sit top-right). Share draws no number — the model has no share count.
 */
@Composable
private fun ReviewActionRail(
    review: Review,
    isMe: Boolean,
    onAvatarClick: () -> Unit,
    onFollow: (() -> Unit)?,
    onLike: () -> Unit,
    onOpenLikes: (() -> Unit)?,
    onComment: () -> Unit,
    onAskTappy: (() -> Unit)?,
    onShare: () -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onHide: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RailAvatar(review = review, isMe = isMe, onClick = onAvatarClick, onFollow = onFollow)

        RailAction(
            icon = if (review.likedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            label = compactCount(review.likeCount),
            tint = if (review.likedByMe) LikeRed else ReviewTextPrimary,
            onClick = onLike,
            onLabelClick = onOpenLikes,
        )

        RailAction(
            icon = Icons.Outlined.ChatBubbleOutline,
            label = compactCount(review.commentCount),
            tint = ReviewTextPrimary,
            onClick = onComment,
        )

        if (onAskTappy != null) {
            RailAction(
                icon = null,
                label = stringResource(R.string.reviews_ask_tappy),
                tint = ReviewTextPrimary,
                onClick = onAskTappy,
                accent = true,
            )
        }

        RailAction(
            icon = Icons.AutoMirrored.Filled.Reply,
            label = stringResource(R.string.reviews_action_share),
            tint = ReviewTextPrimary,
            onClick = onShare,
            // Reply's arrow curves left; the share arrow of the reference curves right.
            iconModifier = Modifier.graphicsLayer { scaleX = -1f },
        )

        RailMore(
            savedByMe = review.savedByMe,
            isMe = isMe,
            onSave = onSave,
            onDelete = onDelete,
            onHide = onHide,
        )
    }
}

/**
 * The creator's avatar at the top of the rail: accent ring, and the small accent badge overlapping
 * its lower edge. Two actions, kept apart: the AVATAR opens the creator's profile; the BADGE is
 * the direct Follow — "+" when the viewer does not follow the author yet, a check once they do
 * (tap again to unfollow, the same toggle the profile screen's button uses). The badge is not
 * drawn on the viewer's own post: nobody follows themselves.
 */
@Composable
private fun RailAvatar(review: Review, isMe: Boolean, onClick: () -> Unit, onFollow: (() -> Unit)?) {
    val name = review.profiles?.fullName ?: stringResource(R.string.reviews_anonymous_name)
    val following = review.isFollowingAuthor
    Box(
        modifier = Modifier.size(width = 52.dp, height = 60.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(
            modifier = Modifier
                .size(50.dp)
                .clip(CircleShape)
                .background(ExploreV3.Purple)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClickLabel = stringResource(R.string.reviews_creator_open_profile, name),
                    onClick = onClick,
                )
                .padding(2.dp),
            contentAlignment = Alignment.Center,
        ) {
            TappyAvatar(
                name = name,
                imageUrl = review.profiles?.avatarUrl,
                size = TappyAvatarSize.HeaderUser,
                modifier = Modifier.fillMaxSize().clip(CircleShape),
            )
        }
        if (!isMe && onFollow != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(if (following) ExploreV3.Surface else ExploreV3.Purple)
                    .border(2.dp, if (following) ExploreV3.Purple else ReviewBackground, CircleShape)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClickLabel = stringResource(if (following) R.string.reviews_profile_following else R.string.reviews_profile_follow),
                        onClick = onFollow,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (following) Icons.Filled.Check else Icons.Filled.Add,
                    contentDescription = null,
                    tint = ReviewTextPrimary,
                    modifier = Modifier.size(13.dp),
                )
            }
        }
    }
}

/**
 * One rail action: a 48dp translucent circle (thin light border) with the glyph, the label under
 * it. [accent] is the ✦ Hỏi Tappy treatment — the accent ring and a soft halo — and nothing else
 * glows.
 */
@Composable
private fun RailAction(
    /** The glyph; null draws the ✦ spark (Hỏi Tappy). */
    icon: ImageVector?,
    label: String,
    tint: Color,
    onClick: () -> Unit,
    iconModifier: Modifier = Modifier,
    accent: Boolean = false,
    /** A tap on the LABEL alone, when the number has a behaviour of its own (the like list). */
    onLabelClick: (() -> Unit)? = null,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .defaultMinSize(minWidth = TappyMinTouchTarget, minHeight = TappyMinTouchTarget)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .then(if (accent) Modifier.drawBehind { drawCircle(color = ExploreV3.Glow, radius = size.minDimension / 2 + 6.dp.toPx()) } else Modifier)
                .clip(CircleShape)
                .background(ExploreV3.Glass)
                .border(if (accent) 1.5.dp else 1.dp, if (accent) ExploreV3.Purple else ExploreV3.GlassBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (accent) ExploreV3.OnSurface else tint,
                    modifier = iconModifier.size(24.dp),
                )
            } else {
                Text(text = "✦", color = ExploreV3.OnSurface, fontSize = 22.sp, lineHeight = 22.sp)
            }
        }
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = label,
            color = ReviewLabelColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = if (onLabelClick != null) Modifier
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClickLabel = label, onClick = onLabelClick)
                .padding(horizontal = 6.dp) else Modifier,
        )
    }
}

/** The rail's last action — "•••" — with the menu: Save/Unsave, and Delete/Hide on an own post. */
@Composable
private fun RailMore(
    savedByMe: Boolean,
    isMe: Boolean,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onHide: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        RailAction(
            icon = Icons.Filled.MoreHoriz,
            label = stringResource(R.string.reviews_action_more),
            tint = ReviewTextPrimary,
            onClick = { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(if (savedByMe) R.string.reviews_action_unsave else R.string.reviews_action_save)) },
                leadingIcon = { Icon(if (savedByMe) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder, contentDescription = null, tint = if (savedByMe) SaveAmber else Color.Unspecified) },
                onClick = { expanded = false; onSave() },
            )
            if (isMe) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.reviews_overflow_hide_post)) },
                    leadingIcon = { Icon(Icons.Filled.VisibilityOff, contentDescription = null) },
                    onClick = { expanded = false; onHide() },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.reviews_overflow_delete_post), color = LikeRed) },
                    leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = LikeRed) },
                    onClick = { expanded = false; onDelete() },
                )
            }
        }
    }
}

/**
 * The place pill of the lower-left block — `place_address` when the row has one, else the place
 * name; nothing for a post without a real place (`isShareOnlyName`). No field is invented.
 */
@Composable
private fun ReviewPlacePill(review: Review) {
    if (isShareOnlyName(review.placeName)) return
    val pill = if (!review.placeAddress.isNullOrBlank()) review.placeAddress else review.placeName
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(ExploreV3.Glass)
            .border(1.dp, ExploreV3.GlassBorder, RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = ReviewTextPrimary, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = pill,
            color = ReviewTextPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 220.dp),
        )
    }
}

/**
 * The lower-left block (approved mockup): the place pill when the post has a real place, the small
 * avatar beside the handle, the caption on at most two lines, then the sound pill — "Âm thanh gốc
 * - handle" for a clip that is its own sound, "Âm thanh đính kèm" for a borrowed track — which
 * opens the existing SoundSheet, as the rail's music disc used to. No verified badge: the profile
 * row carries no verification, so none is drawn. The caption is drawn once, here.
 *
 * Web parity: the avatar and the handle both open the author's profile.
 */
@Composable
private fun ReviewCreatorBlock(
    review: Review,
    onAuthorClick: () -> Unit,
    onSoundClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val displayName = review.profiles?.fullName
    Column(modifier = modifier) {
        ReviewPlacePill(review = review)
        if (!isShareOnlyName(review.placeName)) Spacer(modifier = Modifier.height(12.dp))
        if (displayName != null) {
            val handle = "@${displayName.lowercase().replace(" ", ".")}"
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onAuthorClick,
                ),
            ) {
                TappyAvatar(
                    name = displayName,
                    imageUrl = review.profiles?.avatarUrl,
                    size = TappyAvatarSize.HeaderUser,
                    modifier = Modifier
                        .size(36.dp)
                        .border(1.5.dp, ReviewTextPrimary, CircleShape),
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = handle,
                    color = ReviewTextPrimary,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (review.body.isNotBlank()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = review.body.trim(),
                color = ReviewTextPrimary,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val music = review.music
        // Gated with [ProductFlags.SHOW_MUSIC]: this pill is the entry point to the sound page,
        // so while Music is hidden the clip carries no music affordance at all (web parity with
        // the gated `ReviewMusicDisc`).
        if (ProductFlags.SHOW_MUSIC && music?.origin != null && onSoundClick != null) {
            val handleForSound = displayName?.lowercase()?.replace(" ", ".")
            val label = if (music.origin == "original" && handleForSound != null) {
                stringResource(R.string.reviews_sound_original, handleForSound)
            } else {
                stringResource(R.string.reviews_sound_attached)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ExploreV3.Glass)
                    .border(1.dp, ExploreV3.GlassBorder, RoundedCornerShape(50))
                    .clickable(onClick = onSoundClick)
                    .padding(start = 12.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
            ) {
                Icon(Icons.Filled.MusicNote, contentDescription = null, tint = ReviewTextPrimary, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = label,
                    color = ReviewTextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 200.dp),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(text = "›", color = ExploreV3.OnVideoMuted, fontSize = 16.sp)
            }
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

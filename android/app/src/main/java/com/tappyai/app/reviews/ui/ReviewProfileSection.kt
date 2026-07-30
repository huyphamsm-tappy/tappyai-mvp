package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.app.reviews.data.SEED_PROFILES
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing

private val ProfileBackground = Color(0xFF000000)
private val ProfileTextPrimary = Color(0xFFFFFFFF)
private val ProfileTextSecondary = Color(0xB3FFFFFF)
private val ProfileStatValue = Color(0xFFFFFFFF)
private val ProfileStatLabel = Color(0x99FFFFFF)
private val ProfileDivider = Color(0x1AFFFFFF)
private val ProfileStarColor = Color(0xFFFBBF24)
private val ProfileTileBackground = Color(0xFF111111)

@Composable
internal fun ReviewProfileHeader(
    profile: ReviewProfile,
    reviewCount: Int,
    isFollowLoading: Boolean,
    onToggleFollow: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val displayName = profile.fullName ?: stringResource(R.string.reviews_anonymous_name)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        TappyAvatar(
            name = displayName,
            imageUrl = profile.avatarUrl,
            size = TappyAvatarSize.ProfileHero,
        )

        Text(
            text = displayName,
            color = ProfileTextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        // Web parity (users/[id]/page.tsx): Reviews / Followers / Following.
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.huge),
        ) {
            ProfileStat(value = reviewCount.toString(), label = stringResource(R.string.reviews_profile_stat_reviews))
            ProfileStat(value = profile.followerCount.toString(), label = stringResource(R.string.reviews_profile_stat_followers))
            ProfileStat(value = profile.followingCount.toString(), label = stringResource(R.string.reviews_profile_stat_following_count))
        }

        // Follow / Following button — hidden for one's own profile (web `!profile.is_self`).
        if (!profile.isSelf) {
            TappyButton(
                text = stringResource(
                    if (profile.isFollowing) R.string.reviews_profile_following else R.string.reviews_profile_follow,
                ),
                onClick = onToggleFollow,
                variant = if (profile.isFollowing) TappyButtonVariant.Secondary else TappyButtonVariant.Primary,
                enabled = !isFollowLoading,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ProfileStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            color = ProfileStatValue,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            color = ProfileStatLabel,
            fontSize = 12.sp,
        )
    }
}

@Composable
/**
 * A single 9:16 clip/photo grid tile — matches the web ProfileTab grid (poster = photo → thumbnail
 * → dark placeholder, with a bottom gradient overlay carrying the place name + stars). Replaces the
 * old full-width text row so a profile of clips shows the video thumbnails, not captions.
 */
internal fun RowScope.ReviewProfileGridTile(
    review: Review,
    onClick: () -> Unit,
) {
    val poster = review.photos?.firstOrNull() ?: review.thumbnail
    Box(
        modifier = Modifier
            .weight(1f)
            .aspectRatio(9f / 16f)
            .background(ProfileTileBackground)
            .clickable(onClick = onClick),
    ) {
        if (poster != null) {
            TappyImage(
                url = poster,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC000000))),
                )
                .padding(horizontal = 6.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            if (review.placeName.isNotBlank()) {
                Text(
                    text = review.placeName,
                    color = ProfileTextPrimary,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (review.rating > 0) {
                Text(
                    text = "★".repeat(review.rating),
                    color = ProfileStarColor,
                    fontSize = 8.sp,
                )
            }
        }
    }
}

internal fun LazyListScope.reviewProfileItems(
    profile: ReviewProfile,
    reviews: List<Review>,
    onReviewClick: (Review) -> Unit,
    isFollowLoading: Boolean = false,
    onToggleFollow: () -> Unit = {},
) {
    item(key = "profile-header") {
        ReviewProfileHeader(
            profile = profile,
            // Backend count is authoritative; fall back to the loaded page size when unknown
            // (e.g. profile resolved from an embedded review author rather than GET /api/users).
            reviewCount = profile.reviewCount.takeIf { it > 0 } ?: reviews.size,
            isFollowLoading = isFollowLoading,
            onToggleFollow = onToggleFollow,
        )
    }

    item(key = "profile-divider") {
        HorizontalDivider(color = ProfileDivider, thickness = 0.5.dp)
    }

    if (reviews.isEmpty()) {
        item(key = "profile-empty") {
            TappyEmptyState(
                icon = Icons.Filled.RateReview,
                title = stringResource(R.string.reviews_profile_empty_title),
                message = stringResource(R.string.reviews_profile_empty_message),
            )
        }
    } else {
        // Web parity (ProfileTab): a 3-up grid of clip/photo tiles, not a text list. Rendered as
        // chunked rows inside the existing LazyColumn so the profile header scrolls with the grid.
        items(items = reviews.chunked(3), key = { row -> row.first().id }) { rowReviews ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 1.dp),
                horizontalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                rowReviews.forEach { review ->
                    ReviewProfileGridTile(review = review, onClick = { onReviewClick(review) })
                }
                // Keep tiles their true 1/3 width when the last row is partial.
                repeat(3 - rowReviews.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 700)
@Composable
private fun ProfileWithReviewsPreview() {
    val userReviews = SEED_REVIEWS.filter { it.userId == "user-001" }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(ProfileBackground),
    ) {
        reviewProfileItems(
            profile = SEED_PROFILES[0],
            reviews = userReviews,
            onReviewClick = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 500)
@Composable
private fun ProfileEmptyPreview() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(ProfileBackground),
    ) {
        reviewProfileItems(
            profile = SEED_PROFILES[5],
            reviews = emptyList(),
            onReviewClick = {},
        )
    }
}

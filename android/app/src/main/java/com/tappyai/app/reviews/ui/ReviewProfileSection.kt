package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.graphics.Color
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
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.theme.TappySpacing

private val ProfileBackground = Color(0xFF000000)
private val ProfileTextPrimary = Color(0xFFFFFFFF)
private val ProfileTextSecondary = Color(0xB3FFFFFF)
private val ProfileStatValue = Color(0xFFFFFFFF)
private val ProfileStatLabel = Color(0x99FFFFFF)
private val ProfileDivider = Color(0x1AFFFFFF)
private val ProfileReviewBody = Color(0xB3FFFFFF)
private val ProfileReviewPlace = Color(0x66FFFFFF)
private val ProfileStarColor = Color(0xFFFBBF24)

@Composable
internal fun ReviewProfileHeader(
    profile: ReviewProfile,
    reviewCount: Int,
    totalLikes: Int,
    totalSaves: Int,
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

        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.huge),
        ) {
            ProfileStat(value = reviewCount.toString(), label = stringResource(R.string.reviews_profile_stat_posts))
            ProfileStat(value = totalLikes.toString(), label = stringResource(R.string.reviews_profile_stat_likes))
            ProfileStat(value = totalSaves.toString(), label = stringResource(R.string.reviews_profile_stat_saves))
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
internal fun ReviewProfileReviewItem(
    review: Review,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = review.placeName,
                color = ProfileTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (review.rating > 0) {
                Text(
                    text = "${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}",
                    color = ProfileStarColor,
                    fontSize = 12.sp,
                )
            }
        }

        Text(
            text = review.body,
            color = ProfileReviewBody,
            fontSize = 13.sp,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )

        if (review.placeAddress != null) {
            Text(
                text = review.placeAddress,
                color = ProfileReviewPlace,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

internal fun LazyListScope.reviewProfileItems(
    profile: ReviewProfile,
    reviews: List<Review>,
    onReviewClick: (Review) -> Unit,
) {
    item(key = "profile-header") {
        ReviewProfileHeader(
            profile = profile,
            reviewCount = reviews.size,
            totalLikes = reviews.sumOf { it.likeCount },
            totalSaves = reviews.sumOf { it.saveCount ?: 0 },
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
        items(items = reviews, key = { it.id }) { review ->
            ReviewProfileReviewItem(
                review = review,
                onClick = { onReviewClick(review) },
            )
            HorizontalDivider(color = ProfileDivider, thickness = 0.5.dp)
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

package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

private val SelfBackground = Color(0xFF000000)
private val SelfTextPrimary = Color(0xFFFFFFFF)
private val SelfTextSecondary = Color(0xB3FFFFFF)
private val SelfStatLabel = Color(0x99FFFFFF)
private val SelfEditBg = Color(0x33FFFFFF)
private val SelfTileBg = Color(0x1AFFFFFF)

/**
 * The signed-in user's own profile inside Explore — mirrors the web reviews ProfileTab: centered
 * avatar, name, @handle, a Following/Followers/Posts stat row, Edit + Share actions, and a 3-column
 * grid of the user's own posts. The web's Saved/Liked tabs query Supabase directly with no Android
 * API, so (per the owner) they're omitted rather than faked — no new backend was added.
 */
@Composable
internal fun SelfProfileScreen(
    onReviewClick: (String) -> Unit,
    onEditProfile: () -> Unit,
    onBack: () -> Unit,
    viewModel: SelfProfileViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    // Reflow the grid after a clip is deleted/hidden elsewhere and the user returns — mirrors web
    // ProfileTab refetching. The ViewModel's init already covers the first load.
    ReloadOnResume { viewModel.load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SelfBackground),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp)) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = SelfTextPrimary)
            }
            Text(
                text = stringResource(R.string.reviews_profile_fallback_title),
                color = SelfTextPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        when {
            uiState.isLoading && uiState.profile == null ->
                TappyLoadingIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            uiState.error != null && uiState.profile == null ->
                TappyErrorState(
                    title = stringResource(R.string.reviews_profile_error_title),
                    message = uiState.error,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = viewModel::load,
                )
            else -> {
                val profile = uiState.profile ?: ReviewProfile(null, null)
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        SelfProfileHeader(
                            profile = profile,
                            postCount = uiState.posts.size,
                            onEdit = onEditProfile,
                        )
                    }
                    items(items = uiState.posts, key = { it.id }) { review ->
                        PostGridTile(review = review, onClick = { onReviewClick(review.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SelfProfileHeader(
    profile: ReviewProfile,
    postCount: Int,
    onEdit: () -> Unit,
) {
    val displayName = profile.fullName ?: stringResource(R.string.reviews_anonymous_name)
    val handle = "@" + (profile.fullName?.filterNot { it.isWhitespace() }?.lowercase() ?: "user")

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        TappyAvatar(name = displayName, imageUrl = profile.avatarUrl, size = TappyAvatarSize.ProfileHero)
        Text(text = displayName, color = SelfTextPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(text = handle, color = SelfTextSecondary, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)

        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.huge)) {
            Stat(value = profile.followingCount.toString(), label = stringResource(R.string.reviews_profile_stat_following))
            Stat(value = profile.followerCount.toString(), label = stringResource(R.string.reviews_profile_stat_followers))
            Stat(value = postCount.toString(), label = stringResource(R.string.reviews_profile_stat_posts))
        }

        ProfileActionButton(
            icon = Icons.Filled.Edit,
            label = stringResource(R.string.reviews_profile_edit),
            onClick = onEdit,
        )
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, color = SelfTextPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(text = label, color = SelfStatLabel, fontSize = 12.sp)
    }
}

@Composable
private fun ProfileActionButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(SelfEditBg)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = SelfTextPrimary, modifier = Modifier.size(16.dp))
        Text(text = label, color = SelfTextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PostGridTile(review: Review, onClick: () -> Unit) {
    val photoUrl = review.thumbnail ?: review.photos?.firstOrNull()
    Box(
        modifier = Modifier
            .aspectRatio(9f / 16f)
            .clip(TappyShapes.input)
            .background(SelfTileBg)
            .clickable(onClick = onClick),
    ) {
        if (photoUrl != null) {
            TappyImage(url = photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        } else if (review.contentType == ReviewContentType.Video) {
            // A video with no thumbnail: a play badge so the tile clearly reads as a clip instead
            // of a near-invisible black cell against the profile's dark background.
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.85f),
                modifier = Modifier.align(Alignment.Center).size(28.dp),
            )
        } else {
            Text(
                text = review.body,
                color = SelfTextSecondary,
                fontSize = 11.sp,
                maxLines = 5,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(TappySpacing.sm),
            )
        }
        if (review.isHidden) {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.VisibilityOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }
    }
}

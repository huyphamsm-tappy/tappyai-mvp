package com.tappyai.app.saved

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappySkeleton
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * Saved — mirrors the web `/profile/favorites` ("Đã lưu"): favorite places + saved reviews under
 * one home, with a header count. Data is loaded by [SavedViewModel] from the backend
 * (`/api/favorites` + `/api/reviews/saved`); deleting a favorite removes it instantly and cancels it
 * on the backend (no confirm/dialog/undo — matching the web). Tapping a saved review opens the real
 * review via [onOpenReview] (reused `ReviewDetailScreen`, matching the web's `/reviews/{id}` link);
 * tapping a saved *place* opens its Service Detail via [onOpenPlace], the native equivalent of the
 * web's `/profile/favorites` → `/service/{slug}` link. The empty state's "Explore now" switches to
 * the Home tab via [onExploreNow]. Web has no tabs/filters/search/sort, and saved reviews have no
 * delete — none are added.
 */
@Composable
fun SavedScreen(
    onBack: () -> Unit,
    onExploreNow: () -> Unit,
    onOpenReview: (String) -> Unit,
    onOpenPlace: (FavoritePlace) -> Unit,
    viewModel: SavedViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    val total = (state as? UiState.Success)?.data?.total ?: 0

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Header(total = total, onBack = onBack)

            when (state) {
                UiState.Loading -> LoadingSkeletons()
                is UiState.Error -> ErrorState(message = state.message, onRetry = viewModel::load)
                UiState.Empty, UiState.Idle -> EmptyState(onExploreNow = onExploreNow)
                is UiState.Success -> SavedList(
                    data = state.data,
                    onOpenFavorite = onOpenPlace,
                    onOpenReview = onOpenReview,
                    onRemoveFavorite = viewModel::removeFavorite,
                )
            }
        }
    }
}

@Composable
private fun Header(total: Int, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
        }
        Icon(
            imageVector = Icons.Filled.Favorite,
            contentDescription = null,
            tint = tappyCategoryColors.red.accent,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(R.string.saved_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .padding(start = TappySpacing.sm)
                .weight(1f),
        )
        Text(
            text = stringResource(R.string.saved_items_count, total),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LoadingSkeletons() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        repeat(3) {
            TappySkeleton(
                modifier = Modifier.fillMaxWidth().height(72.dp),
                shape = TappyShapes.card,
            )
        }
    }
}

@Composable
private fun ColumnScope.ErrorState(message: String, onRetry: () -> Unit) {
    TappyErrorState(
        title = stringResource(R.string.saved_error_title),
        message = message,
        retryText = stringResource(R.string.common_try_again),
        onRetry = onRetry,
        modifier = Modifier.weight(1f).fillMaxWidth(),
    )
}

@Composable
private fun ColumnScope.EmptyState(onExploreNow: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterVertically),
    ) {
        Text(text = "♡", fontSize = 48.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = stringResource(R.string.saved_empty_title), style = MaterialTheme.typography.titleMedium)
        Text(
            text = stringResource(R.string.saved_empty_message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = TappySpacing.xl),
        )
        TappyButton(text = stringResource(R.string.saved_explore_now), onClick = onExploreNow)
    }
}

@Composable
private fun ColumnScope.SavedList(
    data: SavedData,
    onOpenFavorite: (FavoritePlace) -> Unit,
    onOpenReview: (String) -> Unit,
    onRemoveFavorite: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        if (data.favorites.isNotEmpty()) {
            item(key = "fav-header") {
                SectionHeader(icon = Icons.Filled.Favorite, tint = tappyCategoryColors.red.accent, label = stringResource(R.string.saved_section_favorites))
            }
            items(items = data.favorites, key = { it.id }) { fav ->
                FavoriteRow(favorite = fav, onOpen = { onOpenFavorite(fav) }, onDelete = { onRemoveFavorite(fav.placeId) })
            }
        }
        if (data.reviews.isNotEmpty()) {
            item(key = "rev-header") {
                SectionHeader(icon = Icons.Filled.Bookmark, tint = MaterialTheme.colorScheme.primary, label = stringResource(R.string.saved_section_reviews))
            }
            items(items = data.reviews, key = { it.id }) { review ->
                SavedReviewRow(review = review, onOpen = { onOpenReview(review.id) })
            }
        }
    }
}

@Composable
private fun SectionHeader(icon: ImageVector, tint: androidx.compose.ui.graphics.Color, label: String) {
    Row(
        modifier = Modifier.padding(top = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun FavoriteRow(favorite: FavoritePlace, onOpen: () -> Unit, onDelete: () -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(TappyShapes.input)
                    .clickable(onClick = onOpen),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(modifier = Modifier.size(36.dp), contentAlignment = Alignment.Center) {
                    Text(text = emojiForPlaceType(favorite.type), fontSize = 28.sp)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = favorite.name,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (favorite.address.isNotBlank()) {
                        Text(
                            text = favorite.address,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = stringResource(R.string.saved_date_prefix, formatSavedDate(favorite.savedAtMillis)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.saved_remove_favorite_content_description, favorite.name),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SavedReviewRow(review: SavedReview, onOpen: () -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(TappyShapes.input)
                .clickable(onClick = onOpen),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(TappyShapes.input)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (review.thumbnailUrl != null) {
                    TappyImage(
                        url = review.thumbnailUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize().clip(TappyShapes.input),
                    )
                } else {
                    Text(text = "📝", fontSize = 22.sp)
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = review.placeName ?: stringResource(R.string.saved_review_fallback_name),
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (review.body != null) {
                    Text(
                        text = review.body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = stringResource(R.string.saved_date_prefix, formatSavedDate(review.savedAtMillis)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

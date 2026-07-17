package com.tappyai.app.myreviews

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * My Reviews — mirrors the web `/profile/posts` ("Bài viết của tôi"): a 3-column grid of the
 * user's own reviews with a per-post hide/delete action sheet. Backed by `GET /api/reviews/mine`
 * (own reviews including hidden ones); hide/show and delete are optimistic and hit
 * `PATCH`/`DELETE /api/reviews/{id}`, reverting with a snackbar on failure. Tapping a tile opens a
 * [TappyBottomSheet] (not a review detail — matching the web). The empty state's "Post your first
 * review" opens the real Reviews composer (`ProfileRoute.MyReviewsComposer`, reused from the
 * Reviews feature — matching the web's `/profile/posts` → `/reviews/new` link); returning from a
 * successful post reloads the grid via [onCreateReview]'s resume-triggered refresh below, since
 * this screen's own `NavBackStackEntry` — and its ViewModel — stays alive across that round trip.
 * No comments/likes/detail/social feed here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyReviewsScreen(
    onBack: () -> Unit,
    onCreateReview: () -> Unit,
    viewModel: MyReviewsViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    var selected by remember { mutableStateOf<Review?>(null) }
    var pendingDelete by remember { mutableStateOf<Review?>(null) }
    val count = (state as? UiState.Success)?.data?.size ?: 0
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.messages.collect { message ->
            snackbarHostState.showSnackbar(message = message, duration = SnackbarDuration.Short)
        }
    }

    // The composer is a sibling destination on the same NavHost, not a fresh screen instance —
    // this ViewModel survives the round trip. Reload on every RESUME *after* the first (the
    // ViewModel's own init{} already covers the first) so a review posted from the composer
    // appears without the user having to manually retry.
    val currentRetry = rememberUpdatedState(viewModel::retry)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        var isFirstResume = true
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (isFirstResume) isFirstResume = false else currentRetry.value()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                    Text(text = stringResource(R.string.myreviews_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    Text(
                        text = stringResource(R.string.myreviews_post_count, count),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                when (state) {
                    UiState.Loading -> Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        TappyLoadingIndicator()
                    }
                    is UiState.Error -> ErrorState(onRetry = viewModel::retry)
                    UiState.Empty, UiState.Idle -> EmptyState(onCreate = onCreateReview)
                    is UiState.Success -> ReviewGrid(reviews = state.data, onSelect = { selected = it })
                }
            }
        }
    }

    selected?.let { review ->
        TappyBottomSheet(onDismiss = { selected = null }) {
            ActionSheetContent(
                review = review,
                onToggleHidden = { viewModel.toggleHidden(review.id); selected = null },
                onDelete = { pendingDelete = review; selected = null },
            )
        }
    }

    pendingDelete?.let { review ->
        TappyDialog(
            title = stringResource(R.string.myreviews_delete_dialog_title),
            message = stringResource(R.string.myreviews_delete_dialog_message, review.placeName),
            confirmText = stringResource(R.string.myreviews_delete_confirm),
            onConfirm = { viewModel.delete(review.id); pendingDelete = null },
            onDismiss = { pendingDelete = null },
        )
    }
}

@Composable
private fun ColumnScope.ReviewGrid(reviews: List<Review>, onSelect: (Review) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier.weight(1f).fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        items(items = reviews, key = { it.id }) { review ->
            ReviewGridTile(review = review, onClick = { onSelect(review) })
        }
    }
}

@Composable
private fun ReviewGridTile(review: Review, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(TappyShapes.input)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
    ) {
        if (review.photoUrl != null) {
            TappyImage(url = review.photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                text = review.body,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(TappySpacing.sm),
            )
        }

        if (review.isHidden) {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Filled.VisibilityOff,
                    contentDescription = stringResource(R.string.myreviews_hidden_badge_description),
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(TappySpacing.xs)
                .clip(TappyShapes.pill)
                .background(Color.Black.copy(alpha = 0.4f))
                .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
        ) {
            Text(
                text = stringResource(R.string.myreviews_like_count_badge, review.likeCount),
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun ActionSheetContent(review: Review, onToggleHidden: () -> Unit, onDelete: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(56.dp).clip(TappyShapes.input).background(colors.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (review.photoUrl != null) {
                    TappyImage(url = review.photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
                } else {
                    Text(
                        text = review.body,
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(TappySpacing.xs),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = review.placeName, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    text = review.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(
                        R.string.myreviews_status_line,
                        stringResource(if (review.isHidden) R.string.myreviews_status_hidden else R.string.myreviews_status_visible),
                        review.likeCount,
                        review.commentCount,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                )
            }
        }

        ActionRow(
            icon = if (review.isHidden) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
            iconTint = if (review.isHidden) tappyCategoryColors.green.accent else tappyCategoryColors.amber.accent,
            label = stringResource(if (review.isHidden) R.string.myreviews_show_post else R.string.myreviews_hide_post),
            containerColor = colors.surfaceVariant,
            contentColor = colors.onSurface,
            onClick = onToggleHidden,
        )
        ActionRow(
            icon = Icons.Filled.Delete,
            iconTint = colors.error,
            label = stringResource(R.string.myreviews_delete_post_action),
            containerColor = colors.errorContainer,
            contentColor = colors.error,
            onClick = onDelete,
        )
    }
}

@Composable
private fun ActionRow(
    icon: ImageVector,
    iconTint: Color,
    label: String,
    containerColor: Color,
    contentColor: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(containerColor)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = contentColor)
    }
}

@Composable
private fun ColumnScope.ErrorState(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterVertically),
    ) {
        Text(stringResource(R.string.myreviews_error_title), style = MaterialTheme.typography.titleMedium)
        Text(
            text = stringResource(R.string.myreviews_error_message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TappyButton(text = stringResource(R.string.common_try_again), onClick = onRetry)
    }
}

@Composable
private fun ColumnScope.EmptyState(onCreate: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterVertically),
    ) {
        Icon(Icons.Filled.GridView, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(44.dp))
        Text(text = stringResource(R.string.myreviews_empty_title), style = MaterialTheme.typography.titleMedium)
        TappyButton(text = stringResource(R.string.myreviews_create_first_review), onClick = onCreate)
    }
}

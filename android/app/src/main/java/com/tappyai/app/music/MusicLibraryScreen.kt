package com.tappyai.app.music

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyComingSoonSheet
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappySearchBar
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Music Library — mirrors the web `/music` page: back + title + upload header, search (debounced,
 * `GET /api/music/tracks/search`), category chips (hidden while searching), and a paginated,
 * infinite-scrolling track list (`GET /api/music/tracks`). Tapping a row opens the track's Sound
 * Detail; the round play button plays a real preview via the ExoPlayer-backed [AudioPlayer] seam.
 * Upload is a separate future milestone (it requires a distinct Vercel Blob direct-upload flow,
 * not just this browse/playback API), so its header action still surfaces a [TappyComingSoonSheet].
 */
@Composable
fun MusicLibraryScreen(
    onBack: () -> Unit,
    onOpenSound: (String) -> Unit,
    viewModel: MusicLibraryViewModel = hiltViewModel(),
) {
    val player = rememberAudioPlayer()
    var comingSoonFeature by remember { mutableStateOf<String?>(null) }
    val musicUploadFeatureName = stringResource(R.string.music_upload_feature_name)
    val listState = rememberLazyListState()

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
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(
                    text = stringResource(R.string.music_library_title),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { comingSoonFeature = musicUploadFeatureName }) {
                    Icon(Icons.Filled.Upload, contentDescription = stringResource(R.string.music_upload_content_description))
                }
            }

            TappySearchBar(
                query = viewModel.query,
                onQueryChange = viewModel::onQueryChange,
                placeholder = stringResource(R.string.music_search_placeholder),
            )

            if (!viewModel.isSearching) {
                CategoryTabs(
                    categories = viewModel.categories,
                    selectedCategoryId = viewModel.selectedCategoryId,
                    onSelect = viewModel::onSelectCategory,
                )
            }

            when (val state = viewModel.tracksState) {
                is UiState.Loading, UiState.Idle -> Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) { TappyLoadingIndicator() }

                is UiState.Error -> Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    TappyErrorState(
                        title = stringResource(R.string.music_error_title),
                        message = state.message,
                        onRetry = viewModel::retry,
                    )
                }

                UiState.Empty -> Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    TappyEmptyState(
                        icon = Icons.Filled.MusicNote,
                        title = stringResource(R.string.music_empty_title),
                        message = stringResource(R.string.music_empty_message),
                    )
                }

                is UiState.Success -> {
                    val tracks = state.data
                    // Fires loadMore() once the last row is within reach, so scrolling near the
                    // bottom quietly appends the next page instead of needing a "Load more" tap.
                    val shouldLoadMore by remember {
                        derivedStateOf {
                            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                            lastVisible >= tracks.size - 3
                        }
                    }
                    LaunchedEffect(shouldLoadMore, tracks.size) {
                        if (shouldLoadMore) viewModel.loadMore()
                    }

                    LazyColumn(
                        state = listState,
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    ) {
                        items(items = tracks, key = { it.id }) { track ->
                            TrackRow(
                                track = track,
                                isPlaying = player.playingTrackId == track.id && player.isPlaying,
                                onOpenDetail = { onOpenSound(track.id) },
                                onTogglePreview = { player.toggle(track.id, track.previewUrl ?: track.audioUrl) },
                            )
                        }
                        if (viewModel.isLoadingMore) {
                            item(key = "loading-more") {
                                val loadingLabel = stringResource(com.tappyai.core.designsystem.R.string.tappy_cd_loading)
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(TappySpacing.lg)
                                        .semantics { contentDescription = loadingLabel },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    comingSoonFeature?.let { feature ->
        TappyComingSoonSheet(
            featureName = feature,
            description = stringResource(R.string.coming_soon_description, feature),
            onDismiss = { comingSoonFeature = null },
        )
    }
}

@Composable
private fun CategoryTabs(
    categories: List<MusicCategory>,
    selectedCategoryId: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        item {
            FilterChip(
                selected = selectedCategoryId == null,
                onClick = { onSelect(null) },
                label = { Text(stringResource(R.string.music_category_all)) },
            )
        }
        items(items = categories, key = { it.id }) { category ->
            FilterChip(
                selected = selectedCategoryId == category.id,
                onClick = { onSelect(category.id) },
                label = { Text(category.label) },
            )
        }
    }
}

@Composable
private fun TrackRow(
    track: MusicTrack,
    isPlaying: Boolean,
    onOpenDetail: () -> Unit,
    onTogglePreview: () -> Unit,
) {
    // Split interaction, matching the web library's "quick listen" intent (browsing stays fast):
    //  - Cover artwork → Sound Detail (the deep-dive affordance).
    //  - Title/artist/duration body → preview.
    //  - Play button → preview.
    // Detail is deliberately NOT the whole row's default action.
    val openDetailsContentDescription = stringResource(R.string.music_open_details_content_description, track.title)
    val stopPreviewContentDescription = stringResource(R.string.music_stop_preview_content_description, track.title)
    val playPreviewContentDescription = stringResource(R.string.music_play_preview_content_description, track.title)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MusicThumbnail(
            coverUrl = track.coverUrl,
            title = track.title,
            size = 40.dp,
            modifier = Modifier
                .clickable(onClick = onOpenDetail)
                .semantics { contentDescription = openDetailsContentDescription },
        )
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(TappyShapes.input)
                .clickable(onClick = onTogglePreview)
                .padding(vertical = TappySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (track.artist != null) {
                    Text(
                        text = track.artist,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Text(
                text = formatDuration(track.durationSec),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary)
                .clickable(onClick = onTogglePreview)
                .semantics {
                    contentDescription =
                        if (isPlaying) stopPreviewContentDescription else playPreviewContentDescription
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isPlaying) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * Track/sound cover — mirrors the web `MusicThumbnail`: the cover image, or a note-icon
 * placeholder on a tinted square when there's no cover (never a fake/broken image). Shared by the
 * library rows and the Sound Detail hero.
 */
@Composable
internal fun MusicThumbnail(coverUrl: String?, title: String, size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(size)
            .clip(TappyShapes.input)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (coverUrl != null) {
            TappyImage(
                url = coverUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize().clip(TappyShapes.input),
            )
        } else {
            Icon(
                imageVector = Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(size * 0.5f),
            )
        }
    }
}

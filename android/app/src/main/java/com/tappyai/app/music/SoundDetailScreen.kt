package com.tappyai.app.music

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Sound Detail — mirrors the web `/sound/[trackId]` page: hero (cover + real play/pause), title,
 * artist, duration + type badge, real stats (`GET /api/sound/{trackId}`: play count, video-usage
 * count, saved count, trending rank), real Save/Follow/Use-this-sound/Report actions, and a
 * "videos using this sound" section (thumbnail grid is still a later pass — needs real video
 * thumbnails, see [VideosSection]'s doc).
 */
@Composable
fun SoundDetailScreen(
    onBack: () -> Unit,
    onOpenCopyrightPolicy: () -> Unit,
    viewModel: SoundDetailViewModel = hiltViewModel(),
) {
    val player = rememberAudioPlayer()
    val context = LocalContext.current
    var showReportSheet by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is SoundDetailEvent.ReportSubmitted -> {
                    showReportSheet = false
                    Toast.makeText(context, context.getString(R.string.music_report_submitted_toast), Toast.LENGTH_SHORT).show()
                }
                is SoundDetailEvent.ActionFailed -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.music_sound_title), style = MaterialTheme.typography.titleLarge)
            }

            when (val state = viewModel.state) {
                is UiState.Loading, UiState.Idle -> Box(modifier = Modifier.fillMaxWidth().padding(TappySpacing.xxxl), contentAlignment = Alignment.Center) {
                    TappyLoadingIndicator()
                }
                is UiState.Error -> TappyErrorState(
                    title = stringResource(R.string.music_error_title),
                    message = state.message,
                    onRetry = viewModel::retry,
                )
                UiState.Empty -> Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.music_sound_not_found),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is UiState.Success -> {
                    val detail = state.data
                    val isPlaying = player.playingTrackId == detail.track.id && player.isPlaying
                    LaunchedEffect(isPlaying) {
                        if (isPlaying) viewModel.onPlaybackStarted()
                    }
                    Hero(
                        detail = detail,
                        isPlaying = isPlaying,
                        onTogglePlay = {
                            player.toggle(detail.track.id, detail.track.previewUrl ?: detail.track.audioUrl)
                        },
                    )
                    Actions(
                        detail = detail,
                        isMutatingSave = viewModel.isMutatingSave,
                        isMutatingFollow = viewModel.isMutatingFollow,
                        onToggleSave = viewModel::onToggleSave,
                        onToggleFollow = viewModel::onToggleFollow,
                        onUseThisSound = viewModel::onUseThisSound,
                        onReport = { showReportSheet = true },
                    )
                    VideosSection(usageCount = detail.usageCount)
                }
            }
        }
    }

    if (showReportSheet) {
        ReportSoundSheet(
            isSubmitting = viewModel.isSubmittingReport,
            onSubmit = { reason, details -> viewModel.onReport(reason.wireValue, details) },
            onOpenCopyrightPolicy = { showReportSheet = false; onOpenCopyrightPolicy() },
            onDismiss = { showReportSheet = false },
        )
    }
}

@Composable
private fun Hero(detail: SoundDetail, isPlaying: Boolean, onTogglePlay: () -> Unit) {
    val track = detail.track
    val playContentDescription = stringResource(R.string.music_play_content_description)
    val pauseContentDescription = stringResource(R.string.music_pause_content_description)

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Box(contentAlignment = Alignment.Center) {
            MusicThumbnail(coverUrl = track.coverUrl, title = track.title, size = 132.dp)
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.55f))
                    .clickable(onClick = onTogglePlay)
                    .semantics {
                        contentDescription = if (isPlaying) pauseContentDescription else playContentDescription
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(28.dp),
                )
            }
        }

        if (detail.trendingRank != null) {
            Row(
                modifier = Modifier
                    .clip(TappyShapes.pill)
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.TrendingUp,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = stringResource(R.string.music_trending_rank, detail.trendingRank),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = track.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
        }
        Text(
            text = track.artist ?: stringResource(R.string.music_unknown_artist),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = formatDuration(track.durationSec),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Box(
                modifier = Modifier
                    .clip(TappyShapes.pill)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
            ) {
                Text(
                    text = "🏷️ ${detail.type.label()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Real stats from GET /api/sound/{trackId} — the backend itself degrades these to 0 when
        // a table/RPC isn't migrated yet (see SoundDetailResponseDto's doc), so 0 here is either
        // "really zero" or "not migrated yet", same honest-not-fabricated meaning as before.
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.music_stat_videos, detail.usageCount),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = stringResource(R.string.music_stat_saved, detail.savedCount),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        Text(
            text = stringResource(R.string.music_played_times, detail.playCount),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Actions(
    detail: SoundDetail,
    isMutatingSave: Boolean,
    isMutatingFollow: Boolean,
    onToggleSave: () -> Unit,
    onToggleFollow: () -> Unit,
    onUseThisSound: () -> Unit,
    onReport: () -> Unit,
) {
    val useThisSoundLabel = stringResource(R.string.music_action_use_this_sound)
    val reportCopyrightLabel = stringResource(R.string.music_action_report_copyright)

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            TappyButton(
                text = stringResource(R.string.music_action_save),
                onClick = onToggleSave,
                enabled = !isMutatingSave,
                modifier = Modifier.weight(1f),
                variant = if (detail.savedByMe) TappyButtonVariant.Primary else TappyButtonVariant.Ghost,
                leadingIcon = {
                    Icon(
                        if (detail.savedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                },
            )
            TappyButton(
                text = stringResource(R.string.music_action_follow),
                onClick = onToggleFollow,
                enabled = !isMutatingFollow,
                modifier = Modifier.weight(1f),
                variant = if (detail.followedByMe) TappyButtonVariant.Primary else TappyButtonVariant.Ghost,
                leadingIcon = {
                    Icon(
                        if (detail.followedByMe) Icons.Filled.NotificationsActive else Icons.Filled.NotificationsNone,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                },
            )
        }
        // Sound model (web parity): every Sound is reusable by SoundID reference.
        TappyButton(
            text = useThisSoundLabel,
            onClick = onUseThisSound,
            modifier = Modifier.fillMaxWidth(),
            variant = TappyButtonVariant.Primary,
            leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp)) },
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(TappyShapes.input)
                .clickable(onClick = onReport)
                .padding(TappySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Flag,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = reportCopyrightLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun VideosSection(usageCount: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        Text(
            text = stringResource(R.string.music_videos_section_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        // The real usage count is wired (GET /api/sound/{trackId}'s usageCount); the thumbnail
        // grid itself is a separate, later pass — so this stays a text summary, not fake tiles.
        Text(
            text = if (usageCount > 0) {
                stringResource(R.string.music_videos_count_pending_grid, usageCount)
            } else {
                stringResource(R.string.music_videos_empty)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = TappySpacing.lg),
        )
    }
}

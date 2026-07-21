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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * The feed music-disc bottom sheet — web parity `src/app/reviews/SoundSheet.tsx`: a compact version
 * of the sound page (cover + play/pause, stats, Save + "Use this sound") shown when the user taps a
 * clip's music disc, instead of navigating away from the feed.
 *
 * Backed by the same [SoundDetailViewModel] as the full page (it reads `trackId` from the nav args),
 * so save/use-this-sound behave identically. The web sheet's "see the full sound page" link is
 * omitted: the full page lives in the Home tab's nested Music graph and isn't reachable from the
 * Reviews graph without a top-level route.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoundSheet(
    onDismiss: () -> Unit,
    viewModel: SoundDetailViewModel = hiltViewModel(),
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val player = rememberAudioPlayer()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            if (event is SoundDetailEvent.ActionFailed) {
                Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = {
            player.stop()
            onDismiss()
        },
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        when (val s = viewModel.state) {
            UiState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(TappySpacing.huge),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            is UiState.Error -> TappyErrorState(
                title = stringResource(R.string.music_error_title),
                message = s.message,
                retryText = stringResource(R.string.common_try_again),
                onRetry = { viewModel.retry() },
            )

            UiState.Empty -> Text(
                text = stringResource(R.string.music_sound_not_found),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(TappySpacing.xl),
            )

            is UiState.Success -> SoundSheetContent(
                detail = s.data,
                player = player,
                isMutatingSave = viewModel.isMutatingSave,
                onToggleSave = viewModel::onToggleSave,
                onPlaybackStarted = viewModel::onPlaybackStarted,
                onUseThisSound = {
                    player.stop()
                    viewModel.onUseThisSound()
                },
            )

            else -> Unit
        }
    }
}

@Composable
private fun SoundSheetContent(
    detail: SoundDetail,
    player: AudioPlayer,
    isMutatingSave: Boolean,
    onToggleSave: () -> Unit,
    onPlaybackStarted: () -> Unit,
    onUseThisSound: () -> Unit,
) {
    val track = detail.track
    val isThisPlaying = player.playingTrackId == track.id && player.isPlaying
    Column(
        modifier = Modifier.fillMaxWidth().padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Cover + centered play/pause overlay (web: MusicThumbnail 72 + h-9 w-9 overlay).
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (track.coverUrl != null) {
                    TappyImage(
                        url = track.coverUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(Icons.Filled.MusicNote, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(
                    onClick = {
                        if (player.playingTrackId != track.id) onPlaybackStarted()
                        player.toggle(track.id, track.previewUrl ?: track.audioUrl)
                    },
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.55f)),
                ) {
                    Icon(
                        imageVector = if (isThisPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = stringResource(
                            if (isThisPlaying) R.string.music_pause_content_description else R.string.music_play_content_description,
                        ),
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = (track.artist ?: stringResource(R.string.music_unknown_artist)) +
                        " · " + formatDuration(track.durationSec),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.music_stat_videos, detail.usageCount) +
                        "  " + stringResource(R.string.music_stat_saved, detail.savedCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Web: a two-button row — Save + the gradient "Use this sound".
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable(enabled = !isMutatingSave, onClick = onToggleSave)
                    .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                Icon(
                    imageVector = if (detail.savedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = null,
                    tint = if (detail.savedByMe) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = stringResource(R.string.music_action_save),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            // Sound model (web parity): every Sound is reusable by SoundID reference.
            TappyButton(
                text = stringResource(R.string.music_action_use_this_sound),
                onClick = onUseThisSound,
                variant = TappyButtonVariant.Primary,
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp)) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

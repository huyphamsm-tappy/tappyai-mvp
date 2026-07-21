package com.tappyai.app.music

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlin.math.roundToInt

/**
 * In-composer background-music picker — web parity: `MusicPickerSheet` (`src/modules/music/
 * components/MusicPickerSheet.kt`). A modal bottom sheet that browses/searches the same library
 * (reusing [MusicLibraryViewModel]), previews tracks with [rememberAudioPlayer], then a selection
 * panel (start offset + volume sliders, web `MusicSelectionPanel`) confirms `{trackId, startSec,
 * volume}` back to the composer. No navigation — the sheet returns a selection in place.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicPickerSheet(
    onSelect: (trackId: String, title: String, startSec: Int, volume: Double) -> Unit,
    onDismiss: () -> Unit,
    viewModel: MusicLibraryViewModel = hiltViewModel(),
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val player = rememberAudioPlayer()
    var selected by remember { mutableStateOf<MusicTrack?>(null) }

    ModalBottomSheet(
        onDismissRequest = {
            player.stop()
            onDismiss()
        },
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 560.dp)) {
            val sel = selected
            if (sel == null) {
                PickerList(viewModel = viewModel, player = player, onPick = { player.stop(); selected = it })
            } else {
                SelectionPanel(
                    track = sel,
                    player = player,
                    onBack = { player.stop(); selected = null },
                    onConfirm = { startSec, volume ->
                        player.stop()
                        onSelect(sel.id, sel.title, startSec, volume)
                    },
                )
            }
        }
    }
}

@Composable
private fun PickerList(
    viewModel: MusicLibraryViewModel,
    player: AudioPlayer,
    onPick: (MusicTrack) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl)
            .padding(bottom = TappySpacing.xl),
    ) {
        Text(
            text = stringResource(R.string.music_picker_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = TappySpacing.md),
        )
        OutlinedTextField(
            value = viewModel.query,
            onValueChange = viewModel::onQueryChange,
            placeholder = { Text(stringResource(R.string.music_search_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (!viewModel.isSearching && viewModel.categories.isNotEmpty()) {
            LazyRow(
                modifier = Modifier.padding(vertical = TappySpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                item {
                    FilterChip(
                        selected = viewModel.selectedCategoryId == null,
                        onClick = { viewModel.onSelectCategory(null) },
                        label = { Text(stringResource(R.string.music_category_all)) },
                    )
                }
                items(viewModel.categories) { cat ->
                    FilterChip(
                        selected = viewModel.selectedCategoryId == cat.id,
                        onClick = { viewModel.onSelectCategory(cat.id) },
                        label = { Text(cat.label) },
                    )
                }
            }
        }
        when (val s = viewModel.tracksState) {
            UiState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(TappySpacing.xxxl),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }
            UiState.Empty -> Text(
                text = stringResource(R.string.music_empty_title),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = TappySpacing.xl),
            )
            is UiState.Error -> Text(
                text = s.message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(vertical = TappySpacing.xl),
            )
            is UiState.Success -> LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                items(s.data) { track ->
                    PickerTrackRow(track = track, player = player, onPick = { onPick(track) })
                }
            }
            else -> Unit
        }
    }
}

@Composable
private fun PickerTrackRow(track: MusicTrack, player: AudioPlayer, onPick: () -> Unit) {
    val isThisPlaying = player.playingTrackId == track.id && player.isPlaying
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPick)
            .padding(vertical = TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (track.coverUrl != null) {
                TappyImage(url = track.coverUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
            } else {
                Icon(Icons.Filled.MusicNote, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(track.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = (track.artist ?: stringResource(R.string.music_unknown_artist)) + " · " + formatDuration(track.durationSec),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = { player.toggle(track.id, track.previewUrl ?: track.audioUrl) }) {
            Icon(
                imageVector = if (isThisPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = stringResource(
                    if (isThisPlaying) R.string.music_pause_content_description else R.string.music_play_content_description,
                ),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun SelectionPanel(
    track: MusicTrack,
    player: AudioPlayer,
    onBack: () -> Unit,
    onConfirm: (startSec: Int, volume: Double) -> Unit,
) {
    var startSec by remember { mutableFloatStateOf(0f) }
    var volume by remember { mutableFloatStateOf(1f) }
    val isThisPlaying = player.playingTrackId == track.id && player.isPlaying
    Column(
        modifier = Modifier.fillMaxWidth().padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
            }
            Text(
                text = track.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { player.toggle(track.id, track.previewUrl ?: track.audioUrl) }) {
                Icon(
                    imageVector = if (isThisPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }
        val maxStart = (track.durationSec - 1).coerceAtLeast(1)
        Text(
            text = stringResource(R.string.music_picker_start) + ": " + formatDuration(startSec.roundToInt()),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Slider(value = startSec, onValueChange = { startSec = it }, valueRange = 0f..maxStart.toFloat())
        Text(
            text = stringResource(R.string.music_picker_volume) + ": " + (volume * 100).roundToInt() + "%",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Slider(value = volume, onValueChange = { volume = it }, valueRange = 0f..1f)
        TappyButton(
            text = stringResource(R.string.music_picker_select),
            onClick = { onConfirm(startSec.roundToInt(), volume.toDouble()) },
            variant = TappyButtonVariant.Primary,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

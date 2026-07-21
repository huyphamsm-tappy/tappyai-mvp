package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.music.MusicTrack
import com.tappyai.app.music.rememberAudioPlayer
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * The review's attached background track — web parity `src/app/reviews/ReviewMusicCard.tsx`:
 * a translucent rounded bar with a small cover, title/artist, a thin progress bar, and a round
 * play/pause on the right.
 *
 * Playback honors the review's saved trim ([startSec] + [volume]) via `AudioPlayer.toggleFrom`,
 * matching the web's `musicPlaybackController` (the only web player that applies them). Progress is
 * polled while playing; leaving the screen stops playback so it can't leak past the detail view.
 */
@Composable
fun ReviewMusicCard(track: MusicTrack, startSec: Int, volume: Float) {
    val player = rememberAudioPlayer()
    val isThisPlaying = player.playingTrackId == track.id && player.isPlaying
    var progress by remember(track.id) { mutableFloatStateOf(0f) }

    // Poll position while playing (ExoPlayer has no progress callback), clamped to the trimmed span.
    LaunchedEffect(isThisPlaying, track.id) {
        while (isThisPlaying) {
            val total = player.durationMs()
            val from = startSec.coerceAtLeast(0) * 1000L
            progress = if (total > from) {
                ((player.positionMs() - from).toFloat() / (total - from)).coerceIn(0f, 1f)
            } else {
                0f
            }
            delay(500)
        }
    }
    DisposableEffect(Unit) { onDispose { player.stop() } }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.40f))
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White.copy(alpha = 0.15f)),
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
                Icon(
                    imageVector = Icons.Filled.MusicNote,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            Text(
                text = track.title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = track.artist ?: stringResource(R.string.music_unknown_artist),
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            // Web: h-0.5 track bg-white/20 with a bg-white fill.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.2f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress)
                        .fillMaxHeight()
                        .clip(CircleShape)
                        .background(Color.White),
                )
            }
        }
        IconButton(
            onClick = { player.toggleFrom(track.id, track.previewUrl ?: track.audioUrl, startSec, volume) },
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.2f)),
        ) {
            Icon(
                imageVector = if (isThisPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = stringResource(
                    if (isThisPlaying) R.string.music_pause_content_description else R.string.music_play_content_description,
                ),
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

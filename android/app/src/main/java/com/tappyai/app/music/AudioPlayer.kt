package com.tappyai.app.music

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/**
 * The audio-playback **seam** for the Music feature — screens (library rows, sound hero) talk
 * ONLY to this interface; they never touch ExoPlayer directly. Lives in `:app/music` (not the
 * design system) so the media stack never leaks into the app-agnostic `core:designsystem` —
 * mirroring how `MapCanvas` keeps the maps SDK out of it.
 *
 * Single-track semantics (matches the web's single shared `<audio>`): starting a track replaces
 * whatever was playing; toggling the playing track pauses it (not stops — resuming keeps position).
 */
@Stable
interface AudioPlayer {
    /** Id of the track currently playing (including paused-but-loaded), or `null` if nothing is
     *  loaded. Compose-observable. */
    val playingTrackId: String?

    /** True while [playingTrackId] is actually producing sound (false while paused). */
    val isPlaying: Boolean

    /** Play [trackId] from [url], or pause/resume it if it's already the loaded track. A `null`
     *  url (a track missing both `previewUrl`/`audioUrl`) is a no-op — never crashes on a bad URI. */
    fun toggle(trackId: String, url: String?)

    /**
     * Like [toggle], but honors the review's saved trim — starts at [startSec] and plays at
     * [volume] (0–1). Web parity: `musicPlaybackController.play()`, which is the only web player
     * that applies `startSec`/`volume` (the library/sound previews ignore them).
     */
    fun toggleFrom(trackId: String, url: String?, startSec: Int, volume: Float)

    /** Current playback position, ms (0 when nothing is loaded) — drives a progress bar. */
    fun positionMs(): Long

    /** Duration of the loaded track, ms (0 when unknown/unset). */
    fun durationMs(): Long

    /** Stop and unload whatever is playing. */
    fun stop()
}

/**
 * Real [AudioPlayer] backed by [androidx.media3.exoplayer.ExoPlayer] — the web's plain `<audio>`
 * tag pointed at the backend's hotlinked `previewUrl`/`audioUrl` translates directly to
 * `MediaItem.fromUri()`, no signing/proxy layer needed on either side.
 */
@Stable
private class ExoAudioPlayer(context: Context) : AudioPlayer {
    private val player = ExoPlayer.Builder(context).build()

    override var playingTrackId: String? by mutableStateOf(null)
        private set
    override var isPlaying: Boolean by mutableStateOf(false)
        private set

    init {
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    playingTrackId = null
                    isPlaying = false
                }
            }
        })
    }

    override fun toggle(trackId: String, url: String?) {
        if (playingTrackId == trackId) {
            if (player.isPlaying) player.pause() else player.play()
            return
        }
        if (url == null) return
        playingTrackId = trackId
        player.volume = 1f // reset any trim volume a previous toggleFrom() applied
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.play()
    }

    override fun toggleFrom(trackId: String, url: String?, startSec: Int, volume: Float) {
        if (playingTrackId == trackId) {
            if (player.isPlaying) player.pause() else player.play()
            return
        }
        if (url == null) return
        playingTrackId = trackId
        player.volume = volume.coerceIn(0f, 1f)
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.seekTo(startSec.coerceAtLeast(0) * 1000L)
        player.play()
    }

    override fun positionMs(): Long = player.currentPosition.coerceAtLeast(0L)

    // ExoPlayer reports C.TIME_UNSET (a large negative) until the media is prepared.
    override fun durationMs(): Long = player.duration.takeIf { it > 0L } ?: 0L

    override fun stop() {
        player.stop()
        player.volume = 1f
        playingTrackId = null
    }

    fun release() = player.release()
}

/**
 * Remembers an [AudioPlayer] for a screen — one ExoPlayer instance per screen (matching the web's
 * per-page `<audio>`), released via [DisposableEffect] when the screen leaves composition so the
 * native player doesn't leak.
 */
@Composable
fun rememberAudioPlayer(): AudioPlayer {
    val context = LocalContext.current
    val player = remember { ExoAudioPlayer(context) }
    DisposableEffect(player) {
        onDispose { player.release() }
    }
    return player
}

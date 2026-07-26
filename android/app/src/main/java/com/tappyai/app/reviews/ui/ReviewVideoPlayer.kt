package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.tappyai.core.designsystem.component.TappyImage

/**
 * Process-global feed-audio unlock, mirroring the web `VideoPlayer`'s TikTok/Reels model
 * (`src/components/explore/VideoPlayer.tsx`): every clip autoplays MUTED (the only always-allowed
 * mode), and the user's first tap on any clip unlocks sound for the whole feed — thereafter active
 * clips play with sound. There is no mute button (owner's TikTok-style choice); once unlocked it
 * stays unlocked for the session.
 */
private object FeedAudio {
    var unlocked by mutableStateOf(false)
}

/**
 * In-feed video playback for uploaded review clips — Android parity for the web's inline
 * `<video autoplay muted loop playsInline>`. Playback is driven purely by [active] (the feed tells
 * each card whether it is the current page), exactly like the web's `active` prop — no per-view
 * observer race. Muted autoplay + loop; sound follows the shared [FeedAudio] unlock. The poster
 * [thumbnail] covers the surface until the first frame renders (no black flash). The ExoPlayer is
 * created per card and released on dispose; playback also pauses when the app is backgrounded.
 */
@OptIn(UnstableApi::class)
@Composable
fun ReviewVideoPlayer(
    url: String,
    thumbnail: String?,
    active: Boolean,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    /** The borrowed track id when this clip uses an attached sound (review.music.origin=="attached").
     *  With [resolveSoundUrl], the video is force-muted and the track plays over it (web parity). */
    attachedTrackId: String? = null,
    soundVolume: Float = 1f,
    resolveSoundUrl: (suspend (String) -> String?)? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Attached ("use this sound") state. [hasSound] is the INTENT to borrow (known before the URL
    // resolves) — muting keys off it, not [soundUrl], so the video never leaks its own audio in the
    // window between unlock and the track fetch (the web's mute-race fix). On failure we fall back.
    val hasSound = attachedTrackId != null && resolveSoundUrl != null
    var soundUrl by remember(attachedTrackId) { mutableStateOf<String?>(null) }
    var soundFailed by remember(attachedTrackId) { mutableStateOf(false) }
    val borrowing = hasSound && !soundFailed

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
        }
    }

    // Single companion audio player for the borrowed track — muted-until-unlock, looped, mirrored to
    // the active clip. Only ever created for attached-sound clips; released on dispose.
    val companionPlayer = remember {
        ExoPlayer.Builder(context).build().apply { repeatMode = Player.REPEAT_MODE_ONE }
    }

    // Latest `active` for callbacks registered once (lifecycle observer) — avoids capturing a stale value.
    val currentActive by rememberUpdatedState(active)

    var showThumbnail by rememberSaveable(url) { mutableStateOf(true) }

    // Only the on-screen clip holds a decoder: prepare + play while active, stop (releasing the codec)
    // and clear the poster overlay when scrolled away. Off-screen cards never prepare, so a long feed
    // can't exhaust the device's video decoders.
    LaunchedEffect(url, active) {
        if (active) {
            exoPlayer.setMediaItem(MediaItem.fromUri(url))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        } else {
            exoPlayer.playWhenReady = false
            exoPlayer.stop()
            exoPlayer.clearMediaItems()
            showThumbnail = true
        }
    }

    // Self-healing watchdog (web-parity contract §5.2): while this is the active, foregrounded clip,
    // re-issue play() every 300 ms if anything paused it — audio-focus loss, a transient stall, an
    // external pause. Deliberately NOT a state machine (the web needed 11 commits before landing on
    // "just keep nudging the active clip back to playing"). Gated on STARTED so it never fights the
    // intentional background pause.
    LaunchedEffect(active) {
        if (!active) return@LaunchedEffect
        while (true) {
            kotlinx.coroutines.delay(300)
            val started = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
            val state = exoPlayer.playbackState
            if (started && !exoPlayer.isPlaying && state != Player.STATE_IDLE && state != Player.STATE_ENDED) {
                exoPlayer.playWhenReady = true
                exoPlayer.play()
            }
            // Force-mute a borrowed-sound clip every tick — the web's mute-race fix: anything that
            // unmutes the video (unlock, a late URL) is re-muted so only the companion track is heard.
            if (borrowing && exoPlayer.volume != 0f) exoPlayer.volume = 0f
            // Keep the companion track playing too (self-heal, same reasoning as the video).
            if (borrowing && started && FeedAudio.unlocked &&
                companionPlayer.playbackState == Player.STATE_READY && !companionPlayer.isPlaying
            ) {
                companionPlayer.play()
            }
        }
    }

    // Poster stays until the first frame is actually rendered.
    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                showThumbnail = false
            }
        }
        exoPlayer.addListener(listener)
        onDispose { exoPlayer.removeListener(listener) }
    }

    // Video volume: a borrowed-sound clip stays MUTED (its audio comes from the companion track);
    // otherwise it follows the shared unlock state (muted until the user's first tap in the feed).
    LaunchedEffect(FeedAudio.unlocked, borrowing) {
        exoPlayer.volume = if (borrowing) 0f else if (FeedAudio.unlocked) 1f else 0f
    }

    // Pause while backgrounded so a scrolled-away/hidden feed never keeps playing audio; re-prepare and
    // resume the active clip on return (it was stopped/cleared while inactive). `currentActive` reads the
    // latest value, not the one captured when the observer was first registered.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> {
                    exoPlayer.pause()
                    companionPlayer.pause() // never let the borrowed track play in the background
                }
                Lifecycle.Event.ON_START -> if (currentActive) {
                    if (exoPlayer.playbackState == Player.STATE_IDLE) {
                        exoPlayer.setMediaItem(MediaItem.fromUri(url))
                        exoPlayer.prepare()
                    }
                    exoPlayer.playWhenReady = true
                    if (borrowing && soundUrl != null && FeedAudio.unlocked) companionPlayer.playWhenReady = true
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    DisposableEffect(Unit) {
        onDispose { exoPlayer.release() }
    }

    // ── Attached ("use this sound") companion audio ──
    // Resolve the borrowed track's audio URL once this clip is active (web `useMusicTrack`).
    LaunchedEffect(active, attachedTrackId) {
        if (active && attachedTrackId != null && resolveSoundUrl != null && soundUrl == null && !soundFailed) {
            val resolved = resolveSoundUrl(attachedTrackId)
            if (resolved == null) soundFailed = true else soundUrl = resolved
        }
    }

    // Play the borrowed track over the muted video while active + unlocked; stop when scrolled away.
    LaunchedEffect(active, soundUrl, FeedAudio.unlocked) {
        val track = soundUrl
        if (active && borrowing && track != null) {
            if (companionPlayer.currentMediaItem == null) {
                companionPlayer.setMediaItem(MediaItem.fromUri(track))
                companionPlayer.prepare()
            }
            companionPlayer.volume = soundVolume.coerceIn(0f, 1f)
            companionPlayer.playWhenReady = FeedAudio.unlocked
        } else {
            companionPlayer.playWhenReady = false
            if (!active) {
                companionPlayer.stop()
                companionPlayer.clearMediaItems()
            }
        }
    }

    // A companion load error → fall back to the clip's own audio (the volume effect unmutes it).
    DisposableEffect(companionPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                soundFailed = true
            }
        }
        companionPlayer.addListener(listener)
        onDispose { companionPlayer.removeListener(listener) }
    }

    DisposableEffect(Unit) {
        onDispose { companionPlayer.release() }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            // Tap unlocks feed audio (web parity: first tap turns sound on for the session).
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { FeedAudio.unlocked = true },
            )
            .then(
                if (contentDescription != null) {
                    Modifier.semantics { this.contentDescription = contentDescription }
                } else {
                    Modifier
                },
            ),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    player = exoPlayer
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                }
            },
        )
        if (showThumbnail && thumbnail != null) {
            TappyImage(
                url = thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

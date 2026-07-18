package com.tappyai.app.reviews.ui

import android.content.Intent
import android.net.Uri
import android.view.SurfaceView
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.tappyai.app.reviews.data.ReviewSourceType
import com.tappyai.core.designsystem.component.TappyImage

/**
 * The feed's video surface. Dispatches by source type, mirroring the web VideoPlayer's three lanes:
 *  - upload  → real ExoPlayer playback ([ReviewUploadVideoSurface])
 *  - youtube → muted autoplay embed in a WebView (matches the web's `<iframe>`), only while [active]
 *  - tiktok/facebook → thumbnail + a play control that opens the clip in the external app/browser
 *
 * Playback is driven purely by [active] (the feed's current pager page), exactly like the web which
 * drives from its active-slide flag rather than a per-view visibility observer.
 */
@Composable
internal fun ReviewFeedVideo(
    mediaUrl: String,
    thumbnail: String?,
    sourceType: ReviewSourceType?,
    sourceUrl: String?,
    active: Boolean,
    audioUnlocked: Boolean,
    onDuration: (Float) -> Unit,
    onRequestAudioUnlock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (sourceType) {
        ReviewSourceType.YouTube -> ReviewYouTubeSurface(mediaUrl, thumbnail, active, modifier)
        ReviewSourceType.TikTok, ReviewSourceType.Facebook ->
            ReviewExternalClipPreview(thumbnail, sourceUrl, modifier)
        else -> ReviewUploadVideoSurface(mediaUrl, active, audioUnlocked, onDuration, onRequestAudioUnlock, modifier)
    }
}

/**
 * Native-upload video: ExoPlayer rendering onto a SurfaceView. Autoplays MUTED when [active], loops,
 * and unmutes once [audioUnlocked] (the feed's first-tap audio permission). A single tap requests
 * that unlock — the web's "tap to unmute" — via [onRequestAudioUnlock]. Reports the clip duration in
 * seconds via [onDuration] once ExoPlayer reaches READY, for the feed's completion-rate analytics.
 */
@Composable
private fun ReviewUploadVideoSurface(
    url: String,
    active: Boolean,
    audioUnlocked: Boolean,
    onDuration: (Float) -> Unit,
    onRequestAudioUnlock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val player = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
            setMediaItem(MediaItem.fromUri(url))
            prepare()
        }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) {
                    val durMs = player.duration
                    if (durMs > 0) onDuration(durMs / 1000f)
                }
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    // Active drives play/pause; volume follows the feed-level audio unlock (muted until first tap).
    LaunchedEffect(active, audioUnlocked) {
        player.volume = if (audioUnlocked) 1f else 0f
        if (active) player.play() else player.pause()
    }
    Box(modifier = modifier.fillMaxSize().clickable(onClick = onRequestAudioUnlock)) {
        AndroidView(
            factory = { ctx -> SurfaceView(ctx).also { player.setVideoSurfaceView(it) } },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/** YouTube embed — a muted, looping, controls-less autoplay iframe in a WebView, mounted only while
 *  [active] (off-screen shows the thumbnail), matching the web's in-view-only iframe. */
@Composable
private fun ReviewYouTubeSurface(
    mediaUrl: String,
    thumbnail: String?,
    active: Boolean,
    modifier: Modifier = Modifier,
) {
    val videoId = remember(mediaUrl) { extractYoutubeId(mediaUrl) }
    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        if (active && videoId != null) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewClient = WebViewClient()
                        @Suppress("SetJavaScriptEnabled")
                        settings.javaScriptEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        setBackgroundColor(android.graphics.Color.BLACK)
                        loadData(youtubeEmbedHtml(videoId), "text/html", "utf-8")
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        } else if (thumbnail != null) {
            TappyImage(
                url = thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** TikTok/Facebook: no in-app playback (parity with the web) — thumbnail + a play control that opens
 *  the source URL in the external app or browser. */
@Composable
private fun ReviewExternalClipPreview(
    thumbnail: String?,
    sourceUrl: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Box(
        modifier = modifier.fillMaxSize().background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        if (thumbnail != null) {
            TappyImage(
                url = thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (sourceUrl != null) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Color(0x33FFFFFF))
                    .clickable {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sourceUrl))) }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(32.dp),
                )
            }
        }
    }
}

private fun youtubeEmbedHtml(videoId: String): String =
    "<html><body style=\"margin:0;background:#000\">" +
        "<iframe width=\"100%\" height=\"100%\" frameborder=\"0\" allow=\"autoplay; encrypted-media\" " +
        "src=\"https://www.youtube.com/embed/$videoId?autoplay=1&mute=1&playsinline=1&loop=1&playlist=$videoId&controls=0&modestbranding=1\">" +
        "</iframe></body></html>"

/** Mirrors the web's `extractYoutubeId` regex. */
private fun extractYoutubeId(url: String): String? =
    Regex("(?:youtube\\.com/watch\\?v=|youtu\\.be/)([^&?/]+)").find(url)?.groupValues?.getOrNull(1)

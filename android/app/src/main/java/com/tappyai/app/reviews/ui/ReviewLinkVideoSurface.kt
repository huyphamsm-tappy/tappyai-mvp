package com.tappyai.app.reviews.ui

import android.content.Intent
import android.net.Uri
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.tappyai.core.designsystem.component.TappyImage

/**
 * Playback surfaces for link-sourced review videos (not produced by the Android composer's upload
 * lane). Ported from the Web-parity reference at production `5c8dc38` to restore YouTube playback,
 * which this branch had regressed to a static poster. Uploads keep using [ReviewVideoPlayer]; these
 * cover the `source_type` cases the web's `VideoPlayer` renders separately.
 */

/** YouTube embed — a muted, looping, controls-less autoplay iframe in a WebView, mounted only while
 *  [active] (off-screen shows the thumbnail), matching the web's in-view-only `<iframe>`. */
@Composable
internal fun ReviewYouTubeSurface(
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
internal fun ReviewExternalClipPreview(
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

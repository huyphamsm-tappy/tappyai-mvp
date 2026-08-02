package com.tappyai.app.reviews.ui

import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebChromeClient
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
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

/**
 * YouTube embed â€” a muted, looping, controls-less autoplay iframe in a WebView.
 *
 * Lifecycle is Web parity (`VideoPlayer.tsx` Â§2.1/Â§6 of docs/WEB_YOUTUBE_PLAYBACK_ARCHITECTURE.md):
 * the embed's mount/unmount is driven by this surface's OWN visibility observation of its container
 * â€” an `IntersectionObserver` with `threshold: 0.5` on web â€” and NOT by the feed's `active` slide
 * prop, which the web's YouTube branch never reads. Compose has no IntersectionObserver, so the
 * 0.5 ratio is approximated with [onGloballyPositioned] + `boundsInWindow` (clipped to window and
 * to any scrolling/paging parent), recomputed on every layout pass â€” i.e. on every scroll frame.
 *
 * Crossing >=50% mounts a FRESH WebView (playback restarts at 0, as a fresh `<iframe>` does on web);
 * dropping below fully unmounts and destroys it. The poster never unmounts â€” it stays underneath and
 * only changes opacity (web: `opacity-100` -> `opacity-30`).
 */
@Composable
internal fun ReviewYouTubeSurface(
    mediaUrl: String,
    thumbnail: String?,
    modifier: Modifier = Modifier,
) {
    val videoId = remember(mediaUrl) { extractYoutubeId(mediaUrl) }
    // Sole driver of the embed, mirroring web's `ytActive` state. Reset when the clip changes.
    var inView by remember(videoId) { mutableStateOf(false) }
    val embedMounted = inView && videoId != null
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .onGloballyPositioned { coords -> inView = visibleFraction(coords) >= VISIBILITY_THRESHOLD },
    ) {
        // Poster is rendered at all times (web keeps the <img> in the DOM permanently), dimmed
        // behind the embed while it is mounted. Web parity (spec Â§thumbnail):
        // `ytThumb = thumbnail || https://i.ytimg.com/vi/{id}/maxresdefault.jpg` â€” the fallback
        // matters because YouTube posts carry no upload thumbnail, and without it this surface
        // rendered pure black where the web shows the video still.
        val poster = thumbnail ?: videoId?.let { "https://i.ytimg.com/vi/$it/maxresdefault.jpg" }
        if (poster != null) {
            TappyImage(
                url = poster,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().alpha(if (embedMounted) POSTER_ALPHA_ACTIVE else 1f),
            )
        }
        if (embedMounted) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        // The embed iframe (youtube.com) is a THIRD-PARTY context under the
                        // tappyai.com base, and WebView blocks third-party cookies by default â€”
                        // which makes the googlevideo video-stream request fail (net::ERR_FAILED)
                        // even though the player loads. Allow them so playback can start.
                        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        webViewClient = WebViewClient()
                        // A WebChromeClient is required for the WebView to play HTML5 / iframe
                        // media at all; without it the YouTube embed stays a black frame.
                        webChromeClient = WebChromeClient()
                        @Suppress("SetJavaScriptEnabled")
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        // Drop the WebView "; wv" UA marker: YouTube serves WebView clients a
                        // stream config whose video request fails (net::ERR_FAILED); a plain
                        // Chrome UA gets a playable stream.
                        settings.userAgentString = settings.userAgentString.replace("; wv", "")
                        // Web layering parity: div(black) > img(poster) > iframe(TRANSPARENT).
                        // The web iframe has no background of its own â€” when the player paints
                        // nothing (autoplay withheld on mobile), the poster shows through. An
                        // opaque black WebView here was occluding the poster entirely, which is
                        // why this surface rendered pure black where mobile web shows the still.
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        // Base URL mirrors the web app's embedding origin (www.tappyai.com).
                        loadDataWithBaseURL(
                            "https://www.tappyai.com",
                            youtubeEmbedHtml(videoId),
                            "text/html",
                            "utf-8",
                            null,
                        )
                    }
                },
                modifier = Modifier.fillMaxSize(),
                // Web relies on the browser discarding the iframe's document when React removes the
                // node. AndroidView has no such automatic teardown: without this the WebView (and
                // its renderer process + still-decoding MediaCodec) outlives the composable. Tear
                // it down in the documented order â€” detach before destroy(), or the WebView can
                // keep running inside its parent.
                onRelease = { web ->
                    web.stopLoading()
                    web.loadUrl("about:blank")
                    web.webChromeClient = null
                    (web.parent as? ViewGroup)?.removeView(web)
                    web.removeAllViews()
                    web.destroy()
                },
            )
        }
    }
}

/** Fraction of the surface still inside the window after all parent clipping â€” Compose's closest
 *  equivalent to an `IntersectionObserver` entry's `intersectionRatio`. */
private fun visibleFraction(coords: LayoutCoordinates): Float {
    if (!coords.isAttached) return 0f
    val size = coords.size
    if (size.width <= 0 || size.height <= 0) return 0f
    val bounds = coords.boundsInWindow()
    val visibleArea = bounds.width.coerceAtLeast(0f) * bounds.height.coerceAtLeast(0f)
    return visibleArea / (size.width.toFloat() * size.height.toFloat())
}

/** Web: `new IntersectionObserver(..., { threshold: 0.5 })`. */
private const val VISIBILITY_THRESHOLD = 0.5f

/** Web: poster `<img>` flips `opacity-100` -> `opacity-30` while the embed is mounted. */
private const val POSTER_ALPHA_ACTIVE = 0.3f

/** TikTok/Facebook: no in-app playback (parity with the web) â€” thumbnail + a play control that opens
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

/**
 * Attribute-for-attribute copy of the web iframe (docs/WEB_YOUTUBE_PLAYBACK_ARCHITECTURE.md
 * "embed contract"): identical parameter string, `allow="autoplay; encrypted-media"`,
 * `allowfullscreen`, `title="video"`. The wrapper stays TRANSPARENT — the web has no wrapper
 * document at all, its iframe sits straight over the poster img — so a background here would
 * occlude the poster underneath whenever the player paints nothing.
 */
private fun youtubeEmbedHtml(videoId: String): String =
    "<html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
        "<style>html,body{margin:0;height:100%;width:100%;background:transparent;overflow:hidden}" +
        "iframe{display:block;width:100%;height:100%;border:0}</style></head><body>" +
        "<iframe width=\"100%\" height=\"100%\" frameborder=\"0\" allow=\"autoplay; encrypted-media\" " +
        "allowfullscreen title=\"video\" " +
        "src=\"https://www.youtube.com/embed/$videoId?autoplay=1&mute=1&playsinline=1&loop=1&playlist=$videoId&controls=0&modestbranding=1\">" +
        "</iframe></body></html>"

/** Mirrors the web's `extractYoutubeId` regex. */
private fun extractYoutubeId(url: String): String? =
    Regex("(?:youtube\\.com/watch\\?v=|youtu\\.be/)([^&?/]+)").find(url)?.groupValues?.getOrNull(1)

package com.tappyai.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * A horizontally-scrollable strip of place photos pulled from an assistant reply's markdown images —
 * the Compose equivalent of the web formatMessage carousel. Web parity: 200×160 items, 12px radius,
 * 8px gap, `scroll-snap-type: x mandatory` (snap-to-start), native-lazy load, and click-to-zoom into
 * a full-screen lightbox (web's `data-zoomable` handler).
 */
@Composable
fun ChatImageCarousel(urls: List<String>, modifier: Modifier = Modifier) {
    var zoomUrl by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    LazyRow(
        state = listState,
        // scroll-snap-type: x mandatory — snap each image to the strip's start.
        flingBehavior = rememberSnapFlingBehavior(listState),
        modifier = modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.md), // web margin: 8px
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // web gap: 8px
    ) {
        items(urls) { url ->
            Box(
                modifier = Modifier
                    .width(200.dp)
                    .height(160.dp)
                    .clip(RoundedCornerShape(12.dp))
                    // Neutral placeholder shows while the image loads (and stays for a broken URL,
                    // instead of an empty gap) — the image draws over it once decoded.
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                    .clickable { zoomUrl = url },
            ) {
                TappyImage(
                    url = url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
    zoomUrl?.let { url ->
        ImageLightbox(url = url, onDismiss = { zoomUrl = null })
    }
}

/** Full-screen zoom (web lightbox: black/80 scrim, contain-fit image, top-right close). */
@Composable
private fun ImageLightbox(url: String, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.8f))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center,
        ) {
            TappyImage(
                url = url,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth(0.92f) // web max-w-[92vw]
                    .fillMaxHeight(0.85f) // web max-h-[85vh]
                    .clip(RoundedCornerShape(8.dp)),
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(TappySpacing.lg)
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.1f)),
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.chat_clear_pending_image),
                    tint = Color.White,
                )
            }
        }
    }
}

package com.tappyai.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * The server's `[TAPPY_MEDIA]` block as native cards (web `MediaBlocks.tsx`): a strip of news
 * pictures, or one/several Wikipedia subject cards. Every URL in [blocks] already passed the
 * host allow-lists in [MediaBlocks] — images load only from those hosts, and a tap opens only an
 * article page of the listed outlets / Wikipedia. Shown once the reply is complete.
 */
@Composable
fun MediaBlocksView(blocks: List<MediaBlock>, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    // A link that cannot be opened (no browser) must never crash the chat.
    val open: (String) -> Unit = { url -> runCatching { uriHandler.openUri(url) } }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        blocks.forEach { block ->
            when (block) {
                is MediaBlock.News -> NewsStrip(block.items, open)
                is MediaBlock.Entities -> block.entities.forEach { EntityCard(it, open) }
            }
        }
    }
}

@Composable
private fun NewsStrip(items: List<MediaBlock.NewsItem>, open: (String) -> Unit) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        items(items, key = { it.href }) { item ->
            Column(
                modifier = Modifier
                    .width(200.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                    .clickable { open(item.href) },
            ) {
                TappyImage(
                    url = item.src,
                    contentDescription = item.title.ifBlank { item.label },
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(112.dp),
                )
                Column(modifier = Modifier.padding(TappySpacing.md)) {
                    Text(
                        text = item.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun EntityCard(entity: MediaBlock.Entity, open: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .clickable { open(entity.href) },
    ) {
        entity.image?.let { image ->
            Box(modifier = Modifier.fillMaxWidth().height(160.dp)) {
                TappyImage(
                    url = image,
                    contentDescription = entity.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                )
            }
        }
        Column(
            modifier = Modifier.padding(TappySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Text(text = entity.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                text = entity.summary,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 6,
                overflow = TextOverflow.Ellipsis,
            )
            Text(text = "Wikipedia", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

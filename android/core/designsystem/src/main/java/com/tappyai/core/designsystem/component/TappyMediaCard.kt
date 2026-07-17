package com.tappyai.core.designsystem.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Shared base for the library's feed/detail media cards (docs/UI_GUIDELINES.md §11): image +
 * title + optional subtitle/rating/price/tag row. [TappyRestaurantCard]/[TappyHotelCard]/
 * [TappyTravelCard] below are thin wrappers over this one layout with a domain-appropriate
 * default [imageAspectRatio] — kept as one implementation (DRY) instead of three near-duplicate
 * layouts, and deliberately typed with plain params (no domain model dependency) so this
 * module stays decoupled from any future `core:model` types.
 */
@Composable
fun TappyMediaCard(
    imageUrl: String?,
    title: String,
    modifier: Modifier = Modifier,
    imageAspectRatio: Float = 4f / 3f,
    subtitle: String? = null,
    ratingText: String? = null,
    priceText: String? = null,
    tagText: String? = null,
    onClick: (() -> Unit)? = null,
) {
    // The whole card (image + title + metadata) is always far taller than the 48dp touch-target
    // floor, so unlike the compact controls elsewhere in this library, no extra padding is
    // needed here to satisfy TappyMinTouchTarget — the full card area already qualifies.
    TappyCard(
        modifier = modifier
            .fillMaxWidth()
            .let { if (onClick != null) it.clickable(onClick = onClick, role = Role.Button) else it },
    ) {
        TappyImage(
            url = imageUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(imageAspectRatio)
                .clip(TappyShapes.card),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = TappySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                if (ratingText != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.padding(end = TappySpacing.xs),
                        )
                        Text(ratingText, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (priceText != null || tagText != null) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (tagText != null) {
                        Text(
                            text = tagText,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (priceText != null) {
                        Text(
                            text = priceText,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}

/** Place photo ratio per §11 ("~5:4, current 200×160 strip"). */
@Composable
fun TappyRestaurantCard(
    imageUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
    cuisineOrArea: String? = null,
    ratingText: String? = null,
    priceLevel: String? = null,
    onClick: (() -> Unit)? = null,
) = TappyMediaCard(
    imageUrl = imageUrl,
    title = name,
    modifier = modifier,
    imageAspectRatio = 5f / 4f,
    subtitle = cuisineOrArea,
    ratingText = ratingText,
    priceText = priceLevel,
    onClick = onClick,
)

/** Thumbnail ratio per §11 ("1:1 or 4:3"). */
@Composable
fun TappyHotelCard(
    imageUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
    location: String? = null,
    ratingText: String? = null,
    pricePerNight: String? = null,
    onClick: (() -> Unit)? = null,
) = TappyMediaCard(
    imageUrl = imageUrl,
    title = name,
    modifier = modifier,
    imageAspectRatio = 4f / 3f,
    subtitle = location,
    ratingText = ratingText,
    priceText = pricePerNight,
    onClick = onClick,
)

/** Wide banner ratio per §11 ("16:9"). */
@Composable
fun TappyTravelCard(
    imageUrl: String?,
    destination: String,
    modifier: Modifier = Modifier,
    dateRangeOrDuration: String? = null,
    tagText: String? = null,
    priceText: String? = null,
    onClick: (() -> Unit)? = null,
) = TappyMediaCard(
    imageUrl = imageUrl,
    title = destination,
    modifier = modifier,
    imageAspectRatio = 16f / 9f,
    subtitle = dateRangeOrDuration,
    tagText = tagText,
    priceText = priceText,
    onClick = onClick,
)

/** Covers the base [TappyMediaCard] layout plus all three domain wrappers in one preview,
 *  since they share one implementation (see the class doc above) — not four near-duplicate
 *  previews. */
@TappyComponentPreviews
@Composable
private fun TappyMediaCardPreview() {
    TappyAITheme(dynamicColor = false) {
        Column(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            TappyRestaurantCard(imageUrl = null, name = "Phở Hòa", cuisineOrArea = "Phở · Bình Thạnh", ratingText = "4.6")
            TappyHotelCard(imageUrl = null, name = "Ocean View Hotel", location = "Đà Nẵng", ratingText = "4.8")
            TappyTravelCard(imageUrl = null, destination = "Đà Lạt 3N2Đ", tagText = "Núi rừng")
        }
    }
}

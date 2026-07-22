package com.tappyai.app.maps

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.BookmarkRemove
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyMediaCard
import com.tappyai.core.designsystem.component.TappySearchBar
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.TappyWindowWidthClass
import com.tappyai.core.designsystem.theme.currentWindowWidthClass

/**
 * Maps foundation (MFS 3.7 Nearby / 3.8 Maps) — full screen structure, **no map SDK, no
 * location, no Places API**. The map itself is [MapCanvas] (a swappable placeholder); the place
 * list/detail data is real (`GET /api/favorites`, see [MapsViewModel]). Place-detail actions
 * (Open/Remove/Share) are real too — see [openPlaceInMaps]/[sharePlace]/`MapsViewModel.removeFavorite`.
 * Nothing here is coming-soon: the map pane's former layers/my-location FABs were removed rather
 * than implemented, because the web has no maps page and no such controls (see [MapPane]'s doc).
 * Reuses design-system pieces throughout: [TappySearchBar], [TappyMediaCard] for place rows, [TappyBottomSheet] for place
 * detail, [TappyEmptyState]/[TappyLoadingIndicator]. Responsive: a phone toggles Map⇄List; a tablet
 * (Expanded window) shows the list and map side by side.
 */
@Composable
fun MapsScreen(viewModel: MapsViewModel = hiltViewModel()) {
    val isExpanded = currentWindowWidthClass() == TappyWindowWidthClass.Expanded
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize().padding(TappySpacing.md)) {
        TappySearchBar(
            query = viewModel.query,
            onQueryChange = viewModel::onQueryChange,
            // Mirrors the web MVP's category-listing style ("Ask TappyAI about food, travel,
            // spa…"), scoped to place search and matching the filter categories below.
            placeholder = stringResource(R.string.maps_search_placeholder),
        )
        FilterChipsRow(
            selected = viewModel.selectedFilter,
            onSelect = viewModel::onFilterChange,
            modifier = Modifier.padding(vertical = TappySpacing.sm),
        )

        if (isExpanded) {
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                PlaceListPane(
                    state = viewModel.placesState(),
                    onSelect = viewModel::onSelectPlace,
                    onRetry = viewModel::retry,
                    modifier = Modifier.weight(0.42f).fillMaxHeight(),
                )
                MapPane(modifier = Modifier.weight(0.58f).fillMaxHeight())
            }
        } else {
            ViewToggle(
                mode = viewModel.viewMode,
                onChange = viewModel::onViewModeChange,
                modifier = Modifier.padding(bottom = TappySpacing.sm),
            )
            Box(modifier = Modifier.fillMaxSize()) {
                when (viewModel.viewMode) {
                    MapsViewMode.Map -> MapPane(modifier = Modifier.fillMaxSize())
                    MapsViewMode.List -> PlaceListPane(
                        state = viewModel.placesState(),
                        onSelect = viewModel::onSelectPlace,
                        onRetry = viewModel::retry,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    viewModel.selectedPlace?.let { place ->
        PlaceDetailSheet(
            place = place,
            onDismiss = viewModel::onDismissPlaceDetail,
            onOpen = { viewModel.onDismissPlaceDetail(); openPlaceInMaps(context, place) },
            onRemove = { viewModel.removeFavorite(place.placeId) },
            onShare = { viewModel.onDismissPlaceDetail(); sharePlace(context, place) },
        )
    }

}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterChipsRow(
    selected: PlaceCategory,
    onSelect: (PlaceCategory) -> Unit,
    modifier: Modifier = Modifier,
) {
    // LazyRow, not a wrapping row: the chips scroll horizontally on one line and gracefully
    // absorb any number of future categories without a layout redesign.
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        items(items = PlaceCategory.entries, key = { it.name }) { category ->
            FilterChip(
                selected = category == selected,
                onClick = { onSelect(category) },
                label = { Text(category.label()) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ViewToggle(
    mode: MapsViewMode,
    onChange: (MapsViewMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    SingleChoiceSegmentedButtonRow(modifier = modifier.fillMaxWidth()) {
        MapsViewMode.entries.forEachIndexed { index, viewMode ->
            SegmentedButton(
                selected = mode == viewMode,
                onClick = { onChange(viewMode) },
                shape = SegmentedButtonDefaults.itemShape(index, MapsViewMode.entries.size),
            ) {
                Text(viewMode.label())
            }
        }
    }
}

/**
 * The map pane is [MapCanvas] alone — a placeholder kept as the swap seam for a real map SDK.
 *
 * It deliberately carries **no controls**. Layers and My-Location buttons used to sit here wired to
 * a coming-soon sheet, but the web has no maps page and no such controls anywhere (its counterpart
 * to this data is the plain saved-places list at `/profile/favorites`), so they promised the user
 * features that were never on the roadmap. Parity meant deleting them, not implementing them.
 */
@Composable
private fun MapPane(modifier: Modifier = Modifier) {
    Box(modifier = modifier) {
        MapCanvas(modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun PlaceListPane(
    state: UiState<List<MapPlace>>,
    onSelect: (MapPlace) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        UiState.Loading -> Box(modifier, contentAlignment = Alignment.Center) { TappyLoadingIndicator() }
        is UiState.Success -> LazyColumn(
            modifier = modifier,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            items(items = state.data, key = { it.id }) { place ->
                TappyMediaCard(
                    imageUrl = place.imageUrl,
                    title = place.name,
                    subtitle = "${place.category.label()} • ${place.address}",
                    ratingText = place.rating?.let { "$it ★" },
                    onClick = { onSelect(place) },
                )
            }
        }
        is UiState.Error -> Box(modifier, contentAlignment = Alignment.Center) {
            TappyErrorState(
                title = stringResource(R.string.maps_load_error_title),
                message = state.message,
                retryText = stringResource(R.string.common_try_again),
                onRetry = onRetry,
            )
        }
        else -> Box(modifier, contentAlignment = Alignment.Center) {
            TappyEmptyState(
                icon = Icons.Filled.SearchOff,
                title = stringResource(R.string.maps_empty_title),
                message = stringResource(R.string.maps_empty_message),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlaceDetailSheet(
    place: MapPlace,
    onDismiss: () -> Unit,
    onOpen: () -> Unit,
    onRemove: () -> Unit,
    onShare: () -> Unit,
) {
    TappyBottomSheet(onDismiss = onDismiss) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = place.name,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                place.rating?.let {
                    Text(
                        text = "★ $it",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.tertiaryContainer,
                                RoundedCornerShape(12.dp),
                            )
                            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
                    )
                }
            }
            Text(
                text = "${place.category.emoji} ${place.category.label()}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier
                    .background(
                        MaterialTheme.colorScheme.secondaryContainer,
                        RoundedCornerShape(16.dp),
                    )
                    .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        TappyShapes.card,
                    )
                    .padding(TappySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                DetailRow(Icons.Filled.LocationOn, stringResource(R.string.maps_detail_address), place.address)
                place.phone?.let { DetailRow(Icons.Filled.Phone, stringResource(R.string.maps_detail_phone), it) }
                place.hours?.let { DetailRow(Icons.Filled.AccessTime, stringResource(R.string.maps_detail_hours), it) }
                place.price?.let { DetailRow(Icons.Filled.Payments, stringResource(R.string.maps_detail_price), it) }
            }
            place.note?.let {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
                            TappyShapes.card,
                        )
                        .padding(TappySpacing.md),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                ) {
                    Text(text = "💡", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                PlaceAction(Icons.AutoMirrored.Filled.OpenInNew, stringResource(R.string.maps_action_open), onOpen, Modifier.weight(1f))
                PlaceAction(Icons.Filled.BookmarkRemove, stringResource(R.string.maps_action_remove), onRemove, Modifier.weight(1f))
                PlaceAction(Icons.Filled.Share, stringResource(R.string.maps_action_share), onShare, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun DetailRow(icon: ImageVector, label: String, value: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp).padding(top = 2.dp),
        )
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun PlaceAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(TappyShapes.card)
            .clickable(onClick = onClick)
            .padding(vertical = TappySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Text(text = label, style = MaterialTheme.typography.labelMedium)
    }
}

/**
 * Opens [place] in an external maps app/browser. `MapPlace.mapsLink` is always null today (the
 * favorites endpoint doesn't carry it — see `MapPlace`'s doc), so this always falls through to a
 * Google Maps *search* URL built from name+address — the identical fallback the backend itself
 * uses server-side when a place has no `maps_link` (`src/lib/platformLinks/` files,
 * `src/lib/ai/tools/food.ts`), kept consistent here rather than inventing a different format. No
 * Places API call, no new backend endpoint — a plain search URL, same as every other response CTA
 * in this app (see `project_response_links`: platform search links, never a real place-detail
 * deep link).
 */
private fun openPlaceInMaps(context: Context, place: MapPlace) {
    val url = place.mapsLink
        ?: "https://www.google.com/maps/search/?api=1&query=${Uri.encode("${place.name} ${place.address}")}"
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}

/** Shares [place] as plain text via the system share sheet — mirrors `BookingsScreen.shareBooking`. */
private fun sharePlace(context: Context, place: MapPlace) {
    val mapsUrl = place.mapsLink
        ?: "https://www.google.com/maps/search/?api=1&query=${Uri.encode("${place.name} ${place.address}")}"
    val text = context.getString(R.string.maps_share_text, place.name, place.address, mapsUrl)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.maps_share_chooser_title)))
}

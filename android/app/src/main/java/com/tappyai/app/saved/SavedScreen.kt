package com.tappyai.app.saved

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3ErrorLine
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3Panel
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.personal.V3Tone
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyImage

/**
 * Saved — the web `/profile/favorites` (`SavedView.tsx`, owner reference 2026-09-28).
 *
 * The hero ("Đã lưu" · "Những điều bạn yêu thích 💙" · the reading otter) carries the filter chips
 * Tất cả / Địa điểm / Bài viết / Video — Deals and Bộ sưu tập are HIDDEN (owner 2026-09-28: no save
 * model behind them, so no "Sắp có" either). "Tất cả" is the hub: two count cards, one per REAL
 * saved dataset — ĐỊA ĐIỂM (`/api/favorites`) and BÀI VIẾT (`/api/reviews/saved`) — and, when
 * nothing is saved, one empty card whose CTA opens Explore. Video is a FILTER over the saved posts
 * (a video IS a saved review), so it has no count card of its own.
 *
 * ZERO IS SHOWN, NOT HIDDEN: a category with nothing in it still renders its card and its 0, so
 * the page never looks fuller than the account is. The chip state is the web's `?type=` URL — here
 * a saveable view state the system Back button unwinds to the hub.
 *
 * Data, routes and the un-save control are unchanged: [SavedViewModel] over the same two
 * endpoints, a place opens the Service Detail (the web's `/service/{slug}`), a post opens the
 * review, deleting a favorite removes it at once and cancels it on the backend.
 */
@Composable
fun SavedScreen(
    onBack: () -> Unit,
    onExploreNow: () -> Unit,
    onOpenReview: (String) -> Unit,
    onOpenPlace: (FavoritePlace) -> Unit,
    viewModel: SavedViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    // The web's `?type=places|posts|videos`; null is the hub ("Tất cả").
    var view by rememberSaveable { mutableStateOf<String?>(null) }
    val filter = savedFilterOf(view)
    BackHandler(enabled = view != null) { view = null }

    val data: SavedData? = when (state) {
        is UiState.Success -> state.data
        UiState.Empty -> SavedData(emptyList(), emptyList())
        else -> null
    }

    V3PersonalPage(
        title = stringResource(R.string.saved_title),
        subtitle = data?.let { stringResource(R.string.saved_items_count, it.total) },
        onBack = onBack,
    ) {
        SavedHero(filter = filter, onSelect = { view = if (it == SavedFilter.ALL) null else it.name })
        Spacer(modifier = Modifier.height(16.dp))
        when {
            state is UiState.Error -> V3Panel {
                V3ErrorLine(message = state.message, retryText = stringResource(R.string.common_try_again), onRetry = viewModel::load)
            }
            data == null -> V3Panel { V3Loading() }
            filter == SavedFilter.ALL -> {
                SavedHub(
                    placesCount = data.favorites.size,
                    postsCount = data.reviews.size,
                    onOpen = { view = it.name },
                )
                if (data.isEmpty) {
                    Spacer(modifier = Modifier.height(16.dp))
                    SavedEmpty(onExploreNow = onExploreNow)
                }
            }
            filter == SavedFilter.PLACES -> CategoryPanel(
                title = stringResource(R.string.saved_section_favorites),
                empty = data.favorites.isEmpty(),
                onBackToHub = { view = null },
                onExploreNow = onExploreNow,
            ) {
                data.favorites.forEachIndexed { index, fav ->
                    if (index > 0) HorizontalDivider(color = HomeV3.Outline)
                    FavoriteRow(favorite = fav, onOpen = { onOpenPlace(fav) }, onDelete = { viewModel.removeFavorite(fav.placeId) })
                }
            }
            else -> {
                val posts = if (filter == SavedFilter.VIDEOS) data.reviews.filter { it.isVideo } else data.reviews
                CategoryPanel(
                    title = stringResource(if (filter == SavedFilter.VIDEOS) R.string.saved_section_videos else R.string.saved_section_reviews),
                    empty = posts.isEmpty(),
                    onBackToHub = { view = null },
                    onExploreNow = onExploreNow,
                ) {
                    posts.forEachIndexed { index, review ->
                        if (index > 0) HorizontalDivider(color = HomeV3.Outline)
                        SavedReviewRow(review = review, onOpen = { onOpenReview(review.id) })
                    }
                }
            }
        }
    }
}

private val HeroAccent = Color(0xFF3391FF)

/** `SavedHero`: label, title, subtitle, the chips, and the reading otter on the right. */
@Composable
private fun SavedHero(filter: SavedFilter, onSelect: (SavedFilter) -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xE60F1E46), HomeV3.Surface)))
            .background(Brush.radialGradient(listOf(HeroAccent.copy(alpha = 0.22f), Color.Transparent), radius = 700f, center = Offset(900f, 60f)))
            .border(1.dp, HomeV3.Outline, shape)
            .testTag("saved_hero"),
    ) {
        Image(
            painter = painterResource(R.drawable.tappy_reading),
            contentDescription = null,
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 8.dp, end = 4.dp).size(96.dp),
        )
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Bookmark, contentDescription = null, tint = HeroAccent, modifier = Modifier.size(18.dp))
                Text(text = stringResource(R.string.saved_title), color = HeroAccent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Text(
                text = stringResource(R.string.saved_hero_title),
                color = HomeV3.OnSurface,
                fontSize = 22.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 8.dp, end = 88.dp),
            )
            Text(
                text = stringResource(R.string.saved_hero_subtitle),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 13.5.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
            Row(
                modifier = Modifier.padding(top = 18.dp).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                SAVED_CHIPS.forEach { chip ->
                    FilterChipPill(chip = chip, active = chip.filter == filter, onClick = { onSelect(chip.filter) })
                }
            }
        }
    }
}

private class SavedChip(val filter: SavedFilter, val icon: ImageVector, val label: Int)

// Order and icons follow the reference; Deals and Bộ sưu tập are hidden (owner 2026-09-28).
private val SAVED_CHIPS = listOf(
    SavedChip(SavedFilter.ALL, Icons.Filled.GridView, R.string.saved_filter_all),
    SavedChip(SavedFilter.PLACES, Icons.Filled.Place, R.string.saved_filter_places),
    SavedChip(SavedFilter.POSTS, Icons.Filled.Description, R.string.saved_filter_posts),
    SavedChip(SavedFilter.VIDEOS, Icons.Filled.PlayCircle, R.string.saved_filter_videos),
)

@Composable
private fun FilterChipPill(chip: SavedChip, active: Boolean, onClick: () -> Unit) {
    val label = stringResource(chip.label)
    Row(
        modifier = Modifier
            .heightIn(min = 40.dp)
            .clip(CircleShape)
            .then(if (active) Modifier.background(HeroAccent.copy(alpha = 0.12f)).border(1.dp, HeroAccent, CircleShape) else Modifier)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics { selected = active }
            .testTag("saved_chip_${chip.filter.name.lowercase()}")
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(chip.icon, contentDescription = null, tint = if (active) HeroAccent else HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
        Text(text = label, color = if (active) HomeV3.OnSurface else HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

/** `SavedHub`: the two count cards — one per REAL saved dataset, zero shown not hidden. */
@Composable
private fun SavedHub(placesCount: Int, postsCount: Int, onOpen: (SavedFilter) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CountCard(
            filter = SavedFilter.PLACES, icon = Icons.Filled.Place, tile = Color(0xFF1D6FE0),
            label = stringResource(R.string.saved_section_favorites), desc = stringResource(R.string.saved_card_places_desc),
            count = placesCount, unit = stringResource(R.string.saved_unit_places), onOpen = onOpen,
        )
        CountCard(
            filter = SavedFilter.POSTS, icon = Icons.Filled.Description, tile = Color(0xFF6D4FD8),
            label = stringResource(R.string.saved_section_reviews), desc = stringResource(R.string.saved_card_posts_desc),
            count = postsCount, unit = stringResource(R.string.saved_unit_posts), onOpen = onOpen,
        )
    }
}

@Composable
private fun CountCard(
    filter: SavedFilter, icon: ImageVector, tile: Color, label: String, desc: String, count: Int, unit: String,
    onOpen: (SavedFilter) -> Unit,
) {
    V3Panel(padding = 0.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = { onOpen(filter) })
                .heightIn(min = 104.dp)
                .testTag("saved_count_${filter.name.lowercase()}")
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(modifier = Modifier.size(48.dp).clip(CircleShape).background(tile), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = label, color = HomeV3.OnSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(text = desc, color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = count.toString(), color = HomeV3.OnSurface, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                Text(text = unit, color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(18.dp))
        }
    }
}

/** Nothing saved at all: one card, one real discovery route (the Explore tab). */
@Composable
private fun SavedEmpty(onExploreNow: () -> Unit) {
    V3Panel {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp).testTag("saved_empty"),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(modifier = Modifier.size(80.dp).clip(RoundedCornerShape(16.dp)).background(HomeV3.SurfaceVariant), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Bookmark, contentDescription = null, tint = HeroAccent, modifier = Modifier.size(34.dp))
            }
            Text(text = stringResource(R.string.saved_hub_empty_title), color = HomeV3.OnSurface, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 20.dp))
            Text(
                text = stringResource(R.string.saved_hub_empty_hint),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 13.5.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            Row(
                modifier = Modifier
                    .padding(top = 24.dp)
                    .heightIn(min = 48.dp)
                    .clip(CircleShape)
                    .background(HeroAccent)
                    .clickable(role = Role.Button, onClick = onExploreNow)
                    .padding(horizontal = 28.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Explore, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                Text(text = stringResource(R.string.saved_explore_now), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** `CategoryView`: the panel header carries the "‹ Đã lưu" link back to the hub and the category title. */
@Composable
private fun CategoryPanel(
    title: String,
    empty: Boolean,
    onBackToHub: () -> Unit,
    onExploreNow: () -> Unit,
    rows: @Composable () -> Unit,
) {
    V3Panel(padding = 0.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "‹ " + stringResource(R.string.saved_title),
                color = HomeV3.Purple,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onBackToHub).padding(horizontal = 4.dp, vertical = 4.dp),
            )
            Text(text = title, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        HorizontalDivider(color = HomeV3.Outline)
        if (empty) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(text = stringResource(R.string.saved_empty_title), color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                Text(text = stringResource(R.string.saved_empty_message), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp, textAlign = TextAlign.Center)
                Spacer(modifier = Modifier.height(6.dp))
                // A real discovery route (the Explore tab), not a fabricated recommendation.
                Text(
                    text = stringResource(R.string.saved_explore_now),
                    color = HomeV3.Purple,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onExploreNow).padding(horizontal = 8.dp, vertical = 6.dp),
                )
            }
        } else {
            rows()
        }
    }
}

@Composable
private fun FavoriteRow(favorite: FavoritePlace, onOpen: () -> Unit, onDelete: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.weight(1f).clickable(onClick = onOpen).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(text = emojiForPlaceType(favorite.type), fontSize = 20.sp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = favorite.name, color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (favorite.address.isNotBlank()) {
                    Text(text = favorite.address, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    text = stringResource(R.string.saved_date_prefix, formatSavedDate(favorite.savedAtMillis)),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        // The existing delete control, reused — un-saving still goes through the same route.
        IconButton(onClick = onDelete) {
            Icon(
                imageVector = Icons.Filled.Delete,
                contentDescription = stringResource(R.string.saved_remove_favorite_content_description, favorite.name),
                tint = HomeV3.OnSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun SavedReviewRow(review: SavedReview, onOpen: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val shape = RoundedCornerShape(12.dp)
        Box(
            modifier = Modifier.size(48.dp).clip(shape).background(HomeV3.SurfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (review.thumbnailUrl != null) {
                TappyImage(url = review.thumbnailUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(shape))
            } else {
                Icon(Icons.Filled.Description, contentDescription = null, tint = V3Tone.Violet, modifier = Modifier.size(17.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = review.placeName ?: stringResource(R.string.saved_review_fallback_name),
                color = HomeV3.OnSurface,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (review.body != null) {
                Text(text = review.body, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text(
                text = stringResource(R.string.saved_date_prefix, formatSavedDate(review.savedAtMillis)),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

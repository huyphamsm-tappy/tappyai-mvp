package com.tappyai.app.saved

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import com.tappyai.app.personal.V3PanelHeader
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.personal.V3Tone
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyImage

/**
 * Saved — the web `/profile/favorites` (`SavedView.tsx`, V3), 2026-09-17.
 *
 * A UTILITY HUB, NOT A DASHBOARD: `V3Shell` at phone width with "Đã lưu" and the "N mục"
 * subtitle, then ONE `.v3-panel`. The panel is the hub — one row per REAL saved category,
 * ĐỊA ĐIỂM (`/api/favorites`) and BÀI VIẾT (`/api/reviews/saved`), each with the count of the
 * very list that opens — or, once a row is tapped, that category's contents with a "‹ Đã lưu"
 * link back to the hub (the web's `?type=` URL; here a saveable view state the system Back
 * button also unwinds).
 *
 * ZERO IS SHOWN, NOT HIDDEN: a category with nothing in it still renders its row and its 0, so
 * the page never looks fuller than the account is. Deals / Sản phẩm / Video are absent for the
 * web's audited reasons (no deal-save model, no catalogue, and a video IS a saved review).
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
    // The web's `?type=places|posts`; null is the hub.
    var view by rememberSaveable { mutableStateOf<String?>(null) }
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
        when {
            state is UiState.Error -> V3Panel {
                V3ErrorLine(message = state.message, retryText = stringResource(R.string.common_try_again), onRetry = viewModel::load)
            }
            data == null -> V3Panel { V3Loading() }
            view == null -> SavedHub(
                placesCount = data.favorites.size,
                postsCount = data.reviews.size,
                onOpen = { view = it },
            )
            view == "places" -> CategoryPanel(
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
            else -> CategoryPanel(
                title = stringResource(R.string.saved_section_reviews),
                empty = data.reviews.isEmpty(),
                onBackToHub = { view = null },
                onExploreNow = onExploreNow,
            ) {
                data.reviews.forEachIndexed { index, review ->
                    if (index > 0) HorizontalDivider(color = HomeV3.Outline)
                    SavedReviewRow(review = review, onOpen = { onOpenReview(review.id) })
                }
            }
        }
    }
}

/** `SavedHub`: one row per REAL saved category, its count, a chevron. */
@Composable
private fun SavedHub(placesCount: Int, postsCount: Int, onOpen: (String) -> Unit) {
    V3Panel(padding = 0.dp) {
        V3PanelHeader(
            title = stringResource(R.string.saved_title),
            icon = Icons.Filled.Bookmark,
            tint = V3Tone.Violet,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
        HorizontalDivider(color = HomeV3.Outline)
        HubRow(key = "places", icon = Icons.Filled.Place, tone = HomeV3.Purple, label = stringResource(R.string.saved_section_favorites), count = placesCount, onOpen = onOpen)
        HorizontalDivider(color = HomeV3.Outline)
        HubRow(key = "posts", icon = Icons.Filled.Description, tone = V3Tone.Violet, label = stringResource(R.string.saved_section_reviews), count = postsCount, onOpen = onOpen)
    }
}

@Composable
private fun HubRow(key: String, icon: ImageVector, tone: Color, label: String, count: Int, onOpen: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = { onOpen(key) })
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(HomeV3.SurfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tone, modifier = Modifier.size(18.dp))
        }
        Text(text = label, color = HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(text = count.toString(), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(18.dp))
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

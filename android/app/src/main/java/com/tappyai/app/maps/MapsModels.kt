package com.tappyai.app.maps

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/** Which top-level view the Maps screen shows on a phone (tablet shows both side by side). */
enum class MapsViewMode(@StringRes val labelRes: Int) {
    Map(R.string.maps_view_mode_map),
    List(R.string.maps_view_mode_list),
}

@Composable
fun MapsViewMode.label(): String = stringResource(labelRes)

/** Filter categories aligned with the Web place model (food/spa/hotel/travel/shopping/entertainment). */
enum class PlaceCategory(@StringRes val labelRes: Int, val emoji: String) {
    All(R.string.maps_category_all, "📍"),
    Food(R.string.maps_category_food, "🍜"),
    Spa(R.string.maps_category_spa, "💆"),
    Hotel(R.string.maps_category_hotel, "🏨"),
    Travel(R.string.maps_category_travel, "✈️"),
    Shopping(R.string.maps_category_shopping, "🛍️"),
    Entertainment(R.string.maps_category_entertainment, "🎉"),
}

@Composable
fun PlaceCategory.label(): String = stringResource(labelRes)

/**
 * A place shown on the Maps screen. Populated from the backend's saved-places endpoint
 * (`GET /api/favorites`) via `RealMapsRepository` — that endpoint provides name, address and type,
 * so [rating]/[phone]/[price]/[hours]/[mapsLink]/[note]/[imageUrl] are null (no REST endpoint
 * carries them; they exist only inside the AI chat tool). The detail sheet renders only the
 * non-null fields. [id] is a stable per-load list index (the favorites id is a server-side uuid);
 * [placeId] is that real server-side uuid, carried through separately so it can target a
 * `DELETE /api/favorites?placeId=` call — every place shown here is, by construction, already a
 * saved favorite (the favorites endpoint is the *only* source this screen has), so [placeId] is
 * always the id of an existing favorite row, never an unsaved place.
 */
data class MapPlace(
    val id: Long,
    val placeId: String,
    val name: String,
    val category: PlaceCategory,
    val address: String,
    val rating: String? = null,
    val phone: String? = null,
    val price: String? = null,
    val hours: String? = null,
    val mapsLink: String? = null,
    val note: String? = null,
    val imageUrl: String? = null,
)

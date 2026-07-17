package com.tappyai.app.maps.data

import com.tappyai.app.maps.MapPlace
import com.tappyai.app.maps.PlaceCategory
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `GET /api/favorites` — the user's saved places.
 *
 * This is the only REST endpoint that returns structured place data rich enough to populate the
 * Maps UI (name + address + type). The backend has NO free-text place-search endpoint (place
 * search is AI-chat-tool-only), and `/api/recommendations` returns only `{placeId, placeName,
 * finalScore, …}` with no address/category — too sparse for the cards/detail/filter. So the Maps
 * list is backed by favorites.
 *
 * Favorites fields are snake_case (raw DB columns) → mapped to the camelCase [MapPlace] domain
 * model here, keeping the domain model unchanged. The endpoint provides no rating/phone/price/
 * hours/image/maps-link (those exist only inside the AI chat tool output), so those [MapPlace]
 * fields map to null and the detail sheet renders only the fields present.
 */
@Serializable
data class FavoritesResponseDto(
    val favorites: List<FavoriteDto> = emptyList(),
)

@Serializable
data class FavoriteDto(
    val id: String = "",
    @SerialName("place_id") val placeId: String = "",
    @SerialName("place_name") val placeName: String = "",
    @SerialName("place_address") val placeAddress: String = "",
    @SerialName("place_type") val placeType: String = "",
    @SerialName("created_at") val createdAt: String = "",
)

/** `DELETE /api/favorites?placeId=` response — matches the shape `SavedApi`/`SavedDtos` already use. */
@Serializable
data class OkResponseDto(val ok: Boolean = false)

/**
 * Maps one favorite to the domain model. [key] is a caller-supplied stable index used only as the
 * `MapPlace.id` (the LazyColumn key) — the list index is unique within a loaded list, which is all
 * the UI key requires. [FavoriteDto.placeId] (the real server-side uuid) is carried through
 * separately as `MapPlace.placeId`, so a "Remove" action can target the correct favorite row via
 * `DELETE /api/favorites?placeId=`. All rich fields the favorites endpoint doesn't carry
 * (rating/phone/price/hours/mapsLink/note/imageUrl) stay null.
 */
fun FavoriteDto.toDomain(key: Long): MapPlace = MapPlace(
    id = key,
    placeId = placeId,
    name = placeName,
    category = placeType.toPlaceCategory(),
    address = placeAddress,
)

/** Maps the backend's `place_type` string to the UI [PlaceCategory]; unknown/blank → [PlaceCategory.All]. */
fun String?.toPlaceCategory(): PlaceCategory = when (this?.lowercase()?.trim()) {
    "food", "restaurant", "cafe" -> PlaceCategory.Food
    "spa" -> PlaceCategory.Spa
    "hotel" -> PlaceCategory.Hotel
    "travel", "attraction" -> PlaceCategory.Travel
    "shopping", "shop" -> PlaceCategory.Shopping
    "entertainment", "bar", "cinema", "gym" -> PlaceCategory.Entertainment
    else -> PlaceCategory.All
}

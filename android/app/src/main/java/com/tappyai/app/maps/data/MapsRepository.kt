package com.tappyai.app.maps.data

import com.tappyai.app.maps.MapPlace
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the Maps backend. The ViewModel depends on this and on domain [MapPlace] only —
 * never on Retrofit/OkHttp or the DTOs.
 *
 * Backed by `GET /api/favorites` (the user's saved places) — the only REST endpoint providing
 * place data rich enough for the Maps UI. Returns the full list (no pagination in the contract).
 */
interface MapsRepository {

    /** The current user's saved places as domain models, or a typed error (incl. 401 → session expired). */
    suspend fun getSavedPlaces(): NetworkResult<List<MapPlace>>

    /** Removes a favorite by its real server-side id (`MapPlace.placeId`), matching `SavedRepository`. */
    suspend fun removeFavorite(placeId: String): NetworkResult<Unit>
}

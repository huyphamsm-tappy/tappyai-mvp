package com.tappyai.app.maps.data

import com.tappyai.app.maps.MapPlace
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [MapsRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping (incl. the
 * stable index key and `place_type`→`PlaceCategory`) happens here; the ViewModel only sees
 * domain [MapPlace]s.
 */
@Singleton
class RealMapsRepository @Inject constructor(
    private val api: MapsApi,
) : MapsRepository {

    override suspend fun getSavedPlaces(): NetworkResult<List<MapPlace>> =
        safeApiCall {
            api.getFavorites().favorites.mapIndexed { index, dto -> dto.toDomain(index.toLong()) }
        }

    override suspend fun removeFavorite(placeId: String): NetworkResult<Unit> =
        safeApiCall {
            api.deleteFavorite(placeId)
            Unit
        }

    override suspend fun addFavorite(
        placeId: String,
        placeName: String,
        placeAddress: String,
        placeType: String,
    ): NetworkResult<Unit> =
        safeApiCall {
            api.addFavorite(AddFavoriteRequestDto(placeId, placeName, placeAddress, placeType))
            Unit
        }
}

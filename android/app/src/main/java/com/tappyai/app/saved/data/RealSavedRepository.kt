package com.tappyai.app.saved.data

import com.tappyai.app.saved.FavoritePlace
import com.tappyai.app.saved.SavedReview
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [SavedRepository]. Every call goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealSavedRepository @Inject constructor(
    private val api: SavedApi,
) : SavedRepository {

    override suspend fun getFavorites(): NetworkResult<List<FavoritePlace>> =
        safeApiCall { api.getFavorites().favorites.map { it.toDomain() } }

    override suspend fun getSavedReviews(): NetworkResult<List<SavedReview>> =
        safeApiCall { api.getSavedReviews().reviews.map { it.toDomain() } }

    override suspend fun removeFavorite(placeId: String): NetworkResult<Unit> =
        safeApiCall {
            api.deleteFavorite(placeId)
            Unit
        }
}

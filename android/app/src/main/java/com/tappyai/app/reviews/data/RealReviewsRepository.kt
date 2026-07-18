package com.tappyai.app.reviews.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import java.util.Collections
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [ReviewsRepository]. Every call goes through core:network's [safeApiCall], which
 * maps HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here;
 * ViewModels only ever see domain types.
 *
 * A small in-memory [reviewCache] retains reviews served (feed/search/profile) keyed by id, so the
 * detail screen can render the tapped review without a single-review GET endpoint (which the
 * backend doesn't provide). It's a bounded access-order LRU: an infinite feed would otherwise grow
 * this map for the whole process lifetime. Eviction is safe for the detail use case because the
 * detail screen always resolves the review the user JUST tapped (most-recently-accessed), so only
 * long-scrolled-past reviews are ever evicted. Wrapped in a synchronized map because fetches write
 * on IO threads while the detail screen reads on the main thread.
 */
@Singleton
class RealReviewsRepository @Inject constructor(
    private val api: ReviewsApi,
) : ReviewsRepository {

    private val reviewCache: MutableMap<String, Review> = Collections.synchronizedMap(
        object : LinkedHashMap<String, Review>(CACHE_INITIAL_CAPACITY, CACHE_LOAD_FACTOR, true) {
            override fun removeEldestEntry(eldest: Map.Entry<String, Review>): Boolean =
                size > CACHE_MAX_ENTRIES
        },
    )

    override suspend fun getFeed(
        page: Int,
        limit: Int,
        sort: String?,
        userId: String?,
        search: String?,
    ): NetworkResult<List<Review>> {
        val result = safeApiCall {
            api.getFeed(page = page, limit = limit, sort = sort, userId = userId, search = search)
                .reviews.map { it.toDomain() }
        }
        if (result is NetworkResult.Success) {
            result.data.forEach { reviewCache[it.id] = it }
        }
        return result
    }

    override suspend fun toggleLike(reviewId: String): NetworkResult<Boolean> =
        safeApiCall { api.toggleLike(reviewId).liked }

    override suspend fun toggleSave(reviewId: String): NetworkResult<Boolean> =
        safeApiCall { api.toggleSave(reviewId).saved }

    override suspend fun getComments(reviewId: String): NetworkResult<List<ReviewComment>> =
        safeApiCall { api.getComments(reviewId).comments.map { it.toDomain() } }

    override suspend fun getUserProfile(userId: String): NetworkResult<ReviewProfile> =
        safeApiCall { api.getUserProfile(userId).toReviewProfile() }

    override suspend fun toggleFollow(userId: String): NetworkResult<Boolean> =
        safeApiCall { api.toggleFollow(userId).following }

    override suspend fun getNotifications(): NetworkResult<List<ReviewGroupedNotification>> =
        safeApiCall { groupNotifications(api.getNotifications().notifications.map { it.toDomain() }) }

    override suspend fun createReview(
        placeId: String,
        placeName: String,
        body: String,
        rating: Int?,
        musicTrackId: String?,
    ): NetworkResult<Unit> = safeApiCall {
        api.createReview(
            CreateReviewRequestDto(
                placeId = placeId,
                placeName = placeName,
                body = body,
                rating = rating,
                music = musicTrackId?.let { MusicSelectionDto(trackId = it) },
            ),
        )
        Unit
    }

    override fun getCachedReview(reviewId: String): Review? = reviewCache[reviewId]

    override suspend fun getMine(): NetworkResult<List<Review>> {
        val result = safeApiCall { api.getMine().reviews.map { it.toDomain() } }
        if (result is NetworkResult.Success) {
            result.data.forEach { reviewCache[it.id] = it }
        }
        return result
    }

    override suspend fun setHidden(reviewId: String, hidden: Boolean): NetworkResult<Unit> =
        safeApiCall { api.setHidden(reviewId, SetHiddenRequestDto(isHidden = hidden)); Unit }

    override suspend fun deleteReview(reviewId: String): NetworkResult<Unit> =
        safeApiCall { api.deleteReview(reviewId); Unit }

    private companion object {
        const val CACHE_MAX_ENTRIES = 200
        const val CACHE_INITIAL_CAPACITY = 16
        const val CACHE_LOAD_FACTOR = 0.75f
    }
}

package com.tappyai.app.reviews.data

import android.content.Context
import android.net.Uri
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
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
    private val blobUploader: VercelBlobUploader,
    @ApplicationContext private val context: Context,
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
        following: Boolean?,
    ): NetworkResult<List<Review>> {
        val result = safeApiCall {
            api.getFeed(page = page, limit = limit, sort = sort, userId = userId, search = search, following = following)
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

    override suspend fun postComment(reviewId: String, body: String, parentId: String?): NetworkResult<PostedComment> =
        safeApiCall {
            val r = api.postComment(reviewId, CreateCommentRequestDto(body = body, parentId = parentId))
            PostedComment(comment = r.comment?.toDomain(), count = r.count)
        }

    override suspend fun deleteComment(reviewId: String, commentId: String): NetworkResult<Int> =
        safeApiCall { api.deleteComment(reviewId, commentId).count }

    override suspend fun reactToComment(commentId: String, reaction: String): NetworkResult<Unit> =
        safeApiCall { api.reactToComment(commentId, ReactionRequestDto(reaction)); Unit }

    override suspend fun removeCommentReaction(commentId: String): NetworkResult<Unit> =
        safeApiCall { api.removeCommentReaction(commentId); Unit }

    override suspend fun getUserProfile(userId: String): NetworkResult<ReviewProfile> =
        safeApiCall { api.getUserProfile(userId).toReviewProfile() }

    override suspend fun followUser(userId: String): NetworkResult<FollowResult> =
        safeApiCall {
            val r = api.followUser(userId)
            FollowResult(following = r.following, followerCount = r.followerCount)
        }

    override suspend fun getNotifications(): NetworkResult<List<ReviewGroupedNotification>> =
        safeApiCall { groupNotifications(api.getNotifications().notifications.map { it.toDomain() }) }

    override suspend fun createReview(
        placeId: String,
        placeName: String,
        body: String,
        rating: Int?,
        musicTrackId: String?,
        photos: List<String>?,
        mediaUrl: String?,
        thumbnail: String?,
        contentType: String?,
        sourceType: String?,
        sourceUrl: String?,
        durationSec: Double?,
        hashtags: List<String>?,
    ): NetworkResult<Unit> = safeApiCall {
        api.createReview(
            CreateReviewRequestDto(
                placeId = placeId,
                placeName = placeName,
                body = body,
                rating = rating,
                music = musicTrackId?.let { MusicSelectionDto(trackId = it) },
                photos = photos?.takeIf { it.isNotEmpty() },
                mediaUrl = mediaUrl,
                thumbnail = thumbnail,
                contentType = contentType,
                // Native video uploads are source_type="upload" (backend default) → omitted. A
                // URL review passes the detected source (youtube/tiktok/facebook) explicitly.
                sourceType = sourceType,
                sourceUrl = sourceUrl,
                duration = durationSec,
                hashtags = hashtags?.takeIf { it.isNotEmpty() },
            ),
        )
        Unit
    }

    override suspend fun processVideoAi(thumbnailUrl: String?, caption: String?, title: String?): NetworkResult<AiEnrichment> =
        safeApiCall {
            val r = api.exploreProcess(
                ExploreProcessRequestDto(
                    thumbnailUrl = thumbnailUrl,
                    caption = caption?.takeIf { it.isNotBlank() },
                    title = title?.takeIf { it.isNotBlank() },
                ),
            )
            AiEnrichment(hashtags = r.hashtags, caption = r.caption)
        }

    override suspend fun uploadReviewPhoto(uri: Uri): NetworkResult<String> = safeApiCall {
        // Stream the picked image to the same multipart endpoint the web posts each photo to
        // (/api/reviews/upload). The server validates type (magic bytes) + 5MB cap. The mediaType is
        // best-effort from the resolver; the backend sniffs the real type regardless.
        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
        val size = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        val body = ProgressUriRequestBody(
            contentResolver = context.contentResolver,
            uri = uri,
            mediaType = mime.toMediaTypeOrNull(),
            contentLength = size,
            onProgress = { _, _ -> },
        )
        val part = MultipartBody.Part.createFormData("file", "photo", body)
        api.uploadPhoto(part).url
    }

    override suspend fun oembed(url: String): NetworkResult<OembedResult> = safeApiCall {
        val r = api.oembed(url)
        OembedResult(thumbnailUrl = r.thumbnailUrl.orEmpty(), title = r.title)
    }

    override suspend fun uploadReviewVideo(
        uri: Uri,
        sizeBytes: Long,
        mimeType: String,
        onProgress: (Float) -> Unit,
    ): NetworkResult<String> = safeApiCall {
        val ext = when (mimeType) {
            "video/quicktime" -> "mov"
            "video/webm" -> "webm"
            else -> "mp4"
        }
        // Same client-upload handshake the web performs: mint a token (STEP 1, our backend),
        // then PUT the bytes directly to Vercel Blob (STEP 2) — bypassing the ~4.5MB function
        // body limit. Pathname mirrors the web composer's `videos/${Date.now()}.${ext}`.
        val pathname = "videos/${System.currentTimeMillis()}.$ext"
        val clientToken = api.generateBlobToken(
            BlobTokenRequestDto(payload = BlobTokenPayloadDto(pathname = pathname)),
        ).clientToken
        val videoBody = ProgressUriRequestBody(
            contentResolver = context.contentResolver,
            uri = uri,
            mediaType = mimeType.toMediaTypeOrNull(),
            contentLength = sizeBytes,
            onProgress = { sent, total -> if (total > 0) onProgress(sent.toFloat() / total.toFloat()) },
        )
        blobUploader.put(clientToken = clientToken, pathname = pathname, body = videoBody, contentType = mimeType)
    }

    override suspend fun uploadReviewThumbnail(jpegBytes: ByteArray): NetworkResult<String> = safeApiCall {
        // Thumbnail lane: clientPayload="thumbnail" makes the token endpoint apply the image
        // content-type/size limits, matching the web's `upload(..., { clientPayload: 'thumbnail' })`.
        val pathname = "thumbnails/${System.currentTimeMillis()}.jpg"
        val clientToken = api.generateBlobToken(
            BlobTokenRequestDto(payload = BlobTokenPayloadDto(pathname = pathname, clientPayload = "thumbnail")),
        ).clientToken
        val body = jpegBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
        blobUploader.put(clientToken = clientToken, pathname = pathname, body = body, contentType = "image/jpeg")
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

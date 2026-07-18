package com.tappyai.app.reviews.data

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit contract for the Reviews backend. Built once from the shared [retrofit2.Retrofit]
 * (core:network's NetworkModule) so it reuses the singleton OkHttp client — meaning the
 * [com.tappyai.core.network.AuthInterceptor] automatically attaches `Authorization: Bearer …`
 * for these own-host calls, and the kotlinx.serialization converter handles JSON.
 *
 * Paths are relative (no leading `/`) so they resolve against the base URL's trailing slash.
 * suspend functions get coroutine cancellation for free: cancelling the calling scope cancels
 * the underlying HTTP call. Non-2xx responses throw retrofit2.HttpException, network failures
 * throw IOException — both mapped in one place by core:network's `safeApiCall`.
 */
interface ReviewsApi {

    /**
     * Main feed. Pagination is page+limit, zero-indexed; the response carries no total/cursor,
     * so end-of-feed is inferred when fewer than [limit] items come back.
     */
    @GET("api/reviews/feed")
    suspend fun getFeed(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("sort") sort: String? = null,
        @Query("userId") userId: String? = null,
        @Query("search") search: String? = null,
    ): FeedResponseDto

    @POST("api/reviews/{id}/like")
    suspend fun toggleLike(@Path("id") reviewId: String): LikeResponseDto

    @POST("api/reviews/{id}/save")
    suspend fun toggleSave(@Path("id") reviewId: String): SaveResponseDto

    @GET("api/reviews/{id}/comments")
    suspend fun getComments(
        @Path("id") reviewId: String,
        @Query("limit") limit: Int = 50,
    ): CommentsResponseDto

    @POST("api/reviews/{id}/comments")
    suspend fun postComment(
        @Path("id") reviewId: String,
        @Body body: PostCommentRequestDto,
    ): PostCommentResponseDto

    @GET("api/users/{id}")
    suspend fun getUserProfile(@Path("id") userId: String): UserProfileDto

    /** Toggles follow on the target user (no request body). Insert-or-delete server-side; returns
     *  the new following state and the updated follower count. 400 on self-follow. */
    @POST("api/users/{id}/follow")
    suspend fun toggleFollow(@Path("id") userId: String): FollowResponseDto

    @GET("api/notifications")
    suspend fun getNotifications(): NotificationsResponseDto

    @POST("api/reviews")
    suspend fun createReview(@Body body: CreateReviewRequestDto): CreateReviewResponseDto

    /**
     * Uploads ONE photo as multipart/form-data (part name `file`) and returns its public Blob URL.
     * Mirrors the web's `POST /api/reviews/upload`: one file per request, ≤5MB, and the server
     * re-sniffs the real image type by magic bytes (JPG/PNG/WebP/GIF) regardless of the client
     * MIME. Callers collect the returned URLs into [CreateReviewRequestDto.photos].
     */
    @Multipart
    @POST("api/reviews/upload")
    suspend fun uploadPhoto(@Part file: MultipartBody.Part): PhotoUploadResponseDto

    /**
     * Server-side oEmbed/OG proxy for a pasted link (TikTok/Facebook block direct client fetch).
     * Returns a best-effort thumbnail + title; fields are null/empty when the provider gives none.
     * YouTube needs no call — its thumbnail URL is derived from the video id client-side.
     */
    @GET("api/explore/oembed")
    suspend fun getOembed(@Query("url") url: String): OembedResponseDto

    /** The caller's own reviews, including hidden ones — see My Reviews. */
    @GET("api/reviews/mine")
    suspend fun getMine(): FeedResponseDto

    @PATCH("api/reviews/{id}")
    suspend fun setHidden(@Path("id") reviewId: String, @Body body: SetHiddenRequestDto): OkResponseDto

    @DELETE("api/reviews/{id}")
    suspend fun deleteReview(@Path("id") reviewId: String): OkResponseDto
}

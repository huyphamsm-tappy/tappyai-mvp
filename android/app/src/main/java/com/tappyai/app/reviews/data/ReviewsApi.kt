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
        // "true" → the Following feed (backend filters to followed authors; needs auth). Omitted
        // otherwise. sort="trending" is the For You feed; "latest" (default) is Latest.
        @Query("following") following: Boolean? = null,
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

    /** Post a comment (1–300 chars, enforced client + server). Returns the inserted comment + count. */
    @POST("api/reviews/{id}/comments")
    suspend fun postComment(
        @Path("id") reviewId: String,
        @Body body: CreateCommentRequestDto,
    ): PostCommentResponseDto

    /** Add/switch the caller's reaction on a comment (one row per user; a different key updates in
     *  place). Backend validates the key against its ALLOWED set — reject → 400. */
    @POST("api/comments/{commentId}/reactions")
    suspend fun reactToComment(
        @Path("commentId") commentId: String,
        @Body body: ReactionRequestDto,
    ): ReactionResponseDto

    /** Remove the caller's reaction from a comment. */
    @DELETE("api/comments/{commentId}/reactions")
    suspend fun removeCommentReaction(
        @Path("commentId") commentId: String,
    ): ReactionResponseDto

    /** Delete one of the caller's own comments (backend scopes the delete to user_id). */
    @DELETE("api/reviews/{id}/comments")
    suspend fun deleteComment(
        @Path("id") reviewId: String,
        @Query("commentId") commentId: String,
    ): DeleteCommentResponseDto

    @GET("api/users/{id}")
    suspend fun getUserProfile(@Path("id") userId: String): UserProfileDto

    /** Toggle follow/unfollow for a user (backend inserts, or deletes on duplicate). Returns the
     *  new following state + the target's follower count. 401 if not signed in, 400 on self-follow. */
    @POST("api/users/{id}/follow")
    suspend fun followUser(@Path("id") userId: String): FollowResponseDto

    @GET("api/notifications")
    suspend fun getNotifications(): NotificationsResponseDto

    @POST("api/reviews")
    suspend fun createReview(@Body body: CreateReviewRequestDto): CreateReviewResponseDto

    /** Photo upload for a photo review — multipart `file` (image ≤5MB, magic-byte validated
     *  server-side). Returns the public Blob URL. Same endpoint the web composer posts each photo to. */
    @Multipart
    @POST("api/reviews/upload")
    suspend fun uploadPhoto(@Part file: MultipartBody.Part): UploadPhotoResponseDto

    /** oEmbed proxy for a link-review's poster/title (TikTok/Facebook). SSRF-guarded server-side. */
    @GET("api/explore/oembed")
    suspend fun oembed(@Query("url") url: String): OembedResponseDto

    /**
     * STEP 1 of the Vercel Blob client-upload handshake — mints a short-lived client token for a
     * direct-to-Blob PUT. This is the SAME endpoint and request shape the web's `@vercel/blob/client`
     * `upload()` posts to (`POST /api/upload/video`); the server's `handleUpload` validates the
     * user, applies size/content-type limits per [BlobTokenPayloadDto.clientPayload], and returns the
     * token. The file itself never passes through this function (Vercel's ~4.5MB body limit), so the
     * actual bytes go out in STEP 2 via [VercelBlobUploader]. Authed like every other own-host call
     * (AuthInterceptor attaches the Bearer token).
     */
    @POST("api/upload/video")
    suspend fun generateBlobToken(@Body body: BlobTokenRequestDto): BlobTokenResponseDto

    /** Post-upload AI enrichment (hashtags + caption) — mirrors the web composer's non-blocking
     *  call after a video upload. Always returns a shape (the backend answers EMPTY on any issue). */
    @POST("api/explore/process")
    suspend fun exploreProcess(@Body body: ExploreProcessRequestDto): ExploreProcessResponseDto

    /** The caller's own reviews, including hidden ones — see My Reviews. */
    @GET("api/reviews/mine")
    suspend fun getMine(): FeedResponseDto

    @PATCH("api/reviews/{id}")
    suspend fun setHidden(@Path("id") reviewId: String, @Body body: SetHiddenRequestDto): OkResponseDto

    @DELETE("api/reviews/{id}")
    suspend fun deleteReview(@Path("id") reviewId: String): OkResponseDto
}

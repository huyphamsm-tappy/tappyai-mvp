package com.tappyai.app.reviews.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for the `/api/reviews`, `/api/users`, and `/api/notifications` endpoints.
 *
 * These deliberately live SEPARATE from the domain models ([Review], [ReviewComment], …): the
 * backend speaks snake_case and passes DB column names straight through, while the domain models
 * are camelCase and use typed enums. `@SerialName` maps the casing here, and [toDomain] converts
 * to the domain shape (including String→enum) so the wire format never leaks into UI code — per
 * the standing rule that serialization mapping belongs to the network layer, not the model.
 *
 * The shared [Json] (NetworkModule) is configured with `ignoreUnknownKeys = true`, so fields the
 * client doesn't need (view_count, completion_rate, is_verified, …) are simply dropped. Every
 * field has a default so a partial/leaner response shape (the saved-list and place-list variants
 * return fewer fields than the feed) still deserializes.
 */

@Serializable
data class FeedResponseDto(
    val reviews: List<ReviewDto> = emptyList(),
    val page: Int = 0,
    val limit: Int = 12,
)

@Serializable
data class ReviewDto(
    val id: String,
    @SerialName("user_id") val userId: String = "",
    // On the wire from every reviews endpoint (`EXPLORE_SELECT` lists `place_id`); previously not
    // declared because nothing consumed it. Bookings' review-eligibility gate needs it to know
    // which places the user has already reviewed, mirroring the web's own `reviewedPlaceIds` set.
    @SerialName("place_id") val placeId: String? = null,
    @SerialName("place_name") val placeName: String? = null,
    @SerialName("place_address") val placeAddress: String? = null,
    val rating: Int = 0,
    val body: String = "",
    val photos: List<String>? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    @SerialName("comment_count") val commentCount: Int = 0,
    @SerialName("save_count") val saveCount: Int? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("liked_by_me") val likedByMe: Boolean = false,
    @SerialName("saved_by_me") val savedByMe: Boolean = false,
    val profiles: ProfileDto? = null,
    @SerialName("content_type") val contentType: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    val thumbnail: String? = null,
    @SerialName("source_type") val sourceType: String? = null,
    @SerialName("source_url") val sourceUrl: String? = null,
    val hashtags: List<String>? = null,
    @SerialName("watch_time_avg") val watchTimeAvg: Double? = null,
    val score: Double? = null,
    val music: MusicDto? = null,
    @SerialName("is_hidden") val isHidden: Boolean? = false,
)

@Serializable
data class ProfileDto(
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

/** Stored JSON payload — its keys are camelCase server-side, unlike every other response field. */
@Serializable
data class MusicDto(
    val version: Int = 1,
    val trackId: String = "",
    val startSec: Int = 0,
    val volume: Double = 1.0,
    val origin: String? = null,
)

@Serializable
data class CommentsResponseDto(
    val comments: List<CommentDto> = emptyList(),
    val count: Int = 0,
)

@Serializable
data class CommentDto(
    val id: String,
    val body: String = "",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("user_id") val userId: String = "",
    val profiles: ProfileDto? = null,
)

/** POST /api/reviews/{id}/like and /save return only the new boolean — no count. */
@Serializable
data class LikeResponseDto(val liked: Boolean = false)

@Serializable
data class SaveResponseDto(val saved: Boolean = false)

/** PATCH /api/reviews/{id} request body — hide/unhide the caller's own review. */
@Serializable
data class SetHiddenRequestDto(@SerialName("is_hidden") val isHidden: Boolean)

/** PATCH and DELETE /api/reviews/{id} both return this shape on success. */
@Serializable
data class OkResponseDto(val ok: Boolean = false)

@Serializable
data class UserProfileDto(
    val id: String = "",
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("follower_count") val followerCount: Int = 0,
    @SerialName("following_count") val followingCount: Int = 0,
    @SerialName("review_count") val reviewCount: Int = 0,
    @SerialName("is_following") val isFollowing: Boolean = false,
    @SerialName("is_self") val isSelf: Boolean = false,
)

@Serializable
data class NotificationsResponseDto(
    val notifications: List<NotificationDto> = emptyList(),
)

@Serializable
data class NotificationDto(
    val id: String = "",
    val type: String = "",
    @SerialName("actor_id") val actorId: String = "",
    @SerialName("actor_name") val actorName: String = "",
    @SerialName("actor_avatar") val actorAvatar: String? = null,
    val text: String = "",
    val url: String = "",
    @SerialName("created_at") val createdAt: String = "",
)

/** POST /api/reviews request body. Place fields are camelCase inbound (backend contract). */
@Serializable
data class CreateReviewRequestDto(
    val placeId: String,
    val placeName: String,
    val body: String,
    val rating: Int? = null,
    val music: MusicSelectionDto? = null,
    // Public Blob URLs of already-uploaded photos (via [PhotoUploadResponseDto]). The backend reads
    // `b.photos` (camelCase, unlike the snake_case response fields) and caps the array at 6. Null
    // when the review has no photos — with encodeDefaults=false it's then omitted from the wire,
    // matching the web sending no `photos` key at all.
    val photos: List<String>? = null,
    // Link-share fields — a review whose media is an external clip (YouTube/TikTok/Facebook). The
    // backend reads these snake_case keys (b.content_type, b.source_type, …); for a link the web
    // sets content_type='video', media_url=source_url, source_type=<provider>, plus a best-effort
    // thumbnail. All null (and omitted, since encodeDefaults=false) for a plain text review.
    @SerialName("content_type") val contentType: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("source_type") val sourceType: String? = null,
    @SerialName("source_url") val sourceUrl: String? = null,
    val thumbnail: String? = null,
)

/** GET /api/explore/oembed?url=… — server-side thumbnail/title proxy for TikTok/Facebook links
 *  (they block direct client fetch). Fields are null/empty when the provider exposes none. */
@Serializable
data class OembedResponseDto(
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val title: String = "",
)

/** POST /api/reviews/upload returns the public Blob URL of the one stored photo. */
@Serializable
data class PhotoUploadResponseDto(val url: String = "")

/** A track picked via Sound Detail's "Use this sound", attached to the review being composed —
 *  mirrors the web's `ReviewMusic` shape (`src/app/api/reviews/route.ts`). [startSec]/[volume]
 *  stay at their defaults since the composer has no trim/mix UI (matches an un-trimmed pick). */
@Serializable
data class MusicSelectionDto(
    val version: Int = 1,
    val trackId: String,
    val startSec: Int = 0,
    val volume: Double = 1.0,
)

@Serializable
data class CreateReviewResponseDto(
    val ok: Boolean = false,
    @SerialName("is_verified") val isVerified: Boolean = false,
)

// ---- DTO → domain mappers -------------------------------------------------------

fun ReviewDto.toDomain(): Review = Review(
    id = id,
    userId = userId,
    placeId = placeId?.takeIf { it.isNotBlank() },
    placeName = placeName ?: "",
    placeAddress = placeAddress,
    rating = rating,
    body = body,
    photos = photos,
    likeCount = likeCount,
    commentCount = commentCount,
    saveCount = saveCount,
    createdAt = createdAt,
    likedByMe = likedByMe,
    savedByMe = savedByMe,
    profiles = profiles?.toDomain(),
    contentType = contentType.toReviewContentType(),
    mediaUrl = mediaUrl,
    thumbnail = thumbnail,
    sourceType = sourceType.toReviewSourceType(),
    sourceUrl = sourceUrl,
    hashtags = hashtags,
    watchTimeAvg = watchTimeAvg,
    score = score,
    music = music?.toDomain(),
    isHidden = isHidden ?: false,
)

fun ProfileDto.toDomain(): ReviewProfile = ReviewProfile(
    fullName = fullName,
    avatarUrl = avatarUrl,
)

fun MusicDto.toDomain(): ReviewMusic = ReviewMusic(
    version = version,
    trackId = trackId,
    startSec = startSec,
    volume = volume,
    origin = origin,
)

fun CommentDto.toDomain(): ReviewComment = ReviewComment(
    id = id,
    body = body,
    createdAt = createdAt,
    userId = userId,
    profiles = profiles?.toDomain(),
)

fun UserProfileDto.toReviewProfile(): ReviewProfile = ReviewProfile(
    fullName = fullName,
    avatarUrl = avatarUrl,
)

fun NotificationDto.toDomain(): ReviewNotification = ReviewNotification(
    id = id,
    type = type,
    actorId = actorId,
    actorName = actorName,
    actorAvatar = actorAvatar,
    text = text,
    url = url,
    createdAt = createdAt,
)

private fun String?.toReviewContentType(): ReviewContentType? = when (this?.lowercase()) {
    "video" -> ReviewContentType.Video
    "photo" -> ReviewContentType.Photo
    else -> null
}

private fun String?.toReviewSourceType(): ReviewSourceType? = when (this?.lowercase()) {
    "youtube" -> ReviewSourceType.YouTube
    "tiktok" -> ReviewSourceType.TikTok
    "facebook" -> ReviewSourceType.Facebook
    "upload" -> ReviewSourceType.Upload
    else -> null
}

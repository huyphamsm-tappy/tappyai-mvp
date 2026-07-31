package com.tappyai.app.reviews.data

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
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
    // One-level threading: non-null marks a reply (backend returns replies FLATTENED in `comments`,
    // grouped client-side). Reactions are a per-key count map; my_reaction is the caller's one pick.
    @SerialName("parent_comment_id") val parentCommentId: String? = null,
    val profiles: ProfileDto? = null,
    val reactions: Map<String, Int> = emptyMap(),
    @SerialName("my_reaction") val myReaction: String? = null,
)

/** POST /api/reviews/{id}/comments request — the comment text (backend validates 1–300 chars) plus
 *  an optional [parentId] for a reply. [parentId] is camelCase on the wire (the backend reads
 *  `b.parentId`), so no @SerialName; omitted when null (encodeDefaults=false) which the backend
 *  treats as a top-level comment. */
@Serializable
data class CreateCommentRequestDto(val body: String, val parentId: String? = null)

/** POST/DELETE /api/comments/{commentId}/reactions response. The UI reconciles from optimistic
 *  local state, so only success/failure matters; fields kept for completeness. */
@Serializable
data class ReactionRequestDto(val reaction: String)

@Serializable
data class ReactionResponseDto(val ok: Boolean = false, val reaction: String? = null)

/** POST /api/reviews/{id}/comments response: the inserted comment + the recomputed exact count. */
@Serializable
data class PostCommentResponseDto(
    val comment: CommentDto? = null,
    val count: Int = 0,
)

/** DELETE /api/reviews/{id}/comments?commentId= response: ok + the recomputed exact count. */
@Serializable
data class DeleteCommentResponseDto(
    val ok: Boolean = false,
    val count: Int = 0,
)

/** POST /api/users/{id}/follow toggles follow/unfollow and returns the new state + follower count. */
@Serializable
data class FollowResponseDto(
    val following: Boolean = false,
    @SerialName("follower_count") val followerCount: Int = 0,
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
    @SerialName("unread_count") val unreadCount: Int = 0,
)

@Serializable
data class NotificationActorDto(
    val id: String = "",
    val name: String = "",
    val avatar: String? = null,
)

// Canonical GET /api/notifications shape (src/lib/notifications/contract.ts NotificationDTO),
// consumed by every client. The backend forms the localized `title`/`body`; the actor is a NESTED
// object (was previously mis-declared as flat actor_name/actor_avatar/text/url, so every field
// silently defaulted to empty — blank names + no message text).
@Serializable
data class NotificationDto(
    val id: String = "",
    val type: String = "",
    val category: String = "",
    val title: String = "",
    val body: String = "",
    val actor: NotificationActorDto? = null,
    @SerialName("entity_url") val entityUrl: String? = null,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
)

/** POST /api/reviews request body. Place fields are camelCase inbound; media fields are snake_case
 *  (backend reads `b.media_url`/`b.content_type`/`b.source_type`/`b.duration`, see
 *  `src/app/api/reviews/route.ts`). For a native video review: contentType="video",
 *  sourceType="upload" (default), mediaUrl+thumbnail = the uploaded Blob URLs, duration = seconds. */
@Serializable
data class CreateReviewRequestDto(
    val placeId: String,
    val placeName: String,
    val body: String,
    val rating: Int? = null,
    val music: MusicSelectionDto? = null,
    /** Photo-review image Blob URLs (from /api/reviews/upload) — sent with content_type="photo". */
    val photos: List<String>? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    val thumbnail: String? = null,
    @SerialName("content_type") val contentType: String? = null,
    @SerialName("source_type") val sourceType: String? = null,
    /** Original external URL for a link-sourced review (youtube/tiktok/facebook) — same as media_url. */
    @SerialName("source_url") val sourceUrl: String? = null,
    val duration: Double? = null,
    /** AI-generated tags from /api/explore/process (backend caps at 10) — same field the web sends. */
    val hashtags: List<String>? = null,
)

/** POST /api/reviews/upload response — the uploaded image's public Blob URL. */
@Serializable
data class UploadPhotoResponseDto(val url: String = "")

/** GET /api/explore/oembed response — poster + title for a tiktok/facebook link (youtube is built
 *  client-side from the video id). */
@Serializable
data class OembedResponseDto(
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val title: String = "",
)

/**
 * Vercel Blob client-upload handshake — STEP 1 (token mint), identical to what the web's
 * `@vercel/blob/client` `upload()` sends to `POST /api/upload/video`. The web never routes the file
 * through a serverless function (Vercel caps function bodies at ~4.5MB); instead it mints a
 * short-lived client token and PUTs the bytes DIRECTLY to Vercel Blob. Android now does the exact
 * same two steps so a 60s/50MB video isn't bounded by the function body limit.
 *
 * Wire shape (from the SDK): `{ type: "blob.generate-client-token",
 * payload: { pathname, clientPayload, multipart } }`. [clientPayload] selects the upload lane the
 * server's `onBeforeGenerateToken` branches on: `"thumbnail"` (image types, 10MB) vs. null/omitted
 * (video types, MAX_VIDEO_SIZE_MB). [multipart] stays false — single-shot PUT.
 */
@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class BlobTokenRequestDto(
    // The shared Json has encodeDefaults=false, so this defaulted field would be DROPPED from the
    // wire — but `@vercel/blob`'s handleUpload switches on `body.type` and throws "Invalid event
    // type" (→ 500) when it's absent, breaking 100% of video + thumbnail uploads. Force it on the
    // wire, same guard as MusicSelectionDto.
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val type: String = "blob.generate-client-token",
    val payload: BlobTokenPayloadDto,
)

@Serializable
data class BlobTokenPayloadDto(
    val pathname: String,
    val clientPayload: String? = null,
    val multipart: Boolean = false,
)

/** STEP 1 response: `{ type, clientToken }`. [clientToken] is `vercel_blob_client_<storeId>_<b64>`
 *  and authorizes the direct PUT in STEP 2 (see [VercelBlobUploader]). */
@Serializable
data class BlobTokenResponseDto(
    val type: String = "",
    val clientToken: String = "",
)

/** STEP 2 response from Vercel Blob's own upload API — only [url] is consumed (the public Blob URL
 *  that goes into the review's `media_url`/`thumbnail`). Other fields (downloadUrl, pathname, …) are
 *  ignored via the shared Json's `ignoreUnknownKeys`. */
@Serializable
data class BlobPutResponseDto(
    val url: String = "",
)

/** POST /api/explore/process request — post-upload AI enrichment (hashtags + caption) from the
 *  clip's thumbnail (+ any typed caption). Mirrors the web composer's call. */
@Serializable
data class ExploreProcessRequestDto(
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val caption: String? = null,
    /** Video title for URL-sourced reviews — same input the web's `triggerUrlAI` passes. */
    val title: String? = null,
)

/** POST /api/explore/process response. Extra fields (category/location) are ignored — the composer,
 *  like the web, only consumes [hashtags] and [caption]. */
@Serializable
data class ExploreProcessResponseDto(
    val caption: String = "",
    val hashtags: List<String> = emptyList(),
)

/** A track picked via Sound Detail's "Use this sound", attached to the review being composed —
 *  mirrors the web's `ReviewMusic` shape (`src/app/api/reviews/route.ts`). [startSec]/[volume]
 *  stay at their defaults since the composer has no trim/mix UI (matches an un-trimmed pick). */
@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class MusicSelectionDto(
    // The shared Json has encodeDefaults=false, so default-valued fields are dropped from the wire.
    // The backend HARD-REQUIRES music.version === 1 (api/reviews/route.ts) and reads startSec/volume,
    // so these must always be serialised — @EncodeDefault(ALWAYS) forces them on despite the default.
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val version: Int = 1,
    val trackId: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val startSec: Int = 0,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val volume: Double = 1.0,
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
    parentCommentId = parentCommentId,
    profiles = profiles?.toDomain(),
    reactions = reactions,
    myReaction = myReaction,
)

/** `GET /api/users/search?q=` — Explore's Users segment. */
@Serializable
data class UserSearchResponseDto(val users: List<UserSearchResultDto> = emptyList())

@Serializable
data class UserSearchResultDto(
    val id: String = "",
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("follower_count") val followerCount: Int = 0,
    @SerialName("following_count") val followingCount: Int = 0,
    @SerialName("is_following") val isFollowing: Boolean = false,
)

fun UserSearchResultDto.toReviewProfile(): ReviewProfile = ReviewProfile(
    fullName = fullName,
    avatarUrl = avatarUrl,
    userId = id.takeIf { it.isNotBlank() },
    followerCount = followerCount,
    followingCount = followingCount,
    isFollowing = isFollowing,
)

fun UserProfileDto.toReviewProfile(): ReviewProfile = ReviewProfile(
    fullName = fullName,
    avatarUrl = avatarUrl,
    userId = id.takeIf { it.isNotBlank() },
    followerCount = followerCount,
    followingCount = followingCount,
    reviewCount = reviewCount,
    isFollowing = isFollowing,
    isSelf = isSelf,
)

fun NotificationDto.toDomain(): ReviewNotification = ReviewNotification(
    id = id,
    type = type,
    actorId = actor?.id.orEmpty(),
    actorName = actor?.name.orEmpty(),
    actorAvatar = actor?.avatar,
    title = title,
    body = body,
    url = entityUrl.orEmpty(),
    readAt = readAt,
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

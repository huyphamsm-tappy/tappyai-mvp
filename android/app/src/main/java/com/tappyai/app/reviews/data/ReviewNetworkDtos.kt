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
    /**
     * Present ONLY on the author's own profile feed — the server attaches it when the requesting
     * identity is the author, and strips the raw lifecycle columns for everyone. So a row that
     * carries this is a row about the reader's own post, and a row without it says nothing about
     * anyone else's.
     */
    val moderation: ModerationDto? = null,
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
    // Threaded replies + reactions (backend: parent_comment_id, aggregated reactions map, and the
    // caller's own reaction). All default so an older/leaner response still deserializes.
    @SerialName("parent_comment_id") val parentCommentId: String? = null,
    val reactions: Map<String, Int> = emptyMap(),
    @SerialName("my_reaction") val myReaction: String? = null,
)

/** POST /api/reviews/{id}/comments request body — the new comment text (backend enforces 1–300).
 *  [parentId] replies to another comment; null (omitted, encodeDefaults=false) posts a top-level one. */
@Serializable
data class PostCommentRequestDto(val body: String, val parentId: String? = null)

/** POST /api/comments/{commentId}/reactions request body — the reaction key (backend whitelists it). */
@Serializable
data class ReactionRequestDto(val reaction: String)

/** POST/DELETE /api/comments/{commentId}/reactions → { ok, reaction? }. */
@Serializable
data class ReactionResponseDto(val ok: Boolean = false, val reaction: String? = null)

/** POST /api/reviews/{id}/comments response — the created comment plus the updated total count. */
@Serializable
data class PostCommentResponseDto(
    val comment: CommentDto? = null,
    val count: Int = 0,
)

/** DELETE /api/reviews/{id}/comments?commentId= → { ok, count } (the updated real comment count). */
@Serializable
data class DeleteCommentResponseDto(
    val ok: Boolean = false,
    val count: Int = 0,
)

/** POST /api/reviews/{id}/like and /save return only the new boolean — no count. */
@Serializable
data class LikeResponseDto(val liked: Boolean = false)

@Serializable
data class SaveResponseDto(val saved: Boolean = false)

/** POST /api/users/{id}/follow toggles and returns the new state + authoritative follower count. */
@Serializable
data class FollowResponseDto(
    val following: Boolean = false,
    @SerialName("follower_count") val followerCount: Int = 0,
)

/**
 * POST /api/reviews/{id}/interact request body — video watch analytics. The backend GREATEST-merges
 * these per user/review, and the first watch ≥3s increments view_count once. [watchSeconds] is the
 * accumulated seconds the clip was the active/visible slide; [completionRate] is watched/duration
 * clamped to 1 (two-decimal), matching the web's behaviorTracker payload exactly.
 */
@Serializable
data class InteractRequestDto(
    @SerialName("watch_seconds") val watchSeconds: Int,
    @SerialName("completion_rate") val completionRate: Double,
)

/** PATCH /api/reviews/{id} request body — hide/unhide the caller's own review. */
@Serializable
data class SetHiddenRequestDto(@SerialName("is_hidden") val isHidden: Boolean)

/** PATCH and DELETE /api/reviews/{id} both return this shape on success. */
@Serializable
data class OkResponseDto(val ok: Boolean = false)

/** GET /api/users/search?q= → { users: [...] }. Each user carries the caller's follow state. */
@Serializable
data class UserSearchResponseDto(
    val users: List<UserSearchResultDto> = emptyList(),
)

@Serializable
data class UserSearchResultDto(
    val id: String = "",
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("follower_count") val followerCount: Int = 0,
    @SerialName("following_count") val followingCount: Int = 0,
    @SerialName("is_following") val isFollowing: Boolean = false,
)

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

/**
 * The slice of `GET api/config` the composer needs. The backend owns which platforms a user may
 * import a video from (web `LINK_VIDEO_PROVIDERS` in `src/lib/config/product.ts`), and serves the
 * list here so web/Android/iOS cannot drift apart. The shared lenient Json (`ignoreUnknownKeys`)
 * drops the freemium/flags/upload/auth/onboarding blocks.
 */
@Serializable
data class ProductConfigDto(
    val video: VideoConfigDto = VideoConfigDto(),
)

/**
 * [linkProviders] defaults to the V1 contract rather than empty: an older deployment that predates
 * the field must not be read as "no provider is allowed", which would break the Link tab entirely.
 */
@Serializable
data class VideoConfigDto(
    val linkProviders: List<String> = listOf("youtube"),
)

/**
 * A track attached to the review being composed — the ONE cross-platform music payload
 * (`{version, trackId, startSec, volume}`, web `src/app/api/reviews/route.ts`). The backend hard-
 * rejects a missing/mismatched `version` ("unsupported music version"), and `Number(undefined)` on
 * a missing startSec/volume NaN-fails its validator — so NO field may carry a default value: the
 * shared prod Json has `encodeDefaults=false`, which silently drops default-valued fields from the
 * wire (the same trap that broke Blob uploads — see `BlobTokenRequestDto`). Every field is a
 * required constructor param and is therefore always serialized.
 */
@Serializable
data class MusicSelectionDto(
    val version: Int,
    val trackId: String,
    val startSec: Int,
    val volume: Double,
) {
    companion object {
        /** Web `MUSIC_PAYLOAD_VERSION` — bump only in lockstep with the backend. */
        const val PAYLOAD_VERSION = 1
    }
}

/**
 * The safety gate's author-facing outcome, as `POST /api/reviews` and `GET /api/reviews/feed`
 * return it (`authorModerationPayload`, src/lib/safety/gate/authorNotice.ts).
 *
 * 🚨 THE WORDING COMES FROM THE SERVER, NOT FROM A STRING RESOURCE HERE. That is deliberate and
 * matches the web: the notice must describe the row that was actually stored, and a client-side
 * code-to-string map is a second opinion that can drift out of agreement with it. The server
 * words it in the request language, which is why `AppLanguageInterceptor` sending the app's
 * `Accept-Language` is a prerequisite for this being right in English.
 *
 * 🔑 ABSENT means the gate is inactive. Deliberately indistinguishable from the world before the
 * gate existed — a nullable field, not a defaulted one, so "no moderation key" and "moderation
 * says nothing" cannot be confused.
 *
 * What is NOT here, also deliberately: `safety_state`, policy identities, evidence, coverage. The
 * author is owed the honest fact that their post is held and that it is not an accusation — not
 * which check held it, which would tell them what to change to get past it.
 */
@Serializable
data class ModerationDto(
    /** `PUBLISHED` | `UNDER_REVIEW` | `RESTRICTED`. */
    val state: String = "",
    val title: String = "",
    val detail: String = "",
    /** True only for an actual finding. Lets the UI style a hold differently from a refusal. */
    @SerialName("assertsViolation") val assertsViolation: Boolean = false,
)

@Serializable
data class CreateReviewResponseDto(
    val ok: Boolean = false,
    @SerialName("is_verified") val isVerified: Boolean = false,
    /**
     * 🚨 `ok: true` DOES NOT MEAN PUBLISHED. The row was stored; whether it is public is this
     * field's business. Android used to read only `ok` and told the author "posted!" for a review
     * the gate had just held — the exact "it uploaded fine and then vanished" experience the gate
     * exists to prevent, which the web already handled and the native clients did not.
     */
    val moderation: ModerationDto? = null,
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
    moderation = moderation?.toDomain(),
)

fun ProfileDto.toDomain(): ReviewProfile = ReviewProfile(
    fullName = fullName,
    avatarUrl = avatarUrl,
)

/**
 * An unrecognised `state` becomes [ReviewPublicationState.Unknown], which is NOT published — the
 * conservative reading, and the one that keeps an older client honest if the backend ever adds a
 * lifecycle state. Text is carried through verbatim; nothing is re-worded on this side.
 */
fun ModerationDto.toDomain(): ReviewModeration = ReviewModeration(
    state = ReviewPublicationState.fromWire(state),
    title = title,
    detail = detail,
    assertsViolation = assertsViolation,
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
    parentCommentId = parentCommentId,
    reactions = reactions,
    myReaction = myReaction,
)

fun UserSearchResultDto.toDomain(): UserSearchResult = UserSearchResult(
    id = id,
    fullName = fullName,
    avatarUrl = avatarUrl,
    followerCount = followerCount,
    followingCount = followingCount,
    isFollowing = isFollowing,
)

fun UserProfileDto.toReviewProfile(): ReviewProfile = ReviewProfile(
    fullName = fullName,
    avatarUrl = avatarUrl,
    isFollowing = isFollowing,
    isSelf = isSelf,
    followerCount = followerCount,
    followingCount = followingCount,
    reviewCount = reviewCount,
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

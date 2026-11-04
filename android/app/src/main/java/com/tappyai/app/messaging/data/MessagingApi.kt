package com.tappyai.app.messaging.data

import kotlinx.serialization.Serializable
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The routes under `/api/messaging` — USER ↔ USER messaging (the web Inbox's "Tin nhắn" tab, 2026-09-17).
 *
 * 🚨 NOT `/api/chat` AND NOT `/api/conversations`. Those are the user ↔ TappyAI assistant; this
 * is people talking to people (`chat_*` tables, `20260905_chat_messaging_phase1.sql`). The two
 * share every noun and no data — nothing here touches `com.tappyai.app.chat`.
 *
 * The wire shape is the web's own (`src/lib/messaging/types.ts`): camelCase, so no
 * `@SerialName` is needed. Reads are scoped by RLS against the bearer; a thread the caller is
 * not in answers 404, never 403 (a privacy decision the server makes, respected here).
 *
 * 2026-11-04 (web release b5cd20e): pictures (`.../media` upload, a `media` object on a message),
 * the idempotent send (`clientId`), keyset paging (`before` + `beforeId`) and the unread totals
 * the navigation badge needs (`api/messaging/unread`).
 */
interface MessagingApi {
    /** The caller's conversation list, newest activity first, with a server-derived unread count per thread. */
    @GET("api/messaging/threads")
    suspend fun getThreads(): ThreadsResponseDto

    /** Start a direct thread (deduplicated per pair server-side) or a group. */
    @POST("api/messaging/threads")
    suspend fun startThread(@Body body: StartThreadRequestDto): StartThreadResponseDto

    /**
     * One page of history, oldest → newest. `before` (an ISO stamp) AND `beforeId` (the id of the oldest loaded message) page further back:
     * together they are the keyset (created_at, id), so messages that share a timestamp are neither skipped nor repeated.
     */
    @GET("api/messaging/threads/{id}/messages")
    suspend fun getMessages(
        @Path("id") threadId: String,
        @Query("before") before: String? = null,
        @Query("beforeId") beforeId: String? = null,
    ): MessagesResponseDto

    @POST("api/messaging/threads/{id}/messages")
    suspend fun sendMessage(@Path("id") threadId: String, @Body body: SendMessageRequestDto): SendMessageResponseDto

    /**
     * Uploads ONE picture (JPEG, PNG or WebP, at most 5 MB) for a message of this thread. The server re-encodes it without metadata, scans it, stores it in a private bucket
     * and answers with the object's path; the picture belongs to a conversation only through the message that carries that path.
     * 422 = the picture is not allowed · 503 = the safety scan is unavailable · 403 = AI data sharing not agreed · 400 = type or size · 429 = too fast · 404 = no such thread.
     */
    @Multipart
    @POST("api/messaging/threads/{id}/media")
    suspend fun uploadMedia(@Path("id") threadId: String, @Part file: MultipartBody.Part): UploadMediaResponseDto

    /** Moves the caller's read cursor to now — the unread count is derived from it, never decremented. */
    @POST("api/messaging/threads/{id}/read")
    suspend fun markRead(@Path("id") threadId: String): MarkThreadReadResponseDto

    /** The two numbers behind the navigation badge: unread messages, and how many unread notifications are message notifications. */
    @GET("api/messaging/unread")
    suspend fun getUnread(): UnreadResponseDto
}

@Serializable
data class ThreadsResponseDto(val threads: List<ThreadSummaryDto> = emptyList())

@Serializable
data class ThreadSummaryDto(
    val id: String = "",
    /** `direct` | `group`. */
    val kind: String = "direct",
    val title: String? = null,
    val lastMessageAt: String = "",
    val lastMessage: LastMessageDto? = null,
    val unreadCount: Int = 0,
    val participants: List<ParticipantDto> = emptyList(),
)

@Serializable
data class LastMessageDto(val body: String = "", val senderId: String? = null, val createdAt: String = "")

@Serializable
data class ParticipantDto(val userId: String = "", val fullName: String? = null, val avatarUrl: String? = null)

/** `{ kind: 'direct', userId }` or `{ kind: 'group', userIds, title? }`. */
@Serializable
data class StartThreadRequestDto(
    val kind: String,
    val userId: String? = null,
    val userIds: List<String>? = null,
    val title: String? = null,
)

@Serializable
data class StartThreadResponseDto(val threadId: String = "")

@Serializable
data class MessagesResponseDto(val messages: List<MessageDto> = emptyList(), val hasMore: Boolean = false)

@Serializable
data class MessageDto(
    val id: String = "",
    val threadId: String = "",
    /** Null when the author's account is gone. */
    val senderId: String? = null,
    /** Empty ONLY when the message carries a picture. */
    val body: String = "",
    val createdAt: String = "",
    /** The picture of the message, when it has one. */
    val media: MessageMediaDto? = null,
)

/**
 * `url` is a SHORT-LIVED signed link the server made for this read (null when the object cannot be linked); `expired` is set once the server removed the
 * picture after its retention period (30 days) — the message stays, and only a copy kept on this device can still show it.
 */
@Serializable
data class MessageMediaDto(
    val type: String = "image",
    val url: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val expired: Boolean = false,
)

/** `{ body, media?: { path, width, height }, clientId }` — the sender is the bearer, never a field. */
@Serializable
data class SendMessageRequestDto(
    val body: String,
    val media: SendMediaDto? = null,
    val clientId: String? = null,
)

@Serializable
data class SendMediaDto(val path: String, val width: Int? = null, val height: Int? = null)

@Serializable
data class SendMessageResponseDto(val message: MessageDto = MessageDto())

@Serializable
data class UploadMediaResponseDto(val media: UploadedMediaDto = UploadedMediaDto())

@Serializable
data class UploadedMediaDto(val path: String = "", val type: String = "image", val width: Int? = null, val height: Int? = null)

@Serializable
data class MarkThreadReadResponseDto(val ok: Boolean = false)

@Serializable
data class UnreadResponseDto(val messages: Int = 0, val messageNotifications: Int = 0)

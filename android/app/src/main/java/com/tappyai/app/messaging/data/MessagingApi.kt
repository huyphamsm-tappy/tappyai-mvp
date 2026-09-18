package com.tappyai.app.messaging.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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
 */
interface MessagingApi {
    /** The caller's conversation list, newest activity first, with a server-derived unread count per thread. */
    @GET("api/messaging/threads")
    suspend fun getThreads(): ThreadsResponseDto

    /** Start a direct thread (deduplicated per pair server-side) or a group. */
    @POST("api/messaging/threads")
    suspend fun startThread(@Body body: StartThreadRequestDto): StartThreadResponseDto

    /** One page of history, oldest → newest; `before` (an ISO stamp) pages further back. */
    @GET("api/messaging/threads/{id}/messages")
    suspend fun getMessages(@Path("id") threadId: String, @Query("before") before: String? = null): MessagesResponseDto

    @POST("api/messaging/threads/{id}/messages")
    suspend fun sendMessage(@Path("id") threadId: String, @Body body: SendMessageRequestDto): SendMessageResponseDto

    /** Moves the caller's read cursor to now — the unread count is derived from it, never decremented. */
    @POST("api/messaging/threads/{id}/read")
    suspend fun markRead(@Path("id") threadId: String): MarkThreadReadResponseDto
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
    val body: String = "",
    val createdAt: String = "",
)

@Serializable
data class SendMessageRequestDto(val body: String)

@Serializable
data class SendMessageResponseDto(val message: MessageDto = MessageDto())

@Serializable
data class MarkThreadReadResponseDto(val ok: Boolean = false)

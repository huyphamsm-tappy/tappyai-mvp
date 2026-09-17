package com.tappyai.app.messaging.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton

// ── Domain (src/lib/messaging/types.ts) ──

enum class ThreadKind { Direct, Group }

data class ChatParticipant(val userId: String, val fullName: String?, val avatarUrl: String?)

data class ChatMessage(val id: String, val threadId: String, val senderId: String?, val body: String, val createdAt: String)

data class LastMessage(val body: String, val senderId: String?, val createdAt: String)

/**
 * One row of the conversation list. `unreadCount` is DERIVED by `chat_thread_summaries()` — the
 * messages after the caller's read cursor that the caller did not send — never stored, never
 * computed on the client.
 */
data class ChatThreadSummary(
    val id: String,
    val kind: ThreadKind,
    /** Group name; null for a direct thread, which is titled from the counterpart. */
    val title: String?,
    val lastMessageAt: String,
    val lastMessage: LastMessage?,
    val unreadCount: Int,
    /** Everyone in the thread, the caller included. */
    val participants: List<ChatParticipant>,
) {
    /** `counterpart`: the other person in a direct thread, or null for a group. */
    fun counterpart(meId: String?): ChatParticipant? =
        if (kind != ThreadKind.Direct) null else participants.firstOrNull { it.userId != meId }

    /** `threadTitle`: a group keeps its name; a direct thread takes the counterpart's. [fallback] is the caller's i18n string. */
    fun title(meId: String?, fallback: String): String =
        if (kind == ThreadKind.Group) title?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
        else counterpart(meId)?.fullName?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
}

data class MessagePage(val messages: List<ChatMessage>, val hasMore: Boolean)

fun ThreadSummaryDto.toDomain(): ChatThreadSummary = ChatThreadSummary(
    id = id,
    kind = if (kind == "group") ThreadKind.Group else ThreadKind.Direct,
    title = title,
    lastMessageAt = lastMessageAt,
    lastMessage = lastMessage?.let { LastMessage(body = it.body, senderId = it.senderId, createdAt = it.createdAt) },
    unreadCount = unreadCount,
    participants = participants.map { ChatParticipant(userId = it.userId, fullName = it.fullName, avatarUrl = it.avatarUrl) },
)

fun MessageDto.toDomain(): ChatMessage = ChatMessage(id = id, threadId = threadId, senderId = senderId, body = body, createdAt = createdAt)

/** Matches the CHECK constraint on `chat_messages.body`; the database is the authority. */
const val MESSAGE_MAX_BODY = 4000

/**
 * User ↔ user messaging — the web Inbox's Messages tab (`MessagesProvider`, `ThreadView`,
 * `NewMessageSheet`). Every method is a route the web already calls; nothing reads the tables
 * directly and nothing carries a user id the server does not already know from the bearer.
 */
interface MessagingRepository {
    suspend fun getThreads(): NetworkResult<List<ChatThreadSummary>>
    /** One person is a direct thread (deduplicated server-side); the id of that thread, new or existing. */
    suspend fun startDirect(userId: String): NetworkResult<String>
    suspend fun startGroup(userIds: List<String>, title: String?): NetworkResult<String>
    suspend fun getMessages(threadId: String, before: String? = null): NetworkResult<MessagePage>
    suspend fun sendMessage(threadId: String, body: String): NetworkResult<ChatMessage>
    suspend fun markRead(threadId: String): NetworkResult<Unit>
}

@Singleton
class RealMessagingRepository @Inject constructor(private val api: MessagingApi) : MessagingRepository {
    override suspend fun getThreads(): NetworkResult<List<ChatThreadSummary>> =
        safeApiCall { api.getThreads().threads.map { it.toDomain() } }

    override suspend fun startDirect(userId: String): NetworkResult<String> =
        safeApiCall { api.startThread(StartThreadRequestDto(kind = "direct", userId = userId)).threadId }

    override suspend fun startGroup(userIds: List<String>, title: String?): NetworkResult<String> =
        safeApiCall {
            api.startThread(StartThreadRequestDto(kind = "group", userIds = userIds, title = title?.trim()?.take(120)?.takeIf { it.isNotEmpty() })).threadId
        }

    override suspend fun getMessages(threadId: String, before: String?): NetworkResult<MessagePage> =
        safeApiCall { api.getMessages(threadId, before).let { MessagePage(it.messages.map { m -> m.toDomain() }, it.hasMore) } }

    override suspend fun sendMessage(threadId: String, body: String): NetworkResult<ChatMessage> =
        safeApiCall { api.sendMessage(threadId, SendMessageRequestDto(body = body.trim().take(MESSAGE_MAX_BODY))).message.toDomain() }

    override suspend fun markRead(threadId: String): NetworkResult<Unit> =
        safeApiCall { api.markRead(threadId); Unit }
}

/** DI wiring — the same two-module shape as Social and Chat History. */
@Module
@InstallIn(SingletonComponent::class)
object MessagingNetworkModule {
    @Provides
    @Singleton
    fun provideMessagingApi(retrofit: Retrofit): MessagingApi = retrofit.create(MessagingApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MessagingBindModule {
    @Binds
    @Singleton
    abstract fun bindMessagingRepository(impl: RealMessagingRepository): MessagingRepository
}

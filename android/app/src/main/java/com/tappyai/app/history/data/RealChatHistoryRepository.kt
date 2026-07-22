package com.tappyai.app.history.data

import com.tappyai.app.history.Conversation
import com.tappyai.app.history.StoredChatMessage
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [ChatHistoryRepository]. Every call goes through core:network's [safeApiCall],
 * which maps HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealChatHistoryRepository @Inject constructor(
    private val api: ChatHistoryApi,
    private val json: Json,
) : ChatHistoryRepository {

    override suspend fun getConversations(): NetworkResult<List<Conversation>> =
        safeApiCall { api.getConversations().map { it.toDomain() } }

    override suspend fun deleteConversation(id: String): NetworkResult<Unit> =
        safeApiCall {
            api.deleteConversation(id)
            Unit
        }

    override suspend fun getConversationMessages(id: String): NetworkResult<List<StoredChatMessage>> =
        safeApiCall {
            val match = api.getConversations().firstOrNull { it.id == id }
            match?.decodeMessages(json)?.map { StoredChatMessage(role = it.role, content = it.content) }
                ?: emptyList()
        }

    override suspend fun createConversation(
        title: String,
        category: String,
        messages: List<StoredChatMessage>,
    ): NetworkResult<String> = safeApiCall {
        api.createConversation(
            CreateConversationRequestDto(
                title = title,
                category = category,
                messages = messages.toDtos(),
            ),
        ).id
    }

    override suspend fun updateConversation(
        id: String,
        title: String,
        messages: List<StoredChatMessage>,
    ): NetworkResult<Unit> = safeApiCall {
        api.updateConversation(
            UpdateConversationRequestDto(id = id, title = title, messages = messages.toDtos()),
        )
        Unit
    }

    private fun List<StoredChatMessage>.toDtos(): List<StoredMessageDto> =
        map { StoredMessageDto(role = it.role, content = it.content) }
}

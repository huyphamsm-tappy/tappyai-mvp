package com.tappyai.app.history.data

import com.tappyai.app.history.Conversation
import com.tappyai.app.history.StoredChatMessage
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the conversations backend. The ViewModel depends on this and domain
 * [Conversation] only — never on Retrofit/OkHttp or the DTOs.
 */
interface ChatHistoryRepository {

    /** The current user's conversations (newest first, capped at 20 by the backend), or a typed error. */
    suspend fun getConversations(): NetworkResult<List<Conversation>>

    /** Deletes a conversation by id. Returns Unit on success (`{ok:true}`). */
    suspend fun deleteConversation(id: String): NetworkResult<Unit>

    /**
     * The full message history of one conversation, for resuming it in Chat. There is no
     * dedicated single-conversation endpoint — the backend only exposes the list read, which
     * already returns each row's full `messages` array (see `ConversationDto`'s doc) — so this
     * re-fetches the list and picks out the matching row rather than inventing a new endpoint.
     * An id with no match (already deleted, wrong id) resolves to an empty list, not an error.
     */
    suspend fun getConversationMessages(id: String): NetworkResult<List<StoredChatMessage>>

    /**
     * Creates a conversation and returns its new server id — the chat flow keeps that id and
     * switches to [updateConversation] for every later save, exactly as the web does (POST once,
     * then PUT). [category] is the lowercase wire value of the chat's category.
     */
    suspend fun createConversation(
        title: String,
        category: String,
        messages: List<StoredChatMessage>,
    ): NetworkResult<String>

    /** Replaces an existing conversation's title+messages. */
    suspend fun updateConversation(
        id: String,
        title: String,
        messages: List<StoredChatMessage>,
    ): NetworkResult<Unit>
}

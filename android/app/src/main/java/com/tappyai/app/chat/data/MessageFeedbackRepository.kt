package com.tappyai.app.chat.data

import com.tappyai.core.logging.LoggerProvider
import kotlinx.coroutines.CancellationException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The three feedback kinds `/api/message-feedback` accepts. [wireValue] is sent verbatim as the
 * request's `type`; the backend rejects anything outside this set with a 400.
 */
enum class MessageFeedback(val wireValue: String) {
    Like("like"),
    Dislike("dislike"),
    Report("report"),
}

/**
 * Abstraction over the message-feedback backend. Deliberately returns [Unit], not a
 * [com.tappyai.core.network.NetworkResult] — the web fires both calls as
 * `fetch(...).catch(() => {})` and never surfaces a failure, because feedback is a background
 * signal, not something whose failure should interrupt reading a reply. Matching that keeps the
 * two clients' behavior identical; the UI's own optimistic state is the user-visible truth.
 */
interface MessageFeedbackRepository {

    /** Records feedback. [reason] is only sent for [MessageFeedback.Report] (the web passes
     *  `'user_reported'`); like/dislike send null, matching the web. */
    suspend fun saveFeedback(
        conversationId: String,
        messageIndex: Int,
        type: MessageFeedback,
        reason: String? = null,
    )

    /** Removes previously-recorded feedback (un-like / un-dislike). */
    suspend fun deleteFeedback(conversationId: String, messageIndex: Int, type: MessageFeedback)
}

@Singleton
class RealMessageFeedbackRepository @Inject constructor(
    private val api: MessageFeedbackApi,
    private val logger: LoggerProvider,
) : MessageFeedbackRepository {

    override suspend fun saveFeedback(
        conversationId: String,
        messageIndex: Int,
        type: MessageFeedback,
        reason: String?,
    ) {
        try {
            api.saveFeedback(
                SaveFeedbackRequestDto(
                    conversationId = conversationId,
                    messageIndex = messageIndex,
                    type = type.wireValue,
                    reason = reason,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.w(TAG, "saveFeedback(${type.wireValue}) failed: ${e.message}")
        }
    }

    override suspend fun deleteFeedback(conversationId: String, messageIndex: Int, type: MessageFeedback) {
        try {
            api.deleteFeedback(
                DeleteFeedbackRequestDto(
                    conversationId = conversationId,
                    messageIndex = messageIndex,
                    type = type.wireValue,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.w(TAG, "deleteFeedback(${type.wireValue}) failed: ${e.message}")
        }
    }

    private companion object {
        const val TAG = "MessageFeedbackRepo"
    }
}

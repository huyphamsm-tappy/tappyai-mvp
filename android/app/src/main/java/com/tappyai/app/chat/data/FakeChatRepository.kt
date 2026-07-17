package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatCategory
import com.tappyai.app.chat.ChatMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject

/**
 * Offline stub for [ChatRepository] — returns hardcoded sample replies without any network call.
 * Retained as a development/test fallback; [ChatModule] binds [RealChatRepository] in all builds.
 */
class FakeChatRepository @Inject constructor() : ChatRepository {

    private val sampleReplies = listOf(
        """
            Đây là một số gợi ý cho bạn:

            - **Phở Hòa Pasteur** — Phở bò truyền thống từ 1968
            - **Bún Chả Hương Liên** — Nổi tiếng Obama đã ghé
            - **Cơm Tấm Bụi Sài Gòn** — Cơm tấm đúng vị

            > Bạn muốn mình tìm thêm theo khu vực nào?
        """.trimIndent(),
        """
            ## Gợi ý cho bạn

            Dựa trên yêu cầu, mình đề xuất:

            1. Xem thời tiết trước khi đi
            2. Đặt grab/taxi sẵn
            3. Mang theo ô phòng mưa

            Cần mình giúp gì thêm không?
        """.trimIndent(),
    )

    override fun streamReply(messages: List<ChatMessage>): Flow<String> = flow {
        delay(RESPONDING_DURATION_MS)
        emit(sampleReplies[messages.size % sampleReplies.size])
    }

    override fun getFollowups(category: ChatCategory): List<String> = listOf(
        "Tìm quán gần đây",
        "Xem thêm gợi ý",
        "Đổi chủ đề khác",
    )

    private companion object {
        const val RESPONDING_DURATION_MS = 2500L
    }
}

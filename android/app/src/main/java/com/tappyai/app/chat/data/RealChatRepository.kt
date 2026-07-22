package com.tappyai.app.chat.data

import android.content.Context
import android.util.Base64
import com.tappyai.app.R
import com.tappyai.app.chat.ChatCategory
import com.tappyai.app.chat.ChatMessage
import com.tappyai.core.common.StringProvider
import com.tappyai.core.designsystem.component.TappyChatRole
import com.tappyai.core.logging.LoggerProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

@Singleton
class RealChatRepository @Inject constructor(
    private val okHttpClient: OkHttpClient,
    @Named("baseUrl") private val baseUrl: String,
    private val json: Json,
    private val logger: LoggerProvider,
    private val stringProvider: StringProvider,
    @ApplicationContext private val context: Context,
) : ChatRepository {

    override fun streamReply(messages: List<ChatMessage>): Flow<String> = callbackFlow {
        // Error bubbles (isError) are a UI artifact, not real model output. They live in the
        // ViewModel's message list with role=Assistant, so without this filter a prior failed
        // turn's error text (e.g. a connection-error message) would be replayed to the backend as a genuine
        // assistant turn — corrupting the model's context AND the server-side memory the
        // /api/chat onFinish step extracts from the conversation. Strip them at the wire.
        //
        // Reading+base64-encoding an attached photo is real file I/O, so this whole build step
        // runs off the main thread — matches the shape confirmed live against /api/chat: a
        // text-only turn sends `content` as a plain string, a turn with an image sends it as
        // `[{type:"text",...},{type:"image",...}]` (see ChatRequest.kt's doc).
        val dtoMessages = withContext(Dispatchers.IO) {
            messages.filterNot { it.isError }.map { msg -> msg.toDto() }
        }
        val body = json.encodeToString(ChatRequest(dtoMessages))
            .toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("${baseUrl}api/chat")
            .post(body)
            .build()

        // The shared client's 30s readTimeout is an inter-byte idle limit — fine for normal
        // request/response, but too aggressive here. Before the first token, /api/chat runs
        // slow server-side tool steps (place/web search, OSM/Overpass) that emit no stream
        // bytes, so the socket sits idle; a single slow tool can exceed 30s and trip a false
        // "network error" on a request the backend is still processing (its own ceiling is
        // maxDuration=60s). Align this call's read timeout with that ceiling. newBuilder()
        // shares the connection pool and interceptors — this is a cheap per-call override.
        val streamingClient = okHttpClient.newBuilder()
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        val call = streamingClient.newCall(request)

        launch(Dispatchers.IO) {
            try {
                val response = call.execute()
                if (!response.isSuccessful) {
                    close(parseChatError(response.code, response.body?.string()))
                    return@launch
                }

                val source = response.body?.source()
                if (source == null) {
                    close()
                    return@launch
                }

                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    parseTextDelta(line)?.let { trySend(it) }
                }
                close()
            } catch (e: IOException) {
                // A cancelled call throws IOException — close cleanly rather than as an error.
                if (call.isCanceled()) close() else {
                    logger.e(TAG, "Chat stream IO error", e)
                    close(e)
                }
            } catch (e: Exception) {
                logger.e(TAG, "Chat stream unexpected error", e)
                close(e)
            }
        }

        // awaitClose { block } is the idiomatic callbackFlow pattern: the block fires when
        // the flow is cancelled (e.g. user taps Stop), immediately closing the socket so
        // readUtf8Line() unblocks without waiting for the 30-second read timeout.
        // Do NOT use invokeOnClose — callbackFlow's internals already use it and calling it
        // again throws "Another handler is already registered".
        awaitClose { call.cancel() }
    }

    override fun getFollowups(category: ChatCategory): List<String> = when (category) {
        ChatCategory.Food -> listOf(
            stringProvider.get(R.string.chat_followup_food_1),
            stringProvider.get(R.string.chat_followup_food_2),
            stringProvider.get(R.string.chat_followup_food_3),
        )
        ChatCategory.Travel -> listOf(
            stringProvider.get(R.string.chat_followup_travel_1),
            stringProvider.get(R.string.chat_followup_travel_2),
            stringProvider.get(R.string.chat_followup_travel_3),
        )
        ChatCategory.Shopping -> listOf(
            stringProvider.get(R.string.chat_followup_shopping_1),
            stringProvider.get(R.string.chat_followup_shopping_2),
            stringProvider.get(R.string.chat_followup_shopping_3),
        )
        ChatCategory.Entertainment -> listOf(
            stringProvider.get(R.string.chat_followup_entertainment_1),
            stringProvider.get(R.string.chat_followup_entertainment_2),
            stringProvider.get(R.string.chat_followup_entertainment_3),
        )
        ChatCategory.Spa -> listOf(
            stringProvider.get(R.string.chat_followup_spa_1),
            stringProvider.get(R.string.chat_followup_spa_2),
            stringProvider.get(R.string.chat_followup_spa_3),
        )
        ChatCategory.General -> listOf(
            stringProvider.get(R.string.chat_followup_general_1),
            stringProvider.get(R.string.chat_followup_general_2),
            stringProvider.get(R.string.chat_followup_general_3),
        )
    }

    private fun parseChatError(code: Int, body: String?): ChatException {
        val dto = body?.let {
            try { json.decodeFromString<ChatErrorDto>(it) } catch (_: Exception) { null }
        }
        // dto.message is always human text; dto.error can be a code or a human sentence.
        val message = dto?.message ?: dto?.error ?: stringProvider.get(R.string.chat_error_generic_with_code, code)
        return when {
            code == 429 && dto?.error == "free_limit_reached" ->
                ChatException.DailyLimitReached(message)
            code == 429 ->
                ChatException.RateLimited(message)
            code == 401 && dto?.error == "anon_limit_reached" ->
                ChatException.AnonLimitReached(message)
            code == 413 ->
                ChatException.MessageTooLong(stringProvider.get(R.string.chat_error_message_too_long))
            code == 502 ->
                ChatException.AiError(stringProvider.get(R.string.chat_error_ai_service_down))
            else ->
                ChatException.ServerError(code, message)
        }
    }

    /**
     * Extracts a text delta from one line of the Vercel AI SDK data stream.
     *
     * Stream lines are `{partType}:{jsonPayload}`. Part type `0` carries text deltas whose
     * payload is a JSON-encoded string (e.g. `0:"Hello "`). All other part types — tool
     * calls (`2`), annotations (`a`), step finish (`e`), done (`d`) — are skipped.
     * An optional `data: ` SSE wrapper is stripped defensively in case the stream format
     * ever changes to full SSE.
     */
    private fun parseTextDelta(line: String): String? {
        val stripped = if (line.startsWith("data: ")) line.removePrefix("data: ") else line
        if (!stripped.startsWith("0:")) return null
        return try {
            json.decodeFromString<String>(stripped.removePrefix("0:"))
        } catch (_: Exception) {
            null
        }
    }

    /** Text-only turns send `content` as a plain string; a turn with [ChatMessage.imageUri] reads
     *  and base64-encodes the photo, sending the vision content-parts shape instead. A read
     *  failure (revoked URI, I/O error) degrades to text-only rather than failing the whole
     *  send — the user's typed text still reaches the model even if the photo didn't attach. */
    private fun ChatMessage.toDto(): ChatMessageDto {
        val role = if (this.role == TappyChatRole.User) "user" else "assistant"
        val dataUrl = imageUri?.let { uri ->
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                val mimeType = context.contentResolver.getType(uri)?.takeIf { it.startsWith("image/") } ?: "image/jpeg"
                bytes?.let { "data:$mimeType;base64,${Base64.encodeToString(it, Base64.NO_WRAP)}" }
            } catch (e: Exception) {
                logger.e(TAG, "Failed to read chat image attachment", e)
                null
            }
        }
        val content = if (dataUrl != null) textAndImageContent(text, dataUrl) else textContent(text)
        return ChatMessageDto(role = role, content = content)
    }

    private companion object {
        const val TAG = "RealChatRepository"
    }
}

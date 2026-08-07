package com.tappyai.app.chat.data

import android.content.Context
import android.net.Uri
import android.util.Base64
import com.tappyai.app.R
import com.tappyai.app.chat.ChatCtaButton
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

    // Round-2 audit fix: streamReply() re-maps the entire conversation history to DTOs on every
    // send, so without this cache, toDto() below re-read-and-base64-encoded every earlier
    // attached image from disk on every subsequent turn — cost growing with conversation length.
    // Keyed by Uri (not message id) since it's the actual re-derivable input.
    //
    // Certification-sprint fix: this is a @Singleton-scoped map mutated from inside a
    // withContext(Dispatchers.IO) block, and ChatViewModel.streamAssistantReply() only cancels
    // (cooperatively) the previous job before launching a new one — job.cancel() does not
    // interrupt code already running past a suspension point, so a rapid double-send/regenerate
    // has a real (if narrow) window where two IO-dispatcher threads run this map's
    // read-then-put concurrently. A plain LinkedHashMap (mutableMapOf()'s default) is not
    // thread-safe under concurrent structural modification. ConcurrentHashMap is a safe drop-in
    // here since values are never null.
    private val imageDataUrlCache = java.util.concurrent.ConcurrentHashMap<Uri, String>()

    override fun streamReply(
        messages: List<ChatMessage>,
        userPreferences: List<String>,
        responseStyle: ResponseStyleDto?,
        userLocation: UserLocationDto?,
    ): Flow<String> = callbackFlow {
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
        val body = json.encodeToString(ChatRequest(dtoMessages, userPreferences, responseStyle, userLocation))
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

    /**
     * Web-parity-sync fix: this used to be a static, per-category canned-prompt lookup —
     * plausible-looking but entirely fabricated Android-only behavior with no web equivalent
     * (the web has no such static table; every followup is model-generated per reply). It also
     * never handled `[CTA_BUTTONS]`/`[TAPPY_PLAN]` at all, so a real recommendation reply showed
     * their raw JSON markers as literal text in the chat bubble. Replaced with a real parser
     * mirroring `ChatInterface.tsx`'s `parsePlan` → `parseCTA` → `parseFollowups` chain, in the
     * same order (each stage strips its own marker from what the next stage sees).
     */
    override fun parseAssistantReply(raw: String): ParsedAssistantReply {
        // Parse (not just strip) the [TAPPY_PLAN] block into a structured plan the UI renders as a
        // card — mirrors ChatInterface.tsx's parsePlan. A malformed block degrades to plain text
        // (plan = null) rather than failing the whole reply or leaking raw JSON.
        val planMatch = TAPPY_PLAN_CAPTURE_REGEX.find(raw)
        val plan = planMatch?.let {
            try {
                json.decodeFromString<com.tappyai.app.chat.TripPlan>(it.groupValues[1].trim())
                    // Web parity (ChatInterface.tsx parsePlan): a block with no `days` array is a
                    // parse-failure → render plain text, not an empty card.
                    .takeIf { p -> p.days.isNotEmpty() }
            } catch (e: Exception) {
                logger.w(TAG, "Failed to parse TAPPY_PLAN payload: ${e.message}")
                null
            }
        }
        var text = raw.replaceFirst(TAPPY_PLAN_REGEX, "").trimEnd()

        val ctaMatch = CTA_WITH_TAG_REGEX.find(text) ?: CTA_NO_TAG_REGEX.find(text)
        val ctaButtons = if (ctaMatch != null) {
            text = text.replaceFirst(CTA_WITH_TAG_REGEX, "").replaceFirst(CTA_NO_TAG_REGEX, "").trimEnd()
            try {
                json.decodeFromString<CtaButtonsPayloadDto>(ctaMatch.groupValues[1].trim()).buttons
                    .map { ChatCtaButton(label = it.label, type = it.type, url = it.url, primary = it.primary) }
            } catch (e: Exception) {
                logger.w(TAG, "Failed to parse CTA_BUTTONS payload: ${e.message}")
                emptyList()
            }
        } else {
            emptyList()
        }

        val followupsMatch = FOLLOWUPS_REGEX.find(text)
        val followups = if (followupsMatch != null) {
            text = text.replaceFirst(FOLLOWUPS_REGEX, "")
            followupsMatch.groupValues[1].split("|").map { it.trim() }.filter { it.isNotEmpty() }.take(3)
        } else {
            emptyList()
        }
        // Safety net matching the web's own — strip any stray/orphan marker on malformed
        // model output so implementation details are never visible to the user.
        text = text.replace(FOLLOWUPS_STRAY_REGEX, "").trimEnd()
        // The block regexes above all require a CLOSING tag, so a reply cut off mid-block leaves its
        // opening marker plus raw JSON sitting in the text. That is now reachable: a Stop mid-stream
        // parses whatever arrived. Drop from any surviving opening marker to the end — there is no
        // closing tag by construction, so nothing after it is renderable content.
        text = text.replace(UNTERMINATED_BLOCK_REGEX, "").trimEnd()

        return ParsedAssistantReply(text = text.trim(), ctaButtons = ctaButtons, followups = followups, plan = plan)
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
            imageDataUrlCache[uri] ?: try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                val mimeType = context.contentResolver.getType(uri)?.takeIf { it.startsWith("image/") } ?: "image/jpeg"
                bytes?.let { "data:$mimeType;base64,${Base64.encodeToString(it, Base64.NO_WRAP)}" }
                    ?.also { imageDataUrlCache[uri] = it }
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

        // Mirrors ChatInterface.tsx's regexes exactly (source of truth: promptBuilder.ts's
        // marker format). RegexOption.IGNORE_CASE matches JS's `/i` flag; Kotlin's `$`/`.` in
        // DOT_MATCHES_ALL-less mode already behaves like JS's `[\s\S]` for our purposes since
        // these patterns explicitly use `[\s\S]` rather than relying on `.`.
        val TAPPY_PLAN_REGEX = Regex("\\[TAPPY_PLAN\\][\\s\\S]*?\\[/TAPPY_PLAN\\]", RegexOption.IGNORE_CASE)
        val TAPPY_PLAN_CAPTURE_REGEX = Regex("\\[TAPPY_PLAN\\]([\\s\\S]*?)\\[/TAPPY_PLAN\\]", RegexOption.IGNORE_CASE)
        val CTA_WITH_TAG_REGEX = Regex("\\[CTA_BUTTONS\\]([\\s\\S]*?)\\[/CTA_BUTTONS\\]", RegexOption.IGNORE_CASE)
        val CTA_NO_TAG_REGEX = Regex("\\[CTA_BUTTONS\\](\\{[\\s\\S]*\\})\\s*$", RegexOption.IGNORE_CASE)
        val FOLLOWUPS_REGEX = Regex("\\[FOLLOWUPS\\]([^\\n]*?)(?:\\[/FOLLOWUPS\\]|\\n|$)", RegexOption.IGNORE_CASE)
        val FOLLOWUPS_STRAY_REGEX = Regex("\\[/?FOLLOWUPS\\]", RegexOption.IGNORE_CASE)

        // An opening block marker with no closing tag left after the parsers above ran — i.e. a
        // reply that stopped mid-block. Everything from the marker onward is a half-written payload,
        // never prose, so it is cut rather than shown.
        val UNTERMINATED_BLOCK_REGEX =
            Regex("\\[(?:TAPPY_PLAN|CTA_BUTTONS)\\][\\s\\S]*$", RegexOption.IGNORE_CASE)
    }
}

/** Wire shape of the `[CTA_BUTTONS]{...}` JSON payload — see `CTAButton` in ChatInterface.tsx. */
@kotlinx.serialization.Serializable
private data class CtaButtonsPayloadDto(val buttons: List<CtaButtonDto> = emptyList())

@kotlinx.serialization.Serializable
private data class CtaButtonDto(
    val label: String,
    val type: String,
    val url: String,
    val primary: Boolean = false,
)

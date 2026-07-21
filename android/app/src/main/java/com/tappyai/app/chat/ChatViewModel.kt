package com.tappyai.app.chat

import android.net.Uri
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.chat.data.ChatException
import com.tappyai.app.chat.data.ChatRepository
import com.tappyai.app.chat.data.MessageFeedback
import com.tappyai.app.chat.data.MessageFeedbackRepository
import com.tappyai.app.chat.data.SuggestedPromptsRepository
import com.tappyai.app.history.StoredChatMessage
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.app.maps.data.MapsRepository
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.LanguageManager
import com.tappyai.core.common.StringProvider
import com.tappyai.core.designsystem.component.TappyChatRole
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val chatRepository: ChatRepository,
    private val chatHistoryRepository: ChatHistoryRepository,
    private val messageFeedbackRepository: MessageFeedbackRepository,
    private val suggestedPromptsRepository: SuggestedPromptsRepository,
    private val mapsRepository: MapsRepository,
    private val languageManager: LanguageManager,
    private val logger: LoggerProvider,
    private val stringProvider: StringProvider,
    @ApplicationContext private val context: android.content.Context,
) : ViewModel() {

    val category: ChatCategory = savedStateHandle.get<String>("category")
        ?.let { name -> ChatCategory.entries.find { it.name.equals(name, ignoreCase = true) } }
        ?: ChatCategory.General

    /**
     * The BCP-47 tag for both speech-to-text (this file's [onToggleSpeak]) and text-to-speech
     * (`ChatScreen`'s voice-input `RecognizerIntent`) — previously both hardcoded to "vi-VN"
     * regardless of the user's selected app language (see [LanguageManager]), so an English-mode
     * user's voice input was recognized against a Vietnamese speech model and replies were read
     * back in a Vietnamese TTS voice. Falls back to Vietnamese when unset, matching the app's
     * existing default before an explicit language choice exists.
     */
    val speechLocaleTag: String
        get() = if (languageManager.current == AppLanguage.English) "en-US" else "vi-VN"

    /**
     * The server id of the conversation this chat is persisted as. Non-null on entry only when
     * resuming an existing conversation from Chat history; for a fresh chat it stays null until the
     * first save creates the row (see [persistConversation]), then holds the new id so every later
     * save updates in place. Mirrors the web exactly: `/chat` POSTs and routes to `/chat/{id}`,
     * `/chat/[id]` PUTs thereafter.
     */
    var conversationId: String? = savedStateHandle.get<String>("conversationId")
        private set

    /**
     * A message to auto-send once on entry — the native equivalent of the web's `/chat?q=…`
     * (see `ChatInterface`'s `initialMessage` effect). Set only when arriving from an "ask Tappy
     * about this" shortcut (e.g. a recommendation); null for a normal new/resumed chat. Consumed
     * in [init].
     */
    private val prefill: String? = savedStateHandle.get<String>("prefill")

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _isAssistantResponding = MutableStateFlow(false)
    val isAssistantResponding: StateFlow<Boolean> = _isAssistantResponding.asStateFlow()

    // The reply text revealed AS IT STREAMS (structured blocks stripped, image markdown KEPT — the
    // UI segments it live so photo galleries appear inline mid-stream, matching the committed
    // message's segments). Empty until the first token arrives — the UI shows the thinking dots +
    // rotating hint until then, then the smooth typewriter reveal. Web parity: ChatInterface
    // streams the last assistant message's text live via useSmoothText + formatMessage.
    private val _streamingText = MutableStateFlow("")
    val streamingText: StateFlow<String> = _streamingText.asStateFlow()

    // True only while a resumed conversation's history is still loading, so the Welcome state
    // doesn't flash before the real messages arrive (see init{} below). Chats started fresh
    // (conversationId == null) never enter this state.
    private val _isLoadingConversation = MutableStateFlow(conversationId != null)
    val isLoadingConversation: StateFlow<Boolean> = _isLoadingConversation.asStateFlow()

    var input by mutableStateOf("")
        private set

    /** A photo picked for the next outgoing turn (vision input), staged until send — mirrors the
     *  web's `experimental_attachments` preview-before-send UX. */
    var pendingImageUri by mutableStateOf<Uri?>(null)
        private set

    /**
     * Which feedback the user has applied to each message, keyed by [ChatMessage.id]. Held here
     * rather than as `remember` state inside the action bar so it survives the row scrolling out of
     * the LazyColumn and back (local state would silently reset the thumb, making it look like the
     * feedback was lost). Only ever holds [MessageFeedback.Like]/[MessageFeedback.Dislike] — Report
     * is a fire-and-forget action with its own [reportedMessageIds] latch, not a toggle.
     */
    private val _feedback = MutableStateFlow<Map<Long, MessageFeedback>>(emptyMap())
    val feedback: StateFlow<Map<Long, MessageFeedback>> = _feedback.asStateFlow()

    /** Messages already reported, so the More menu can disable the row — mirrors the web's
     *  `reportState === 'reported'` disabling its own report button. */
    private val _reportedMessageIds = MutableStateFlow<Set<Long>>(emptySet())
    val reportedMessageIds: StateFlow<Set<Long>> = _reportedMessageIds.asStateFlow()

    /** Dynamic starter prompts (GET /api/suggested-prompts) for the general-category welcome. Empty
     *  until loaded / on failure, in which case the screen keeps the static [quickPrompts]. */
    private val _dynamicPrompts = MutableStateFlow<List<String>>(emptyList())
    val dynamicPrompts: StateFlow<List<String>> = _dynamicPrompts.asStateFlow()

    init {
        // The general-category welcome shows dynamic, time/memory-aware prompts (the web's
        // /api/suggested-prompts); specific categories keep their static starter prompts. Best-effort
        // — a failure leaves the static fallback in place.
        if (category == ChatCategory.General) {
            viewModelScope.launch {
                val english = languageManager.current == AppLanguage.English
                when (val result = suggestedPromptsRepository.getPrompts(english)) {
                    is NetworkResult.Success -> _dynamicPrompts.value = result.data
                    is NetworkResult.Error ->
                        logger.e("ChatViewModel", "Suggested prompts load failed: ${result.error}")
                }
            }
        }
    }

    private var nextId = 0L
    private var respondingJob: Job? = null

    private var textToSpeech: TextToSpeech? = null

    private var speechRecognizer: SpeechRecognizer? = null
    private val _isListening = MutableStateFlow(false)
    /** True while the in-app voice recogniser is actively listening — drives the mic recording
     *  animation (mirrors the web chat's `isListening`). */
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    /** False until the device's TTS engine finishes initializing successfully — mirrors the
     *  web's `!window.speechSynthesis` guard; [onToggleSpeak] silently no-ops while false. */
    var ttsAvailable by mutableStateOf(false)
        private set

    /** The message currently being read aloud, or null. Only one message speaks at a time,
     *  matching the web's single `speakingId` in `useTTS` — mirrors [TranslateViewModel]'s
     *  own on-device [TextToSpeech] wrapper, adapted for a list of independently toggleable
     *  messages instead of one single result. */
    var speakingMessageId by mutableStateOf<Long?>(null)
        private set

    // ── TTS player-bar state (web parity: the scrubber shown while a message reads aloud) ──
    // Native TextToSpeech has no pause/seek, so play/pause/skip/speed are implemented by stopping and
    // re-speaking from a character offset; onRangeStart drives the live progress. CPS matches the web.
    var ttsSpeed by mutableStateOf(1f)
        private set
    var ttsIsPaused by mutableStateOf(false)
        private set
    var ttsProgress by mutableStateOf(0f) // 0..1
        private set
    var ttsElapsedSec by mutableStateOf(0)
        private set
    var ttsTotalSec by mutableStateOf(0)
        private set
    private var ttsText: String = ""
    private var ttsBaseOffset: Int = 0 // char index the current utterance started at
    private var ttsCurrentOffset: Int = 0
    // Set true when WE stop TTS on purpose (pause/skip/speed change) so the engine's onDone/onError
    // callback doesn't tear the player down — only a natural finish or the user's Stop should.
    private var ttsIntentionalStop = false

    init {
        val id = conversationId
        if (id != null) {
            viewModelScope.launch {
                when (val result = chatHistoryRepository.getConversationMessages(id)) {
                    is NetworkResult.Success -> {
                        _messages.value = result.data.map { stored ->
                            ChatMessage(
                                id = nextId++,
                                role = if (stored.role == "user") TappyChatRole.User else TappyChatRole.Assistant,
                                text = stored.content,
                            )
                        }
                    }
                    is NetworkResult.Error -> {
                        // Resume is best-effort: an id that fails to load (deleted, network error)
                        // just falls back to a fresh chat rather than blocking the screen.
                        logger.e(TAG, "Failed to load conversation $id: ${result.error}")
                    }
                }
                _isLoadingConversation.value = false
            }
        } else if (!prefill.isNullOrBlank()) {
            // Fresh chat opened from an "ask Tappy about this" shortcut: fire the prompt once, the
            // same as the web auto-submitting a lingering `?q=` when the transcript is empty.
            sendUserMessage(prefill)
        }

        textToSpeech = TextToSpeech(context) { status ->
            ttsAvailable = status == TextToSpeech.SUCCESS
            if (status != TextToSpeech.SUCCESS) {
                logger.w(TAG, "TextToSpeech init failed (status=$status) — read-aloud disabled")
            }
        }
        textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            // Live progress: `start` is the char index within the CURRENT (offset) utterance; add the
            // base to get the absolute position, then derive progress + elapsed (web CPS = 13).
            override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                val abs = (ttsBaseOffset + start).coerceIn(0, ttsText.length)
                ttsCurrentOffset = abs
                val len = ttsText.length.coerceAtLeast(1)
                ttsProgress = abs.toFloat() / len
                ttsElapsedSec = (abs / (TTS_CPS * ttsSpeed)).toInt()
                ttsTotalSec = (len / (TTS_CPS * ttsSpeed)).toInt()
            }
            override fun onDone(utteranceId: String?) {
                if (ttsIntentionalStop) { ttsIntentionalStop = false; return }
                stopTtsPlayback()
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                if (ttsIntentionalStop) { ttsIntentionalStop = false; return }
                stopTtsPlayback()
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
                if (ttsIntentionalStop) { ttsIntentionalStop = false; return }
                stopTtsPlayback()
            }
        })
    }

    fun onInputChange(value: String) { input = value }

    /** Appends a picked emoji to the draft (web `insertEmoji`; the composer's String-based field
     *  has no cursor access, so Android appends at the end — the common typing-then-emoji flow). */
    fun onEmojiPicked(emoji: String) { input += emoji }

    /**
     * Starts in-app voice input via [SpeechRecognizer] (mirrors the web chat's Web Speech API mic):
     * a live partial transcript flows into the input as the user speaks, and on a final result the
     * recognised text is appended and the message is AUTO-SENT — the same behaviour as web (no extra
     * manual tap). Toggling while already listening stops it. RECORD_AUDIO is requested by the screen.
     */
    fun startVoiceInput() {
        if (_isListening.value) { stopVoiceInput(); return }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) return
        val base = input
        val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        speechRecognizer = recognizer
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { _isListening.value = true }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { _isListening.value = false }
            override fun onError(error: Int) {
                _isListening.value = false
                recognizer.destroy(); speechRecognizer = null
            }
            override fun onPartialResults(partialResults: Bundle?) {
                partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?.let { input = if (base.isBlank()) it else "$base $it" }
            }
            override fun onResults(results: Bundle?) {
                _isListening.value = false
                recognizer.destroy(); speechRecognizer = null
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (!text.isNullOrBlank()) {
                    input = if (base.isBlank()) text else "$base $text"
                    onSend() // web parity: auto-send once recognition completes
                }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        _isListening.value = true // optimistic instant feedback (web parity)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, speechLocaleTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        runCatching { recognizer.startListening(intent) }.onFailure { _isListening.value = false }
    }

    /** Stops/cancels in-app voice input and clears the listening state. */
    fun stopVoiceInput() {
        speechRecognizer?.let { runCatching { it.stopListening() }; runCatching { it.destroy() } }
        speechRecognizer = null
        _isListening.value = false
    }

    fun onImagePicked(uri: Uri) { pendingImageUri = uri }

    fun onClearPendingImage() { pendingImageUri = null }

    fun onSend() {
        val text = input.trim()
        val image = pendingImageUri
        if (text.isEmpty() && image == null) return
        sendUserMessage(text, image)
        pendingImageUri = null
    }

    fun onMoodSelected(mood: MoodChip) = sendUserMessage(mood.prompt)

    fun onQuickPromptSelected(prompt: String) = sendUserMessage(prompt)

    fun onFollowupSelected(followup: String) = sendUserMessage(followup)

    fun onStop() {
        respondingJob?.cancel()
        respondingJob = null
        _isAssistantResponding.value = false
    }

    /**
     * Regenerates the last assistant reply — mirrors the web's `reload()` (Vercel AI SDK):
     * drops the last assistant message and re-sends the same history (ending in the same last
     * user message) to get a fresh reply in its place, rather than appending a second one.
     * Only ever called for the last assistant message (the composer/action bar gates this).
     */
    fun onRegenerate() {
        val current = _messages.value
        val lastAssistantIndex = current.indexOfLast { it.role == TappyChatRole.Assistant }
        if (lastAssistantIndex == -1) return
        val historyWithoutReply = current.take(lastAssistantIndex)
        _messages.value = historyWithoutReply
        streamAssistantReply(historyWithoutReply)
    }

    /** Toggles on-device read-aloud for message [id] — stops if [id] is already speaking
     *  (matching the web's single-speaker toggle), else stops any other message and starts
     *  this one. No-ops if the device has no working TTS engine. */
    fun onToggleSpeak(id: Long, text: String) {
        if (textToSpeech == null || !ttsAvailable) return
        if (speakingMessageId == id) { stopTtsPlayback(); return }
        // Start fresh on a new message (reset the scrubber; keep no residual speed).
        speakingMessageId = id
        ttsText = text
        ttsSpeed = 1f
        ttsProgress = 0f
        ttsElapsedSec = 0
        ttsTotalSec = (text.length.coerceAtLeast(1) / (TTS_CPS * ttsSpeed)).toInt()
        speakFromOffset(0)
    }

    /** (Re)speak [ttsText] from [offset] chars in, at the current [ttsSpeed]. Backs resume/skip/speed. */
    private fun speakFromOffset(offset: Int) {
        val tts = textToSpeech ?: return
        ttsBaseOffset = offset.coerceIn(0, ttsText.length)
        ttsCurrentOffset = ttsBaseOffset
        ttsIsPaused = false
        tts.setSpeechRate(ttsSpeed)
        tts.language = Locale.forLanguageTag(speechLocaleTag)
        val remainder = ttsText.substring(ttsBaseOffset)
        tts.speak(remainder, TextToSpeech.QUEUE_FLUSH, null, "chat-utterance-$speakingMessageId")
    }

    /** Fully stops read-aloud and hides the player (natural finish, Stop tap, or error). */
    private fun stopTtsPlayback() {
        ttsIntentionalStop = false
        textToSpeech?.stop()
        speakingMessageId = null
        ttsIsPaused = false
        ttsProgress = 0f
    }

    /** Player Stop/close — same as tapping the speaking message's read-aloud again. */
    fun onStopSpeak() = stopTtsPlayback()

    /** Player play/pause. Pause = stop but keep the offset; play = resume from that offset. */
    fun onTtsPauseResume() {
        if (speakingMessageId == null) return
        if (ttsIsPaused) {
            speakFromOffset(ttsCurrentOffset)
        } else {
            ttsIntentionalStop = true
            textToSpeech?.stop()
            ttsIsPaused = true
        }
    }

    /** Skip [seconds] (±) — jump the char offset by seconds×CPS×speed and re-speak from there. */
    fun onTtsSkip(seconds: Int) {
        if (speakingMessageId == null) return
        val delta = (seconds * TTS_CPS * ttsSpeed).toInt()
        val target = (ttsCurrentOffset + delta).coerceIn(0, ttsText.length)
        if (target >= ttsText.length) { stopTtsPlayback(); return }
        ttsIntentionalStop = true
        speakFromOffset(target)
    }

    /** Cycle read-aloud speed 1× → 1.5× → 2× → 1× (web parity), re-speaking from the current spot. */
    fun onTtsCycleSpeed() {
        if (speakingMessageId == null) return
        ttsSpeed = when (ttsSpeed) {
            1f -> 1.5f
            1.5f -> 2f
            else -> 1f
        }
        if (!ttsIsPaused) {
            ttsIntentionalStop = true
            speakFromOffset(ttsCurrentOffset)
        }
    }

    /** Saves a place to favorites (web SavePlaceButton / FavoriteToggle). Returns true on success. */
    suspend fun addFavorite(placeId: String, placeName: String, placeAddress: String, placeType: String): Boolean =
        mapsRepository.addFavorite(placeId, placeName, placeAddress, placeType) is NetworkResult.Success

    /** Removes a favorite place by id. Returns true on success. */
    suspend fun removeFavorite(placeId: String): Boolean =
        mapsRepository.removeFavorite(placeId) is NetworkResult.Success

    private fun sendUserMessage(text: String, imageUri: Uri? = null) {
        _messages.update { it + ChatMessage(id = nextId++, role = TappyChatRole.User, text = text, imageUri = imageUri) }
        input = ""
        streamAssistantReply(_messages.value)
    }

    private fun streamAssistantReply(history: List<ChatMessage>) {
        respondingJob?.cancel()
        // Explicitly reset before the new job starts so any in-flight finally{} from the
        // cancelled job can't race with the new job's true state.
        _isAssistantResponding.value = false
        respondingJob = viewModelScope.launch {
            _isAssistantResponding.value = true
            _streamingText.value = ""

            try {
                val reply = StringBuilder()
                chatRepository.streamReply(history).collect { token ->
                    reply.append(token)
                    // Surface the running text with structured blocks stripped but image markdown
                    // RETAINED — the UI segments it live, so each recommendation's photos render
                    // inline at their position during the stream (web parity: formatMessage runs
                    // on the accumulated stream every frame; images are never deferred to the end).
                    _streamingText.value = ChatResponseParser.parse(reply.toString()).streamText
                }

                // Parse the structured blocks the model may append (plan/CTA/followups) and strip
                // them from the visible text — web parity (see ChatResponseParser). Web parses
                // followups from the reply itself; keep the dedicated endpoint as a fallback when
                // the model didn't inline any, so existing Android followups don't regress.
                val parsed = ChatResponseParser.parse(reply.toString())
                val followups = parsed.followups.ifEmpty { chatRepository.getFollowups(category) }
                _messages.update { msgs ->
                    msgs + ChatMessage(
                        id = nextId++,
                        role = TappyChatRole.Assistant,
                        text = parsed.text,
                        plan = parsed.plan,
                        ctaButtons = parsed.ctaButtons,
                        segments = parsed.segments,
                        followups = followups,
                    )
                }
                persistConversation()
            } catch (e: CancellationException) {
                // User tapped Stop — suppress the indicator via onStop(); just rethrow.
                throw e
            } catch (e: ChatException) {
                _messages.update { msgs ->
                    msgs + ChatMessage(
                        id = nextId++,
                        role = TappyChatRole.Assistant,
                        text = e.message ?: stringProvider.get(R.string.chat_error_generic),
                        isError = true,
                    )
                }
            } catch (e: Exception) {
                logger.e(TAG, "Chat stream failed", e)
                _messages.update { msgs ->
                    msgs + ChatMessage(
                        id = nextId++,
                        role = TappyChatRole.Assistant,
                        text = stringProvider.get(R.string.chat_error_connection),
                        isError = true,
                    )
                }
            } finally {
                _isAssistantResponding.value = false
                _streamingText.value = ""
            }
        }
    }

    /**
     * The message's index in the **persisted** `messages` array — which is what
     * `/api/message-feedback`'s `messageIndex` refers to. Error bubbles are stripped before saving
     * (see [persistConversation]), so this counts position among non-error messages rather than
     * using the raw list index: after any failed turn the two diverge, and using the raw index
     * would attach feedback to the wrong message server-side. The web has no such skew (it never
     * stores error turns at all), so this arithmetic is what keeps the two clients equivalent.
     * Null for an error bubble itself, which is never persisted and so can't carry feedback.
     */
    private fun persistedIndexOf(messageId: Long): Int? {
        var index = 0
        for (message in _messages.value) {
            if (message.isError) continue
            if (message.id == messageId) return index
            index++
        }
        return null
    }

    /**
     * Toggles like/dislike on a message — same rules as the web's `handleLike`/`handleDislike`:
     * tapping the active one clears it (DELETE); tapping the other switches, clearing the opposite
     * first (DELETE) before recording the new one (POST), since they're mutually exclusive.
     *
     * The optimistic UI flip happens even with no [conversationId] (an unsaved chat), exactly as
     * the web does — its `saveFeedback` early-returns on `!conversationId` while its `setLiked` has
     * already run. In practice the id exists by now: the first save completes when the reply does,
     * and the action bar only renders on a finished reply.
     */
    fun onToggleFeedback(messageId: Long, type: MessageFeedback) {
        val previous = _feedback.value[messageId]
        val isClearing = previous == type
        _feedback.update { current ->
            if (isClearing) current - messageId else current + (messageId to type)
        }

        val id = conversationId ?: return
        val index = persistedIndexOf(messageId) ?: return
        viewModelScope.launch {
            if (isClearing) {
                messageFeedbackRepository.deleteFeedback(id, index, type)
            } else {
                // Clear the opposite thumb server-side too, or the row would keep both.
                previous?.let { messageFeedbackRepository.deleteFeedback(id, index, it) }
                messageFeedbackRepository.saveFeedback(id, index, type)
            }
        }
    }

    /** Reports a message — matches the web's `saveFeedback('report', 'user_reported')`; one-way,
     *  no un-report affordance on either platform. */
    fun onReportMessage(messageId: Long) {
        if (messageId in _reportedMessageIds.value) return
        _reportedMessageIds.update { it + messageId }

        val id = conversationId ?: return
        val index = persistedIndexOf(messageId) ?: return
        viewModelScope.launch {
            messageFeedbackRepository.saveFeedback(id, index, MessageFeedback.Report, REPORT_REASON)
        }
    }

    /**
     * Saves the conversation after a reply completes — the web fires the identical save from
     * `useChat`'s `onFinish` (`src/components/ChatInterface.tsx`), so the two clients write on the
     * same trigger. First save POSTs and captures the new id; every later one PUTs that id.
     *
     * Best-effort by design, matching the web (its `handleSave` only `console.error`s a failure):
     * a save failure must never surface an error bubble over a reply the user did receive, and the
     * next reply retries the whole array anyway since each save sends full state, not a delta.
     * Error bubbles are filtered out — they're a UI artifact the web has no equivalent of (it
     * surfaces failures via `useChat`'s `error`, never as a stored message), so persisting them
     * would corrupt both the history list and any later resume of this conversation.
     */
    private suspend fun persistConversation() {
        val stored = _messages.value
            .filterNot { it.isError }
            .map { StoredChatMessage(role = if (it.role == TappyChatRole.User) "user" else "assistant", content = it.text) }
        if (stored.isEmpty()) return

        // Same title rule as the web: first message's text, capped at 50 chars.
        val title = stored.first().content.take(TITLE_MAX_CHARS).ifBlank { DEFAULT_TITLE }
        val id = conversationId
        if (id == null) {
            when (val result = chatHistoryRepository.createConversation(
                title = title,
                category = category.name.lowercase(),
                messages = stored,
            )) {
                is NetworkResult.Success -> conversationId = result.data
                is NetworkResult.Error -> logger.w(TAG, "Conversation create failed: ${result.error}")
            }
        } else {
            when (val result = chatHistoryRepository.updateConversation(id = id, title = title, messages = stored)) {
                is NetworkResult.Success -> Unit
                is NetworkResult.Error -> logger.w(TAG, "Conversation update failed: ${result.error}")
            }
        }
    }

    override fun onCleared() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        speechRecognizer?.destroy()
        speechRecognizer = null
        super.onCleared()
    }

    private companion object {
        const val TAG = "ChatViewModel"
        /** Read-aloud chars-per-second estimate — matches the web useTTS `CPS = 13` for progress/skip. */
        const val TTS_CPS = 13f
        /** Matches the web's `all[0]?.content?.slice(0, 50)` title rule. */
        const val TITLE_MAX_CHARS = 50
        /** Matches the web's `|| 'Chat'` fallback for a blank first message. */
        const val DEFAULT_TITLE = "Chat"
        /** The web sends this exact literal as the report's `reason`. */
        const val REPORT_REASON = "user_reported"
    }
}

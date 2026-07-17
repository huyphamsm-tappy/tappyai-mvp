package com.tappyai.app.chat

import android.net.Uri
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
import com.tappyai.app.history.StoredChatMessage
import com.tappyai.app.history.data.ChatHistoryRepository
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
    private val languageManager: LanguageManager,
    private val logger: LoggerProvider,
    private val stringProvider: StringProvider,
    @ApplicationContext context: android.content.Context,
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

    private var nextId = 0L
    private var respondingJob: Job? = null

    private var textToSpeech: TextToSpeech? = null

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
            override fun onDone(utteranceId: String?) { speakingMessageId = null }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { speakingMessageId = null }
            override fun onError(utteranceId: String?, errorCode: Int) { speakingMessageId = null }
        })
    }

    fun onInputChange(value: String) { input = value }

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
        val tts = textToSpeech ?: return
        if (!ttsAvailable) return
        if (speakingMessageId == id) {
            tts.stop()
            speakingMessageId = null
            return
        }
        tts.language = Locale.forLanguageTag(speechLocaleTag)
        speakingMessageId = id
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "chat-utterance-$id")
    }

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

            try {
                val reply = StringBuilder()
                chatRepository.streamReply(history).collect { token -> reply.append(token) }

                _messages.update { msgs ->
                    msgs + ChatMessage(
                        id = nextId++,
                        role = TappyChatRole.Assistant,
                        text = reply.toString().trim(),
                        followups = chatRepository.getFollowups(category),
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
        super.onCleared()
    }

    private companion object {
        const val TAG = "ChatViewModel"
        /** Matches the web's `all[0]?.content?.slice(0, 50)` title rule. */
        const val TITLE_MAX_CHARS = 50
        /** Matches the web's `|| 'Chat'` fallback for a blank first message. */
        const val DEFAULT_TITLE = "Chat"
        /** The web sends this exact literal as the report's `reason`. */
        const val REPORT_REASON = "user_reported"
    }
}

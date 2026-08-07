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
import com.tappyai.app.chat.data.ResponseStyleDto
import com.tappyai.app.history.StoredChatMessage
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.LanguageManager
import com.tappyai.app.memory.RESPONSE_STYLE_LENGTH_KEY
import com.tappyai.app.memory.RESPONSE_STYLE_TONE_KEY
import com.tappyai.app.preferences.data.PreferencesRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.datastore.PreferencesDataSource
import com.tappyai.core.designsystem.component.TappyChatRole
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val chatRepository: ChatRepository,
    private val chatHistoryRepository: ChatHistoryRepository,
    private val messageFeedbackRepository: MessageFeedbackRepository,
    private val preferencesRepository: PreferencesRepository,
    private val prefs: PreferencesDataSource,
    private val languageManager: LanguageManager,
    private val locationRepository: com.tappyai.app.location.LocationRepository,
    private val favoritesApi: com.tappyai.app.chat.data.FavoritesApi,
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

    // Round-3 audit fix: unsent composer text was lost on process death (a plain mutableStateOf).
    var input by mutableStateOf(savedStateHandle.get<String>(KEY_INPUT).orEmpty())
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

    /** The user's saved freeform preference tags, sent on every chat turn (see
     *  [ChatRepository.streamReply]'s doc). Best-effort background load, matching the web's
     *  `fetch('/api/preferences').catch(() => {})` (`ChatInterface.tsx:820`) — a failed/slow load
     *  just means this turn goes out with no preference bias, never blocks sending. */
    private var userPreferences: List<String> = emptyList()

    /** The user's saved tone/length pick from What-Tappy-Knows ([com.tappyai.app.memory.MemoryViewModel]),
     *  sent on every chat turn as `responseStyle`. Read once per ViewModel instance — a mid-chat
     *  change only takes effect on the next fresh Chat screen, matching the web's own `useState`
     *  read-once-on-mount (`ChatInterface.tsx:570`). */
    private var responseStyle: ResponseStyleDto? = null

    /** Device location sent as `userLocation` for search bias (web parity, `ChatInterface.tsx:580`).
     *  Populated best-effort once permission is available; null means "no bias", which the backend
     *  handles the same as the web sending no location. */
    private var userLocation: com.tappyai.app.chat.data.UserLocationDto? = null

    /** Whether location permission is already granted — lets the screen decide whether to request. */
    fun hasLocationPermission(): Boolean = locationRepository.hasPermission()

    /** Saves a place to favorites (chat "Save place" affordance, web `SavePlaceButton`). Returns
     *  true only on a real success so the UI never shows a false "saved" (a past web bug). */
    suspend fun savePlace(placeName: String): Boolean {
        val name = placeName.trim()
        if (name.isEmpty()) return false
        return withContext(Dispatchers.IO) {
            runCatching {
                favoritesApi.addFavorite(
                    com.tappyai.app.chat.data.AddFavoriteRequestDto(
                        placeId = "manual_${System.currentTimeMillis()}",
                        placeName = name,
                    ),
                ).isSuccessful
            }.getOrElse {
                logger.w(TAG, "Save place failed: ${it.message}")
                false
            }
        }
    }

    /** Best-effort refresh of [userLocation]; called once permission is available. */
    fun refreshLocation() {
        viewModelScope.launch {
            val location = locationRepository.currentLocation() ?: return@launch
            userLocation = com.tappyai.app.chat.data.UserLocationDto(location.lat, location.lng, location.address)
        }
    }

    private var nextId = 0L
    private var respondingJob: Job? = null

    /**
     * True while a dictated turn is queued to send and the user can still stop it — the web's
     * `pendingSend` (`ChatInterface.tsx`), which renders a tappable "sending in a moment… tap to
     * edit" status line for exactly the same window. Held in the ViewModel rather than the
     * composable so a rotation mid-window neither cancels the send nor loses the notice.
     */
    var voiceAutoSendPending by mutableStateOf(false)
        private set

    private var voiceAutoSendJob: Job? = null

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
                        if (result.data.isEmpty()) {
                            // getConversationMessages resolves the id from the 20-most-recent list
                            // (no GET-by-id endpoint), so a conversation outside that window comes back
                            // empty. A real conversation always has messages, so empty = not found →
                            // start a fresh chat by clearing conversationId, exactly like the Error
                            // branch. Otherwise persistConversation() below would PUT-overwrite the
                            // still-existing conversation with this empty history (data loss).
                            conversationId = null
                        } else {
                            _messages.value = result.data.map { stored -> restoreMessage(stored) }
                        }
                    }
                    is NetworkResult.Error -> {
                        // Resume is best-effort: an id that fails to load (deleted, network error)
                        // just falls back to a fresh chat rather than blocking the screen. Clearing
                        // conversationId here is required, not cosmetic: persistConversation() below
                        // branches on it being non-null to call PUT (full-replace) instead of POST
                        // (create) — leaving it set would let the next send silently overwrite the
                        // real, still-existing conversation with this empty-chat's history on a
                        // merely-transient load failure.
                        logger.e(TAG, "Failed to load conversation $id: ${result.error}")
                        conversationId = null
                    }
                }
                _isLoadingConversation.value = false
            }
        } else if (!prefill.isNullOrBlank()) {
            // Fresh chat opened from an "ask Tappy about this" shortcut: fire the prompt once, the
            // same as the web auto-submitting a lingering `?q=` when the transcript is empty.
            sendUserMessage(prefill)
        }

        viewModelScope.launch {
            when (val result = preferencesRepository.getPreferences()) {
                is NetworkResult.Success -> userPreferences = result.data.preferences
                is NetworkResult.Error -> Unit
            }
        }
        viewModelScope.launch {
            val tone = prefs.getString(RESPONSE_STYLE_TONE_KEY).first()
            val length = prefs.getString(RESPONSE_STYLE_LENGTH_KEY).first()
            responseStyle = if (tone != null || length != null) ResponseStyleDto(tone, length) else null
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

    /**
     * Rebuilds one message of a resumed conversation from its stored content. Assistant turns go
     * back through [ChatRepository.parseAssistantReply], which is what makes a saved itinerary
     * re-render as a [TripPlanCard] (plus its CTA buttons and followups) instead of as text with the
     * markers stripped. This mirrors the web exactly: it feeds the stored `content` straight into
     * `useChat`'s `initialMessages` and parses at render time, so a resumed plan card survives there.
     */
    private fun restoreMessage(stored: StoredChatMessage): ChatMessage {
        val id = nextId++
        if (stored.role == "user") {
            return ChatMessage(id = id, role = TappyChatRole.User, text = stored.content)
        }
        val parsed = chatRepository.parseAssistantReply(stored.content)
        return ChatMessage(
            id = id,
            role = TappyChatRole.Assistant,
            text = parsed.text,
            followups = parsed.followups,
            ctaButtons = parsed.ctaButtons,
            plan = parsed.plan,
            rawText = stored.content,
        )
    }

    fun onInputChange(value: String) {
        // Web parity (`ChatInterface.tsx`'s textarea `onChange`: `if (pendingSend) cancelAutoSend()`):
        // editing the text during the voice grace window cancels the queued auto-send, so the timer
        // can never overtake an edit the user is still making.
        cancelVoiceAutoSend()
        input = value
        savedStateHandle[KEY_INPUT] = value
    }

    fun onImagePicked(uri: Uri) { pendingImageUri = uri }

    fun onClearPendingImage() { pendingImageUri = null }

    /**
     * Consumes a finished dictation — the native counterpart of the web's `recognition.onresult`
     * (fill the composer) + `recognition.onend` (queue the auto-send) pair in `ChatInterface.tsx`.
     * Android's dictation is the system `RecognizerIntent` dialog, so the transcript arrives once at
     * the end instead of streaming in live, but everything after that point matches the web:
     *
     *  1. the transcript is appended to whatever was already typed (the web's `voiceBaseRef`), and
     *  2. the turn auto-sends after [VOICE_AUTO_SEND_DELAY_MS], a window the user can cancel by
     *     tapping the status line or by editing the text.
     *
     * A blank transcript queues nothing, matching the web's `voiceSpokeRef` guard — a recognition
     * that captured no speech must never fire an empty turn.
     */
    fun onVoiceResult(spoken: String) {
        val transcript = spoken.trim()
        if (transcript.isEmpty()) return
        val base = input.trimEnd()
        // onInputChange cancels any previous grace window, so the pending state below is set after
        // it — a second dictation replaces the first one's timer rather than racing it.
        onInputChange(if (base.isEmpty()) transcript else "$base $transcript")
        voiceAutoSendPending = true
        voiceAutoSendJob = viewModelScope.launch {
            delay(VOICE_AUTO_SEND_DELAY_MS)
            // Cleared before sending so onSend()'s own cancelVoiceAutoSend() can't cancel the
            // coroutine it is being called from.
            voiceAutoSendJob = null
            voiceAutoSendPending = false
            onSend()
        }
    }

    /** Cancels a queued voice auto-send — the web's `cancelAutoSend()`. Fired by an edit, by a
     *  manual send, and by tapping the pending status line. */
    fun cancelVoiceAutoSend() {
        voiceAutoSendJob?.cancel()
        voiceAutoSendJob = null
        voiceAutoSendPending = false
    }

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
        // Any send supersedes a queued voice auto-send, so the timer can never fire a second,
        // duplicate turn behind it (web: `handleFormSubmit` and `handleKeyDown` both call
        // `cancelAutoSend()`). Placed in this single funnel so the composer, the action chips,
        // the mood/followup chips and the auto-send itself all get the same guarantee.
        cancelVoiceAutoSend()
        _messages.update { it + ChatMessage(id = nextId++, role = TappyChatRole.User, text = text, imageUri = imageUri) }
        input = ""
        savedStateHandle[KEY_INPUT] = ""
        streamAssistantReply(_messages.value)
    }

    private fun streamAssistantReply(history: List<ChatMessage>) {
        respondingJob?.cancel()
        // Explicitly reset before the new job starts so any in-flight finally{} from the
        // cancelled job can't race with the new job's true state.
        _isAssistantResponding.value = false
        respondingJob = viewModelScope.launch {
            _isAssistantResponding.value = true

            // Insert a streaming placeholder up front and reveal text token-by-token (web parity:
            // useSmoothText decouples display from network bursts, killing the block-jump). Markers
            // are hidden mid-stream via streamingDisplayText; the final parse fills in plan/CTA/
            // followups and clears the streaming flag.
            val streamingId = nextId++
            _messages.update { it + ChatMessage(id = streamingId, role = TappyChatRole.Assistant, text = "", streaming = true) }
            // Declared outside the try so the Stop (CancellationException) path can still parse and
            // persist what arrived before the user tapped Stop.
            val reply = StringBuilder()
            try {
                chatRepository.streamReply(history, userPreferences, responseStyle, userLocation).collect { token ->
                    reply.append(token)
                    val display = streamingDisplayText(reply.toString())
                    _messages.update { msgs -> msgs.map { if (it.id == streamingId) it.copy(text = display) else it } }
                }

                // Web-parity-sync fix: extract the model's own [CTA_BUTTONS]/[FOLLOWUPS] markers and
                // parse [TAPPY_PLAN] into a card — see ChatRepository.parseAssistantReply's doc.
                val parsed = chatRepository.parseAssistantReply(reply.toString())
                _messages.update { msgs ->
                    msgs.map {
                        if (it.id != streamingId) it else it.copy(
                            text = parsed.text,
                            followups = parsed.followups,
                            ctaButtons = parsed.ctaButtons,
                            plan = parsed.plan,
                            streaming = false,
                            rawText = reply.toString(),
                        )
                    }
                }
                persistConversation()
            } catch (e: CancellationException) {
                // User tapped Stop — keep whatever streamed so far (web keeps the partial reply).
                //
                // This must run the SAME parse as the success path. It used to only clear the
                // streaming flag, which silently threw away an itinerary that had already fully
                // arrived: `plan` stayed null, so no TripPlanCard was ever built, and the turn was
                // never persisted either, so reopening the conversation could not recover it. A
                // plan takes tens of seconds to generate, so tapping Stop is ordinary behaviour —
                // and it made the whole itinerary disappear. parseAssistantReply degrades to
                // plan = null on a half-arrived block, so parsing a partial reply is safe.
                val parsed = chatRepository.parseAssistantReply(reply.toString())
                _messages.update { msgs ->
                    msgs.map {
                        if (it.id != streamingId) it else it.copy(
                            text = parsed.text,
                            followups = parsed.followups,
                            ctaButtons = parsed.ctaButtons,
                            plan = parsed.plan,
                            streaming = false,
                            rawText = reply.toString(),
                        )
                    }
                }
                // The coroutine is already cancelled, so any suspension point would throw
                // immediately — persisting has to opt out of cancellation or it silently no-ops.
                withContext(NonCancellable) { persistConversation() }
                throw e
            } catch (e: ChatException) {
                // Drop the streaming placeholder and show the error bubble in its place.
                _messages.update { msgs -> msgs.filterNot { it.id == streamingId } }
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
                    msgs.filterNot { it.id == streamingId } + ChatMessage(
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
            .map {
                StoredChatMessage(
                    role = if (it.role == TappyChatRole.User) "user" else "assistant",
                    // The RAW reply, not the display text: the markers are what let this conversation
                    // come back as a plan card (here via [restoreMessage], on the web via its
                    // render-time `parsePlan`). Saving the stripped text dropped the itinerary from
                    // every reload — and, since both clients share one backend, from the web too.
                    content = it.rawText ?: it.text,
                )
            }
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
        const val KEY_INPUT = "chat_input"
        /** The web's voice grace window before auto-sending a dictated turn — `setTimeout(…, 2000)`
         *  in `ChatInterface.tsx`'s `recognition.onend`. */
        const val VOICE_AUTO_SEND_DELAY_MS = 2_000L
    }
}

package com.tappyai.app.messaging

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.messaging.data.ChatMessage
import com.tappyai.app.messaging.data.ChatThreadSummary
import com.tappyai.app.messaging.data.MessagingRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * One conversation — the web's `ThreadView` (2026-09-17). History (oldest → newest, paged
 * further back with `before`), the read cursor moved on open and on every incoming message,
 * and send: the SERVER's row is appended (its real id and `created_at`), so a later re-read
 * dedupes against it cleanly. No "Online", no "Typing…": there is no presence infrastructure,
 * and nothing here claims to know.
 *
 * The thread id arrives as the route's `threadId` argument — the same name on both hosts'
 * routes (`ReviewsRoute.MessageThread`, `ProfileRoute.MessageThread`). The header's title and
 * roster come from the caller's own thread list (`GET /api/messaging/threads`), which is also
 * what a deep link resolves through: a thread the caller is not in is simply absent.
 *
 * Realtime stands in for: [poll] re-reads the newest page every [POLL_MS] while the screen is
 * resumed and merges by id — new rows land, nothing is duplicated, nothing is invented.
 */
@HiltViewModel
class ThreadViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: MessagingRepository,
    private val authRepository: AuthRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    val threadId: String = savedStateHandle.get<String>("threadId").orEmpty()
    val meId: String? = authRepository.currentUserId()

    var thread by mutableStateOf<ChatThreadSummary?>(null)
        private set
    var messages by mutableStateOf<List<ChatMessage>>(emptyList())
        private set
    var hasMore by mutableStateOf(false)
        private set
    var isLoading by mutableStateOf(true)
        private set
    var loadingOlder by mutableStateOf(false)
        private set
    /** Null = fine; otherwise the caller's i18n error text is set by the screen through [fail]. */
    var failed by mutableStateOf<ThreadFailure?>(null)
        private set
    var draft by mutableStateOf("")
        private set
    var sending by mutableStateOf(false)
        private set
    /** Bumped when a row is appended, so the list scrolls to the end. */
    var appendTick by mutableStateOf(0)
        private set

    init {
        viewModelScope.launch {
            (repository.getThreads() as? NetworkResult.Success)?.data?.firstOrNull { it.id == threadId }?.let { thread = it }
        }
        load()
    }

    fun load() {
        isLoading = true; failed = null
        viewModelScope.launch {
            when (val result = repository.getMessages(threadId)) {
                is NetworkResult.Success -> {
                    messages = result.data.messages; hasMore = result.data.hasMore; appendTick++
                    // Opening a thread IS reading it: the mark is unconditional (no per-message receipts).
                    repository.markRead(threadId)
                }
                is NetworkResult.Error -> { logger.e(TAG, "Thread load failed: ${result.error}"); failed = ThreadFailure.Load }
            }
            isLoading = false
        }
    }

    /** Older history, prepended; `before` is the oldest loaded stamp. */
    fun loadOlder() {
        val oldest = messages.firstOrNull()?.createdAt ?: return
        if (loadingOlder || !hasMore) return
        loadingOlder = true
        viewModelScope.launch {
            when (val result = repository.getMessages(threadId, before = oldest)) {
                is NetworkResult.Success -> {
                    val known = messages.map { it.id }.toSet()
                    messages = result.data.messages.filter { it.id !in known } + messages
                    hasMore = result.data.hasMore
                }
                is NetworkResult.Error -> logger.e(TAG, "Older page failed: ${result.error}")
            }
            loadingOlder = false
        }
    }

    /** The newest page, merged by id. Incoming rows from others move the read cursor, as the web does on a realtime INSERT. */
    fun poll() {
        if (isLoading || sending) return
        viewModelScope.launch {
            val page = (repository.getMessages(threadId) as? NetworkResult.Success)?.data ?: return@launch
            val known = messages.map { it.id }.toSet()
            val fresh = page.messages.filter { it.id !in known }
            if (fresh.isEmpty()) return@launch
            messages = (messages + fresh).sortedBy { it.createdAt }
            appendTick++
            if (fresh.any { it.senderId != meId }) repository.markRead(threadId)
        }
    }

    fun onDraftChange(value: String) { draft = value.take(com.tappyai.app.messaging.data.MESSAGE_MAX_BODY) }

    fun send() {
        val body = draft.trim()
        if (body.isEmpty() || sending) return
        sending = true; failed = null
        viewModelScope.launch {
            when (val result = repository.sendMessage(threadId, body)) {
                is NetworkResult.Success -> {
                    val row = result.data
                    if (messages.none { it.id == row.id }) messages = messages + row
                    draft = ""; appendTick++
                }
                is NetworkResult.Error -> { logger.e(TAG, "Send failed: ${result.error}"); failed = ThreadFailure.Send }
            }
            sending = false
        }
    }

    enum class ThreadFailure { Load, Send }

    companion object {
        private const val TAG = "ThreadVM"
        const val POLL_MS = 5_000L
    }
}

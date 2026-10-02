package com.tappyai.app.messaging

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.messaging.data.ChatThreadSummary
import com.tappyai.app.messaging.data.MessagingRepository
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * The Messages tab of the Inbox — the web's `MessagesProvider` + `MessagesTab` + `NewMessageSheet`
 * (2026-09-17). The conversation list with its server-derived unread counts, the list filter
 * (over what is LOADED — there is no message search index, so it narrows by name and last
 * message, never pretends to search history), the read cursor, and starting a thread from a
 * real people search (`GET /api/users/search`, reused — no second people-search endpoint).
 *
 * Realtime: the web holds one Supabase `postgres_changes` channel. This client has no realtime
 * dependency, so the list is re-read on resume and every [POLL_MS] while the tab is showing —
 * the same "re-read the list rather than patch it" rule, because unread is derived server-side.
 */
@HiltViewModel
class MessagesViewModel @Inject constructor(
    private val repository: MessagingRepository,
    private val reviewsRepository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    var threads by mutableStateOf<List<ChatThreadSummary>?>(null)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var query by mutableStateOf("")
        private set
    /** Null until auth resolves; tells my own messages from theirs. */
    var meId by mutableStateOf<String?>(null)
        private set
    /** Signed-in (non-anonymous). The tab shows the sign-in state otherwise and loads nothing. */
    var isSignedIn by mutableStateOf<Boolean?>(null)
        private set

    // ── New message ──
    var peopleQuery by mutableStateOf("")
        private set
    var people by mutableStateOf<List<UserSearchResult>>(emptyList())
        private set
    var searching by mutableStateOf(false)
        private set
    var selected by mutableStateOf<List<UserSearchResult>>(emptyList())
        private set
    var groupName by mutableStateOf("")
        private set
    var starting by mutableStateOf(false)
        private set
    var startError by mutableStateOf<String?>(null)
        private set

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }
            val id = authRepository.currentUserId()
            meId = id
            isSignedIn = !anonymous && id != null
            if (isSignedIn == true) refetch()
        }
    }

    /** Sum of per-thread unread. Message unread ONLY — never notification unread. */
    val unreadTotal: Int get() = threads?.sumOf { it.unreadCount } ?: 0

    /** The list under the filter: by title (counterpart / group name) or last message body. */
    fun visible(fallbackUser: String, fallbackGroup: String): List<ChatThreadSummary>? {
        val all = threads ?: return null
        val q = query.trim().lowercase()
        if (q.isEmpty()) return all
        return all.filter { t ->
            t.title(meId, if (t.kind == com.tappyai.app.messaging.data.ThreadKind.Group) fallbackGroup else fallbackUser).lowercase().contains(q) ||
                (t.lastMessage?.body?.lowercase()?.contains(q) ?: false)
        }
    }

    fun onQueryChange(value: String) { query = value }

    fun refetch() {
        if (isSignedIn != true) return
        if (threads == null) isLoading = true
        viewModelScope.launch {
            when (val result = repository.getThreads()) {
                is NetworkResult.Success -> { threads = result.data; error = null }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Threads load failed: ${result.error}")
                    // Keep the previous list on a transient failure, as the web does.
                    if (threads == null) error = reviewErrorMessages.toUserMessage(result.error)
                }
            }
            isLoading = false
        }
    }

    /** Optimistic on the badge only; the server owns `last_read_at` and the refetch reconciles. */
    fun markThreadRead(threadId: String) {
        threads = threads?.map { if (it.id == threadId) it.copy(unreadCount = 0) else it }
        viewModelScope.launch {
            repository.markRead(threadId)
            refetch()
        }
    }

    // ── New message sheet ──

    fun onPeopleQueryChange(value: String) {
        peopleQuery = value
        searchJob?.cancel()
        val q = value.trim()
        if (q.length < MIN_QUERY) { people = emptyList(); searching = false; return }
        searching = true
        searchJob = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            people = (reviewsRepository.searchUsers(q) as? NetworkResult.Success)?.data ?: emptyList()
            searching = false
        }
    }

    fun togglePerson(user: UserSearchResult) {
        selected = if (selected.any { it.id == user.id }) selected.filter { it.id != user.id } else selected + user
    }

    fun onGroupNameChange(value: String) { groupName = value.take(120) }

    fun resetComposer() {
        searchJob?.cancel()
        peopleQuery = ""; people = emptyList(); searching = false; selected = emptyList(); groupName = ""; startError = null; starting = false
    }

    /** One person → direct (deduplicated server-side); more → a group. Hands back the thread id. */
    fun start(errorText: String, onStarted: (String) -> Unit) {
        if (selected.isEmpty() || starting) return
        starting = true; startError = null
        viewModelScope.launch {
            val result = if (selected.size == 1) repository.startDirect(selected.first().id)
            else repository.startGroup(selected.map { it.id }, groupName)
            starting = false
            when (result) {
                is NetworkResult.Success -> { val id = result.data; resetComposer(); refetch(); onStarted(id) }
                is NetworkResult.Error -> { logger.e(TAG, "Start thread failed: ${result.error}"); startError = errorText }
            }
        }
    }

    companion object {
        private const val TAG = "MessagesVM"
        const val MIN_QUERY = 2
        const val DEBOUNCE_MS = 350L
        /** Re-read cadence while the tab is showing — the realtime channel's stand-in. */
        const val POLL_MS = 15_000L
    }
}

package com.tappyai.app.notifications

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * The Inbox category filter — the four REAL categories the API emits (`v3.inbox.cat*`), plus All.
 * Not a taxonomy invented here: `src/lib/notifications/contract.ts` names exactly these.
 */
enum class InboxCategory(val apiValue: String?) { All(null), Social("social"), Deal("deal"), Explore("explore"), System("system") }

/**
 * The Inbox (web `/profile/notifications`, `NotificationsView.tsx` — V3 Page 6), 2026-09-17.
 *
 * One page of `GET /api/notifications` (ADR-014 contract v1) grouped the way the web groups it
 * (`groupNotifs`: likes on one review collapse to a row with an actor stack), the server's unread
 * total, a category filter over the loaded rows, and "mark all read" through
 * `POST /api/notifications/read`. Marking read is optimistic the way the web's provider is —
 * every row loses its dot and the count drops to zero at once; a refused write reloads the truth.
 *
 * Guests: the web route redirects to `/login`; here the screen shows the sign-in state instead
 * (same rule the Following / Followers page applies), and loads nothing.
 */
@HiltViewModel
class InboxViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    var groups by mutableStateOf<List<ReviewGroupedNotification>?>(null)
        private set
    var unreadCount by mutableStateOf(0)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var filter by mutableStateOf(InboxCategory.All)
        private set
    /** Signed-in (non-anonymous) — resolved off the main thread like the Profile hub does. */
    var isSignedIn by mutableStateOf<Boolean?>(null)
        private set

    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }
            isSignedIn = !anonymous && authRepository.currentUserId() != null
            if (isSignedIn == true) load()
        }
    }

    /** The rows under the active filter. `null` while nothing has loaded yet. */
    val visible: List<ReviewGroupedNotification>?
        get() = groups?.let { all -> filter.apiValue?.let { v -> all.filter { it.category == v } } ?: all }

    fun selectFilter(category: InboxCategory) { filter = category }

    fun load() {
        loadJob?.cancel()
        isLoading = true; error = null
        loadJob = viewModelScope.launch {
            when (val result = repository.getNotifications()) {
                is NetworkResult.Success -> {
                    groups = result.data.groups
                    unreadCount = result.data.unreadCount
                    isLoading = false
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Inbox load failed: ${result.error}")
                    isLoading = false
                    error = reviewErrorMessages.toUserMessage(result.error)
                }
            }
        }
    }

    fun markAllRead() {
        if (unreadCount == 0 && groups?.none { it.unread } != false) return
        val before = groups; val beforeCount = unreadCount
        groups = groups?.map { it.copy(unread = false) }
        unreadCount = 0
        viewModelScope.launch {
            when (val result = repository.markAllNotificationsRead()) {
                is NetworkResult.Success -> Unit
                is NetworkResult.Error -> {
                    logger.e(TAG, "Mark all read failed: ${result.error}")
                    groups = before; unreadCount = beforeCount
                }
            }
        }
    }

    private companion object { const val TAG = "InboxVM" }
}

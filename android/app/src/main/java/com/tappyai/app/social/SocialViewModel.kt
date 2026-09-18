package com.tappyai.app.social

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.app.social.data.ConnectionType
import com.tappyai.app.social.data.SocialRepository
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
 * Following / Followers — the web `/social` page (`SocialView.tsx`), native.
 *
 * Behind it, this product has exactly ONE social primitive: `user_follows(follower_id,
 * following_id)`. So there are two lists (the two directions of that table), a name search
 * (`/api/users/search`, which already carries `is_following`), and a follow toggle
 * (`POST /api/users/[id]/follow`). No friend requests, no suggestions, no mutual counts —
 * none of those exist, and none are mocked.
 *
 * 🔑 The follow toggle is driven by the SERVER'S answer, as on the web: the endpoint toggles, so
 * the client cannot know which way it went until the response arrives. The button shows busy,
 * then reports what happened; the same person is patched everywhere they appear, and the
 * Following list is invalidated (its membership changed and only the server knows the new order).
 *
 * The anonymous tier is chat + browsing: the lists read fine (an anonymous user is a user), the
 * toggle is refused with 403 by `refuseAnonymousSocialWrite`, and the screen shows the sign-in
 * state up front rather than a button that fails — exactly what the web does with `signedIn`.
 */
@HiltViewModel
class SocialViewModel @Inject constructor(
    private val socialRepository: SocialRepository,
    private val reviewsRepository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    var tab by mutableStateOf(ConnectionType.Following)
        private set

    /** null until first read (the web's `lists[tab] === null`), so a count is never a zero the server did not send. */
    var following by mutableStateOf<List<UserSearchResult>?>(null)
        private set
    var followers by mutableStateOf<List<UserSearchResult>?>(null)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var loadFailed by mutableStateOf(false)
        private set

    var query by mutableStateOf("")
        private set
    var results by mutableStateOf<List<UserSearchResult>?>(null)
        private set
    var isSearching by mutableStateOf(false)
        private set

    /** Ids whose toggle is in flight; the card shows a spinner for them. */
    var busyIds by mutableStateOf<Set<String>>(emptySet())
        private set
    /** Ids whose last toggle failed; the card wears the rose border until the next attempt. */
    var failedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    /** Signed-in (non-anonymous) — resolved off the main thread like the Profile hub does. */
    var isSignedIn by mutableStateOf<Boolean?>(null)
        private set

    private var searchJob: Job? = null
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }
            isSignedIn = !anonymous && authRepository.currentUserId() != null
            if (isSignedIn == true) load(tab)
        }
    }

    val current: List<UserSearchResult>?
        get() = if (tab == ConnectionType.Following) following else followers

    fun selectTab(type: ConnectionType) {
        tab = type
        if (isSignedIn == true && current == null && !isLoading) load(type)
    }

    fun retry() = load(tab)

    private fun load(type: ConnectionType) {
        loadJob?.cancel()
        isLoading = true
        loadFailed = false
        loadJob = viewModelScope.launch {
            when (val result = socialRepository.getConnections(type)) {
                is NetworkResult.Success -> when (type) {
                    ConnectionType.Following -> following = result.data
                    ConnectionType.Followers -> followers = result.data
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Connections ($type) load failed: ${result.error}")
                    loadFailed = true
                }
            }
            isLoading = false
        }
    }

    /** Debounced (350 ms), min 2 chars — the web's own search behaviour. */
    fun onQueryChange(value: String) {
        query = value
        searchJob?.cancel()
        val q = value.trim()
        if (q.length < 2) {
            results = null
            isSearching = false
            return
        }
        isSearching = true
        searchJob = viewModelScope.launch {
            delay(350)
            results = when (val result = reviewsRepository.searchUsers(q)) {
                is NetworkResult.Success -> result.data
                is NetworkResult.Error -> emptyList()
            }
            isSearching = false
        }
    }

    fun toggleFollow(person: UserSearchResult) {
        if (person.id in busyIds) return
        busyIds = busyIds + person.id
        failedIds = failedIds - person.id
        viewModelScope.launch {
            when (val result = reviewsRepository.toggleFollow(person.id)) {
                is NetworkResult.Success -> onFollowChange(person.id, result.data)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Follow toggle failed: ${result.error}")
                    failedIds = failedIds + person.id
                }
            }
            busyIds = busyIds - person.id
        }
    }

    /**
     * One follow toggle, applied everywhere that person appears. The follower count moves by one
     * in the direction the server reported; the Following list is dropped so its next read comes
     * from the server (its membership just changed).
     */
    private fun onFollowChange(id: String, isFollowing: Boolean) {
        fun patch(people: List<UserSearchResult>?): List<UserSearchResult>? = people?.map { p ->
            if (p.id != id || p.isFollowing == isFollowing) p
            else p.copy(isFollowing = isFollowing, followerCount = (p.followerCount + if (isFollowing) 1 else -1).coerceAtLeast(0))
        }
        results = patch(results)
        followers = patch(followers)
        following = null
        if (tab == ConnectionType.Following) load(ConnectionType.Following)
    }

    private companion object {
        const val TAG = "SocialViewModel"
    }
}

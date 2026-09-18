package com.tappyai.app.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.app.membership.data.MembershipRepository
import com.tappyai.app.profile.data.ProfileCollectionsRepository
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.app.saved.FavoritePlace
import com.tappyai.app.saved.data.SavedRepository
import com.tappyai.app.social.data.ConnectionType
import com.tappyai.app.social.data.SocialRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * The self profile's content collections — the four PRIVATE ones and the saved places.
 *
 *  - [Posts]  `GET /api/reviews/mine` — the caller's own posts, public ones (the hidden rows the
 *             same read returns are the [Hidden] collection, not mixed in).
 *  - [Liked]  `GET /api/reviews/liked` — the caller's likes, newest like first (the gated route
 *             added for this screen; the web's own-profile tab reads `review_likes` directly).
 *  - [Saved]  `GET /api/reviews/saved` — the caller's saves, newest save first.
 *  - [Hidden] the `is_hidden` rows of `GET /api/reviews/mine` — own-only by the route's construction.
 *  - [Shared] `GET /api/reviews/shared` — the caller's share HISTORY (`review_shares`, written
 *             by `POST /api/reviews/{id}/share` after a share completed), one row per review,
 *             latest share first. 2026-09-15: before this table existed the only trace of a share
 *             was a telemetry event, and the collection was — rightly — absent.
 *  - [Places] `GET /api/favorites` — the web hub's own tab, kept.
 */
enum class ProfileContentTab { Posts, Liked, Saved, Hidden, Shared, Places }

/**
 * The signed-in hub's content and side panels — the web `/profile` page's server-assembled props
 * (`page.tsx`) and the client-fetched tabs (`ProfileContent`), read through the routes this
 * client already has and nothing else:
 *
 *  - hero stats: `GET /api/users/{me}` (follower / following counts, trigger-maintained columns);
 *  - Posts: `GET /api/reviews/mine`; Saved: `GET /api/reviews/saved`; Places: `GET /api/favorites`;
 *  - likes = the sum of `like_count` over the user's own posts (what the web sums server-side);
 *  - conversations: `GET /api/conversations` (capped at 20 by the backend — the web counts the
 *    table exactly; documented deviation);
 *  - Premium: `GET /api/subscription`; Following preview: `GET /api/social/connections?type=following`.
 *
 * Every number renders only once its read returned. A guest (anonymous) session loads nothing:
 * the web renders `GuestProfileView` with no content, and so does this hub.
 */
@HiltViewModel
class ProfileHubContentViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val reviewsRepository: ReviewsRepository,
    private val savedRepository: SavedRepository,
    private val collectionsRepository: ProfileCollectionsRepository,
    private val chatHistoryRepository: ChatHistoryRepository,
    private val membershipRepository: MembershipRepository,
    private val socialRepository: SocialRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    var tab by mutableStateOf(ProfileContentTab.Posts)
        private set

    /** null until `GET /api/users/{me}` returned — a hero stat never renders a zero the server did not send. */
    var stats by mutableStateOf<ReviewProfile?>(null)
        private set
    /** Every row `/mine` returned, hidden included — [posts] and [hidden] are its two halves. */
    var mine by mutableStateOf<List<Review>?>(null)
        private set
    val posts: List<Review>? get() = mine?.filterNot { it.isHidden }
    val hidden: List<Review>? get() = mine?.filter { it.isHidden }
    var liked by mutableStateOf<List<Review>?>(null)
        private set
    var saved by mutableStateOf<List<Review>?>(null)
        private set
    var shared by mutableStateOf<List<Review>?>(null)
        private set
    var places by mutableStateOf<List<FavoritePlace>?>(null)
        private set
    var conversationCount by mutableStateOf<Int?>(null)
        private set
    var isPremium by mutableStateOf(false)
        private set
    var following by mutableStateOf<List<UserSearchResult>?>(null)
        private set

    var tabLoading by mutableStateOf(false)
        private set
    var tabFailed by mutableStateOf(false)
        private set

    /** Sum of `like_count` over the user's own posts (the web sums every own row); null until known. */
    val likes: Int? get() = mine?.sumOf { it.likeCount }
    val videoCount: Int? get() = mine?.count { it.contentType == ReviewContentType.Video }

    init {
        viewModelScope.launch {
            val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }
            val userId = authRepository.currentUserId()
            if (anonymous || userId == null) return@launch
            loadSide(userId)
            loadTab(ProfileContentTab.Posts)
        }
    }

    fun selectTab(next: ProfileContentTab) {
        tab = next
        loadTab(next)
    }

    /** Re-read everything — the hub calls this when it comes back on screen after an edit. */
    fun refresh() {
        val userId = authRepository.currentUserId() ?: return
        viewModelScope.launch {
            mine = null; liked = null; saved = null; shared = null; places = null
            loadSide(userId)
            loadTab(tab)
        }
    }

    private suspend fun loadSide(userId: String) {
        viewModelScope.launch {
            val profile = async { reviewsRepository.getUserProfile(userId) }
            val conversations = async { chatHistoryRepository.getConversations() }
            val membership = async { membershipRepository.getStatus() }
            val connections = async { socialRepository.getConnections(ConnectionType.Following) }
            val mine = async { reviewsRepository.getMine() }
            val savedRows = async { reviewsRepository.getSaved() }
            val likedRows = async { collectionsRepository.getLiked() }
            val sharedRows = async { collectionsRepository.getShared() }
            val favorites = async { savedRepository.getFavorites() }
            (profile.await() as? NetworkResult.Success)?.let { stats = it.data }
            (conversations.await() as? NetworkResult.Success)?.let { conversationCount = it.data.size }
            (membership.await() as? NetworkResult.Success)?.let { isPremium = it.data.isPro }
            (connections.await() as? NetworkResult.Success)?.let { following = it.data.take(FOLLOWING_PREVIEW) }
            (mine.await() as? NetworkResult.Success)?.let { this@ProfileHubContentViewModel.mine = it.data }
            (savedRows.await() as? NetworkResult.Success)?.let { saved = it.data }
            (likedRows.await() as? NetworkResult.Success)?.let { liked = it.data }
            (sharedRows.await() as? NetworkResult.Success)?.let { shared = it.data }
            (favorites.await() as? NetworkResult.Success)?.let { places = it.data }
        }.join()
    }

    /** The web's `load(index)`: a tab already read is not re-fetched; a failure is shown, not hidden. */
    private fun loadTab(which: ProfileContentTab) {
        val cached = when (which) {
            ProfileContentTab.Posts, ProfileContentTab.Hidden -> mine != null
            ProfileContentTab.Liked -> liked != null
            ProfileContentTab.Saved -> saved != null
            ProfileContentTab.Shared -> shared != null
            ProfileContentTab.Places -> places != null
        }
        if (cached) { tabFailed = false; return }
        tabLoading = true
        tabFailed = false
        viewModelScope.launch {
            val ok = when (which) {
                ProfileContentTab.Posts, ProfileContentTab.Hidden -> (reviewsRepository.getMine() as? NetworkResult.Success)?.also { mine = it.data } != null
                ProfileContentTab.Liked -> (collectionsRepository.getLiked() as? NetworkResult.Success)?.also { liked = it.data } != null
                ProfileContentTab.Saved -> (reviewsRepository.getSaved() as? NetworkResult.Success)?.also { saved = it.data } != null
                ProfileContentTab.Shared -> (collectionsRepository.getShared() as? NetworkResult.Success)?.also { shared = it.data } != null
                ProfileContentTab.Places -> (savedRepository.getFavorites() as? NetworkResult.Success)?.also { places = it.data } != null
            }
            if (!ok) logger.e(TAG, "Profile tab $which failed to load")
            tabFailed = !ok
            tabLoading = false
        }
    }

    private companion object {
        const val TAG = "ProfileHubContentViewModel"
        /** The web's `FOLLOWING_PREVIEW`. */
        const val FOLLOWING_PREVIEW = 5
    }
}

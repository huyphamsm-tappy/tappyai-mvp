package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * An author's public profile: their identity (GET /api/users/{id}) plus their reviews
 * (GET /api/reviews/feed?userId=…). Both are needed — the header shows the name/avatar from the
 * profile and the stats are summed from the reviews list, exactly as the seed version did.
 */
data class ReviewProfileUiState(
    val profile: ReviewProfile? = null,
    val reviews: List<Review> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val isFollowLoading: Boolean = false,
)

@HiltViewModel
class ReviewProfileViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewProfileUiState())
    val uiState: StateFlow<ReviewProfileUiState> = _uiState.asStateFlow()

    private var loadedUserId: String? = null
    private var loadJob: Job? = null

    fun load(userId: String) {
        if (loadedUserId == userId) return
        loadedUserId = userId
        reload(userId)
    }

    fun retry() {
        loadedUserId?.let { reload(it) }
    }

    /**
     * Toggles follow on the viewed author (web parity: `handleFollow`). Optimistically flips
     * `isFollowing` and nudges `followerCount`, then reconciles with the backend's authoritative
     * `{ following, follower_count }`; reverts on failure (e.g. 401 when signed out). No-op for
     * one's own profile (the button is hidden then, matching the web's `!is_self` gate).
     */
    fun toggleFollow() {
        val profile = _uiState.value.profile ?: return
        val targetId = profile.userId ?: loadedUserId ?: return
        if (profile.isSelf || _uiState.value.isFollowLoading) return

        val optimisticFollowing = !profile.isFollowing
        val optimisticCount = (profile.followerCount + if (optimisticFollowing) 1 else -1).coerceAtLeast(0)
        _uiState.update {
            it.copy(
                profile = profile.copy(isFollowing = optimisticFollowing, followerCount = optimisticCount),
                isFollowLoading = true,
            )
        }
        viewModelScope.launch {
            when (val result = repository.followUser(targetId)) {
                is NetworkResult.Success -> _uiState.update { s ->
                    s.copy(
                        profile = s.profile?.copy(
                            isFollowing = result.data.following,
                            followerCount = result.data.followerCount,
                        ),
                        isFollowLoading = false,
                    )
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Follow toggle failed: ${result.error}")
                    _uiState.update { it.copy(profile = profile, isFollowLoading = false) }
                }
            }
        }
    }

    private fun reload(userId: String) {
        loadJob?.cancel()
        _uiState.update { it.copy(isLoading = true, error = null) }
        loadJob = viewModelScope.launch {
            val profileResult = repository.getUserProfile(userId)
            val reviewsResult = repository.getFeed(page = 0, limit = REVIEWS_LIMIT, sort = "latest", userId = userId)

            val profile = (profileResult as? NetworkResult.Success)?.data
            val reviews = (reviewsResult as? NetworkResult.Success)?.data

            if (profile == null && reviews == null) {
                val error = (profileResult as? NetworkResult.Error)?.error
                    ?: (reviewsResult as? NetworkResult.Error)?.error
                logger.e(TAG, "Profile load failed: $error")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = error?.let { networkError -> reviewErrorMessages.toUserMessage(networkError) }
                            ?: stringProvider.get(R.string.reviews_error_generic),
                    )
                }
                return@launch
            }
            // Fall back to the author info embedded in their reviews if the profile call failed.
            val resolvedProfile = profile ?: reviews?.firstOrNull()?.profiles ?: ReviewProfile(null, null)
            _uiState.update {
                it.copy(
                    profile = resolvedProfile,
                    reviews = reviews ?: emptyList(),
                    isLoading = false,
                    error = null,
                )
            }
        }
    }

    private companion object {
        const val TAG = "ReviewProfileViewModel"
        const val REVIEWS_LIMIT = 20
    }
}

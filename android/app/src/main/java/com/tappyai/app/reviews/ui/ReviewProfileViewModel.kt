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
    val isTogglingFollow: Boolean = false,
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

    /**
     * Toggles follow on the loaded profile. Optimistically flips [ReviewProfile.isFollowing] and
     * nudges [ReviewProfile.followerCount] by ±1 so the button reacts instantly, then reconciles
     * with the server's authoritative following state (reverting both on failure). No-op on the
     * caller's own profile ([ReviewProfile.isSelf], which the backend 400s) or while a toggle is
     * already in flight.
     */
    fun toggleFollow() {
        val userId = loadedUserId ?: return
        val profile = _uiState.value.profile ?: return
        if (profile.isSelf || _uiState.value.isTogglingFollow) return
        val target = !profile.isFollowing
        _uiState.update {
            it.copy(
                isTogglingFollow = true,
                profile = profile.copy(
                    isFollowing = target,
                    followerCount = (profile.followerCount + if (target) 1 else -1).coerceAtLeast(0),
                ),
            )
        }
        viewModelScope.launch {
            when (val result = repository.toggleFollow(userId)) {
                is NetworkResult.Success -> _uiState.update { s ->
                    s.copy(isTogglingFollow = false, profile = s.profile?.copy(isFollowing = result.data))
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Toggle follow failed: ${result.error}")
                    _uiState.update { s ->
                        s.copy(
                            isTogglingFollow = false,
                            profile = s.profile?.copy(
                                isFollowing = profile.isFollowing,
                                followerCount = profile.followerCount,
                            ),
                        )
                    }
                }
            }
        }
    }

    private companion object {
        const val TAG = "ReviewProfileViewModel"
        const val REVIEWS_LIMIT = 20
    }
}

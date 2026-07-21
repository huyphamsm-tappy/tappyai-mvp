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
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The signed-in user's own profile inside Explore — mirrors the web reviews ProfileTab. Loads
 * identity/stats from GET /api/users/{me} (Following/Followers/Posts) and the user's own posts from
 * GET /api/reviews/mine (including hidden), rendered as a 3-column grid. The web's Saved/Liked tabs
 * query Supabase directly (no Android API), so per the owner's decision those tabs are omitted here
 * — no new backend was added. [userId] backs the "Share profile" link.
 */
data class SelfProfileUiState(
    val profile: ReviewProfile? = null,
    val posts: List<Review> = emptyList(),
    val userId: String? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class SelfProfileViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SelfProfileUiState(userId = authRepository.currentUserId()))
    val uiState: StateFlow<SelfProfileUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        val userId = authRepository.currentUserId()
        if (userId == null) {
            _uiState.update { it.copy(isLoading = false, error = stringProvider.get(R.string.reviews_error_session_expired)) }
            return
        }
        _uiState.update { it.copy(isLoading = true, error = null, userId = userId) }
        viewModelScope.launch {
            val profileResult = repository.getUserProfile(userId)
            val postsResult = repository.getMine()

            val profile = (profileResult as? NetworkResult.Success)?.data
            val posts = (postsResult as? NetworkResult.Success)?.data

            if (profile == null && posts == null) {
                val error = (profileResult as? NetworkResult.Error)?.error
                    ?: (postsResult as? NetworkResult.Error)?.error
                logger.e(TAG, "Self profile load failed: $error")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = error?.let { e -> reviewErrorMessages.toUserMessage(e) }
                            ?: stringProvider.get(R.string.reviews_error_generic),
                    )
                }
                return@launch
            }
            _uiState.update {
                it.copy(
                    profile = profile ?: ReviewProfile(null, null),
                    posts = posts ?: emptyList(),
                    isLoading = false,
                    error = null,
                )
            }
        }
    }

    private companion object {
        const val TAG = "SelfProfileViewModel"
    }
}

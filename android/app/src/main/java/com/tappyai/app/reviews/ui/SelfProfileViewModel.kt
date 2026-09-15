package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.app.membership.data.MembershipRepository
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
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The signed-in user's own profile inside Explore — the V3 self profile (mockup 05_17_48) over
 * the same three real sources it always had plus one: identity/stats from GET /api/users/{me},
 * the user's own posts from GET /api/reviews/mine (hidden ones included), the membership status
 * from GET /api/subscription for the "Premium" badge, and the user's saved reviews from
 * GET /api/reviews/saved for the "Đã lưu" segment (the web's Saved hub route — self-only by
 * construction, so no other user's saves can ever be requested). The web's "Đã thích" tab reads
 * `review_likes` straight from Supabase and has no API, so it is not drawn — nothing invented.
 * [userId] backs the "share profile link" action.
 *
 * [isPro] is null until the membership row answers, and stays null when it cannot (signed out, or
 * the request failed) — the badge is drawn only for a real `true`, never assumed either way.
 */
data class SelfProfileUiState(
    val profile: ReviewProfile? = null,
    val posts: List<Review> = emptyList(),
    /** The "Đã lưu" grid rows (newest save first); null while unknown or when the call failed. */
    val saved: List<Review>? = null,
    val userId: String? = null,
    val isPro: Boolean? = null,
    /** The bio from `GET /api/profile` (auth metadata — the users row has none); null while unknown. */
    val bio: String? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class SelfProfileViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val membershipRepository: MembershipRepository,
    private val accountRepository: AccountRepository,
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
            // Membership is a badge, not the page: fetched alongside, never able to fail the load.
            val membership = async { membershipRepository.getStatus() }
            // The bio lives in auth metadata and only `GET /api/profile` returns it; like the
            // membership row it decorates the page and never fails the load.
            val account = async { accountRepository.getProfile() }
            // The saved list is its own segment: fetched alongside, never able to fail the page.
            val saved = async { repository.getSaved() }
            val profileResult = repository.getUserProfile(userId)
            val postsResult = repository.getMine()
            val isPro = (membership.await() as? NetworkResult.Success)?.data?.isPro
            val bio = (account.await() as? NetworkResult.Success)?.data?.bio
            val savedResult = saved.await()
            if (savedResult is NetworkResult.Error) logger.e(TAG, "Saved list load failed: ${savedResult.error}")

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
                    saved = (savedResult as? NetworkResult.Success)?.data,
                    isPro = isPro,
                    bio = bio,
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

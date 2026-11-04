package com.tappyai.app.safety

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The thin screen-facing side of [SafetyRepository], for screens that have no ViewModel of their
 * own for it (Settings, the blocked list, an author's profile, the comment sheet, the composer).
 * Reading `flags` here is what keeps the Block / Report-user controls hidden until the server says
 * it has them.
 */
@HiltViewModel
class SafetyViewModel @Inject constructor(
    val safety: SafetyRepository,
    private val reviews: ReviewsRepository,
) : ViewModel() {

    val flags: StateFlow<SafetyFlags> = safety.flags
    val blockedIds: StateFlow<Set<String>> = safety.blockedIds

    private val _names = MutableStateFlow<Map<String, String>>(emptyMap())
    /** Display names of blocked accounts, filled by [loadNames]; an id without a name shows a neutral label. */
    val names: StateFlow<Map<String, String>> = _names.asStateFlow()

    init {
        viewModelScope.launch { safety.refresh() }
    }

    suspend fun reportReview(reviewId: String, reason: ReportReason): ReportOutcome = safety.reportReview(reviewId, reason)

    suspend fun report(target: ReportTarget, id: String, reason: ReportReason): ReportOutcome = safety.report(target, id, reason)

    suspend fun block(userId: String): Boolean = safety.block(userId)

    suspend fun unblock(userId: String): Boolean = safety.unblock(userId)

    val termsAccepted: Boolean get() = safety.termsAccepted

    fun acceptTerms() = safety.acceptTerms()

    fun loadNames(ids: Collection<String>) {
        ids.filter { it !in _names.value }.forEach { id ->
            viewModelScope.launch {
                val profile = (reviews.getUserProfile(id) as? NetworkResult.Success)?.data
                profile?.fullName?.takeIf { it.isNotBlank() }?.let { name -> _names.update { it + (id to name) } }
            }
        }
    }
}

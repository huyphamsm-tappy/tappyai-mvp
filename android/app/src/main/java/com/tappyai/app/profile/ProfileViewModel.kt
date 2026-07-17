package com.tappyai.app.profile

import androidx.lifecycle.ViewModel
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * State for the Profile landing screen. Currently exists only to supply [userId] to the QR
 * profile sheet — [AuthRepository.currentUserId] is a synchronous JWT-claim read (no network
 * call), so a plain `val` is enough; no loading/error state to model. The screen's identity
 * header stays a documented placeholder (Phase 1C.1 scope boundary, unchanged by this ViewModel).
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    authRepository: AuthRepository,
) : ViewModel() {
    val userId: String? = authRepository.currentUserId()
}

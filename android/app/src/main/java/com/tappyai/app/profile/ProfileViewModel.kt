package com.tappyai.app.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.account.AccountProfile
import com.tappyai.app.account.data.AccountRepository
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
 * State for the Profile landing screen: [userId] for the QR profile sheet, and [profile] for the
 * header card's real identity (name/email/avatar). [AuthRepository.currentUserId] makes no
 * network call but does read the Keystore-backed token store synchronously — round-2 audit fix:
 * read it off the main thread via [Dispatchers.IO] instead of as a property initializer.
 *
 * Certification-sprint fix: the header previously showed a hardcoded "Sign in to personalize"
 * placeholder unconditionally — stale from the Phase 1C.1 foundation, before real auth existed.
 * Auth has been fully wired since Phase 1B, and this exact profile data (`GET /api/profile`) is
 * already fetched the same way by [com.tappyai.app.account.AccountViewModel] for the Account
 * screen — this screen just never adopted it, so a genuinely signed-in user still saw a "sign in"
 * prompt on their own Profile tab. The web's `ProfileView` shows the real name/avatar/email here
 * (see `src/app/profile/ProfileView.tsx`), so this was also a real parity gap, not just cosmetic.
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val accountRepository: AccountRepository,
    private val logger: LoggerProvider,
) : ViewModel() {
    var userId by mutableStateOf<String?>(null)
        private set

    var profile by mutableStateOf<AccountProfile?>(null)
        private set

    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            userId = withContext(Dispatchers.IO) { authRepository.currentUserId() }
        }
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            when (val result = accountRepository.getProfile()) {
                is NetworkResult.Success -> profile = result.data
                is NetworkResult.Error -> {
                    // No error UI on this header — same "never fabricate, degrade to the
                    // existing neutral placeholder" contract TappyAvatar already documents.
                    logger.e(TAG, "Profile header load failed: ${result.error}")
                }
            }
        }
    }

    private companion object {
        const val TAG = "ProfileViewModel"
    }
}

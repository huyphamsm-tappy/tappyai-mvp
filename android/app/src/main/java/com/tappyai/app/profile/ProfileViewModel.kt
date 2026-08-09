package com.tappyai.app.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.account.AccountProfile
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * State for the Profile landing screen. Supplies [userId] to the QR sheet ([AuthRepository
 * .currentUserId] is a synchronous JWT-claim read) and loads the signed-in user's real
 * [profile] (name/avatar) from `GET /api/profile` so the header shows the authenticated user
 * instead of the logged-out placeholder. Reuses the same [AccountRepository] the Account screen
 * uses — no new endpoint, no duplicated model.
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val accountRepository: AccountRepository,
) : ViewModel() {
    val userId: String? = authRepository.currentUserId()

    var profile by mutableStateOf<AccountProfile?>(null)
        private set

    /**
     * Authoritative anonymity, read from the verified JWT's `is_anonymous` claim via
     * [AuthRepository.isAnonymous]. Never inferred from [userId] being null (an anonymous session
     * has a real user id) or from the absent profile (that is a consequence of anonymity, not
     * evidence of it). Drives the sign-in card below the header.
     *
     * Resolved on [Dispatchers.IO]: `isAnonymous()` reads the Keystore-backed token store, and a
     * ViewModel init must not block the main thread on it.
     */
    var isAnonymous by mutableStateOf(false)
        private set

    init {
        viewModelScope.launch {
            isAnonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }
        }
        load()
    }

    fun load() {
        viewModelScope.launch {
            (accountRepository.getProfile() as? NetworkResult.Success)?.let { profile = it.data }
        }
    }
}

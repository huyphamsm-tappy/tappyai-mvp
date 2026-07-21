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
import kotlinx.coroutines.launch
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
    authRepository: AuthRepository,
    private val accountRepository: AccountRepository,
) : ViewModel() {
    val userId: String? = authRepository.currentUserId()

    var profile by mutableStateOf<AccountProfile?>(null)
        private set

    init { load() }

    fun load() {
        viewModelScope.launch {
            (accountRepository.getProfile() as? NetworkResult.Success)?.let { profile = it.data }
        }
    }
}

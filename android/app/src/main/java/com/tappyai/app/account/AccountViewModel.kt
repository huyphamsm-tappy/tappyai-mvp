package com.tappyai.app.account

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.account.data.AccountErrorMessages
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** One-shot outcome of a Save/avatar-upload, delivered once to the Edit screen (Toast, and for
 *  [Saved] a navigate-back). */
sealed interface AccountEvent {
    data object Saved : AccountEvent
    data class SaveFailed(val message: String) : AccountEvent
    data class AvatarUploadFailed(val message: String) : AccountEvent
}

/**
 * Backs the Account + Edit screens with real profile data from `GET /api/profile`, and persists
 * name/bio edits via `PATCH /api/profile`. Graph-scoped (shared across Account ↔ Edit), so the Edit
 * screen sees the already-loaded profile and the Account screen reflects a successful save on return.
 */
@HiltViewModel
class AccountViewModel @Inject constructor(
    private val repository: AccountRepository,
    private val logger: LoggerProvider,
    private val accountErrorMessages: AccountErrorMessages,
    private val stringProvider: StringProvider,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    var profile by mutableStateOf<AccountProfile?>(null)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var isSaving by mutableStateOf(false)
        private set
    var isUploadingAvatar by mutableStateOf(false)
        private set

    var editName by mutableStateOf("")
        private set
    var editBio by mutableStateOf("")
        private set

    private val _events = Channel<AccountEvent>(Channel.BUFFERED)
    val events: Flow<AccountEvent> = _events.receiveAsFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        isLoading = true
        error = null
        loadJob = viewModelScope.launch {
            when (val result = repository.getProfile()) {
                is NetworkResult.Success -> {
                    profile = result.data
                    editName = result.data.fullName
                    editBio = result.data.bio
                    isLoading = false
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Profile load failed: ${result.error}")
                    error = accountErrorMessages.toUserMessage(result.error)
                    isLoading = false
                }
            }
        }
    }

    fun retry() = load()

    fun onNameChange(value: String) {
        if (value.length <= 100) editName = value
    }

    fun onBioChange(value: String) {
        if (value.length <= 200) editBio = value
    }

    /**
     * Uploads [uri] (from the system photo picker, see `AccountEditScreen`) as the new avatar via
     * multipart `POST /api/profile`, matching the web's upload route exactly (same size/type
     * limits enforced server-side too). The byte read runs on [Dispatchers.IO] — not the
     * `viewModelScope` default — since a photo-picker Uri's backing content provider can be
     * slower storage (SD card, cold page cache) or a larger file than the "fast local read"
     * assumption this comment used to make; blocking `viewModelScope.launch`'s
     * `Dispatchers.Main.immediate` for that read stalls the UI thread.
     */
    fun onAvatarPicked(uri: Uri) {
        if (isUploadingAvatar) return
        viewModelScope.launch {
            isUploadingAvatar = true

            val bytes = try {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                }
            } catch (e: Exception) {
                logger.e(TAG, "Failed to read picked avatar", e)
                null
            }
            if (bytes == null) {
                isUploadingAvatar = false
                _events.send(AccountEvent.AvatarUploadFailed(stringProvider.get(R.string.account_avatar_read_failed)))
                return@launch
            }
            if (bytes.size > MAX_AVATAR_BYTES) {
                isUploadingAvatar = false
                _events.send(AccountEvent.AvatarUploadFailed(stringProvider.get(R.string.account_avatar_too_large)))
                return@launch
            }
            val mimeType = context.contentResolver.getType(uri)
            if (mimeType == null || !mimeType.startsWith("image/")) {
                isUploadingAvatar = false
                _events.send(AccountEvent.AvatarUploadFailed(stringProvider.get(R.string.account_avatar_invalid_type)))
                return@launch
            }

            when (val result = repository.uploadAvatar(bytes, mimeType)) {
                is NetworkResult.Success -> {
                    profile = profile?.copy(avatarUrl = result.data)
                    isUploadingAvatar = false
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Avatar upload failed: ${result.error}")
                    isUploadingAvatar = false
                    _events.send(AccountEvent.AvatarUploadFailed(accountErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    fun onSave() {
        if (isSaving) return
        val name = editName.trim()
        val bio = editBio.trim()
        isSaving = true
        viewModelScope.launch {
            when (val result = repository.updateProfile(fullName = name, bio = bio)) {
                is NetworkResult.Success -> {
                    // PATCH returns only {ok}; reflect the saved values locally so the Account
                    // screen shows them on return.
                    profile = profile?.copy(fullName = name, bio = bio)
                    isSaving = false
                    _events.send(AccountEvent.Saved)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Profile save failed: ${result.error}")
                    isSaving = false
                    _events.send(AccountEvent.SaveFailed(accountErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    private companion object {
        const val TAG = "AccountViewModel"
        // Matches the web's client + server-side avatar size cap exactly (src/app/api/profile/route.ts).
        const val MAX_AVATAR_BYTES = 3 * 1024 * 1024
    }
}

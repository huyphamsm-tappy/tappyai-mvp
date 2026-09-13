package com.tappyai.app.reviews.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.account.data.AccountErrorMessages
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.app.reviews.data.PickedImage
import com.tappyai.app.reviews.data.PickedImageReader
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * What the Edit Profile screen can and cannot change — the backend's word, not the mockup's.
 *
 * `PATCH /api/profile` persists `full_name` (≤100) and `bio` (≤200); `POST /api/profile` uploads
 * the avatar. There is no username/handle, website or city field on any profile endpoint, so
 * this screen has none — a field that is not stored is not offered. [nameError] is the one
 * client rule: a blank display name is refused before the request, because the server would
 * store the empty string as the name.
 */
data class SelfProfileEditUiState(
    val name: String = "",
    val bio: String = "",
    val avatarUrl: String? = null,
    val isLoading: Boolean = true,
    val loadError: String? = null,
    val isSaving: Boolean = false,
    val isUploadingAvatar: Boolean = false,
    val nameError: Int? = null,
) {
    /** Web parity: the bio field's counter. */
    val bioRemaining: Int get() = BIO_MAX - bio.length
    val canSave: Boolean get() = !isSaving && !isUploadingAvatar && !isLoading && name.isNotBlank()

    companion object {
        const val NAME_MAX = 100
        const val BIO_MAX = 200
    }
}

/** One-shot outcomes, delivered once to the screen (a toast, and for [Saved] the pop back). */
sealed interface SelfProfileEditEvent {
    data object Saved : SelfProfileEditEvent
    data class SaveFailed(val message: String) : SelfProfileEditEvent
    data class AvatarUploadFailed(val message: String) : SelfProfileEditEvent
}

/**
 * Explore → My Profile → Sửa hồ sơ. The same data layer the app's account screen uses
 * (`AccountRepository`: `GET`/`PATCH`/`POST /api/profile`), driven as a StateFlow like the rest of
 * the reviews screens. Nothing is stored locally: Save is the PATCH, the avatar is the upload, and
 * the profile screen re-reads on return.
 */
@HiltViewModel
class SelfProfileEditViewModel @Inject constructor(
    private val repository: AccountRepository,
    private val logger: LoggerProvider,
    private val accountErrorMessages: AccountErrorMessages,
    private val stringProvider: StringProvider,
    private val imageReader: PickedImageReader,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SelfProfileEditUiState())
    val uiState: StateFlow<SelfProfileEditUiState> = _uiState.asStateFlow()

    private val _events = Channel<SelfProfileEditEvent>(Channel.BUFFERED)
    val events: Flow<SelfProfileEditEvent> = _events.receiveAsFlow()

    init { load() }

    /** Initial values are the stored profile — the same `GET /api/profile` the account screen reads. */
    fun load() {
        _uiState.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            when (val result = repository.getProfile()) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(
                        name = result.data.fullName,
                        bio = result.data.bio,
                        avatarUrl = result.data.avatarUrl,
                        isLoading = false,
                    )
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Edit profile load failed: ${result.error}")
                    _uiState.update { it.copy(isLoading = false, loadError = accountErrorMessages.toUserMessage(result.error)) }
                }
            }
        }
    }

    fun onNameChange(value: String) {
        if (value.length <= SelfProfileEditUiState.NAME_MAX) _uiState.update { it.copy(name = value, nameError = null) }
    }

    fun onBioChange(value: String) {
        if (value.length <= SelfProfileEditUiState.BIO_MAX) _uiState.update { it.copy(bio = value) }
    }

    /**
     * Uploads the picked image as the new avatar through multipart `POST /api/profile` — the same
     * limits as the account screen and the web (3MB, an image MIME type).
     */
    fun onAvatarPicked(uri: Uri) {
        if (_uiState.value.isUploadingAvatar) return
        viewModelScope.launch {
            _uiState.update { it.copy(isUploadingAvatar = true) }
            val picked = imageReader.read(uri)
            val rejection = avatarRejection(picked)
            if (rejection != null) {
                _uiState.update { it.copy(isUploadingAvatar = false) }
                _events.send(SelfProfileEditEvent.AvatarUploadFailed(stringProvider.get(rejection)))
                return@launch
            }
            when (val result = repository.uploadAvatar(picked!!.bytes, picked.mimeType!!)) {
                is NetworkResult.Success -> _uiState.update { it.copy(avatarUrl = result.data, isUploadingAvatar = false) }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Avatar upload failed: ${result.error}")
                    _uiState.update { it.copy(isUploadingAvatar = false) }
                    _events.send(SelfProfileEditEvent.AvatarUploadFailed(accountErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    /** `PATCH /api/profile` with the trimmed name and bio; [SelfProfileEditEvent.Saved] pops back. */
    fun onSave() {
        val state = _uiState.value
        if (state.isSaving || state.isUploadingAvatar) return
        val name = state.name.trim()
        if (name.isEmpty()) {
            _uiState.update { it.copy(nameError = R.string.reviews_self_edit_name_required) }
            return
        }
        val bio = state.bio.trim()
        _uiState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            when (val result = repository.updateProfile(fullName = name, bio = bio)) {
                is NetworkResult.Success -> {
                    _uiState.update { it.copy(name = name, bio = bio, isSaving = false) }
                    _events.send(SelfProfileEditEvent.Saved)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Profile save failed: ${result.error}")
                    _uiState.update { it.copy(isSaving = false) }
                    _events.send(SelfProfileEditEvent.SaveFailed(accountErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    companion object {
        private const val TAG = "SelfProfileEditViewModel"
        /** The web's client + server avatar cap (src/app/api/profile/route.ts). */
        const val MAX_AVATAR_BYTES = 3 * 1024 * 1024

        /** Why a picked image is refused before upload, as the message to show — or null to upload. */
        internal fun avatarRejection(picked: PickedImage?): Int? = when {
            picked == null -> R.string.account_avatar_read_failed
            picked.bytes.size > MAX_AVATAR_BYTES -> R.string.account_avatar_too_large
            picked.mimeType?.startsWith("image/") != true -> R.string.account_avatar_invalid_type
            else -> null
        }
    }
}

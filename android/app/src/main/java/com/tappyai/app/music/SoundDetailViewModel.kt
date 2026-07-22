package com.tappyai.app.music

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.music.data.MusicErrorMessages
import com.tappyai.app.music.data.MusicRepository
import com.tappyai.app.navigation.AppRoute
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.navigation.TappyNavigator
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One-shot outcomes the screen reacts to with a Toast — mirrors [com.tappyai.app.reviews.ui.ComposerEvent]. */
sealed interface SoundDetailEvent {
    data object ReportSubmitted : SoundDetailEvent
    data class ActionFailed(val message: String) : SoundDetailEvent
}

/**
 * State for Sound Detail — mirrors the web `/sound/[trackId]` page: `GET /api/sound/{trackId}`
 * for the track + stats + this-user's saved/followed state. Reads [trackId] from the nav args via
 * [SavedStateHandle] (same pattern as `ChatViewModel`'s `conversationId`), so the screen doesn't
 * need to thread it through explicitly.
 *
 * Save/Follow mutate optimistically (flip local state immediately, reconcile with the backend's
 * returned count/flag, revert on failure) — same shape as the web's `toggle()` helper. Use this
 * sound hands off to [AppRoute.ComposerWithSound], a top-level route (like [AppRoute.GroupDetail])
 * so it can be reached from Music even though Music lives inside the Home tab's nested NavHost and
 * the review composer is normally reached from the Reviews tab. Report opens a reason sheet, then
 * posts once; the "videos using this sound" grid stays a later pass (needs real thumbnails).
 */
@HiltViewModel
class SoundDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: MusicRepository,
    private val navigator: TappyNavigator,
    private val logger: LoggerProvider,
    private val musicErrorMessages: MusicErrorMessages,
) : ViewModel() {

    // Falls back to blank rather than checkNotNull()-crashing ViewModel init on a malformed/
    // restored nav arg (e.g. a stale back-stack entry surviving an app update) — load() below
    // degrades a blank id to the same UiState.Error + retry path as any other failed fetch.
    val trackId: String = savedStateHandle.get<String>("trackId").orEmpty()

    var state by mutableStateOf<UiState<SoundDetail>>(UiState.Loading)
        private set

    var isMutatingSave by mutableStateOf(false)
        private set

    var isMutatingFollow by mutableStateOf(false)
        private set

    var isSubmittingReport by mutableStateOf(false)
        private set

    private val _events = Channel<SoundDetailEvent>(Channel.BUFFERED)
    val events: Flow<SoundDetailEvent> = _events.receiveAsFlow()

    private var hasRecordedPlay = false
    private var loadJob: Job? = null

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        loadJob?.cancel()
        state = UiState.Loading
        loadJob = viewModelScope.launch {
            when (val result = repository.getSoundDetail(trackId)) {
                is NetworkResult.Success -> state = UiState.Success(result.data)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Sound detail load failed: ${result.error}")
                    state = UiState.Error(musicErrorMessages.toUserMessage(result.error))
                }
            }
        }
    }

    /** Fires the play-count tick once per screen visit, the first time playback actually starts —
     *  not on every pause/resume toggle, matching the web firing it once per listen, not once per
     *  UI interaction. */
    fun onPlaybackStarted() {
        if (hasRecordedPlay) return
        hasRecordedPlay = true
        viewModelScope.launch { repository.recordPlay(trackId) }
    }

    fun onToggleSave() {
        val current = (state as? UiState.Success)?.data ?: return
        if (isMutatingSave) return
        val target = !current.savedByMe
        // Optimistic flip, mirroring the web's toggle() — reconciled with the server's real
        // count on success, reverted to the pre-tap snapshot on failure.
        state = UiState.Success(current.copy(savedByMe = target, savedCount = (current.savedCount + if (target) 1 else -1).coerceAtLeast(0)))
        isMutatingSave = true
        viewModelScope.launch {
            when (val result = repository.setSaved(trackId, target)) {
                is NetworkResult.Success -> {
                    val latest = (state as? UiState.Success)?.data
                    if (latest != null) {
                        state = UiState.Success(latest.copy(savedByMe = result.data.saved, savedCount = result.data.savedCount))
                    }
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "setSaved failed: ${result.error}")
                    state = UiState.Success(current)
                    _events.send(SoundDetailEvent.ActionFailed(musicErrorMessages.toUserMessage(result.error)))
                }
            }
            isMutatingSave = false
        }
    }

    fun onToggleFollow() {
        val current = (state as? UiState.Success)?.data ?: return
        if (isMutatingFollow) return
        val target = !current.followedByMe
        state = UiState.Success(current.copy(followedByMe = target, followCount = (current.followCount + if (target) 1 else -1).coerceAtLeast(0)))
        isMutatingFollow = true
        viewModelScope.launch {
            when (val result = repository.setFollowed(trackId, target)) {
                is NetworkResult.Success -> {
                    val latest = (state as? UiState.Success)?.data
                    if (latest != null) {
                        state = UiState.Success(latest.copy(followedByMe = result.data.followed, followCount = result.data.followCount))
                    }
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "setFollowed failed: ${result.error}")
                    state = UiState.Success(current)
                    _events.send(SoundDetailEvent.ActionFailed(musicErrorMessages.toUserMessage(result.error)))
                }
            }
            isMutatingFollow = false
        }
    }

    fun onReport(reason: String, details: String?) {
        if (isSubmittingReport) return
        isSubmittingReport = true
        viewModelScope.launch {
            when (val result = repository.reportTrack(trackId, reason, details?.takeIf { it.isNotBlank() })) {
                is NetworkResult.Success -> _events.send(SoundDetailEvent.ReportSubmitted)
                is NetworkResult.Error -> {
                    logger.e(TAG, "reportTrack failed: ${result.error}")
                    _events.send(SoundDetailEvent.ActionFailed(musicErrorMessages.toUserMessage(result.error)))
                }
            }
            isSubmittingReport = false
        }
    }

    /** Hands off to the review composer with this track pre-attached — mirrors the web's
     *  `router.push('/reviews/new?sound=' + trackId)`. [trackTitle] rides along on the route so
     *  the composer can show "Using: {title}" without a second fetch. */
    fun onUseThisSound() {
        val title = (state as? UiState.Success)?.data?.track?.title ?: return
        viewModelScope.launch {
            navigator.navigateTo(AppRoute.ComposerWithSound(trackId = trackId, trackTitle = title))
        }
    }

    private companion object {
        const val TAG = "SoundDetailViewModel"
    }
}

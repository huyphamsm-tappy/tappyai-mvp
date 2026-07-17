package com.tappyai.app.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.history.data.ChatHistoryErrorMessages
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Chat History list, backed by `/api/conversations`. Loads the user's conversations
 * on init (GET) into a real [UiState] — a failed load now surfaces the actual error + a retry
 * button rather than silently collapsing into the "no conversations" empty state. [delete]
 * optimistically removes a row then calls `DELETE`, restoring it if the call fails; a failed delete
 * still has no snackbar (matches the web, which also has no delete-failure toast).
 */
@HiltViewModel
class ChatHistoryViewModel @Inject constructor(
    clock: ClockProvider,
    private val repository: ChatHistoryRepository,
    private val errorMessages: ChatHistoryErrorMessages,
    private val logger: LoggerProvider,
) : ViewModel() {

    val now: Long = clock.nowMillis()

    private val _uiState = MutableStateFlow<UiState<List<Conversation>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Conversation>>> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        loadJob?.cancel()
        _uiState.value = UiState.Loading
        loadJob = viewModelScope.launch {
            _uiState.value = when (val result = repository.getConversations()) {
                is NetworkResult.Success -> if (result.data.isEmpty()) UiState.Empty else UiState.Success(result.data)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Conversations load failed: ${result.error}")
                    UiState.Error(errorMessages.toUserMessage(result.error))
                }
            }
        }
    }

    /** No-ops outside [UiState.Success] — nothing to delete from a Loading/Error/Empty list. */
    fun delete(id: String) {
        val snapshot = (_uiState.value as? UiState.Success)?.data ?: return
        val updated = snapshot.filterNot { it.id == id }
        _uiState.value = if (updated.isEmpty()) UiState.Empty else UiState.Success(updated)
        viewModelScope.launch {
            val result = repository.deleteConversation(id)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Delete conversation failed: ${result.error}")
                _uiState.value = UiState.Success(snapshot)
            }
        }
    }

    private companion object {
        const val TAG = "ChatHistoryViewModel"
    }
}

package com.tappyai.app.groupdining

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.tappyai.app.groupdining.data.GroupAction
import com.tappyai.app.groupdining.data.GroupErrorMessages
import com.tappyai.app.groupdining.data.GroupRepository
import com.tappyai.app.navigation.AppRoute
import com.tappyai.core.common.UiState
import com.tappyai.core.datastore.PreferencesDataSource
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Group Dining **detail** screen (the web `/group/[id]` → `GroupPage`). Loads the
 * group from `GET /api/group?id=`, decides the creator-vs-member view from the signed-in user's id,
 * and drives the two member actions (join, and — creator-only — request an AI suggestion). Mirrors
 * the web's control flow exactly; the backend owns every rule (ownership, the 10-member cap, the
 * suggestion itself). "Already joined" is persisted per-group in [PreferencesDataSource], the native
 * analog of the web's `localStorage.joined_group_<id>`, so a returning member sees the joined state.
 */
@HiltViewModel
class GroupDetailViewModel @Inject constructor(
    private val repository: GroupRepository,
    private val prefs: PreferencesDataSource,
    private val logger: LoggerProvider,
    private val groupErrorMessages: GroupErrorMessages,
    authRepository: AuthRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val groupId: String = savedStateHandle.toRoute<AppRoute.GroupDetail>().groupId

    /** Path appended to the public web origin to build the shareable link (`<origin>/group/<id>`). */
    val groupLinkPath: String = "group/$groupId"

    /** Read once (mirrors the web's `supabase.auth.getUser()`); null when signed out. */
    private val currentUserId: String? = authRepository.currentUserId()

    var uiState by mutableStateOf<UiState<Group>>(UiState.Loading)
        private set

    /** True when [group] is loaded and the signed-in user created it. */
    fun isCreator(group: Group): Boolean =
        currentUserId != null && group.creatorId == currentUserId

    /** Whether this user has already joined (persisted; also set optimistically after a join). */
    var joined by mutableStateOf(false)
        private set

    // ---- Join form (non-creator) ----
    var joinName by mutableStateOf("")
        private set
    var joinBudget by mutableStateOf<BudgetOption?>(null)
        private set
    var joinFoodPrefs by mutableStateOf("")
        private set
    var joinDietary by mutableStateOf("")
        private set
    var joinArea by mutableStateOf("")
        private set
    var joining by mutableStateOf(false)
        private set
    var joinError by mutableStateOf<String?>(null)
        private set

    var suggesting by mutableStateOf(false)
        private set

    /** One-shot messages (suggest failures) → a Toast, matching the web's `alert()`. */
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            joined = prefs.getBoolean(joinedKey(groupId)).first() == true
        }
        load()
    }

    fun load() {
        loadJob?.cancel()
        uiState = UiState.Loading
        loadJob = viewModelScope.launch {
            uiState = when (val result = repository.getGroup(groupId)) {
                is NetworkResult.Success -> UiState.Success(result.data)
                is NetworkResult.Error -> {
                    // 404 = no such group → the web's "Không tìm thấy nhóm này" (rendered from Empty).
                    if ((result.error as? NetworkError.Http)?.code == 404) {
                        UiState.Empty
                    } else {
                        logger.e(TAG, "getGroup failed: ${result.error}")
                        UiState.Error(groupErrorMessages.toUserMessage(result.error, GroupAction.Load))
                    }
                }
            }
        }
    }

    fun onJoinNameChange(v: String) {
        if (v.length <= MAX_MEMBER_NAME) joinName = v
        if (joinError != null) joinError = null
    }

    fun onJoinBudgetChange(b: BudgetOption) { joinBudget = b }
    fun onJoinFoodPrefsChange(v: String) { joinFoodPrefs = v }
    fun onJoinDietaryChange(v: String) { joinDietary = v }
    fun onJoinAreaChange(v: String) { joinArea = v }

    /** Required fields mirror the web form: name, budget, area (food/dietary optional). */
    val canSubmitJoin: Boolean
        get() = joinName.isNotBlank() && joinBudget != null && joinArea.isNotBlank() && !joining

    fun join() {
        val budget = joinBudget
        if (joinName.isBlank() || budget == null || joinArea.isBlank() || joining) return
        joining = true
        joinError = null
        viewModelScope.launch {
            when (val result = repository.joinGroup(
                id = groupId,
                name = joinName.trim(),
                budget = budget.label,
                foodPreferences = joinFoodPrefs.trim(),
                dietaryRestrictions = joinDietary.trim(),
                area = joinArea.trim(),
            )) {
                is NetworkResult.Success -> {
                    prefs.setBoolean(joinedKey(groupId), true)
                    joined = true
                    load() // reflect the now-larger group (matches the web's post-join refetch)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "joinGroup failed: ${result.error}")
                    joinError = groupErrorMessages.toUserMessage(result.error, GroupAction.Join)
                }
            }
            joining = false
        }
    }

    fun suggest() {
        if (suggesting) return
        suggesting = true
        viewModelScope.launch {
            when (val result = repository.suggest(groupId)) {
                is NetworkResult.Success -> {
                    val current = (uiState as? UiState.Success)?.data
                    if (current != null) {
                        uiState = UiState.Success(current.copy(suggestion = result.data))
                    }
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "suggest failed: ${result.error}")
                    _messages.send(groupErrorMessages.toUserMessage(result.error, GroupAction.Suggest))
                }
            }
            suggesting = false
        }
    }

    private companion object {
        const val TAG = "GroupDetailViewModel"
        // Matches the web join form's name maxLength.
        const val MAX_MEMBER_NAME = 50
        fun joinedKey(id: String) = "group_joined_$id"
    }
}

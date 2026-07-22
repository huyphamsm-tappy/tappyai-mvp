package com.tappyai.app.groupdining

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.groupdining.data.GroupAction
import com.tappyai.app.groupdining.data.GroupErrorMessages
import com.tappyai.app.groupdining.data.GroupRepository
import com.tappyai.app.navigation.AppRoute
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.navigation.TappyNavigator
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Group Dining **create** screen (the web `/group/new` → `GroupNewForm`). Holds the
 * group-name input and, on submit, calls `POST /api/group`; on success it navigates to the new
 * group's detail page via the app-level [TappyNavigator] (same event-bus mechanism every other
 * cross-cutting navigation uses), landing the creator on [AppRoute.GroupDetail]. All group business
 * logic stays server-side — this only sends the name and routes.
 */
@HiltViewModel
class GroupDiningViewModel @Inject constructor(
    private val repository: GroupRepository,
    private val navigator: TappyNavigator,
    private val logger: LoggerProvider,
    private val groupErrorMessages: GroupErrorMessages,
) : ViewModel() {

    var groupName by mutableStateOf("")
        private set

    var isCreating by mutableStateOf(false)
        private set

    /** Inline error under the form (mirrors the web's `error` text). Cleared on the next edit. */
    var errorMessage by mutableStateOf<String?>(null)
        private set

    fun onGroupNameChange(value: String) {
        if (value.length <= MAX_NAME) {
            groupName = value
            if (errorMessage != null) errorMessage = null
        }
    }

    fun createGroup() {
        val name = groupName.trim()
        if (name.isEmpty() || isCreating) return
        isCreating = true
        errorMessage = null
        viewModelScope.launch {
            when (val result = repository.createGroup(name)) {
                is NetworkResult.Success -> {
                    // Stay disabled through the transition, then hand off to the detail page.
                    navigator.navigateTo(AppRoute.GroupDetail(result.data))
                    isCreating = false
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "createGroup failed: ${result.error}")
                    errorMessage = groupErrorMessages.toUserMessage(result.error, GroupAction.Create)
                    isCreating = false
                }
            }
        }
    }

    private companion object {
        const val TAG = "GroupDiningViewModel"
        // Matches the web input's maxLength.
        const val MAX_NAME = 80
    }
}

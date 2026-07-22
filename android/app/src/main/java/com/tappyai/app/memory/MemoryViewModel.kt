package com.tappyai.app.memory

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.memory.data.MemoryRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the What-Tappy-Knows screen, backed by `/api/memory`. Loads on init (GET); every
 * per-fact remove optimistically updates local state then persists the FULL corrected memory via
 * PATCH (reverting on failure); clear is an optimistic DELETE. Response style ([tone]/[length]) is
 * a local-only preference (not part of `/api/memory`). The public surface is unchanged from the
 * seed version, so the screen is untouched.
 *
 * GET never 401s — it returns null on any issue — and the screen has no error branch, so a failed
 * load maps to `memory = null` (the empty state), mirroring the backend's own contract.
 */
@HiltViewModel
class MemoryViewModel @Inject constructor(
    private val repository: MemoryRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    var memory by mutableStateOf<Memory?>(null)
        private set

    /** True once the user has cleared memory this session — drives the "Memory cleared" empty copy. */
    var cleared by mutableStateOf(false)
        private set

    var editing by mutableStateOf(false)
        private set

    var tone by mutableStateOf<ResponseTone?>(null)
        private set
    var length by mutableStateOf<ResponseLength?>(null)
        private set

    // Only the latest full-state PATCH matters; cancel the prior one when a new edit arrives.
    private var persistJob: Job? = null

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            when (val result = repository.getMemory()) {
                is NetworkResult.Success -> memory = result.data
                is NetworkResult.Error -> {
                    // No error UI on this screen; a load failure reads as "no memory" (empty state),
                    // mirroring the backend GET which itself returns {memory:null} on error.
                    logger.e(TAG, "Memory load failed: ${result.error}")
                    memory = null
                }
            }
        }
    }

    fun toggleEditing() {
        editing = !editing
    }

    /** Reload from the backend. */
    fun refresh() {
        cleared = false
        editing = false
        load()
    }

    fun clear() {
        val snapshot = memory
        val wasCleared = cleared
        memory = null
        cleared = true
        editing = false
        persistJob?.cancel()
        viewModelScope.launch {
            val result = repository.clearMemory()
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Clear memory failed: ${result.error}")
                memory = snapshot
                cleared = wasCleared
            }
        }
    }

    fun selectTone(value: ResponseTone) {
        tone = if (tone == value) null else value
    }

    fun selectLength(value: ResponseLength) {
        length = if (length == value) null else value
    }

    fun removeLocation() = update { it.copy(locationBase = null) }
    fun removeCompanions() = update { it.copy(companions = null) }
    fun removeTiming() = update { it.copy(timing = null) }
    fun removePersonality() = update { it.copy(personality = null) }

    fun removeFood(index: Int) = updatePrefs { it.copy(food = it.food.removeAt(index)) }
    fun removeSpa(index: Int) = updatePrefs { it.copy(spa = it.spa.removeAt(index)) }
    fun removeEntertainment(index: Int) = updatePrefs { it.copy(entertainment = it.entertainment.removeAt(index)) }
    fun removeShopping(index: Int) = updatePrefs { it.copy(shopping = it.shopping.removeAt(index)) }
    fun removeAvoid(index: Int) = updatePrefs { it.copy(avoid = it.avoid.removeAt(index)) }

    fun removeHistory(topic: String) = update { it.copy(history = it.history.filterNot { h -> h == topic }) }
    fun removeBudget(category: String) = update { it.copy(budget = it.budget.filterNot { b -> b.category == category }) }

    /** Optimistically applies [transform], then persists the full corrected memory; reverts on failure. */
    private fun update(transform: (Memory) -> Memory) {
        val current = memory ?: return
        val updated = transform(current)
        memory = updated
        persistJob?.cancel()
        persistJob = viewModelScope.launch {
            val result = repository.saveMemory(updated)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Save memory failed: ${result.error}")
                memory = current
            }
        }
    }

    private fun updatePrefs(transform: (MemoryPreferences) -> MemoryPreferences) {
        update { it.copy(preferences = transform(it.preferences)) }
    }

    private fun <T> List<T>.removeAt(index: Int): List<T> =
        if (index in indices) filterIndexed { i, _ -> i != index } else this

    private companion object {
        const val TAG = "MemoryViewModel"
    }
}

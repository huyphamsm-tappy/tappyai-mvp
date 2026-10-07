package com.tappyai.app.deals

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.deals.data.DealsRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Deals screen (`/deals` on the web) — loads the active partner-deal pool from
 * `GET /api/deals`, and reloads it when the app language changes (see [onLanguageResolved]; the
 * feed is localized server-side, so the data is language-dependent, not just the chrome around it).
 * No pagination; the only filtering is the V3 category pills ([selectedCategory]), applied on the
 * client over the loaded pool. Tapping a card bumps the popularity counter and opens
 * [Deal.officialUrl] externally, same as the web's `<a target="_blank">`.
 */
@HiltViewModel
class DealsViewModel @Inject constructor(
    private val repository: DealsRepository,
    private val logger: LoggerProvider,
    private val stringProvider: StringProvider,
) : ViewModel() {

    var uiState by mutableStateOf<UiState<List<Deal>>>(UiState.Loading)
        private set

    /** The V3 category pill currently selected, or null for "all". */
    var selectedCategory by mutableStateOf<String?>(null)
        private set

    /**
     * The categories the loaded deals ACTUALLY have, in feed order.
     *
     * Read off the data, never a hardcoded list: the live feed carries three ("Mua sắm",
     * "Vận chuyển", "Du lịch"), and offering a pill for a category with nothing behind it would be
     * a filter that can only ever return an empty screen. These are the LOCALIZED labels
     * ([Deal.category]) because they are what the pills display; a language reload clears the
     * selection (see [load]) so a label from the previous language can never be left selected.
     */
    val categories: List<String>
        get() = (uiState as? UiState.Success)?.data
            ?.map { it.category }
            ?.filter { it.isNotBlank() }
            ?.distinct()
            .orEmpty()

    /** The deals the grid shows: everything, or just the selected category. */
    val visibleDeals: List<Deal>
        get() {
            val all = (uiState as? UiState.Success)?.data.orEmpty()
            val category = selectedCategory ?: return all
            return all.filter { it.category == category }
        }

    fun onCategorySelected(category: String?) {
        selectedCategory = category
    }

    private var loadJob: Job? = null

    /**
     * The language the data currently in [uiState] was fetched for, or null before the first load.
     */
    private var loadedForEnglish: Boolean? = null

    /**
     * Called by the screen with the language Android's resources resolved to, and again whenever
     * that changes.
     *
     * 🚨 This replaces an `init { load() }`, and the difference is a device-reproduced defect.
     * `category` and `description` are LOCALIZED BY THE SERVER — they arrive already translated,
     * chosen by the `?lang=` the request carried. The tag itself was never wrong: the repository
     * resolves it at call time. But `init` runs once per ViewModel instance, and below API 33 a
     * language switch re-resolves resources WITHOUT recreating the ViewModel. So the strings around
     * the cards switched language while the cards themselves kept the language they were fetched
     * in — "Tappy chọn lọc 7 ưu đãi tốt nhất" above a card reading "Shopping · Online marketplace"
     * — until the next force stop. Same mechanism as the Home hero greeting; that one froze a
     * derived value, this one freezes fetched data.
     *
     * [english] is only the CHANGE SIGNAL and the cache key. What the server is asked for still
     * comes solely from [com.tappyai.app.language.AppLanguageResolver] inside the repository, so
     * there is no second language authority — both read the same AppCompat application locale.
     *
     * Re-fetching is skipped when the data on screen already belongs to this language, so returning
     * to the tab does not spend a request; an error state is not treated as loaded, so coming back
     * retries by itself.
     */
    fun onLanguageResolved(english: Boolean) {
        val alreadyLoaded = uiState is UiState.Success || uiState is UiState.Empty
        if (loadedForEnglish == english && alreadyLoaded) return
        loadedForEnglish = english
        load()
    }

    private fun load() {
        loadJob?.cancel()
        uiState = UiState.Loading
        // A fresh pool may carry different categories (or the same ones in another language).
        selectedCategory = null
        loadJob = viewModelScope.launch {
            when (val result = repository.getDeals()) {
                is NetworkResult.Success -> {
                    uiState = if (result.data.isEmpty()) UiState.Empty else UiState.Success(result.data)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Deals load failed: ${result.error}")
                    uiState = UiState.Error(stringProvider.get(R.string.deals_error_message))
                }
            }
        }
    }

    fun retry() = load()

    /**
     * Fire-and-forget popularity counter for an opened deal (web parity: `DealsView.tsx` posts
     * `/api/deals/{id}/click` on card click).
     *
     * Launched on [viewModelScope] and never awaited by the caller, so the link opens immediately
     * whatever the network does. The repository already swallows failures; nothing is reported.
     */
    fun onDealOpen(deal: Deal) {
        viewModelScope.launch { repository.recordClick(deal.id) }
    }

    private companion object {
        const val TAG = "DealsViewModel"
    }
}

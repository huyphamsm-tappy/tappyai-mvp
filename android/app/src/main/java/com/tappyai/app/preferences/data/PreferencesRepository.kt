package com.tappyai.app.preferences.data

import com.tappyai.app.preferences.BudgetLevel
import com.tappyai.app.preferences.UserPreferences
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the preferences backend. The ViewModel depends on this and the domain types
 * only — never on Retrofit/OkHttp or the DTOs.
 */
interface PreferencesRepository {

    /** The user's saved preferences (or a typed error, incl. 401 → session expired). */
    suspend fun getPreferences(): NetworkResult<UserPreferences>

    /**
     * Persists the whole form. The backend splits this into PUT (structured) + POST (freeform list);
     * both must succeed. Returns Unit on success. Gender is not persisted (no backend field).
     */
    suspend fun savePreferences(
        budget: BudgetLevel?,
        cuisines: Set<String>,
        dietary: String,
        preferences: List<String>,
    ): NetworkResult<Unit>
}

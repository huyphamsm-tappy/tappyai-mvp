package com.tappyai.app.preferences.data

import com.tappyai.app.preferences.BudgetLevel
import com.tappyai.app.preferences.UserPreferences
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [PreferencesRepository]. Every call goes through core:network's [safeApiCall],
 * which maps HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealPreferencesRepository @Inject constructor(
    private val api: PreferencesApi,
) : PreferencesRepository {

    override suspend fun getPreferences(): NetworkResult<UserPreferences> =
        safeApiCall { api.getPreferences().toDomain() }

    override suspend fun savePreferences(
        budget: BudgetLevel?,
        cuisines: Set<String>,
        dietary: String,
        preferences: List<String>,
    ): NetworkResult<Unit> {
        // Structured fields (PUT) first; only continue to the freeform list (POST) if it succeeded.
        val structuredResult = safeApiCall {
            api.putStructured(
                UpdateStructuredRequestDto(
                    budgetLevel = budget?.toApiValue(),
                    cuisineLikes = cuisines.toList(),
                    dietaryRestrictions = dietary.trim().ifBlank { null },
                ),
            )
            Unit
        }
        if (structuredResult is NetworkResult.Error) return structuredResult

        return safeApiCall {
            api.postPreferences(UpdatePreferencesRequestDto(preferences = preferences))
            Unit
        }
    }
}

package com.tappyai.app.preferences.data

import com.tappyai.app.preferences.BudgetLevel
import com.tappyai.app.preferences.UserPreferences
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `/api/preferences`. GET returns `{ preferences: string[], structured: {...}|null }`
 * (snake_case) mapped to the domain [UserPreferences]. Writes are split by the backend: PUT carries
 * the structured fields (budget/cuisine/dietary), POST carries the freeform preferences list.
 * Domain enums are unchanged — the budget_level string↔enum mapping lives here.
 */
@Serializable
data class PreferencesResponseDto(
    val preferences: List<String> = emptyList(),
    val structured: StructuredDto? = null,
)

@Serializable
data class StructuredDto(
    @SerialName("budget_level") val budgetLevel: String? = null,
    @SerialName("cuisine_likes") val cuisineLikes: List<String>? = null,
    @SerialName("dietary_restrictions") val dietaryRestrictions: String? = null,
)

/** PUT body — structured preferences. */
@Serializable
data class UpdateStructuredRequestDto(
    @SerialName("budget_level") val budgetLevel: String?,
    @SerialName("cuisine_likes") val cuisineLikes: List<String>,
    @SerialName("dietary_restrictions") val dietaryRestrictions: String?,
)

/** POST body — the freeform preference list. */
@Serializable
data class UpdatePreferencesRequestDto(
    val preferences: List<String>,
)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

fun PreferencesResponseDto.toDomain(): UserPreferences = UserPreferences(
    preferences = preferences,
    budget = structured?.budgetLevel.toBudgetLevel(),
    cuisines = structured?.cuisineLikes?.toSet() ?: emptySet(),
    dietary = structured?.dietaryRestrictions ?: "",
)

/**
 * budget_level wire value. Uses the lowercase enum name; the backend stores it verbatim, so an
 * Android write round-trips. Cross-platform consistency (web-written value read on Android and vice
 * versa) depends on the web using the same tokens — flagged for the Production Audit Sprint.
 */
fun BudgetLevel.toApiValue(): String = when (this) {
    BudgetLevel.Cheap -> "cheap"
    BudgetLevel.Mid -> "mid"
    BudgetLevel.High -> "high"
}

fun String?.toBudgetLevel(): BudgetLevel? = when (this?.lowercase()?.trim()) {
    "cheap" -> BudgetLevel.Cheap
    "mid" -> BudgetLevel.Mid
    "high" -> BudgetLevel.High
    else -> null
}

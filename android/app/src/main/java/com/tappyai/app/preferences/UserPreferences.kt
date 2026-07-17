package com.tappyai.app.preferences

/**
 * The user's saved preference selections, loaded from `GET /api/preferences`. These populate the
 * editable form's initial state. [gender] is intentionally absent — the `/api/preferences` endpoint
 * has no gender field, so that form control is not persisted by this backend.
 */
data class UserPreferences(
    val preferences: List<String>,
    val budget: BudgetLevel?,
    val cuisines: Set<String>,
    val dietary: String,
)

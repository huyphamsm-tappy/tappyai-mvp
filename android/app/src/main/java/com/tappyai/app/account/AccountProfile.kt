package com.tappyai.app.account

/**
 * The signed-in user's profile, from `GET /api/profile`. [joinDate] is empty because that endpoint
 * does not return the account creation date (it selects `created_at` server-side but omits it from
 * the JSON) — the screen shows a no-data placeholder for it. [avatarUrl] is null when the user has
 * no uploaded avatar (the UI falls back to name initials).
 */
data class AccountProfile(
    val fullName: String,
    val email: String,
    val bio: String,
    val joinDate: String,
    val avatarUrl: String?,
    val language: String?,
)

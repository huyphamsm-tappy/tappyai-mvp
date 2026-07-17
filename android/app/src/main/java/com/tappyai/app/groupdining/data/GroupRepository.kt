package com.tappyai.app.groupdining.data

import com.tappyai.app.groupdining.Group
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the group backend. The ViewModels depend on this and the domain [Group] only —
 * never on Retrofit/OkHttp or the DTOs. All business logic (creator ownership, 10-member cap, AI
 * suggestion generation) stays server-side; this only transports and maps.
 */
interface GroupRepository {

    /** Create a group with [name]; returns the new group's id. */
    suspend fun createGroup(name: String): NetworkResult<String>

    /** Load a group and its members by [id]. A 404 (not found) surfaces as [NetworkResult.Error]. */
    suspend fun getGroup(id: String): NetworkResult<Group>

    /** Join group [id] with the member's details. Idempotent server-side (re-join → success). */
    suspend fun joinGroup(
        id: String,
        name: String,
        budget: String,
        foodPreferences: String,
        dietaryRestrictions: String,
        area: String,
    ): NetworkResult<Unit>

    /** Ask Tappy (creator-only, enforced by the backend) to suggest places; returns the text. */
    suspend fun suggest(id: String): NetworkResult<String>
}

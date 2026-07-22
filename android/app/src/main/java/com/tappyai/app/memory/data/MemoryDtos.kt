package com.tappyai.app.memory.data

import com.tappyai.app.memory.BudgetItem
import com.tappyai.app.memory.Memory
import com.tappyai.app.memory.MemoryPreferences
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `/api/memory`. GET returns `{ memory: <obj> | null }` in snake_case; the memory
 * object's `budget` is a MAP keyed by category (`{ food: {min,max}, … }`), converted to the domain
 * model's `List<BudgetItem>` here. Domain models ([Memory], …) are unchanged — mapping lives here.
 *
 * PATCH ([MemoryPatchDto]) is sent as the FULL current state on every edit: the backend replaces
 * whatever fields it receives, so sending only the changed category would wipe the others. Sending
 * the complete state keeps prefs/budget intact.
 */
@Serializable
data class MemoryResponseDto(
    val memory: MemoryDto? = null,
)

@Serializable
data class MemoryDto(
    @SerialName("location_base") val locationBase: String? = null,
    val companions: String? = null,
    val timing: String? = null,
    val personality: String? = null,
    val preferences: PreferencesDto? = null,
    val budget: Map<String, BudgetValueDto> = emptyMap(),
    val history: List<String> = emptyList(),
)

@Serializable
data class PreferencesDto(
    val food: List<String> = emptyList(),
    val spa: List<String> = emptyList(),
    val entertainment: List<String> = emptyList(),
    val shopping: List<String> = emptyList(),
    val avoid: List<String> = emptyList(),
)

/** min/max nullable to tolerate partial rows on GET; carries real ints on the PATCH send. */
@Serializable
data class BudgetValueDto(
    val min: Int? = null,
    val max: Int? = null,
)

/** Full-state PATCH body — all whitelisted fields the backend accepts. */
@Serializable
data class MemoryPatchDto(
    @SerialName("location_base") val locationBase: String?,
    val companions: String?,
    val timing: String?,
    val personality: String?,
    val preferences: PreferencesDto,
    val budget: Map<String, BudgetValueDto>,
    val history: List<String>,
)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

// ---- mappers --------------------------------------------------------------------

fun MemoryDto.toDomain(): Memory = Memory(
    locationBase = locationBase?.takeIf { it.isNotBlank() },
    companions = companions?.takeIf { it.isNotBlank() },
    timing = timing?.takeIf { it.isNotBlank() },
    personality = personality?.takeIf { it.isNotBlank() },
    preferences = (preferences ?: PreferencesDto()).let {
        MemoryPreferences(
            food = it.food,
            spa = it.spa,
            entertainment = it.entertainment,
            shopping = it.shopping,
            avoid = it.avoid,
        )
    },
    budget = budget.map { (category, value) ->
        BudgetItem(category = category, min = value.min ?: 0, max = value.max ?: 0)
    },
    history = history,
)

fun Memory.toPatchDto(): MemoryPatchDto = MemoryPatchDto(
    locationBase = locationBase,
    companions = companions,
    timing = timing,
    personality = personality,
    preferences = PreferencesDto(
        food = preferences.food,
        spa = preferences.spa,
        entertainment = preferences.entertainment,
        shopping = preferences.shopping,
        avoid = preferences.avoid,
    ),
    budget = budget.associate { it.category to BudgetValueDto(it.min, it.max) },
    history = history,
)

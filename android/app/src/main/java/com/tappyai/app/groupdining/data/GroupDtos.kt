package com.tappyai.app.groupdining.data

import com.tappyai.app.groupdining.Group
import com.tappyai.app.groupdining.GroupMember
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for the group endpoints, matching the web JSON shapes exactly:
 *  - `POST /api/group` `{name}` → `{id, name}`
 *  - `GET  /api/group?id=` → `{id, name, creator_id, status, suggestion, created_at, members[]}`
 *  - `POST /api/group/{id}/join` `{name, budget, food_preferences, dietary_restrictions, area}` → `{ok}`
 *  - `POST /api/group/{id}/suggest` → `{suggestion}`
 *
 * snake_case field names come straight from the backend (`select(...)` columns); the shared lenient
 * Json drops the columns the client doesn't need (`status`, `created_at`, `user_id`, …). DTO→domain
 * mapping lives here so the ViewModels only ever see [Group]/[GroupMember].
 */
@Serializable
data class CreateGroupRequestDto(val name: String)

@Serializable
data class CreateGroupResponseDto(
    val id: String = "",
    val name: String = "",
)

@Serializable
data class GroupDto(
    val id: String = "",
    val name: String = "",
    @SerialName("creator_id") val creatorId: String = "",
    val suggestion: String? = null,
    val members: List<GroupMemberDto> = emptyList(),
)

@Serializable
data class GroupMemberDto(
    val id: String = "",
    val name: String = "",
    val budget: String? = null,
    @SerialName("food_preferences") val foodPreferences: String? = null,
    @SerialName("dietary_restrictions") val dietaryRestrictions: String? = null,
    val area: String? = null,
)

@Serializable
data class JoinGroupRequestDto(
    val name: String,
    val budget: String,
    @SerialName("food_preferences") val foodPreferences: String,
    @SerialName("dietary_restrictions") val dietaryRestrictions: String,
    val area: String,
)

/** `{ok:true}` or `{ok:true, alreadyJoined:true}` — any 2xx means the caller is now a member. */
@Serializable
data class JoinGroupResponseDto(
    val ok: Boolean = false,
    val alreadyJoined: Boolean = false,
)

@Serializable
data class SuggestResponseDto(
    val suggestion: String = "",
)

fun GroupDto.toDomain(): Group = Group(
    id = id,
    name = name,
    creatorId = creatorId,
    suggestion = suggestion?.takeIf { it.isNotBlank() },
    members = members.map { it.toDomain() },
)

fun GroupMemberDto.toDomain(): GroupMember = GroupMember(
    id = id,
    name = name,
    budget = budget.orEmpty(),
    foodPreferences = foodPreferences.orEmpty(),
    dietaryRestrictions = dietaryRestrictions.orEmpty(),
    area = area.orEmpty(),
)

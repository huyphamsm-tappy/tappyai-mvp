package com.tappyai.app.groupdining

/**
 * Domain models for Group Dining — mirror the web `/group/[id]` (`GroupPage`) types. The backend
 * is the source of truth for all business logic (creator ownership, 10-member cap, AI suggestion);
 * these are plain data the ViewModels render. Wire DTOs and DTO→domain mapping live in
 * `groupdining.data`; nothing here knows about Retrofit/serialization.
 */

/** A member who has joined a group. `id` is the `group_members` row id (list key). */
data class GroupMember(
    val id: String,
    val name: String,
    val budget: String,
    val foodPreferences: String,
    val dietaryRestrictions: String,
    val area: String,
)

/**
 * A dining group. [creatorId] is compared against the signed-in user's id to decide the
 * creator-vs-member view (same rule as the web's `group.creator_id === currentUserId`); the
 * backend independently enforces creator-only actions server-side. [suggestion] is Tappy's AI
 * recommendation once generated (null until the creator requests it).
 */
data class Group(
    val id: String,
    val name: String,
    val creatorId: String,
    val suggestion: String?,
    val members: List<GroupMember>,
)

/**
 * Budget tiers a member picks when joining, shown as selectable chips — mirrors the web
 * `BUDGET_OPTIONS`. Labels are English to match the rest of the native app's copy (the web is
 * Vietnamese); the chosen [label] is submitted verbatim as free-form display text (the backend
 * stores it as-is and the AI prompt interpolates it — there is no canonical token to match).
 */
enum class BudgetOption(val label: String) {
    LOW("Under 100k"),
    MID("100–200k"),
    HIGH("Over 200k"),
}

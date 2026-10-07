package com.tappyai.app.planner

import com.tappyai.app.chat.ChatResponseParser
import com.tappyai.app.chat.PlanItem
import com.tappyai.app.chat.TappyPlan
import com.tappyai.app.history.ConversationWithMessages

/**
 * The AI Planner's row model — a line-for-line port of the web's `lib/planner/derivePlans.ts`
 * (design/v3-phase4). Plans are READ OUT OF CONVERSATIONS: every `[TAPPY_PLAN]` block an
 * assistant turn carried becomes one card. Nothing here is stored, nothing is mutated, and no
 * field is invented — a plan has no dates, no status and no plan-level image, so the card shows
 * what a plan really contains (days, stops, people, budget, the first real stop photo).
 */
enum class PlanKind { Trip, Evening }

data class DerivedPlan(
    /** Stable across reloads: a plan is identified by where it lives (`conversationId#index`). */
    val id: String,
    val conversationId: String,
    /** `TappyPlan.title`, falling back to the conversation's own title — both real strings. */
    val title: String,
    /** null when the model wrote neither 'trip' nor 'evening'; the UI shows no kind rather than a guess. */
    val kind: PlanKind?,
    /** The conversation's `updated_at` — the last time the THREAD moved, labelled as such, never as a plan date. */
    val updatedAtMillis: Long,
    val people: Int?,
    /** Free text from the model ("khoảng 5 triệu"), never parsed into a number. */
    val budgetTotal: String?,
    val dayCount: Int,
    val stopCount: Int,
    /** First real per-stop photo, or null. */
    val coverUrl: String?,
    /** The first three stops, for a preview that shows the plan instead of describing it. */
    val stops: List<PlanItem>,
    /** The decoded payload, so the card can open the full itinerary without re-parsing. */
    val plan: TappyPlan,
)

object DerivePlans {
    private const val PREVIEW_STOPS = 3
    private const val MARKER = "[TAPPY_PLAN]"

    private fun kindOf(type: String?): PlanKind? = when (type) {
        "trip" -> PlanKind.Trip
        "evening" -> PlanKind.Evening
        else -> null
    }

    private fun itemsOf(plan: TappyPlan): List<PlanItem> =
        plan.days.flatMap { it.items }.filter { it.name.isNotBlank() }

    /** The plans one conversation carries, in message order — see the web's `plansInConversation`. */
    fun plansInConversation(row: ConversationWithMessages): List<DerivedPlan> {
        val out = ArrayList<DerivedPlan>()
        row.messages.forEachIndexed { index, message ->
            if (message.role != "assistant" || !message.content.contains(MARKER)) return@forEachIndexed
            val plan = ChatResponseParser.parse(message.content).plan ?: return@forEachIndexed
            val items = itemsOf(plan)
            val title = plan.title.trim().ifBlank { row.conversation.title.trim() }
            if (title.isBlank()) return@forEachIndexed // nothing real to name the card with
            out += DerivedPlan(
                id = "${row.conversation.id}#$index",
                conversationId = row.conversation.id,
                title = title,
                kind = kindOf(plan.type),
                updatedAtMillis = row.conversation.updatedAtMillis,
                people = plan.people?.takeIf { it > 0 },
                budgetTotal = plan.budgetTotal?.trim()?.takeIf { it.isNotBlank() },
                dayCount = plan.days.size,
                stopCount = items.size,
                coverUrl = items.firstNotNullOfOrNull { it.photoUrl?.takeIf { url -> url.isNotBlank() } },
                stops = items.take(PREVIEW_STOPS),
                plan = plan,
            )
        }
        return out
    }

    /** All plans across the rows the list read returned, newest thread first (the rows' own order). */
    fun derivePlans(rows: List<ConversationWithMessages>): List<DerivedPlan> = rows.flatMap(::plansInConversation)

    /**
     * The kinds the user actually has, in the fixed trip → evening order. Empty when there is
     * fewer than two — one chip beside "All" narrows nothing, so the row does not render.
     */
    fun facets(plans: List<DerivedPlan>): List<PlanKind> {
        val present = listOf(PlanKind.Trip, PlanKind.Evening).filter { k -> plans.any { it.kind == k } }
        return if (present.size > 1) present else emptyList()
    }
}

package com.tappyai.app.chat

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A `[TAPPY_PLAN]` itinerary — the parsed JSON of the model's plan block, mirroring the web
 * `TappyPlan` (`src/components/TripPlanCard.tsx`). Rendered by [TripPlanCard]; NEVER shown as raw
 * text (the web rule: edit the parsed object + re-serialize, never splice text into the JSON).
 *
 * All snake_case wire keys are mapped explicitly. Defaults keep a partially-formed plan from
 * failing the whole parse — a malformed block instead falls back to plain text upstream.
 */
@Serializable
data class TripPlan(
    val type: String = "trip",
    val title: String = "",
    val people: Int? = null,
    @SerialName("budget_total") val budgetTotal: String? = null,
    val days: List<PlanDay> = emptyList(),
    @SerialName("cost_breakdown") val costBreakdown: Map<String, String>? = null,
    @SerialName("share_text") val shareText: String? = null,
)

@Serializable
data class PlanDay(
    val label: String = "",
    val items: List<PlanItem> = emptyList(),
)

@Serializable
data class PlanItem(
    val time: String = "",
    val emoji: String = "",
    val category: String = "",
    val name: String = "",
    val description: String? = null,
    val price: String? = null,
    val address: String? = null,
    @SerialName("maps_link") val mapsLink: String? = null,
    @SerialName("booking_link") val bookingLink: String? = null,
    @SerialName("place_id") val placeId: String? = null,
    /** Representative photo injected server-side (streamEnrichment.injectPlanPhotos). */
    @SerialName("photo_url") val photoUrl: String? = null,
)

package com.tappyai.app.chat

import kotlinx.serialization.Serializable

/**
 * The DURABLE place card, as it arrives inside `[TAPPY_PLACES]`.
 *
 * Kotlin mirror of the server's `PersistedRecommendation` (src/lib/recommendation/marker.ts). The
 * server serialises that projection directly into the marker, so this is the wire shape and not a
 * re-derivation — the rank, the match verdict and the action URLs are exactly what the server
 * decided, which is why the card can never disagree with the prose above it.
 *
 * 🚨 WHY THE MARKER EXISTS AT ALL, AND WHY IT IS NOT THE LIVE CARD. Two different payloads carry
 * places, deliberately:
 *
 *   `8:` annotation  → the LIVE card. Richer (chips, trade-offs, reference prices), never stored:
 *                      the chat saves `{role, content}` only, so it is gone on reload.
 *   `[TAPPY_PLACES]` → the DURABLE card. Rides in the message TEXT, which is the only channel that
 *                      survives a save/reload round trip, and is therefore the one bound by the
 *                      provider's storage terms.
 *
 * That is why some fields here can be absent for a place the live card showed in full: Google
 * Places content must not be stored, so `mayPersist` on the server drops name, address, rating,
 * hours, phone and Google photos for a Google-sourced row. OpenStreetMap and Serper rows are not
 * subject to those terms and persist whole. Nothing on this side may reconstruct what the server
 * declined to write — an absent field is an answer, not a gap to fill.
 *
 * 🚨 THE HONESTY RULE IS IN THE TYPES. Every field the server may not know is nullable, and the
 * card omits a null row rather than showing a placeholder. Nothing here is defaulted to a
 * plausible-looking value.
 */
@Serializable
data class PersistedPlaceAction(
    val kind: String = "",
    val urlKind: String = "",
    val url: String = "",
    val labelKey: String = "",
    val platform: String? = null,
    val attributed: Boolean? = null,
)

/** Why the server ranked this place where it did. Shown only when the server stated it. */
@Serializable
data class PersistedPlaceReason(
    val attribute: String = "",
    val evidence: String = "",
)

@Serializable
data class PersistedPlace(
    val id: String = "",
    val domain: String = "",
    val kind: String = "",
    val rank: Int = 0,
    val name: String? = null,
    val image: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val openingHours: String? = null,
    val openNow: Boolean? = null,
    val phone: String? = null,
    val priceLevel: Int? = null,
    val distanceKm: Double? = null,
    val shortlistPosition: Int? = null,
    val recommended: Boolean? = null,
    val matchVerdict: String? = null,
    val reasons: List<PersistedPlaceReason> = emptyList(),
    val actions: List<PersistedPlaceAction> = emptyList(),
)

/**
 * The block envelope.
 *
 * 🚨 `v` IS READ BUT NOT ENFORCED. Web is the reference implementation and decodes any payload
 * carrying a non-empty `items`, whatever the version says — so gating on `v` here would mean a
 * server version bump silently blanked the card on Android while Web kept working. The shared
 * fixture `places-unknown-version` pins that. Unknown FIELDS are tolerated the same way, by the
 * parser's `ignoreUnknownKeys`.
 */
@Serializable
data class PlacesMarkerPayload(
    val v: Int = 1,
    val items: List<PersistedPlace> = emptyList(),
)

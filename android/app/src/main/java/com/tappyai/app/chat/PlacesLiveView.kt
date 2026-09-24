package com.tappyai.app.chat

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * The LIVE place decision, as it arrives on the `8:` annotation frame.
 *
 * Kotlin mirror of the server's `PlacesLiveView` (src/lib/recommendation/liveView.ts). The server
 * already builds this on every place turn and sends it to the browser today; Android read only
 * `0:` text frames and dropped it on the floor, which is why the same turn showed a rich decision
 * card on web and plain prose on the phone.
 *
 * 🚨 THIS IS NOT THE DURABLE MARKER, AND THE DIFFERENCE IS THE POINT.
 *
 *   `8:` annotation  → richer, and NEVER stored. The chat saves `{role, content}` only, so this
 *                      lives for the session and is gone on reload. Because it is not storage, no
 *                      provider storage term applies to it — which is exactly why it may carry the
 *                      Google-sourced name, rating and hours that the durable payload must drop.
 *   `[TAPPY_PLACES]` → poorer, and PERMANENT. See [PersistedPlace].
 *
 * So a live card being richer than the card the same turn leaves behind after a reload is the
 * designed outcome, not a defect — and the fix for the durable one is never to copy this payload
 * into storage.
 *
 * Nothing here is re-derived on the client: every field is read straight from the annotation.
 */

/**
 * The Commerce Capability Platform's facts on an action it resolved (web `CommerceActionFacts`,
 * src/lib/recommendation/actions.ts). Present only on a commerce handoff; absent on every other
 * action. Nothing here is re-derived: the merchant, the depth the URL lands at, the login boundary
 * and the opaque ids the handoff beacon reports are all the server's.
 *
 * 🚨 THE URL IS NOT HERE, AND THE MODEL NEVER WROTE IT. The action's `url` is the one CCP validated
 * (host allow-list, grammar, tracking) — the card opens it verbatim and reports [linkId] +
 * [requestId], never the URL.
 */
@Serializable
data class LiveCommerceFacts(
    val linkId: String = "",
    val requestId: String = "",
    val providerId: String = "",
    /** L0–L5 the URL lands at for a guest. */
    val depth: Int = 0,
    val guestDepth: Int = 0,
    val authRequiredAt: String = "",
    /** True when the merchant asks for a login BEFORE the landed step can be completed. */
    val loginRequired: Boolean = false,
    /** `guest` · `merchant_login` · `app` — what the user meets after the tap. */
    val handoff: String? = null,
    val authenticatedDepth: Int? = null,
    val freshnessType: String = "",
    val expiresAt: String? = null,
    val tracked: Boolean = false,
    val capability: String? = null,
    val primary: Boolean = true,
    /** Observed price / availability / schedule facts when a source stated them; never inferred. */
    val facts: LiveCommerceObservedFacts? = null,
)

@Serializable
data class LiveCommerceObservedFacts(
    val source: String = "",
    val retrievedAt: String = "",
    val expiresAt: String? = null,
    val freshnessType: String = "",
    val price: LiveCommercePrice? = null,
    val availability: String? = null,
    val inventory: Int? = null,
    val schedule: LiveCommerceSchedule? = null,
)

@Serializable
data class LiveCommercePrice(
    val listPrice: Double? = null,
    val salePrice: Double? = null,
    val currency: String = "VND",
)

@Serializable
data class LiveCommerceSchedule(
    val date: String = "",
    val time: String? = null,
)

@Serializable
data class LivePlaceAction(
    val kind: String = "",
    val urlKind: String = "",
    val url: String = "",
    val labelKey: String = "",
    val platform: String? = null,
    val attributed: Boolean? = null,
    /** CCP facts for a commerce handoff. Null on every other action. */
    val commerce: LiveCommerceFacts? = null,
)

@Serializable
data class LivePlaceReason(
    val attribute: String = "",
    val evidence: String = "",
    /**
     * The reason as data (web `reasonText.ts`): `{value}` for rating, `{count}` for reviewCount,
     * `{km}` for distance, `{priceVnd}`, `{stars}`, `{minutes}`. The card words it from these in
     * the reader's language (`PlaceCardCopy`); absent → the `evidence` string, as before (F-050).
     */
    val params: JsonObject? = null,
)

@Serializable
data class LiveTappyRating(
    val avg: Double = 0.0,
    val count: Int = 0,
)

@Serializable
data class LivePlace(
    val id: String = "",
    val domain: String = "",
    val kind: String = "",
    val name: String = "",
    val image: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    /** Hotel CLASS, 1-5 — never a guest rating. Carried separately so the card cannot confuse them. */
    val stars: Int? = null,
    val openingHours: String? = null,
    val openNow: Boolean? = null,
    val phone: String? = null,
    val priceLevel: Int? = null,
    /** A price seen in a search snippet. Weak evidence — the card labels it as reference. */
    val priceSignal: String? = null,
    /** The provider's own price band, shown plainly (web `priceRangeText`). */
    val priceRangeText: String? = null,
    /** Our own review aggregate, labelled "Tappy" so it is never read as the provider's rating. */
    val tappyRating: LiveTappyRating? = null,
    val distanceKm: Double? = null,
    val categories: List<String> = emptyList(),
    val flags: List<String> = emptyList(),
    val rank: Int = 0,
    val shortlistPosition: Int? = null,
    val recommended: Boolean? = null,
    val matchVerdict: String? = null,
    val reasons: List<LivePlaceReason> = emptyList(),
    val tradeOff: LivePlaceReason? = null,
    val actions: List<LivePlaceAction> = emptyList(),
)

@Serializable
data class PlacesLiveView(
    val kind: String = "",
    val v: Int = 1,
    val domain: String = "",
    /**
     * Whether the engine actually RANKED this set. False when rows were retrieved but nothing in
     * them was scoreable, so the order is the provider's and no position means anything — the card
     * must not print a rank badge in that case.
     */
    val ranked: Boolean? = null,
    val items: List<LivePlace> = emptyList(),
    val mapsSearchUrl: String? = null,
    /**
     * Item 2 (2026-09-19): the ids of the places the MODEL named in its reply, pick first, in
     * prose order — rendered first; `items` itself keeps the engine's order. Empty on older
     * payloads. Web parity: `liveView.ts` `picked`.
     */
    val picked: List<String> = emptyList(),
    /** How many cards sit above "Xem thêm" (item 2: 3). Null: every card, as before. */
    val shown: Int? = null,
    /**
     * A1(a) (2026-09-20): the ENGINE's set, sent the moment the rows land — before the model has
     * written a word — so the fold is not blank while the prose is written. Unranked, no pick, no
     * reasons, no photos. The decision frame that follows the prose replaces it: the last frame of
     * the kind is the turn's view. Web parity: `liveView.ts` `preliminary`.
     */
    val preliminary: Boolean = false,
    /**
     * F (2026-09-20): the reply named venues and NONE matched a row (server A.4) — `picked` is empty
     * and the order is the engine's, not the model's. The card then prints no rank badge and no lead
     * emphasis, exactly as an unranked set. Web parity: `liveView.ts` `pickUnmatched` /
     * `PlaceDecision.tsx` `ranked={view.ranked !== false && !view.pickUnmatched}`.
     */
    val pickUnmatched: Boolean = false,
)

/** Whether a position means anything on this view (web parity). */
fun PlacesLiveView.positionsRanked(): Boolean = ranked != false && !pickUnmatched

/**
 * The render order (web parity: `placesRenderOrder`): the model's picks first, then the engine's
 * order for the rest. Never mutates [PlacesLiveView.items].
 */
fun PlacesLiveView.renderOrder(): List<LivePlace> {
    val byId = items.associateBy { it.id }
    val first = picked.mapNotNull { byId[it] }
    val seen = first.map { it.id }.toSet()
    return first + items.filter { it.id !in seen }
}

/**
 * The annotation's own type tag, verbatim from the server (`liveView.ts`). Checked before the
 * payload is used so a DIFFERENT annotation on the same `8:` part can never be mistaken for a
 * place decision — the frame is shared, the kind is what identifies it.
 */
const val PLACES_ANNOTATION_KIND = "tappy.places.v1"

/**
 * The same frame, projected for the share artifact (V3 share parity —
 * [com.tappyai.app.share.ShareArtifactBuilder]). One parse of the `8:` line feeds both the card
 * and the share sheet; the share model keeps its own thinner shape (reasons as sentences, no
 * commerce facts) so the artifact renderer is untouched by card-side changes.
 */
fun PlacesLiveView.toShareView(): com.tappyai.app.share.PlacesLiveView =
    com.tappyai.app.share.PlacesLiveView(
        domain = domain,
        items = items.map { p ->
            com.tappyai.app.share.LivePlace(
                name = p.name,
                image = p.image,
                address = p.address,
                rating = p.rating,
                ratingCount = p.ratingCount,
                openingHours = p.openingHours,
                openNow = p.openNow,
                phone = p.phone,
                priceRangeText = p.priceRangeText,
                categories = p.categories,
                reasons = p.reasons.map { it.evidence }.filter { it.isNotBlank() },
                actions = p.actions.map { a ->
                    com.tappyai.app.share.LiveAction(
                        kind = a.kind,
                        urlKind = a.urlKind,
                        url = a.url,
                        platform = a.platform,
                        attributed = a.attributed,
                    )
                },
            )
        },
    )

/**
 * What a place card actually draws.
 *
 * ONE card, TWO payloads. The live annotation and the durable marker are different projections of
 * the same recommendation, and rendering them through two composables would guarantee they drifted
 * — the live card gaining a row the reloaded one never gets, or the two disagreeing about which
 * place is "popular". So both are mapped into this shape and there is exactly one card.
 *
 * Fields the durable payload cannot carry (a trade-off, a reference price, provider categories)
 * are simply null on that path, and every row is conditional, so the same card renders the richer
 * live version and the thinner stored one without a placeholder anywhere.
 */
data class PlaceCardView(
    val name: String,
    val rank: Int,
    /** The vertical (food/travel/shopping/entertainment/spa) — carried for the recommendation_click event only. */
    val domain: String = "",
    val image: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val stars: Int? = null,
    val openingHours: String? = null,
    val openNow: Boolean? = null,
    val priceLevel: Int? = null,
    val priceSignal: String? = null,
    /**
     * The provider's OWN price band ("1-100.000 ₫", Serper `/maps`). A structured field, shown as
     * a plain fact — unlike [priceSignal], which is a number spotted in search prose.
     */
    val priceRangeText: String? = null,
    /** TappyAI's own community rating for this place, when we have reviews of it. */
    val tappyRating: LiveTappyRating? = null,
    /** The phone NUMBER as information — web prints it beside the dialler (`place-phone`). */
    val phone: String? = null,
    val distanceKm: Double? = null,
    val categories: List<String> = emptyList(),
    /**
     * Boolean amenities the provider actually stated — `wifi`, `outdoorSeating`, `vegetarian`.
     *
     * 🚨 DECODED AND THEN DROPPED. The annotation has carried these since the live card shipped and
     * web renders them as chips; Android decoded them into [LivePlace] and the projection left them
     * behind, so "có Wi-Fi" reached the browser and not the phone. The UI owns their wording — the
     * server sends the key, never a sentence.
     */
    val flags: List<String> = emptyList(),
    /** Structured, so the card can word them in the reader's language (F-050). */
    val reasons: List<LivePlaceReason> = emptyList(),
    val tradeOff: LivePlaceReason? = null,
    val actions: List<PlaceCardAction> = emptyList(),
)

data class PlaceCardAction(
    val kind: String,
    val urlKind: String,
    val url: String,
    val labelKey: String,
    val platform: String? = null,
    /**
     * `review` only: true when the URL is a specific attributed piece of content rather than a
     * search for one. Web's label reads it ("Review trên TikTok" vs "Tìm review trên YouTube"),
     * so the card must carry it or it cannot say the same thing.
     */
    val attributed: Boolean? = null,
    /** The commerce facts, carried through untouched so a tap can report the handoff. */
    val commerce: LiveCommerceFacts? = null,
)

/** The LIVE projection → the card. Nothing is dropped that the card can show. */
fun LivePlace.toCardView(): PlaceCardView = PlaceCardView(
    name = name,
    rank = rank,
    domain = domain,
    image = image,
    address = address,
    rating = rating,
    ratingCount = ratingCount,
    stars = stars,
    openingHours = openingHours,
    openNow = openNow,
    priceLevel = priceLevel,
    priceSignal = priceSignal,
    priceRangeText = priceRangeText,
    phone = phone,
    tappyRating = tappyRating,
    distanceKm = distanceKm,
    categories = categories,
    flags = flags,
    reasons = reasons.filter { it.evidence.isNotBlank() },
    tradeOff = tradeOff?.takeIf { it.evidence.isNotBlank() },
    actions = actions.map { PlaceCardAction(it.kind, it.urlKind, it.url, it.labelKey, it.platform, it.attributed, it.commerce) },
)

/**
 * The DURABLE projection → the same card.
 *
 * A place whose name the server could not persist (Google-sourced content) has nothing a reader
 * could identify it by, so it yields null and no card is drawn for it. That is a licensing
 * outcome, not a gap to fill: the prose above still describes the place, and re-fetching to
 * complete the card is exactly what the storage terms forbid.
 */
fun PersistedPlace.toCardView(): PlaceCardView? {
    val known = name?.takeIf { it.isNotBlank() } ?: return null
    return PlaceCardView(
        name = known,
        rank = rank,
        domain = domain,
        image = image,
        address = address,
        rating = rating,
        ratingCount = ratingCount,
        openingHours = openingHours,
        openNow = openNow,
        phone = phone,
        priceLevel = priceLevel,
        distanceKm = distanceKm,
        reasons = reasons.filter { it.evidence.isNotBlank() }.map { LivePlaceReason(it.attribute, it.evidence) },
        actions = actions.map { PlaceCardAction(it.kind, it.urlKind, it.url, it.labelKey, it.platform, it.attributed) },
    )
}

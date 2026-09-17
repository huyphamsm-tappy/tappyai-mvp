package com.tappyai.app.chat

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors
import java.net.URI

/**
 * The place DECISION on Android — the counterpart of web's `PlaceDecision.tsx`.
 *
 * The INFORMATION is web's, field for field (the Web Chat Information Contract audit,
 * 2026-09-12): the same facts on a card, the same actions in the same groups, the same filter
 * rule, the same badges. The PRESENTATION is the phone's:
 *
 *   filter chips  →  ONE merchant card per viewport, swiped horizontally  →  page dots  →  map CTA
 *
 * Web draws three cards in a desktop grid and lets the filter count stand for the rest; a phone
 * has one column, and three full cards stacked under a reply are a wall. So the same ranked set is
 * a pager: card #1 first, #2 one swipe away, every merchant reachable. Nothing about the SET
 * changes — the server's order is the page order, the filters only choose which pages exist,
 * and a card's "#N" is its position in the server's list even when a chip has hidden #1.
 *
 * Every card renders what the server already decided and states nothing of its own:
 *
 *   - every row is conditional on the server having supplied the value. A place the source knew
 *     only a name and a map link for renders a name and a map button — never a placeholder;
 *   - the filters only choose WHICH rows show, never a different order — nothing is re-sorted,
 *     re-scored or re-grouped on the client;
 *   - a chip appears only when at least one row satisfies it AND at least one does not (web
 *     `buildFilters`);
 *   - "#N" and "Phổ biến" appear only where web puts them — when the engine actually RANKED the
 *     set, and for the top place with enough ratings for the word to mean something.
 *
 * Row for row this is web's `PlaceCard` (design/v3-phase4, ported 2026-09-12): rating with its
 * count or the hotel class; Tappy's own rating; address; the phone NUMBER; hours and the open
 * state; price band and distance; the provider's price range; a snippet reference price; chips;
 * "Vì sao" — the ranker's reasons; the trade-off; then the actions. What the wire carries but web
 * does not draw — ids, verdicts, the published week of hours — is not drawn here either.
 *
 * WHY SOME DURABLE CARDS ARE THINNER THAN THE LIVE ONE. The live card is built from the `8:`
 * annotation, which is never stored; the durable card from the message text, which is. Google
 * Places content must not be stored, so a Google-sourced row persists only its identifiers and
 * our own derived values (`mayPersist` on the server). A licensing outcome, not a bug.
 */

/** Enough Google ratings that "popular" is a description rather than a flourish (web parity). */
private const val POPULAR_MIN_RATINGS = 100

/** Web `filterRated`: a rating this high is what the chip means by "top rated". */
internal const val RATED_MIN = 4.5

/** Web parity: only the first two provider categories become chips. */
internal const val CATEGORY_CHIPS = 2

/**
 * How many merchants the carousel pages through — web `VISIBLE`. The owner's rule (2026-09-12):
 * the first three fully, the rest through "Tất cả (N)" and "Xem tất cả trên bản đồ".
 */
internal const val PLACES_VISIBLE = 3

/** Web parity: `priceBand` in PlaceDecision.tsx — one to four `₫`, or nothing at all. */
internal fun priceBand(level: Int?): String? =
    if (level == null || level < 1 || level > 4) null else "₫".repeat(level)

// ── Filters (pure — the rule web's `buildFilters` uses, tested directly) ────────────────────

enum class PlaceFilterId { All, Open, Rated, Wifi, Outdoor, Vegetarian }

data class PlaceFilter(val id: PlaceFilterId, val matches: (PlaceCardView) -> Boolean)

/**
 * The filter row, derived from the rows themselves.
 *
 * `All` is always first. Every other chip is offered only when it would actually change the
 * result: at least one row matches and at least one does not. A chip every row passes (or none
 * does) is pure noise and is not built.
 */
internal fun placeFilters(items: List<PlaceCardView>): List<PlaceFilter> {
    val candidates = listOf(
        PlaceFilter(PlaceFilterId.Open) { it.openNow == true },
        PlaceFilter(PlaceFilterId.Rated) { (it.rating ?: 0.0) >= RATED_MIN },
        PlaceFilter(PlaceFilterId.Wifi) { "wifi" in it.flags },
        PlaceFilter(PlaceFilterId.Outdoor) { "outdoorSeating" in it.flags },
        PlaceFilter(PlaceFilterId.Vegetarian) { "vegetarian" in it.flags },
    )
    val useful = candidates.filter { f ->
        val n = items.count(f.matches)
        n > 0 && n < items.size
    }
    return listOf(PlaceFilter(PlaceFilterId.All) { true }) + useful
}

/**
 * The pages of the carousel: the rows the chip admits, in SERVER order, the first
 * [PLACES_VISIBLE] of them — exactly web's `items.filter(match).slice(0, VISIBLE)`. The count
 * chip says how many there are; the map footer is where the rest live.
 */
internal fun carouselPlaces(items: List<PlaceCardView>, filter: PlaceFilter): List<PlaceCardView> =
    items.filter(filter.matches).take(PLACES_VISIBLE)

/**
 * Web parity: the chip row shows when a chip can actually change the result, and also when the
 * payload holds more rows than the carousel pages through — the count is then the honest answer
 * to "is this all of them?".
 */
internal fun showsFilterRow(items: List<PlaceCardView>, filters: List<PlaceFilter>): Boolean =
    filters.size > 1 || items.size > PLACES_VISIBLE

// ── Actions (pure) ──────────────────────────────────────────────────────────────────────────

/** Web parity: the map button leads, ordering follows, anything else is a secondary button. */
data class GroupedActions(
    val maps: PlaceCardAction?,
    val orders: List<PlaceCardAction>,
    val others: List<PlaceCardAction>,
)

/**
 * An action with no URL is not a button — it is a lie, and the live projection drops it for the
 * same reason. Grouping is by `kind`, exactly as `PlaceDecision.tsx` groups.
 */
internal fun groupActions(actions: List<PlaceCardAction>): GroupedActions {
    val usable = actions.filter { it.url.isNotBlank() }
    val maps = usable.firstOrNull { it.kind == "maps" || it.kind == "directions" }
    val orders = usable.filter { it !== maps && (it.kind == "order" || it.kind == "delivery") }
    val others = usable.filter { it !== maps && it !in orders }
    return GroupedActions(maps, orders, others)
}

/** Web `actionLabel.ts` HOST_BRAND: the platform a URL's host names, when the action did not say. */
private val HOST_BRAND: List<Pair<Regex, String>> = listOf(
    Regex("""(^|\.)youtube\.com$|(^|\.)youtu\.be$""") to "YouTube",
    Regex("""(^|\.)tiktok\.com$""") to "TikTok",
    Regex("""(^|\.)google\.""") to "Google",
    Regex("""(^|\.)shopee\.""") to "Shopee",
    Regex("""(^|\.)lazada\.""") to "Lazada",
    Regex("""(^|\.)tiki\.vn$""") to "Tiki",
    Regex("""(^|\.)shopeefood\.""") to "ShopeeFood",
    Regex("""(^|\.)grab\.com$""") to "GrabFood",
    Regex("""(^|\.)be\.com\.vn$""") to "BeFood",
    Regex("""(^|\.)booking\.com$""") to "Booking.com",
    Regex("""(^|\.)agoda\.""") to "Agoda",
    Regex("""(^|\.)facebook\.com$""") to "Facebook",
    Regex("""(^|\.)vexere\.""") to "Vexere",
)

/**
 * Web `platformOf`: the action's own `platform`, else the brand its host names, else the host's
 * first label capitalised. `tel:` and anything unparseable name nothing.
 */
internal fun platformOf(action: PlaceCardAction): String? {
    action.platform?.takeIf { it.isNotBlank() }?.let { return it }
    val host = runCatching { URI(action.url).host }.getOrNull()?.removePrefix("www.") ?: return null
    for ((re, brand) in HOST_BRAND) if (re.containsMatchIn(host)) return brand
    val first = host.substringBefore('.')
    return first.takeIf { it.isNotEmpty() }?.replaceFirstChar { it.uppercaseChar() }
}

/**
 * The resource and argument a label resolves to — kept as data so the mapping is testable
 * without a Compose host. A PORT of web `resolveActionLabel`, keyed on `kind`, `urlKind` and
 * `attributed` exactly as web is (the wire's `labelKey` is not what web shows):
 *
 *   - `review`: attributed content is "Review trên {platform}", anything else is a search —
 *     "Tìm review trên {platform}" — and without a platform the generic wording;
 *   - a `search` URL says so: rooms/tickets/orders/products are "Tìm … trên {platform}";
 *   - a direct URL keeps the plain verb for its kind; an unknown kind reads as a website.
 */
internal fun actionLabelSpec(action: PlaceCardAction): Pair<Int, String?> {
    val platform = platformOf(action)
    fun withPlatform(key: Int, fallback: Int): Pair<Int, String?> =
        if (platform != null) key to platform else fallback to null

    if (action.kind == "review") {
        return if (action.attributed == true) {
            withPlatform(R.string.place_action_review_on, R.string.place_action_review)
        } else {
            withPlatform(R.string.place_action_review_search_on, R.string.place_action_review_search_generic)
        }
    }
    if (action.urlKind == "search") {
        return when (action.kind) {
            "booking", "reservation" -> withPlatform(R.string.place_action_booking_search_on, R.string.place_action_search_generic)
            "ticket" -> withPlatform(R.string.place_action_ticket_search_on, R.string.place_action_search_generic)
            else -> withPlatform(R.string.place_action_search_on, R.string.place_action_search_generic)
        }
    }
    val res = when (action.kind) {
        "maps" -> R.string.place_action_maps
        "directions" -> R.string.place_action_directions
        "website" -> R.string.place_action_website
        "call" -> R.string.place_action_call
        "order" -> R.string.place_action_order
        "delivery" -> R.string.place_action_delivery
        "booking" -> R.string.place_action_booking
        "reservation" -> R.string.place_action_reservation
        "ticket" -> R.string.place_action_ticket
        "purchase" -> R.string.place_action_purchase
        "social" -> R.string.place_action_social
        else -> R.string.place_action_website
    }
    return res to null
}

@Composable
private fun actionLabel(action: PlaceCardAction): String {
    val (res, arg) = actionLabelSpec(action)
    return if (arg != null) stringResource(res, arg) else stringResource(res)
}

/** A URL's identity for de-duplication: the same page with a different query is the same page. */
internal fun urlKey(url: String): String = url.substringBefore('?')

/**
 * Web parity (`ChatInterface.tsx`): a model-written `[CTA_BUTTONS]` entry that points at a page a
 * card already offers is a duplicate button, and is dropped. Pure render-time filtering — the
 * message keeps every button it was given.
 */
internal fun ctaButtonsOutsideCards(
    buttons: List<CtaButton>,
    places: List<PlaceCardView>,
    mapsSearchUrl: String?,
): List<CtaButton> {
    if (places.isEmpty() && mapsSearchUrl == null) return buttons
    val cardUrls = buildSet {
        places.forEach { p -> p.actions.forEach { add(urlKey(it.url)) } }
        mapsSearchUrl?.let { add(urlKey(it)) }
    }
    return buttons.filterNot { it.url.isNotBlank() && urlKey(it.url) in cardUrls }
}

// ── The facts one card shows (pure — what the composable draws, and nothing else) ───────────

/** A chip on the card: an amenity the provider stated (worded by the client) or a raw provider category. */
sealed class PlaceChip {
    data class Amenity(val flag: String) : PlaceChip()
    data class Category(val name: String) : PlaceChip()
}

/**
 * Everything a card renders, as data. The composable maps each field to exactly one row, so a
 * test that reads this knows what the user sees; a field that is null draws nothing.
 *
 * The mapping is web `PlaceCard`'s, row for row: rating with its count; a hotel class only when
 * there is no guest rating; address; hours and/or the open state; price band and/or distance;
 * amenity chips then at most two category chips; the trade-off; the grouped actions.
 */
data class PlaceCardFacts(
    val name: String,
    /** 1-based position in the SERVER's list, or null when the set was not ranked. */
    val rankLabel: Int?,
    val lead: Boolean,
    val popular: Boolean,
    val image: String?,
    val rating: Double?,
    /** Shown only next to a rating, as on web. */
    val ratingCount: Int?,
    /** Shown only when there is no rating, as on web. */
    val stars: Int?,
    /** TappyAI's own aggregate — a second, labelled rating (web `tappy-rating`). */
    val tappyRating: LiveTappyRating?,
    val address: String?,
    /** The number as information, beside the dialler (web `place-phone`). */
    val phone: String?,
    val openingHours: String?,
    val openNow: Boolean?,
    val priceBand: String?,
    val distanceKm: Double?,
    /** The provider's own band, a plain fact (web `price-range-text`). */
    val priceRangeText: String?,
    /** A snippet price, always hedged as a reference (web `referencePrice`). */
    val priceSignal: String?,
    val chips: List<PlaceChip>,
    /** The ranker's positive case, joined like web: "Vì sao: a · b". */
    val reasons: List<String>,
    val tradeOff: String?,
    val actions: GroupedActions,
)

internal fun placeCardFacts(place: PlaceCardView, position: Int, ranked: Boolean): PlaceCardFacts {
    val lead = ranked && position == 0
    val amenities = place.flags.filter { it == "wifi" || it == "outdoorSeating" || it == "vegetarian" }
    return PlaceCardFacts(
        name = place.name,
        rankLabel = if (ranked) position + 1 else null,
        lead = lead,
        popular = lead && (place.ratingCount ?: 0) >= POPULAR_MIN_RATINGS,
        image = place.image?.takeIf { it.isNotBlank() },
        rating = place.rating,
        ratingCount = if (place.rating != null) place.ratingCount else null,
        stars = if (place.rating == null) place.stars else null,
        tappyRating = place.tappyRating,
        address = place.address?.takeIf { it.isNotBlank() },
        phone = place.phone?.takeIf { it.isNotBlank() },
        openingHours = place.openingHours?.takeIf { it.isNotBlank() },
        openNow = place.openNow,
        priceBand = priceBand(place.priceLevel),
        distanceKm = place.distanceKm,
        priceRangeText = place.priceRangeText?.takeIf { it.isNotBlank() },
        priceSignal = place.priceSignal?.takeIf { it.isNotBlank() },
        chips = amenities.map { PlaceChip.Amenity(it) } +
            place.categories.filter { it.isNotBlank() }.take(CATEGORY_CHIPS).map { PlaceChip.Category(it) },
        reasons = place.reasons.filter { it.isNotBlank() },
        tradeOff = place.tradeOff?.takeIf { it.isNotBlank() },
        actions = groupActions(place.actions),
    )
}

// ── The section ─────────────────────────────────────────────────────────────────────────────

/** How much of the next card shows beside the current one — the hint that there is one. */
private val PAGE_PEEK = 36.dp

/**
 * The turn's place decision: filter chips, the merchant pager, its position dots, the map CTA.
 *
 * Empty in, nothing out: a turn that carried no places renders no frame at all rather than an
 * empty section. [ranked] is the server's `ranked` flag — false means the order is the
 * provider's and no position means anything, so no "#N" is printed. [mapsSearchUrl] is the
 * server-built "see everything on the map" destination; the durable payload does not carry one.
 */
@Composable
fun PlaceDecisionSection(
    places: List<PlaceCardView>,
    ranked: Boolean,
    mapsSearchUrl: String?,
    modifier: Modifier = Modifier,
) {
    if (places.isEmpty()) return
    val context = LocalContext.current
    val filters = remember(places) { placeFilters(places) }
    var activeId by rememberSaveable(places) { mutableStateOf(PlaceFilterId.All) }
    val active = filters.firstOrNull { it.id == activeId } ?: filters.first()
    val pages = remember(places, active) { carouselPlaces(places, active) }
    // The pager reads the CURRENT page list: a chip changes it, and a state built over the first
    // list would keep counting pages that no longer exist.
    val currentPages = rememberUpdatedState(pages)
    val pagerState = rememberPagerState(pageCount = { currentPages.value.size })
    // A chip restarts the carousel at its first admitted merchant. The chip itself survives
    // recomposition and configuration changes (rememberSaveable above).
    LaunchedEffect(active.id) { if (pagerState.currentPage != 0) pagerState.scrollToPage(0) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        if (showsFilterRow(places, filters)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                filters.forEach { f ->
                    FilterChip(
                        label = filterLabel(f.id, places.size),
                        selected = f.id == active.id,
                        onClick = { activeId = f.id },
                    )
                }
            }
        }

        if (pages.isNotEmpty()) {
            HorizontalPager(
                state = pagerState,
                // A stable identity per merchant, so a chip that removes page 0 does not hand
                // page 0's state to whoever moves into its slot.
                key = { page -> pages[page].let { "${it.rank}:${it.name}" } },
                pageSpacing = TappySpacing.sm,
                contentPadding = PaddingValues(end = if (pages.size > 1) PAGE_PEEK else 0.dp),
                verticalAlignment = Alignment.Top,
                modifier = Modifier.fillMaxWidth(),
            ) { page ->
                val place = pages[page]
                // "#N" is the position in the SERVER's list, not in the filtered one: hiding #1
                // behind a chip does not promote #2.
                PlaceCard(facts = placeCardFacts(place, position = places.indexOf(place), ranked = ranked))
            }
            if (pages.size > 1) {
                PagerDots(count = pages.size, current = pagerState.currentPage)
            }
        }

        if (!mapsSearchUrl.isNullOrBlank()) {
            ExploreMapFooter(onClick = { openUrl(context, mapsSearchUrl) })
        }
    }
}

@Composable
private fun PagerDots(count: Int, current: Int) {
    val colors = MaterialTheme.colorScheme
    val position = stringResource(R.string.place_pager_position, current + 1, count)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = position },
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(count) { i ->
            Box(
                modifier = Modifier
                    .size(if (i == current) 8.dp else 6.dp)
                    .clip(CircleShape)
                    .background(if (i == current) colors.primary else colors.outlineVariant),
            )
        }
    }
}

@Composable
private fun filterLabel(id: PlaceFilterId, total: Int): String = when (id) {
    PlaceFilterId.All -> stringResource(R.string.place_filter_all, total)
    PlaceFilterId.Open -> stringResource(R.string.place_filter_open)
    PlaceFilterId.Rated -> stringResource(R.string.place_filter_rated)
    PlaceFilterId.Wifi -> stringResource(R.string.place_card_flag_wifi)
    PlaceFilterId.Outdoor -> stringResource(R.string.place_card_flag_outdoor)
    PlaceFilterId.Vegetarian -> stringResource(R.string.place_card_flag_vegetarian)
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
        color = if (selected) colors.onPrimary else colors.onSurfaceVariant,
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(if (selected) colors.primary else colors.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
    )
}

@Composable
private fun ExploreMapFooter(onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .border(1.dp, colors.outlineVariant, TappyShapes.card)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Map, contentDescription = null, tint = colors.primary, modifier = Modifier.size(20.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.place_explore_map),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = colors.primary,
            )
            Text(
                text = stringResource(R.string.place_explore_map_hint),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
            )
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
}

private fun openUrl(context: android.content.Context, url: String) {
    // A URL the server built. A device with nothing able to open it is not worth a crash on a
    // card the user can still read.
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}

// ── One card ────────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlaceCard(facts: PlaceCardFacts) {
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(colors.surface)
            .border(1.dp, if (facts.lead) colors.primary.copy(alpha = 0.6f) else colors.outlineVariant, TappyShapes.card)
            // One TalkBack node per card, assembled from the child Text nodes, which are already
            // localised where they are read.
            .semantics(mergeDescendants = true) {},
    ) {
        // ── Photo with the rank and popular badges laid over it (web parity) ──
        Box(modifier = Modifier.fillMaxWidth()) {
            if (facts.image != null) {
                TappyImage(
                    url = facts.image,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                )
            } else {
                // No photo collapses to a thin band rather than a grey box pretending something
                // is still loading.
                Box(modifier = Modifier.fillMaxWidth().height(TappySpacing.md))
            }
            facts.rankLabel?.let { rank ->
                Text(
                    text = stringResource(R.string.place_rank, rank),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(TappySpacing.sm)
                        .clip(TappyShapes.chip)
                        .background(Color.Black.copy(alpha = 0.7f))
                        .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                )
            }
            if (facts.popular) {
                Text(
                    text = "🔥 " + stringResource(R.string.place_card_popular),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(TappySpacing.sm)
                        .clip(TappyShapes.chip)
                        .background(tappyCategoryColors.amber.accent.copy(alpha = 0.9f))
                        .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                )
            }
        }

        Column(
            modifier = Modifier.padding(TappySpacing.md),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(
                text = facts.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = colors.onSurface,
            )

            // Rating with its count; a hotel CLASS only when there is no guest rating, so a
            // 5-star hotel can never read as a 5.0 review score (web parity).
            facts.rating?.let { rating ->
                FactRow(icon = Icons.Filled.Star, tint = tappyCategoryColors.amber.accent) {
                    Text(
                        // Web prints `{rating}` with JS String(): 4.9 → "4.9", 5 → "5", never "5.0".
                        text = numberText(rating),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = colors.onSurface,
                    )
                    facts.ratingCount?.let { count ->
                        Text(
                            text = "(" + stringResource(R.string.place_card_rating_count, count) + ")",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
            }
            facts.stars?.let { stars ->
                FactRow(icon = Icons.Filled.Star, tint = tappyCategoryColors.amber.accent) {
                    Text(
                        text = stringResource(R.string.place_card_stars, stars),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = colors.onSurface,
                    )
                }
            }

            facts.tappyRating?.let { tr ->
                FactRow(icon = Icons.Filled.Star, tint = colors.primary) {
                    Text(
                        text = stringResource(R.string.place_card_tappy_rating, numberText(tr.avg), tr.count),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = colors.onSurface,
                    )
                }
            }

            facts.address?.let {
                FactRow(icon = Icons.Filled.Place) {
                    // The whole address, wrapped — web wraps it too; a cut address is a wrong address.
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                    )
                }
            }

            // The number itself, not only the dialler: it is what a user copies or reads out.
            facts.phone?.let {
                FactRow(icon = Icons.Filled.Phone) {
                    Text(text = it, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                }
            }

            // Hours and the open/closed state share a line, and either half may be missing.
            if (facts.openingHours != null || facts.openNow != null) {
                FactRow(icon = Icons.Filled.Schedule) {
                    facts.openingHours?.let { hours ->
                        // Google sends the whole week ("Thứ Hai: 08:00–21:30; Thứ Ba: …"); web prints it
                        // verbatim and so does this — clipping hours would hide the day the user asked about.
                        Text(
                            text = hours,
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.onSurfaceVariant,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                    facts.openNow?.let { open ->
                        Text(
                            text = (if (facts.openingHours != null) "· " else "") +
                                stringResource(if (open) R.string.place_card_open_now else R.string.place_card_closed_now),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = if (open) tappyCategoryColors.green.accent else colors.onSurfaceVariant,
                        )
                    }
                }
            }

            val distance = facts.distanceKm?.let { stringResource(R.string.place_card_away, it.toString()) }
            if (facts.priceBand != null || distance != null) {
                Text(
                    text = listOfNotNull(facts.priceBand, distance).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                )
            }

            // The provider's own band — a structured fact, shown plainly.
            facts.priceRangeText?.let {
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            }
            // A price seen in a search snippet: labelled as a reference, because that is what it is.
            facts.priceSignal?.let {
                Text(
                    text = stringResource(R.string.place_card_reference_price) + ": " + it,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                )
            }

            // Amenities the provider stated, then provider categories — the same chips web draws.
            // The server sends flag KEYS; the wording is the client's. Categories are the
            // provider's strings, verbatim, as on web.
            if (facts.chips.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    modifier = Modifier.padding(top = 2.dp),
                ) {
                    facts.chips.forEach { chip ->
                        Text(
                            text = when (chip) {
                                is PlaceChip.Amenity -> amenityLabel(chip.flag)
                                is PlaceChip.Category -> chip.name
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = colors.onSurfaceVariant,
                            modifier = Modifier
                                .clip(TappyShapes.pill)
                                .border(1.dp, colors.outlineVariant, TappyShapes.pill)
                                .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                        )
                    }
                }
            }

            // WHY this one — the ranker's positive case, joined exactly as web joins it.
            if (facts.reasons.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.place_card_why) + ": " + facts.reasons.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = tappyCategoryColors.green.accent,
                )
            }

            // The honest half of a recommendation: what it costs you.
            facts.tradeOff?.let {
                Text(
                    text = stringResource(R.string.place_card_trade_off) + ": " + it,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.tertiary,
                )
            }
        }

        // ── Actions: map leads full-width, ordering follows, the rest are secondary ──
        val grouped = facts.actions
        if (grouped.maps != null || grouped.orders.isNotEmpty() || grouped.others.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = TappySpacing.md, end = TappySpacing.md, bottom = TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                grouped.maps?.let { maps ->
                    ActionButton(
                        label = actionLabel(maps),
                        icon = Icons.Filled.Map,
                        border = colors.outlineVariant,
                        tint = colors.onSurface,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { openUrl(context, maps.url) },
                    )
                }
                if (grouped.orders.isNotEmpty()) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    ) {
                        grouped.orders.forEach { a ->
                            ActionButton(
                                label = actionLabel(a),
                                icon = Icons.Filled.Restaurant,
                                border = tappyCategoryColors.red.accent.copy(alpha = 0.6f),
                                tint = tappyCategoryColors.red.accent,
                                onClick = { openUrl(context, a.url) },
                            )
                        }
                    }
                }
                if (grouped.others.isNotEmpty()) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    ) {
                        grouped.others.forEach { a ->
                            ActionButton(
                                label = actionLabel(a),
                                icon = if (a.kind == "call") Icons.Filled.Call else null,
                                border = colors.outlineVariant,
                                tint = colors.onSurface,
                                onClick = { openUrl(context, a.url) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun amenityLabel(flag: String): String = when (flag) {
    "wifi" -> stringResource(R.string.place_card_flag_wifi)
    "outdoorSeating" -> stringResource(R.string.place_card_flag_outdoor)
    else -> stringResource(R.string.place_card_flag_vegetarian)
}

@Composable
private fun FactRow(
    icon: ImageVector,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        content()
    }
}

@Composable
private fun ActionButton(
    label: String,
    icon: ImageVector?,
    border: Color,
    tint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(TappyShapes.chip)
            .border(1.dp, border, TappyShapes.chip)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        }
        Text(text = label, style = MaterialTheme.typography.labelLarge, color = tint)
    }
}

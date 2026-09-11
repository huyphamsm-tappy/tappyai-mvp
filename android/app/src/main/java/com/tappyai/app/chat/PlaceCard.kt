package com.tappyai.app.chat

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * The DURABLE place card on Android — the counterpart of web's `PlaceDecision.tsx`.
 *
 * A PORT of proven behaviour, not a redesign. It renders what the server already decided and
 * states nothing of its own:
 *
 *   - every row is conditional on the server having supplied the value. A place the source knew
 *     only a name and a map link for renders a name and a map button — not a card full of empty
 *     rows, and never a placeholder standing in for a fact. The server stopped writing its
 *     "unknown" sentence into the payload for exactly this reason, so an absent field here is
 *     genuinely absent;
 *   - ordering is the server's `rank`. Nothing is re-sorted, re-scored or re-grouped on the client;
 *   - "Popular" appears only where web puts it — the top-ranked place with enough ratings for the
 *     word to mean something — so the two platforms cannot disagree about which place is popular.
 *
 * WHY SOME DURABLE CARDS ARE THINNER THAN THE LIVE ONE. The live rail is built from the `8:`
 * annotation, which is never stored; this card is built from the message text, which is. Google
 * Places content must not be stored, so a Google-sourced row persists only its identifiers and our
 * own derived values (`mayPersist` on the server). That is a licensing outcome, not a bug, and it
 * must never be "fixed" here by re-fetching or by inventing a value.
 */
private const val POPULAR_MIN_RATINGS = 100

/** Web parity: `priceBand` in PlaceDecision.tsx — one to four symbols, or nothing at all. */
internal fun priceBand(level: Int?): String? =
    if (level == null || level < 1 || level > 4) null else "đ".repeat(level)

/**
 * The user-facing label for an action.
 *
 * The server sends a `labelKey` (`v3.action.maps`), not a sentence, so the label is localised on
 * the device that renders it — the same contract web resolves through its `w5/placeDecision`
 * catalogue. A key this app version has never seen falls back to a generic "Open" rather than
 * rendering the raw key, which is what a missing dictionary entry looked like on web.
 */
@Composable
private fun actionLabel(action: PlaceCardAction): String {
    val platform = action.platform
    if (action.urlKind == "search" && !platform.isNullOrBlank()) {
        return stringResource(R.string.place_action_search_on, platform)
    }
    return when (action.labelKey.substringAfterLast('.')) {
        "maps" -> stringResource(R.string.place_action_maps)
        "directions" -> stringResource(R.string.place_action_directions)
        "website" -> stringResource(R.string.place_action_website)
        "order", "orderSearch" -> stringResource(R.string.place_action_order)
        "delivery" -> stringResource(R.string.place_action_delivery)
        "booking", "bookingSearch" -> stringResource(R.string.place_action_booking)
        "reservation" -> stringResource(R.string.place_action_reservation)
        "ticket", "ticketSearch" -> stringResource(R.string.place_action_ticket)
        "call" -> stringResource(R.string.place_action_call)
        "review", "reviewOn", "reviewSearch", "reviewSearchGeneric" ->
            stringResource(R.string.place_action_review)
        "social" -> stringResource(R.string.place_action_social)
        "searchGeneric", "searchOn" -> stringResource(R.string.place_action_search_generic)
        else -> stringResource(R.string.place_action_open)
    }
}

/**
 * The turn's durable places, best first.
 *
 * Empty in, nothing out: a turn that carried no block, or a block whose payload could not be
 * decoded, renders no frame at all rather than an empty card.
 */
@Composable
fun PlaceCards(places: List<PlaceCardView>, modifier: Modifier = Modifier) {
    if (places.isEmpty()) return
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        places.forEach { place -> PlaceCard(place) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlaceCard(place: PlaceCardView) {
    val context = LocalContext.current
    val name = place.name

    val popular = place.rank == 0 && (place.ratingCount ?: 0) >= POPULAR_MIN_RATINGS
    val band = priceBand(place.priceLevel)
    // Web groups the same three ways: the map button leads, the rest follow. An action with no URL
    // is not a button — it is a lie, and the live projection drops it for the same reason.
    val usable = place.actions.filter { it.url.isNotBlank() }
    val maps = usable.firstOrNull { it.kind == "maps" || it.kind == "directions" }
    val rest = usable.filter { it !== maps }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, TappyShapes.card)
            // One TalkBack node per card, assembled from the child Text nodes, which are already
            // localised where they are read.
            .semantics(mergeDescendants = true) {},
    ) {
        if (!place.image.isNullOrBlank()) {
            TappyImage(
                url = place.image,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
            )
        }

        Column(
            modifier = Modifier.padding(TappySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (popular) {
                    Text(
                        text = stringResource(R.string.place_card_popular),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            // Web parity: a hotel CLASS is shown only when there is no guest rating, so a 5-star
            // hotel can never read as a 5.0 review score.
            if (place.rating == null) {
                place.stars?.let { stars ->
                    Text(
                        text = stringResource(R.string.place_card_stars, stars),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            place.rating?.let { rating ->
                val count = place.ratingCount
                Text(
                    text = if (count != null) {
                        rating.toString() + " · " + stringResource(R.string.place_card_rating_count, count)
                    } else {
                        rating.toString()
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            place.address?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Hours and the open/closed state share a line, and either half may be missing.
            val hours = place.openingHours?.takeIf { it.isNotBlank() }
            val openState = place.openNow?.let {
                stringResource(if (it) R.string.place_card_open_now else R.string.place_card_closed_now)
            }
            if (hours != null || openState != null) {
                Text(
                    text = listOfNotNull(hours, openState).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            val distance = place.distanceKm?.let {
                stringResource(R.string.place_card_away, it.toString())
            }
            if (band != null || distance != null) {
                Text(
                    text = listOfNotNull(band, distance).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // A price seen in a search snippet. Labelled as REFERENCE, because that is what it is:
            // presenting weak evidence as the place's price is the defect the label exists to stop.
            place.priceSignal?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = stringResource(R.string.place_card_reference_price) + ": " + it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Amenities the provider stated, then provider categories — the same row and the same
            // order web builds. The server sends flag KEYS; the wording is the client's, so an
            // unknown key is dropped rather than printed raw.
            val amenities = place.flags.mapNotNull { flag ->
                when (flag) {
                    "wifi" -> stringResource(R.string.place_card_flag_wifi)
                    "outdoorSeating" -> stringResource(R.string.place_card_flag_outdoor)
                    "vegetarian" -> stringResource(R.string.place_card_flag_vegetarian)
                    else -> null
                }
            }
            val chips = amenities + place.categories.take(2)
            if (chips.isNotEmpty()) {
                Text(
                    text = chips.joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Why the server ranked it here. Shown only when it said so — a card never writes its
            // own reason, which is the rule the whole decision layer is built on.
            place.reasons.forEach { reason ->
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // The honest half of a recommendation: what it costs you.
            place.tradeOff?.let {
                Text(
                    text = stringResource(R.string.place_card_trade_off) + ": " + it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
        }

        if (maps != null || rest.isNotEmpty()) {
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = TappySpacing.lg, end = TappySpacing.lg, bottom = TappySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                listOfNotNull(maps).plus(rest).forEach { action ->
                    Text(
                        text = actionLabel(action),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier
                            .clip(TappyShapes.chip)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, TappyShapes.chip)
                            .clickable {
                                // A URL the server built. A device with nothing able to open it is
                                // not worth a crash on a card the user can still read.
                                runCatching {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(action.url)))
                                }
                            }
                            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
                    )
                }
            }
        }
    }
}

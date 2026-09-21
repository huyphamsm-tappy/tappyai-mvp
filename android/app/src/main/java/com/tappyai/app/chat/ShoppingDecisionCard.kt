package com.tappyai.app.chat

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.tappyai.core.common.formatCompactVnd
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * D1 — the shopping DECISION on Android.
 *
 * Android used to strip `[TAPPY_SHOPPING]` and render nothing, so a mobile user on a shopping turn
 * silently lost the recommendation, the price ranges, the match verdicts and every alternative.
 * This is the Kotlin counterpart of web's `ShoppingDecision.tsx`, and it is a PORT of that proven
 * behaviour rather than a redesign (DD-008: Extract → Generalise → Improve):
 *
 *   • it renders the DECISION, not a catalogue — one recommended configuration leads, and the
 *     alternatives stay as compact rows so a valid option is never hidden;
 *   • it groups NOTHING and infers NOTHING: every config label, price range, verdict and reason is
 *     read straight from the server's view;
 *   • a value the server did not supply renders as an explicit "chưa rõ", never as a fabricated
 *     number and never as a blank.
 *
 * Spacing uses the values the design system already ships (V3_SPACING_TOKEN_AUDIT.md — OD-5 is
 * held, so this file resolves VALUES through `TappySpacing` rather than assuming a token name means
 * the same thing it means on iOS).
 */
@Composable
fun ShoppingDecisionCard(
    view: ShoppingDecisionView,
    modifier: Modifier = Modifier,
    /**
     * Start a price watch for the recommended product.
     *
     * 🚨 WEB HAS THIS BUTTON AND ANDROID DID NOT. On web the card offers "theo dõi giá" on the
     * product it just recommended; the phone user had to know the feature existed, leave the
     * answer and type the product name again. It PREFILLS the composer with the same phrasing the
     * composer chip already uses — the user still presses send — so the request goes through the
     * shipped `save_price_watch` tool with its permission, argument and audit steps. No second
     * write path, and nothing is saved by pressing a button on a card.
     *
     * Optional: a host that has no composer (previews, tests) omits it and no button renders.
     */
    onPriceWatch: ((String) -> Unit)? = null,
    /** Commerce handoff reporting (CCP event 6). Absent in previews and tests. */
    commerce: CommerceActionCallbacks = CommerceActionCallbacks(),
) {
    // PRODUCT IDENTITY RULE. Only an entity with a real product name (the listing title the server
    // read, `ShoppingEntityView.name`) may be shown — `config` is a spec line ("chip ? · RAM ?"),
    // and rendering it as the title showed the user a configuration as if it were a product. An
    // entity without a name is not rendered at all rather than falling back to its key, its
    // config or a seller; a payload with no named entity renders no card.
    val entities = view.entities.filter { it.displayName != null }
    if (entities.isEmpty()) return

    val recommended = entities.firstOrNull { it.recommended }
    val others = entities.filter { it !== recommended }
    val rec = view.recommendation
    // Reasons belong to the recommended entity only — a reason attached to a different entity would
    // be a claim the server did not make.
    val reasons = if (rec != null && recommended != null && rec.entityKey == recommended.key) rec.reasons else emptyList()

    Column(modifier = modifier.fillMaxWidth()) {
        if (recommended != null) {
            RecommendedEntity(entity = recommended, recommendation = rec, reasons = reasons, commerce = commerce)
        } else {
            Text(
                text = stringResource(R.string.shopping_decision_options_title),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        // The watch action belongs to the product the card recommends — offering it for a
        // configuration the server did not pick would be watching a price nobody suggested.
        val watchName = recommended?.displayName
        if (onPriceWatch != null && watchName != null) {
            Text(
                text = stringResource(R.string.shopping_decision_price_watch),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .padding(top = TappySpacing.md)
                    .clip(TappyShapes.chip)
                    .clickable { onPriceWatch(watchName) }
                    .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
            )
        }

        if (others.isNotEmpty()) {
            if (recommended != null) {
                Text(
                    text = stringResource(R.string.shopping_decision_other_options),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = TappySpacing.lg, bottom = TappySpacing.md),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                others.forEach { AlternativeEntity(it, commerce) }
            }
        }
    }
}

@Composable
private fun RecommendedEntity(
    entity: ShoppingEntityView,
    recommendation: ShoppingRecommendationView?,
    reasons: List<ShoppingReason>,
    commerce: CommerceActionCallbacks,
) {
    val colors = MaterialTheme.colorScheme
    val handoffs = entity.commerceHandoffs
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .border(1.dp, colors.primary.copy(alpha = 0.35f), TappyShapes.card)
            .background(colors.primary.copy(alpha = 0.06f))
            .padding(TappySpacing.lg),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
            entity.image?.let { url ->
                TappyImage(
                    url = url,
                    contentDescription = null, // decorative — the product name carries the meaning
                    modifier = Modifier
                        .size(72.dp)
                        .clip(TappyShapes.card),
                )
            }
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(R.string.shopping_decision_recommended).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.primary,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                    modifier = Modifier.padding(top = TappySpacing.xs),
                ) {
                    Text(
                        // The product's own name — never the config line (see ShoppingDecisionCard).
                        text = entity.displayName.orEmpty(),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    MatchBadge(entity.matchesRequest)
                }
                // The stated configuration, as the SECONDARY line it is. Empty when nothing was stated.
                entity.config.takeIf { it.isNotBlank() }?.let { config ->
                    Text(
                        text = config,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    )
                }
                Text(
                    text = priceRange(entity.priceLow, entity.priceHigh),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                    modifier = Modifier.padding(top = TappySpacing.xs),
                )
                reasons.forEach { r ->
                    Text(
                        text = "· ${r.evidence}",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    )
                }
                recommendation?.tradeOff?.let { t ->
                    Text(
                        text = "${stringResource(R.string.shopping_decision_trade_off)}: ${t.evidence}",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.tertiary,
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    )
                }
                if (recommendation?.conditional == true) {
                    Text(
                        text = stringResource(R.string.shopping_decision_conditional),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    )
                }
            }
        }

        // The merchant handoffs the Commerce Capability Platform resolved for this product (web
        // parity, components/chat/ShoppingDecision.tsx): DETAIL links are the buttons, the
        // marketplaces' searches only stand in when no detail link exists. Seller offer rows (a
        // Google Shopping redirect each) are kept only while no verified merchant handoff exists.
        CommerceHandoffRow(handoffs, commerce, emphasised = true)
        if (handoffs.detail.isEmpty()) entity.offers.forEach { OfferRow(it) }
    }
}

/**
 * The Shopping card's commerce handoffs — the SAME action the live place card renders, through
 * the same label resolver ("Mua trên Điện Máy Xanh", with the login boundary stated when the
 * merchant has one) and the same handoff beacon (opaque ids only). Nothing here composes a URL.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommerceHandoffRow(handoffs: ShoppingCommerceHandoffs, commerce: CommerceActionCallbacks, emphasised: Boolean) {
    if (handoffs.isEmpty) return
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme
    val actions = (handoffs.detail + handoffs.search).map { it.asPlaceCardAction() }
    LaunchedEffect(actions) { actions.forEach { a -> a.commerce?.let(commerce.onRendered) } }
    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        actions.forEach { action ->
            val detail = action.urlKind == "direct"
            Text(
                text = actionLabel(action),
                style = if (emphasised && detail) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelMedium,
                fontWeight = if (detail) FontWeight.SemiBold else FontWeight.Medium,
                color = if (detail) colors.primary else colors.onSurfaceVariant,
                modifier = Modifier
                    .clip(TappyShapes.chip)
                    .then(if (detail) Modifier.border(1.dp, colors.primary.copy(alpha = 0.35f), TappyShapes.chip) else Modifier)
                    .clickable { commerce.onCardTap("shopping"); openPlaceAction(context, action, commerce) }
                    .padding(horizontal = if (detail) TappySpacing.lg else TappySpacing.sm, vertical = TappySpacing.sm),
            )
        }
    }
}

@Composable
private fun AlternativeEntity(entity: ShoppingEntityView, commerce: CommerceActionCallbacks) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .border(1.dp, colors.outlineVariant, TappyShapes.card)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = entity.displayName.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = colors.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            MatchBadge(entity.matchesRequest)
        }
        entity.config.takeIf { it.isNotBlank() }?.let { config ->
            Text(
                text = config,
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = TappySpacing.xs),
            )
        }
        Text(
            text = priceRange(entity.priceLow, entity.priceHigh),
            style = MaterialTheme.typography.bodySmall,
            color = colors.onSurfaceVariant,
            modifier = Modifier.padding(top = TappySpacing.xs),
        )
        CommerceHandoffRow(entity.commerceHandoffs, commerce, emphasised = false)
    }
}

/**
 * The match verdict.
 *
 * Colour is never the only carrier of meaning (V3_DESIGN_SYSTEM.md §2.4) — the badge always shows
 * its label as text, so the verdict survives greyscale, colour blindness and TalkBack alike.
 */
@Composable
private fun MatchBadge(match: String) {
    val colors = MaterialTheme.colorScheme
    val (labelRes, tint) = when (match) {
        ShoppingMatch.EXACT -> R.string.shopping_decision_match_exact to colors.primary
        ShoppingMatch.DIFFERENT -> R.string.shopping_decision_match_different to colors.tertiary
        else -> R.string.shopping_decision_match_unknown to colors.onSurfaceVariant
    }
    Text(
        text = stringResource(labelRes),
        style = MaterialTheme.typography.labelSmall,
        color = tint,
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
    )
}

/** One seller's offer. Opens the listing; a missing price says so rather than showing nothing. */
@Composable
private fun OfferRow(offer: ShoppingOfferView) {
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme
    val seller = offer.seller ?: stringResource(R.string.shopping_decision_unknown_seller)
    val price = offer.price?.let { formatCompactVnd(it.toLong()) }
        ?: stringResource(R.string.shopping_decision_no_price)
    val viewLabel = stringResource(R.string.shopping_decision_view)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (offer.url != null) {
                    Modifier.clickable {
                        runCatching {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(offer.url)))
                        }
                    }
                } else Modifier,
            )
            // One TalkBack node per offer ("CellphoneS · 18.9 triệu · Xem") built from the child
            // Text nodes, rather than a hand-assembled contentDescription. The strings are already
            // localised where they are read; re-stating them here would be a second place to
            // forget to translate, which is what `androidHardcodedUiStrings` guards against.
            .semantics(mergeDescendants = true) {}
            .padding(top = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (offer.condition != null) "$seller · ${offer.condition}" else seller,
            style = MaterialTheme.typography.bodySmall,
            color = colors.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = price,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = colors.onSurface,
        )
        if (offer.url != null) {
            Text(
                text = viewLabel,
                style = MaterialTheme.typography.bodySmall,
                color = colors.primary,
            )
        }
    }
}

/**
 * A price range, or an explicit "unknown".
 *
 * Exposed for testing because this is where the honesty rule is easiest to break: returning an
 * empty string, a "0đ", or a low bound alone would each be a claim the server never made.
 */
internal fun priceRangeText(low: Double?, high: Double?, unknown: String): String = when {
    low != null && high != null && low != high ->
        "${formatCompactVnd(low.toLong())} – ${formatCompactVnd(high.toLong())}"
    low != null -> formatCompactVnd(low.toLong())
    high != null -> formatCompactVnd(high.toLong())
    else -> unknown
}

@Composable
private fun priceRange(low: Double?, high: Double?): String =
    priceRangeText(low, high, stringResource(R.string.shopping_decision_no_price))

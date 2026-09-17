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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
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
import com.tappyai.core.designsystem.theme.tappyCategoryColors
import java.net.URI
import java.text.NumberFormat
import java.util.Locale

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
            RecommendedEntity(entity = recommended, recommendation = rec, reasons = reasons, showMatch = view.showsMatchBadge)
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
                others.forEach { AlternativeEntity(it, showMatch = view.showsMatchBadge) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecommendedEntity(
    entity: ShoppingEntityView,
    recommendation: ShoppingRecommendationView?,
    reasons: List<ShoppingReason>,
    showMatch: Boolean,
) {
    val colors = MaterialTheme.colorScheme
    val featured = featuredOffer(entity, recommendation)
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
                    // A verdict is meaningless without a request to match (web `showMatch`).
                    if (showMatch) MatchBadge(entity.matchesRequest)
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
                // The stated specs and the seller's condition, as chips — the same information web
                // draws under the title. Only what the listing stated; a spec with no value is skipped.
                val chips = entity.specs.mapNotNull { specLabel(it) } + listOfNotNull(entity.condition?.let { conditionLabel(it) })
                if (chips.isNotEmpty()) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    ) {
                        chips.forEach { chip ->
                            Text(
                                text = chip,
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
                Text(
                    text = priceRange(entity.priceLow, entity.priceHigh),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                    modifier = Modifier.padding(top = TappySpacing.xs),
                )
                // The featured listing's own rating, said as web says it: "4.7 · 339 đánh giá".
                featured?.rating?.let { rating ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    ) {
                        Icon(Icons.Filled.Star, contentDescription = null, tint = tappyCategoryColors.amber.accent, modifier = Modifier.size(14.dp))
                        Text(
                            text = ratingLine(rating, featured.ratingCount),
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
                reasons.forEach { r ->
                    Text(
                        text = "· ${reasonText(r)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                        modifier = Modifier.padding(top = TappySpacing.xs),
                    )
                }
                recommendation?.tradeOff?.let { t ->
                    Text(
                        text = "${stringResource(R.string.shopping_decision_trade_off)}: ${reasonText(t)}",
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

        entity.offers.forEach { OfferRow(it) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AlternativeEntity(entity: ShoppingEntityView, showMatch: Boolean) {
    val colors = MaterialTheme.colorScheme
    val context = LocalContext.current
    // Web `AlternativeRow`: the first listing is the row's offer — its seller, its rating, its link.
    val offer = entity.offers.firstOrNull()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .border(1.dp, colors.outlineVariant, TappyShapes.card)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        entity.image?.let { url ->
            TappyImage(
                url = url,
                contentDescription = null, // decorative — the product name carries the meaning
                modifier = Modifier
                    .size(56.dp)
                    .clip(TappyShapes.card),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
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
            if (showMatch) MatchBadge(entity.matchesRequest)
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
        // Price · seller · ★ rating — the facts web puts on one line under the name.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            modifier = Modifier.padding(top = TappySpacing.xs),
        ) {
            Text(
                text = priceRange(entity.priceLow, entity.priceHigh),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = colors.onSurface,
            )
            offer?.seller?.let { seller ->
                Text(
                    text = seller,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
            offer?.rating?.let { rating ->
                Icon(Icons.Filled.Star, contentDescription = null, tint = tappyCategoryColors.amber.accent, modifier = Modifier.size(12.dp))
                Text(
                    text = ratingLine(rating, offer.ratingCount),
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.onSurfaceVariant,
                )
            }
        }
        val chips = entity.specs.mapNotNull { specLabel(it) } + listOfNotNull(entity.condition?.let { conditionLabel(it) })
        if (chips.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                modifier = Modifier.padding(top = TappySpacing.xs),
            ) {
                chips.forEach { chip ->
                    Text(
                        text = chip,
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
        offer?.url?.let { url ->
            Text(
                text = offerActionLabel(offerDestination(url, offer.seller)),
                style = MaterialTheme.typography.labelLarge,
                color = colors.primary,
                modifier = Modifier
                    .padding(top = TappySpacing.xs)
                    .clip(TappyShapes.chip)
                    .clickable { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
                    .padding(vertical = TappySpacing.xs),
            )
        }
        }
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
    val price = offer.price?.let { formatVndShort(it, Locale.getDefault()) }
        ?: stringResource(R.string.shopping_decision_no_price)
    // Web `offerActionLabel`: a search page says "Tìm trên Google", another site's product page
    // says "Xem trên X", the seller's own page just "Xem".
    val viewLabel = offerActionLabel(offerDestination(offer.url, offer.seller))

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
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = if (offer.condition != null) "$seller · ${offer.condition}" else seller,
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            // This listing's rating, beside the seller it belongs to (web `OfferRow`).
            offer.rating?.let { rating ->
                Icon(Icons.Filled.Star, contentDescription = null, tint = tappyCategoryColors.amber.accent, modifier = Modifier.size(12.dp))
                Text(
                    text = numberText(rating),
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.onSurfaceVariant,
                )
            }
        }
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
internal fun priceRangeText(low: Double?, high: Double?, unknown: String, locale: Locale = Locale.getDefault()): String = when {
    low != null && high != null && low != high ->
        "${formatVndShort(low, locale)} – ${formatVndShort(high, locale)}"
    low != null -> formatVndShort(low, locale)
    high != null -> formatVndShort(high, locale)
    else -> unknown
}

/**
 * Web `formatVndShort` (src/lib/format/vndPrice.ts), the ONE price format the shopping card and
 * its reasons use: at or above a million, one rounded decimal — "1,3 triệu" / "1.3M"; below it,
 * the locale's grouped integer with the sign — "169.000₫" / "169,000₫". The deals-style
 * `formatCompactVnd` ("169k", truncated "18.9 triệu") read differently from web on the same wire
 * (five-domain E2E 2026-09-12), so it is not used here.
 */
internal fun formatVndShort(n: Double, locale: Locale): String {
    val vi = locale.language == "vi"
    if (n >= 1_000_000) {
        val millions = Math.round(n / 1_000_000 * 10) / 10.0
        val text = numberText(millions)
        return if (vi) text.replace('.', ',') + " triệu" else text + "M"
    }
    return NumberFormat.getIntegerInstance(if (vi) Locale("vi", "VN") else Locale.US).format(n.toLong()) + "₫"
}

@Composable
private fun priceRange(low: Double?, high: Double?): String =
    priceRangeText(low, high, stringResource(R.string.shopping_decision_no_price))

// ── Web parity helpers (pure where they can be, so the mapping is testable) ─────────────────

/** Web `recOffer`: the seller the recommendation names, else the first listing. */
internal fun featuredOffer(entity: ShoppingEntityView, rec: ShoppingRecommendationView?): ShoppingOfferView? =
    entity.offers.firstOrNull { rec?.seller != null && it.seller == rec.seller } ?: entity.offers.firstOrNull()

/** `4.7` stays `4.7`, `5.0` reads `5` — how web prints `String(value)`. */
internal fun numberText(n: Double): String =
    if (n == Math.floor(n) && !n.isInfinite()) n.toLong().toString() else n.toString()

/** A count with the locale's digit grouping (web `toLocaleString`). */
internal fun countText(n: Double, locale: Locale): String = NumberFormat.getIntegerInstance(locale).format(n.toLong())

/** What a reason resolves to: a sentence resource with its argument, or the engine's own words. */
data class ReasonSpec(val res: Int?, val arg: String?, val fallback: String)

/**
 * Web `reasonText`: the reason's DATA (`params`) said in the user's language, falling back to the
 * engine's English evidence only when the data is not there. Nothing is inferred — a reason
 * without params reads exactly as the engine wrote it.
 */
internal fun shoppingReasonSpec(r: ShoppingReason, locale: Locale): ReasonSpec {
    val fallback = ReasonSpec(null, null, r.evidence)
    return when (r.attribute) {
        "rating" -> r.number("value")?.let { ReasonSpec(R.string.shopping_reason_rating, numberText(it), r.evidence) } ?: fallback
        "reviewCount" -> r.number("count")?.let { ReasonSpec(R.string.shopping_reason_review_count, countText(it, locale), r.evidence) } ?: fallback
        "price" -> r.number("priceVnd")?.let { ReasonSpec(R.string.shopping_reason_price, formatVndShort(it, locale), r.evidence) } ?: fallback
        "distance" -> r.number("km")?.let { ReasonSpec(R.string.shopping_reason_distance, numberText(it), r.evidence) } ?: fallback
        "stars" -> r.number("stars")?.let { ReasonSpec(R.string.shopping_reason_stars, numberText(it), r.evidence) } ?: fallback
        "eta" -> r.number("minutes")?.let { ReasonSpec(R.string.shopping_reason_eta, numberText(it), r.evidence) } ?: fallback
        "directPage" -> ReasonSpec(R.string.shopping_reason_direct_page, null, r.evidence)
        else -> fallback
    }
}

@Composable
private fun reasonText(r: ShoppingReason): String {
    val spec = shoppingReasonSpec(r, Locale.getDefault())
    return when {
        spec.res == null -> spec.fallback
        spec.arg != null -> stringResource(spec.res, spec.arg)
        else -> stringResource(spec.res)
    }
}

/** Web `shoppingDecision.spec.{key}`: the resource for a stated spec, or null when it has no value. */
internal fun specLabelSpec(spec: ShoppingSpecView): Pair<Int, String>? {
    val value = spec.valueText ?: return null
    val res = when (spec.key) {
        "ram" -> R.string.shopping_spec_ram
        "storage" -> R.string.shopping_spec_storage
        "size" -> R.string.shopping_spec_size
        "chip" -> R.string.shopping_spec_chip
        else -> return null
    }
    return res to value
}

@Composable
private fun specLabel(spec: ShoppingSpecView): String? =
    specLabelSpec(spec)?.let { (res, value) -> stringResource(res, value) }

/** Web `shoppingDecision.condition.{key}`: a dictionary entry for a known key, else the seller's wording. */
internal fun conditionLabelRes(key: String?): Int? = when (key) {
    "dealerOfficial" -> R.string.shopping_condition_dealer_official
    "warrantyOfficial" -> R.string.shopping_condition_warranty_official
    "genuine" -> R.string.shopping_condition_genuine
    "official" -> R.string.shopping_condition_official
    "likeNew" -> R.string.shopping_condition_like_new
    "refurbished" -> R.string.shopping_condition_refurbished
    "sealed" -> R.string.shopping_condition_sealed
    "gradeHigh" -> R.string.shopping_condition_grade_high
    "used" -> R.string.shopping_condition_used
    else -> null
}

@Composable
private fun conditionLabel(c: ShoppingConditionView): String? =
    conditionLabelRes(c.key)?.let { stringResource(it) } ?: c.label.takeIf { it.isNotBlank() }

@Composable
private fun ratingLine(rating: Double, count: Int?): String =
    if (count != null) stringResource(R.string.shopping_decision_rating_line, numberText(rating), countText(count.toDouble(), Locale.getDefault()))
    else stringResource(R.string.shopping_decision_rating_only, numberText(rating))

// ── Web `OfferRow.offerDestination` / `offerActionLabel` ─────────────────────────────────────

/** Where an offer link actually goes: which platform, whether it is a product page, whether it is the seller's own. */
data class OfferDestination(val platform: String?, val direct: Boolean, val isSeller: Boolean)

private val SEARCH_PATH = Regex("/search|/tim-kiem|/catalog|/s\\b")

/**
 * Web parity: a Serper product `link` is a search-results page as often as a product page, and
 * "Xem" promises a product. The host names the platform, the path says which it is, and the
 * seller name says whether the platform IS the seller.
 */
internal fun offerDestination(url: String?, seller: String?): OfferDestination? {
    if (url.isNullOrBlank()) return null
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    val host = uri.host?.removePrefix("www.") ?: return null
    val path = uri.rawPath ?: ""
    val query = uri.rawQuery ?: ""
    val brand = host.substringBefore('.')
    val platform = brand.takeIf { it.isNotEmpty() }?.replaceFirstChar { it.uppercaseChar() }
    val normalisedSeller = (seller ?: "").lowercase().replace(Regex("[^a-z0-9]"), "")
    val isSeller = normalisedSeller.isNotEmpty() && brand.isNotEmpty() &&
        (normalisedSeller.contains(brand) || brand.contains(normalisedSeller))
    val isSearch = SEARCH_PATH.containsMatchIn(path) || query.length > 1
    val direct = !isSearch && path.trimEnd('/').length > 1
    return OfferDestination(platform, direct, isSeller)
}

internal fun offerActionLabelSpec(dest: OfferDestination?): Pair<Int, String?> = when {
    dest?.platform == null -> R.string.shopping_decision_view to null
    dest.direct && dest.isSeller -> R.string.shopping_decision_view to null
    dest.direct -> R.string.shopping_decision_view_on to dest.platform
    else -> R.string.shopping_decision_view_on_search to dest.platform
}

@Composable
private fun offerActionLabel(dest: OfferDestination?): String {
    val (res, arg) = offerActionLabelSpec(dest)
    return if (arg != null) stringResource(res, arg) else stringResource(res)
}

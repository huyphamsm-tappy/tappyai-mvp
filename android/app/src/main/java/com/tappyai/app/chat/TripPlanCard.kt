package com.tappyai.app.chat

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlin.math.roundToInt

/**
 * The `[TAPPY_PLAN]` itinerary card — an Android port of the web `TripPlanCard`
 * (`src/components/TripPlanCard.tsx`). Header (title + people/budget + share), optional day tabs
 * for multi-day trips, a timeline of category-coloured item cards (emoji, name, price, photo,
 * description, address, map/booking links), an optional cost breakdown, and a share footer.
 */
@Composable
fun TripPlanCard(plan: TripPlan, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var activeDay by remember(plan) { mutableIntStateOf(0) }
    val shareText = plan.shareText ?: "${plan.title} — ${context.getString(R.string.chat_plan_share_suffix)}"
    val share = {
        context.startActivity(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, shareText)
                },
                null,
            ),
        )
    }
    val currentDay = plan.days.getOrElse(activeDay) { plan.days.firstOrNull() }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.surface),
    ) {
        // ── Header ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.horizontalGradient(
                        listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary),
                    ),
                )
                .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = plan.title,
                    color = Color.White,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    // Web parity: the title is `line-clamp-2`, so a long one can't push the
                    // people/budget line and the share chip out of the header.
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val subtitle = buildString {
                    if ((plan.people ?: 0) > 1) append(context.getString(R.string.chat_plan_people, plan.people))
                    plan.budgetTotal?.let { append(it) }
                }
                if (subtitle.isNotBlank()) {
                    Text(
                        text = subtitle,
                        color = Color.White.copy(alpha = 0.85f),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            Row(
                modifier = Modifier
                    .clip(TappyShapes.pill)
                    .background(Color.White.copy(alpha = 0.2f))
                    .clickable(onClick = share)
                    .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Share, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                Text(
                    text = context.getString(R.string.chat_plan_share),
                    color = Color.White,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }

        // ── Day tabs (multi-day only) ──
        if (plan.days.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
            ) {
                plan.days.forEachIndexed { index, day ->
                    val selected = index == activeDay
                    Text(
                        text = day.label,
                        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier
                            .clickable { activeDay = index }
                            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm),
                    )
                }
            }
        }

        // ── Timeline ──
        val items = currentDay?.items.orEmpty()
        Column(modifier = Modifier.padding(vertical = TappySpacing.xs)) {
            items.forEachIndexed { index, item ->
                // Web parity: the timeline is `divide-y`, a hairline between consecutive entries.
                if (index > 0) HorizontalDivider(color = timelineDividerColor())
                // Web draws the gutter connector on every entry but the last (`i < items.length - 1`).
                PlanItemRow(item = item, showConnector = index < items.lastIndex)
            }
        }

        // ── Cost breakdown ──
        val breakdown = plan.costBreakdown
        if (!breakdown.isNullOrEmpty()) {
            HorizontalDivider(color = timelineDividerColor())
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                    .padding(TappySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                Text(
                    text = "💰 ${context.getString(R.string.chat_plan_cost_estimate)}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                breakdown.forEach { (label, value) ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(value, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium)
                    }
                }
                plan.budgetTotal?.let { total ->
                    // Web parity: the total sits below a `border-t`, separated from the line items.
                    HorizontalDivider(color = timelineDividerColor())
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            context.getString(R.string.chat_plan_total_estimate),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(total, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        // ── Share footer ──
        // Web parity (TripPlanCard.tsx's footer): the primary "share this itinerary" call to action
        // plus its hint line. The header chip is the compact duplicate of the same action, exactly
        // as on the web — this full-width button is the one users actually reach for.
        HorizontalDivider(color = timelineDividerColor())
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(TappySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TappyButton(
                text = context.getString(R.string.chat_plan_share_itinerary),
                onClick = share,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(14.dp)) },
            )
            Text(
                text = context.getString(R.string.chat_plan_share_hint),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** The card's hairline separator — the web's `divide-gray-50 dark:divide-gray-800/80`, shared by the
 *  between-entry dividers and the time-gutter connector (web uses the same grey for both). */
@Composable
private fun timelineDividerColor(): Color =
    MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)

/** The time gutter — the web's `w-10`. Shared by the time label and the connector's centre line so
 *  the two can never drift apart. Unchanged from the original literal, so measurement is identical. */
private val TIME_COLUMN_WIDTH = 40.dp

/** Where the connector starts: clear of the `labelSmall` time label's line box, plus the web's
 *  `mt-1.5` gap. A fixed inset keeps this a draw-time constant — reading the label's real height
 *  would couple the connector to measurement, which is exactly what this approach avoids. */
private val CONNECTOR_TOP_INSET = 22.dp

/** The web's `min-h-4` floor — shorter than this and the connector is not drawn at all. */
private val CONNECTOR_MIN_LENGTH = 16.dp

/** The web's `w-px`, matched to the divider thickness the rest of the card uses. */
private val CONNECTOR_THICKNESS = 1.dp

/**
 * Width kept back from the price pill for the place name beside it.
 *
 * The pill carries no weight, so [Row] measures it before the weighted name group and offers it
 * the whole row. The model does not always write a price as a price — it writes
 * "~450.000 VND (2 người, 2 tô phở + nước)" — and on a 360dp phone that measured 428px of a 487px
 * row, leaving the name about 20px. No word fits in 20px, so Compose fell back to breaking the
 * text between characters and "Phở Việt Nam" rendered one letter per line.
 *
 * A reserved width rather than a fraction of the row, because what the name actually needs is
 * absolute: room for the emoji, its gap, and the longest single word it has to show. A fraction
 * would also scale the wrong way — on a tablet the name needs no more than this and the pill
 * should be free to use everything else.
 *
 * 120dp is measured, not estimated. At 96dp the name text node came out 125px wide on the report
 * device (720x1600, density 300) and "PHỞ 24 - 158D PASTEUR" still broke as "PASTEU" / "R": a long
 * uppercase Latin word runs to ~140px there, and Vietnamese syllables are far shorter. 120dp
 * leaves the text ~180px once the emoji and its gap are taken, which clears that with margin.
 */
private val PLAN_NAME_MIN_WIDTH = 120.dp

/**
 * Floor on the pill so a very narrow row cannot reserve the name so much that the price disappears
 * entirely. At this point neither fits properly and both are truncated rather than one erased.
 */
private const val PLAN_PRICE_MIN_WIDTH_FRACTION = 0.35f

/**
 * Measures the content against the width its parent offers, less [reserve] for the sibling.
 *
 * A layout modifier rather than `widthIn(max = …)` because the bound has to track the row it lands
 * in, and rather than `BoxWithConstraints` because it needs no subcomposition: the incoming
 * [Constraints] already carry the width the parent is offering. Content that already fits inside
 * the bound is measured exactly as it was before, so short prices lay out unchanged.
 */
private fun Modifier.widthReserving(reserve: Dp) = this.layout { measurable, constraints ->
    val cap = cappedMaxWidthPx(constraints.maxWidth, reserve.roundToPx(), PLAN_PRICE_MIN_WIDTH_FRACTION)
    val placeable = measurable.measure(
        // minWidth is clamped too: a parent demanding a minimum wider than the cap would otherwise
        // produce an invalid range (min > max), which Constraints rejects.
        constraints.copy(minWidth = minOf(constraints.minWidth, cap), maxWidth = cap),
    )
    layout(placeable.width, placeable.height) { placeable.place(0, 0) }
}

/**
 * The width [widthReserving] measures against. Split out from the modifier so the rule can be
 * covered by a plain JVM test — the layout phase itself needs a device.
 *
 * An unbounded parent (a horizontally scrolling container) offers `Constraints.Infinity`, which is
 * `Int.MAX_VALUE`: there is no finite width to reserve from, and subtracting would leave a bound
 * that silently truncates, so it is passed through untouched.
 */
internal fun cappedMaxWidthPx(availableMaxWidthPx: Int, reservePx: Int, minFraction: Float): Int {
    if (availableMaxWidthPx == Constraints.Infinity) return availableMaxWidthPx
    val floor = (availableMaxWidthPx * minFraction).roundToInt()
    return (availableMaxWidthPx - reservePx).coerceIn(minOf(floor, availableMaxWidthPx), availableMaxWidthPx)
}

@Composable
private fun PlanItemRow(item: PlanItem, showConnector: Boolean) {
    val uriHandler = LocalUriHandler.current
    val connectorColor = timelineDividerColor()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm)
            // Web parity: the time gutter carries a hairline down to the next entry
            // (`<div className="w-px flex-1 mt-1.5 …" />` inside the time column).
            //
            // Drawn, not laid out. On the web the connector's height comes from `flex-1` inside a
            // column that `align-items: stretch` has already sized to the row; the laid-out Compose
            // equivalent would need Modifier.height(IntrinsicSize.Min) here plus fillMaxHeight() on
            // the gutter — i.e. intrinsic measurement, which this frozen layout must not take on.
            // Nothing positions against the connector, so it is purely decorative: drawBehind is a
            // DrawModifier that runs in the draw phase against the already-measured [size]. It adds
            // no layout node and leaves every constraint, weight and intrinsic of this row untouched.
            .drawBehind {
                if (!showConnector) return@drawBehind
                val top = CONNECTOR_TOP_INSET.toPx()
                // Web's `min-h-4` floor; below that there is nothing worth drawing.
                if (size.height - top < CONNECTOR_MIN_LENGTH.toPx()) return@drawBehind
                val x = TIME_COLUMN_WIDTH.toPx() / 2f // web centres it in the `w-10` gutter
                drawLine(
                    color = connectorColor,
                    start = Offset(x, top),
                    end = Offset(x, size.height),
                    strokeWidth = CONNECTOR_THICKNESS.toPx(),
                )
            },
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        // Time column
        Text(
            text = item.time,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(TIME_COLUMN_WIDTH),
        )
        // Card
        val categoryHue = categoryHue(item.category)
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(TappyShapes.input)
                .background(categoryHue.copy(alpha = CATEGORY_FILL_ALPHA))
                // Web parity: each item card is `rounded-xl border` in its category's border tone,
                // not a fill alone — without it the cards blend into the card background.
                .border(1.dp, categoryHue.copy(alpha = CATEGORY_BORDER_ALPHA), TappyShapes.input)
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = item.emoji.ifBlank { "📍" }, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = item.name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                item.price?.let { price ->
                    Text(
                        text = price,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            // Outermost, so the cap bounds the constraint the pill's own
                            // background and padding are measured against.
                            .widthReserving(PLAN_NAME_MIN_WIDTH)
                            .clip(TappyShapes.pill)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    )
                }
            }
            // Web parity: a photo that fails to load is removed outright (`onError` sets
            // `display:none`) — keeping the fixed-height slot would leave a blank band inside the
            // item card, which is what a dead/expired image URL produced here.
            var photoFailed by remember(item.photoUrl) { mutableStateOf(false) }
            item.photoUrl?.takeUnless { photoFailed }?.let { url ->
                TappyImage(
                    url = url,
                    contentDescription = item.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(96.dp)
                        .clip(TappyShapes.input),
                    onLoadFailed = { photoFailed = true },
                )
            }
            item.description?.let { desc ->
                Text(desc, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            // "Xem bản đồ" is a placeholder address the web filters out.
            item.address?.takeIf { it.isNotBlank() && it != "Xem bản đồ" }?.let { address ->
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(10.dp))
                    Text(address, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (item.mapsLink != null || item.bookingLink != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg), verticalAlignment = Alignment.CenterVertically) {
                    item.mapsLink?.let { link ->
                        PlanLink(icon = Icons.Filled.LocationOn, label = R.string.chat_plan_map, onClick = { uriHandler.openUri(link) }, emphasized = false)
                    }
                    item.bookingLink?.let { link ->
                        PlanLink(icon = Icons.Filled.OpenInNew, label = R.string.chat_plan_book_now, onClick = { uriHandler.openUri(link) }, emphasized = true)
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanLink(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: Int,
    onClick: () -> Unit,
    emphasized: Boolean,
) {
    val color = if (emphasized) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = Modifier.clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(10.dp))
        Text(
            text = androidx.compose.ui.res.stringResource(label),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = if (emphasized) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

/**
 * The base hue for an item's category — the web `CATEGORY_COLORS` row, which pairs a `-50` fill with
 * a `-200` border drawn from one hue. Both are derived here from a single colour so the two can
 * never drift apart; unknown categories fall back to neutral, matching the web's `transport` default.
 */
@Composable
private fun categoryHue(category: String): Color = when (category) {
    "hotel" -> Color(0xFF3B82F6)
    "food" -> Color(0xFFF97316)
    "spa" -> Color(0xFFEC4899)
    "entertainment" -> Color(0xFFA855F7)
    else -> MaterialTheme.colorScheme.onSurface
}

/** Fill weight of [categoryHue] — the web's `-50` background tone, kept subtle on both themes. */
private const val CATEGORY_FILL_ALPHA = 0.08f

/** Border weight of [categoryHue] — the web's `-200` border tone, readable but not loud. */
private const val CATEGORY_BORDER_ALPHA = 0.35f

package com.tappyai.app.chat

import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

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
        Column(modifier = Modifier.padding(vertical = TappySpacing.xs)) {
            currentDay?.items?.forEach { item ->
                PlanItemRow(item = item)
            }
        }

        // ── Cost breakdown ──
        val breakdown = plan.costBreakdown
        if (!breakdown.isNullOrEmpty()) {
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
    }
}

@Composable
private fun PlanItemRow(item: PlanItem) {
    val uriHandler = LocalUriHandler.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        // Time column
        Text(
            text = item.time,
            style = MaterialTheme.typography.labelSmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(40.dp),
        )
        // Card
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(TappyShapes.input)
                .background(categoryColor(item.category))
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
                            .clip(TappyShapes.pill)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    )
                }
            }
            item.photoUrl?.let { url ->
                TappyImage(
                    url = url,
                    contentDescription = item.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(96.dp)
                        .clip(TappyShapes.input),
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

/** Approximates the web `CATEGORY_COLORS` tint per item category (theme-aware, subtle). */
@Composable
private fun categoryColor(category: String): Color {
    val scheme = MaterialTheme.colorScheme
    return when (category) {
        "hotel" -> Color(0xFF3B82F6)
        "food" -> Color(0xFFF97316)
        "spa" -> Color(0xFFEC4899)
        "entertainment" -> Color(0xFFA855F7)
        else -> scheme.onSurface
    }.copy(alpha = 0.08f)
}

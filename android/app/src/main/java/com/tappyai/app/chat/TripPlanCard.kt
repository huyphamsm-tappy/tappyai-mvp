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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing
import androidx.compose.ui.res.stringResource

/**
 * Compose port of the web `TripPlanCard` (src/components/TripPlanCard.tsx) — renders a
 * [TappyPlan] the assistant emitted as a `[TAPPY_PLAN]` block: gradient header with a share
 * action, day tabs for multi-day trips, a per-item timeline coloured by category, an optional
 * cost breakdown, and a share footer. Structure, sections and copy mirror the web one-for-one.
 */
@Composable
fun TripPlanCard(plan: TappyPlan, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var activeDay by remember(plan) { mutableIntStateOf(0) }
    val currentDay = plan.days.getOrNull(activeDay) ?: plan.days.firstOrNull()

    val shareText = plan.shareText?.takeIf { it.isNotBlank() }
        ?: stringResource(R.string.chat_plan_share_text, plan.title)
    val share = {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, shareText)
            putExtra(Intent.EXTRA_SUBJECT, plan.title)
        }
        runCatching { context.startActivity(Intent.createChooser(send, null)) }
        Unit
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.md)
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface),
    ) {
        // ── Header ──
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.horizontalGradient(
                        listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary),
                    ),
                )
                .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = plan.title,
                        color = MaterialTheme.colorScheme.onPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val meta = buildString {
                        if ((plan.people ?: 0) > 1) append("${plan.people} người · ")
                        plan.budgetTotal?.let { append(it) }
                    }.trim().trimEnd('·', ' ')
                    if (meta.isNotBlank()) {
                        Text(
                            text = meta,
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f),
                            fontSize = 12.sp,
                        )
                    }
                }
                ShareChip(onClick = share, label = stringResource(R.string.chat_plan_share_short))
            }
        }

        // ── Day tabs (multi-day only) ──
        if (plan.days.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                    .horizontalScroll(rememberScrollState()),
            ) {
                plan.days.forEachIndexed { i, day ->
                    val selected = i == activeDay
                    Text(
                        text = day.label,
                        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        fontSize = 12.sp,
                        maxLines = 1,
                        modifier = Modifier
                            .clickable { activeDay = i }
                            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm),
                    )
                }
            }
        }

        // ── Timeline ──
        Column(modifier = Modifier.padding(vertical = TappySpacing.xs)) {
            currentDay?.items?.forEachIndexed { i, item ->
                PlanTimelineItem(
                    item = item,
                    isLast = i == currentDay.items.lastIndex,
                    onOpenUrl = { url -> openUrl(context, url) },
                )
            }
        }

        // ── Cost breakdown ──
        val breakdown = plan.costBreakdown?.filterValues { it.isNotBlank() }.orEmpty()
        if (breakdown.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                    .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                Text(
                    text = stringResource(R.string.chat_plan_cost_title),
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                breakdown.forEach { (k, v) ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(k, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(v, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
                plan.budgetTotal?.let { total ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(R.string.chat_plan_cost_total), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        Text(total, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        // ── Share footer ──
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(TappySpacing.lg),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primary)
                    .clickable(onClick = share)
                    .padding(vertical = TappySpacing.md),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Share, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.width(16.dp).height(16.dp))
                Spacer(Modifier.width(TappySpacing.sm))
                Text(
                    text = stringResource(R.string.chat_plan_share_cta),
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                )
            }
        }
    }
}

@Composable
private fun ShareChip(onClick: () -> Unit, label: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.2f))
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Share, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.width(11.dp).height(11.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, color = MaterialTheme.colorScheme.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun PlanTimelineItem(item: PlanItem, isLast: Boolean, onOpenUrl: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
    ) {
        // Time column
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(40.dp),
        ) {
            Text(
                text = item.time,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
            )
            if (!isLast) {
                Spacer(
                    modifier = Modifier
                        .padding(top = TappySpacing.xs)
                        .width(1.dp)
                        .height(24.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
            }
        }

        // Card
        val (bg, border) = categoryColors(item.category)
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(12.dp))
                .border(1.dp, border, RoundedCornerShape(12.dp))
                .background(bg)
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
                Text(text = item.emoji.ifBlank { "📍" }, fontSize = 16.sp)
                Spacer(Modifier.width(TappySpacing.xs))
                Text(
                    text = item.name,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    color = PlanTextPrimary,
                    modifier = Modifier.weight(1f),
                )
                item.price?.takeIf { it.isNotBlank() }?.let { price ->
                    Text(
                        text = price,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    )
                }
            }
            item.description?.takeIf { it.isNotBlank() }?.let {
                Text(text = it, fontSize = 12.sp, color = PlanTextSecondary)
            }
            item.address?.takeIf { it.isNotBlank() && it != "Xem bản đồ" }?.let { addr ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = PlanTextSecondary, modifier = Modifier.width(10.dp).height(10.dp))
                    Spacer(Modifier.width(2.dp))
                    Text(text = addr, fontSize = 11.sp, color = PlanTextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (!item.mapsLink.isNullOrBlank() || !item.bookingLink.isNullOrBlank()) {
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), modifier = Modifier.padding(top = 2.dp)) {
                    item.mapsLink?.takeIf { it.isNotBlank() }?.let { link ->
                        PlanLink(icon = Icons.Filled.LocationOn, label = stringResource(R.string.chat_plan_map), primary = false) { onOpenUrl(link) }
                    }
                    item.bookingLink?.takeIf { it.isNotBlank() }?.let { link ->
                        PlanLink(icon = Icons.Filled.OpenInNew, label = stringResource(R.string.chat_plan_book), primary = true) { onOpenUrl(link) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanLink(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, primary: Boolean, onClick: () -> Unit) {
    val tint = if (primary) MaterialTheme.colorScheme.primary else PlanTextSecondary
    Row(
        modifier = Modifier.clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.width(10.dp).height(10.dp))
        Spacer(Modifier.width(2.dp))
        Text(text = label, fontSize = 11.sp, color = tint, fontWeight = if (primary) FontWeight.SemiBold else FontWeight.Normal)
    }
}

private val PlanTextPrimary = Color(0xFF1F2937)
private val PlanTextSecondary = Color(0xFF6B7280)

/** Mirrors the web CATEGORY_COLORS (Tailwind 50/200 shades) as (background, border) tints. */
private fun categoryColors(category: String): Pair<Color, Color> = when (category) {
    "hotel" -> Color(0xFFEFF6FF) to Color(0xFFBFDBFE)
    "food" -> Color(0xFFFFF7ED) to Color(0xFFFED7AA)
    "spa" -> Color(0xFFFDF2F8) to Color(0xFFFBCFE8)
    "entertainment" -> Color(0xFFFAF5FF) to Color(0xFFE9D5FF)
    else -> Color(0xFFF9FAFB) to Color(0xFFE5E7EB)
}

private fun openUrl(context: android.content.Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}

package com.tappyai.app.planner

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.app.history.formatRelativeTime
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3AccentPill
import com.tappyai.app.personal.V3Chip
import com.tappyai.app.personal.V3EmptyPanel
import com.tappyai.app.personal.V3ErrorLine
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.personal.V3Tone
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * AI Planner (My Plans) — the web `/planner` page (design/v3-phase4 `src/app/planner/PlannerView.tsx`),
 * native: the V3 page header, the kind chips + the real count + the one "Lập kế hoạch" action,
 * then one card per plan — the first real stop photo (or the calendar glyph), the title, the kind
 * pill, the facts the plan actually carries (days, stops, people, budget), the first stops with
 * their own emoji, and a footer with the thread's last activity, "Xem lịch trình" (which opens
 * the itinerary IN PLACE — day chips, times, names, prices, map links) and "Mở trong cuộc trò
 * chuyện".
 *
 * 🚨 NOTHING HERE MUTATES A PLAN — there is no edit flow in this product. Changing a plan means
 * asking Tappy, which is what the CTA does: it opens Chat with the planner prompt pre-filled,
 * the same `/chat?q=` mechanism the web uses.
 */
@Composable
fun PlannerScreen(
    onBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onPlanWithTappy: (String) -> Unit,
    viewModel: PlannerViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var filter by remember { mutableIntStateOf(0) }
    val prompt = stringResource(R.string.planner_prompt)
    val cta = stringResource(R.string.planner_cta)

    V3PersonalPage(
        title = stringResource(R.string.planner_title),
        subtitle = stringResource(R.string.planner_subtitle),
        onBack = onBack,
    ) {
        val plans = (state as? UiState.Success)?.data.orEmpty()
        val facets = remember(plans) { DerivePlans.facets(plans) }
        val activeKind = if (filter == 0) null else facets.getOrNull(filter - 1)
        val visible = if (activeKind == null) plans else plans.filter { it.kind == activeKind }

        // ── Filters, the real count, and the one action this surface has ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                if (facets.isNotEmpty()) {
                    val labels = listOf(stringResource(R.string.planner_all)) + facets.map { stringResource(it.labelRes()) }
                    labels.forEachIndexed { i, label -> V3Chip(text = label, selected = filter == i, onClick = { filter = i }) }
                }
                if (plans.isNotEmpty()) {
                    Text(text = stringResource(R.string.planner_count, plans.size), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
                }
            }
            V3AccentPill(text = cta, icon = Icons.Filled.AutoAwesome, onClick = { onPlanWithTappy(prompt) })
        }

        when (val current = state) {
            UiState.Loading, UiState.Idle -> V3Loading(height = 200.dp)
            is UiState.Error -> V3ErrorLine(
                message = current.message,
                retryText = stringResource(R.string.common_try_again),
                onRetry = viewModel::retry,
            )
            UiState.Empty -> V3EmptyPanel(
                icon = Icons.Filled.CalendarMonth,
                text = stringResource(R.string.planner_empty),
                action = { V3AccentPill(text = cta, icon = Icons.Filled.AutoAwesome, onClick = { onPlanWithTappy(prompt) }) },
            )
            is UiState.Success -> {
                if (visible.isEmpty()) {
                    V3EmptyPanel(icon = Icons.Filled.CalendarMonth, text = stringResource(R.string.planner_empty_filtered))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
                        visible.forEach { plan ->
                            PlanCard(plan = plan, now = viewModel.now, onOpen = { onOpenConversation(plan.conversationId) })
                        }
                        // Says where the list comes from, so an older plan outside the window is explained.
                        Text(
                            text = stringResource(R.string.planner_scope),
                            color = HomeV3.OnSurfaceVariant,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun PlanKind.labelRes(): Int = when (this) {
    PlanKind.Trip -> R.string.planner_travel
    PlanKind.Evening -> R.string.planner_evening
}

/**
 * One plan. Collapsed it is a summary; expanded it is the itinerary — the reason this page is
 * a planner rather than an index.
 */
@Composable
private fun PlanCard(plan: DerivedPlan, now: Long, onOpen: () -> Unit) {
    var open by remember(plan.id) { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, V3PanelShape),
    ) {
        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // 🚨 A real photograph of a real stop, or the calendar mark — never a placeholder pool.
            Box(
                modifier = Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)).background(HomeV3.SurfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (plan.coverUrl != null) {
                    TappyImage(url = plan.coverUrl, contentDescription = null, modifier = Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)))
                } else {
                    Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = V3Tone.Violet, modifier = Modifier.size(22.dp))
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                    Text(
                        text = plan.title,
                        color = HomeV3.OnSurface,
                        fontSize = 14.sp,
                        lineHeight = 19.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    // Rendered only when the payload actually said which kind it is.
                    plan.kind?.let { kind ->
                        Text(
                            text = stringResource(kind.labelRes()),
                            color = V3Tone.Violet,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(V3Tone.Violet.copy(alpha = 0.16f))
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }
                // The facts, and only the ones this plan carries. No default party size.
                PlanFacts(plan)
                if (plan.stops.isNotEmpty()) {
                    val preview = buildString {
                        append(plan.stops.joinToString(" · ") { "${it.emoji.ifBlank { "📍" }} ${it.name}" })
                        if (plan.stopCount > plan.stops.size) append(" · ").append(stringResource(R.string.planner_more, plan.stopCount - plan.stops.size))
                    }
                    Text(text = preview, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }

        // ── Footer: when the thread last moved, and the two ways on ──
        HorizontalDivider(color = HomeV3.Outline)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // 🚨 Labelled as THREAD activity, not as a plan date.
            Text(
                text = stringResource(R.string.planner_last_activity, formatRelativeTime(plan.updatedAtMillis, now)),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            FooterLink(
                text = stringResource(if (open) R.string.planner_collapse else R.string.planner_expand),
                color = HomeV3.OnSurfaceVariant,
                onClick = { open = !open },
                trailing = { Icon(Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(14.dp).rotate(if (open) 180f else 0f)) },
            )
            FooterLink(
                text = stringResource(R.string.planner_open),
                color = HomeV3.Purple,
                bold = true,
                onClick = onOpen,
                trailing = { Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(14.dp)) },
            )
        }

        AnimatedVisibility(visible = open) { Itinerary(plan) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanFacts(plan: DerivedPlan) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Fact(Icons.Filled.CalendarMonth, stringResource(R.string.planner_days, plan.dayCount))
        Fact(Icons.Filled.Route, stringResource(R.string.planner_stops, plan.stopCount))
        plan.people?.let { Fact(Icons.Filled.Group, stringResource(R.string.planner_people, it)) }
        plan.budgetTotal?.let { Fact(Icons.Filled.Wallet, it) }
    }
}

@Composable
private fun Fact(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(icon, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(12.dp))
        Text(text = text, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
    }
}

@Composable
private fun FooterLink(text: String, color: Color, onClick: () -> Unit, bold: Boolean = false, trailing: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = 30.dp)
            .clip(CircleShape)
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(text = text, color = color, fontSize = 11.5.sp, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Medium)
        trailing()
    }
}

/**
 * The plan, opened. Days become chips only when there is more than one; each stop renders the
 * fields the payload actually has, in itinerary order — a missing field draws nothing.
 */
@Composable
private fun Itinerary(plan: DerivedPlan) {
    var day by remember(plan.id) { mutableIntStateOf(0) }
    val days = plan.plan.days
    val current = days.getOrNull(day) ?: days.firstOrNull()
    val context = LocalContext.current
    Column(modifier = Modifier.fillMaxWidth().background(HomeV3.SurfaceVariant)) {
        HorizontalDivider(color = HomeV3.Outline)
        if (days.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                days.forEachIndexed { i, d -> V3Chip(text = d.label.ifBlank { "${i + 1}" }, selected = i == day, onClick = { day = i }) }
            }
            HorizontalDivider(color = HomeV3.Outline)
        }
        current?.items.orEmpty().forEachIndexed { i, item ->
            if (i > 0) HorizontalDivider(color = HomeV3.Outline)
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // The model's own time string, monospaced so a column lines up; blank when absent.
                Text(text = item.time, color = HomeV3.OnSurfaceVariant, fontSize = 11.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.width(40.dp).padding(top = 2.dp))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = "${item.emoji.ifBlank { "📍" }} ${item.name}",
                            color = HomeV3.OnSurface,
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        item.price?.takeIf { it.isNotBlank() }?.let {
                            Text(text = it, color = HomeV3.Purple, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    item.description?.takeIf { it.isNotBlank() }?.let {
                        Text(text = it, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 17.sp)
                    }
                    item.mapsLink?.takeIf { it.isNotBlank() }?.let { link ->
                        Row(
                            modifier = Modifier
                                .clip(CircleShape)
                                .clickable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link))) }
                                .padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(Icons.Filled.Place, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(11.dp))
                            Text(text = stringResource(R.string.planner_map), color = HomeV3.Purple, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

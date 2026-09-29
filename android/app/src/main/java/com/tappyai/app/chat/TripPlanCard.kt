package com.tappyai.app.chat

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.chat.plan.PlanArea
import com.tappyai.app.chat.plan.PlanCardView
import com.tappyai.app.chat.plan.PlanImageManifest
import com.tappyai.app.chat.plan.planCardViewOf
import com.tappyai.app.chat.plan.planImageRepository
import com.tappyai.app.share.PlanShareOutcome
import com.tappyai.app.share.PlanShareState
import com.tappyai.app.share.PlanShareViewModel
import com.tappyai.app.share.ShareArtifactBuilder
import com.tappyai.app.share.TappyShareSheet
import com.tappyai.core.designsystem.component.TappyImage
import java.util.Locale

/**
 * The plan card v2 (owner 29/09) — drawn to the approved sample `docs/design/share-layouts/plan-share.png`
 * ("Quy Nhơn · 3 ngày 2 đêm") at chat width, for ALL FIVE areas:
 *  - the brand row with "Chia sẻ" (the approved sheet #6 with the plan image #7, SL1);
 *  - the hero: the plan's STORED background image (placeholder gradient of the area until the
 *    manifest serves it), "TAPPY PLAN", the title, destination · duration · people, the tagline;
 *  - "Hành trình": every day stacked (a non-travel plan is ONE session with times of the day), each
 *    stop with its time, its STORED stop image, name, description, address and the server's price —
 *    or "chưa có giá — hỏi quán";
 *  - "Tổng quan" (only the fields the server wrote), "Điểm nổi bật" (2×2), the server's tips and cost
 *    lines, and "Xem kế hoạch đầy đủ trên Tappy", which publishes the plan and opens its page.
 * What is shown is decided in [planCardViewOf] (pure, unit-tested); this file only draws.
 */
@Composable
fun TripPlanCard(plan: TappyPlan, modifier: Modifier = Modifier, planJson: String? = null) {
    val context = LocalContext.current
    val view = remember(plan) { planCardViewOf(plan) }
    val manifest = rememberPlanImageManifest()

    var shareOpen by remember(plan) { mutableStateOf(false) }
    if (shareOpen) {
        val artifact = remember(plan, planJson) { ShareArtifactBuilder.buildPlanArtifact(plan, Locale.getDefault().language, planJson) }
        // SL1 (owner 29/09): the plan card uses the approved sheet (sample #6) with the plan image (#7).
        TappyShareSheet(artifact = artifact, onDismiss = { shareOpen = false }, plan = plan)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(PlanPal.Ground)
            .border(1.dp, PlanPal.Line, RoundedCornerShape(20.dp))
            .testTag("plan_card_v2"),
    ) {
        BrandRow(onShare = { shareOpen = true })
        Hero(view, manifest)

        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            if (view.days.isNotEmpty()) {
                Text(stringResource(R.string.chat_plan_v2_itinerary), color = PlanPal.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                view.days.forEach { day -> DayBlock(day, view.area, manifest) { url -> openUrl(context, url) } }
            }
            if (view.overview.isNotEmpty()) Overview(view)
            if (view.highlights.isNotEmpty()) Highlights(view, manifest)
            Tips(plan)
            CostLines(plan)
            FullPlanCta(planJson)
            Text(
                text = stringResource(R.string.chat_plan_v2_made_by),
                color = PlanPal.Muted,
                fontSize = 12.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

/** The manifest, loaded once per process; placeholders until it arrives (or when it cannot). */
@Composable
private fun rememberPlanImageManifest(): PlanImageManifest {
    if (LocalInspectionMode.current) return PlanImageManifest.EMPTY
    val context = LocalContext.current
    val repo = remember { planImageRepository(context) }
    LaunchedEffect(repo) { repo.ensureLoaded() }
    val manifest by repo.manifest.collectAsState()
    return manifest
}

/** The sample's colours (dark navy ground, blue→violet accents), fixed so the card reads the same in both themes. */
private object PlanPal {
    val Ground = Color(0xFF0B1122)
    val Panel = Color(0xFF131B31)
    val Line = Color(0x1FFFFFFF)
    val Text = Color.White
    val Muted = Color(0xFFA7B0C8)
    val Kicker = Color(0xFF8FB3FF)
    val Accent = Color(0xFF8FB3FF)
    val Cta = Brush.horizontalGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)))
    val Badge = Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF8B5CF6)))
}

/** The placeholder gradient of each area — the "ảnh giữ chỗ" drawn under a key the manifest cannot serve. */
internal fun PlanArea.placeholder(): Brush = when (this) {
    PlanArea.TRAVEL -> Brush.linearGradient(listOf(Color(0xFF0EA5E9), Color(0xFF1D4ED8), Color(0xFF312E81)))
    PlanArea.FOOD -> Brush.linearGradient(listOf(Color(0xFFF97316), Color(0xFFDB2777), Color(0xFF4C1D95)))
    PlanArea.ENTERTAINMENT -> Brush.linearGradient(listOf(Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF1E1B4B)))
    PlanArea.SHOPPING -> Brush.linearGradient(listOf(Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFF7C2D12)))
    PlanArea.SPA -> Brush.linearGradient(listOf(Color(0xFF2DD4BF), Color(0xFFA855F7), Color(0xFF1E1B4B)))
}

/**
 * One image slot: the manifest's URL for the STORED [key], else the area's gradient with its emoji.
 * Never another picture — no photo_url fallback, no key chosen here.
 */
@Composable
private fun PlanImage(
    key: String?,
    area: PlanArea,
    manifest: PlanImageManifest,
    glyph: String,
    glyphSize: Int,
    modifier: Modifier,
    glyphAlignment: Alignment = Alignment.Center,
) {
    val url = manifest.urlFor(key)
    Box(modifier = modifier.background(area.placeholder())) {
        if (url != null) {
            TappyImage(url = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                glyph,
                fontSize = glyphSize.sp,
                modifier = Modifier.align(glyphAlignment).padding(if (glyphAlignment == Alignment.Center) 0.dp else 16.dp).testTag("plan_image_placeholder"),
            )
        }
    }
}

@Composable
private fun BrandRow(onShare: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("TAPPY", color = PlanPal.Text, fontSize = 18.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .border(1.dp, Color(0x668FB3FF), CircleShape)
                .clickable(onClick = onShare)
                .testTag("plan_share")
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(stringResource(R.string.chat_plan_share_short), color = PlanPal.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Icon(Icons.Filled.Share, contentDescription = null, tint = PlanPal.Text, modifier = Modifier.size(14.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Hero(view: PlanCardView, manifest: PlanImageManifest) {
    Box(modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp)) {
        PlanImage(
            key = view.heroKey, area = view.area, manifest = manifest, glyph = view.area.emoji, glyphSize = 40,
            modifier = Modifier.matchParentSize().testTag("plan_hero"),
            // The hero's glyph sits in the corner, clear of the title (the text owns the lower left).
            glyphAlignment = Alignment.TopEnd,
        )
        // Legibility veil: the sample's dark fade under the text.
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color(0x33000000), Color(0xCC0B1122)))))
        Column(modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 56.dp, bottom = 18.dp)) {
            Text(stringResource(R.string.chat_plan_v2_kicker), color = PlanPal.Kicker, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 3.sp)
            Text(view.title, color = PlanPal.Text, fontSize = 26.sp, lineHeight = 31.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(top = 4.dp))
            FlowRow(
                modifier = Modifier.padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                view.destination?.let { MetaChip(Icons.Filled.LocationOn, it) }
                view.duration?.let { MetaChip(Icons.Filled.CalendarMonth, it) }
                view.people?.let { MetaChip(Icons.Filled.Group, stringResource(R.string.chat_plan_v2_people, it)) }
            }
            view.tagline?.let {
                Text(it, color = Color(0xE6FFFFFF), fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
    }
}

@Composable
private fun MetaChip(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Icon(icon, contentDescription = null, tint = PlanPal.Accent, modifier = Modifier.size(16.dp))
        Text(text, color = PlanPal.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun DayBlock(day: PlanCardView.Day, area: PlanArea, manifest: PlanImageManifest, onOpenUrl: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.testTag("plan_day_${day.number}")) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(PlanPal.Badge), contentAlignment = Alignment.Center) {
                Text("%02d".format(day.number), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(day.label, color = PlanPal.Accent, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                day.title?.let { Text(it, color = PlanPal.Muted, fontSize = 13.sp) }
            }
        }
        day.stops.forEachIndexed { i, stop -> StopRow(stop, isLast = i == day.stops.lastIndex, area = area, manifest = manifest, onOpenUrl = onOpenUrl) }
    }
}

@Composable
private fun StopRow(stop: PlanCardView.Stop, isLast: Boolean, area: PlanArea, manifest: PlanImageManifest, onOpenUrl: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).testTag("plan_stop"),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // The time rail: the dot on the day's line, then the line down to the next stop.
        Box(Modifier.width(10.dp).fillMaxHeight()) {
            Box(Modifier.align(Alignment.TopCenter).padding(top = 5.dp).size(8.dp).clip(CircleShape).background(PlanPal.Accent))
            if (!isLast) Box(Modifier.align(Alignment.TopCenter).padding(top = 16.dp).width(1.dp).fillMaxHeight().background(Color(0x668FB3FF)))
        }
        Text(stop.time.ifBlank { "—" }, color = PlanPal.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(42.dp))
        PlanImage(
            key = stop.imageKey, area = area, manifest = manifest, glyph = stop.emoji, glyphSize = 22,
            modifier = Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)),
        )
        Column(modifier = Modifier.weight(1f).padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(stop.name, color = PlanPal.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            stop.description?.let { Text(it, color = PlanPal.Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            stop.address?.let { addr ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = PlanPal.Accent, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(addr, color = PlanPal.Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Text(
                text = if (stop.priced) stop.price else stringResource(R.string.chat_plan_v2_no_price),
                color = if (stop.priced) Color(0xFFFFD27A) else PlanPal.Muted,
                fontSize = 12.sp,
                fontWeight = if (stop.priced) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier.testTag(if (stop.priced) "plan_price" else "plan_no_price"),
            )
            if (stop.mapsLink != null || stop.bookingLink != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(top = 2.dp)) {
                    stop.mapsLink?.let { PlanLink(Icons.Filled.LocationOn, stringResource(R.string.chat_plan_map)) { onOpenUrl(it) } }
                    stop.bookingLink?.let { PlanLink(Icons.Filled.OpenInNew, stringResource(R.string.chat_plan_book)) { onOpenUrl(it) } }
                }
            }
        }
    }
}

@Composable
private fun PlanLink(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(modifier = Modifier.clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = PlanPal.Accent, modifier = Modifier.size(12.dp))
        Spacer(Modifier.width(3.dp))
        Text(label, color = PlanPal.Accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Panel(title: String, tag: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(PlanPal.Panel)
            .border(1.dp, PlanPal.Line, RoundedCornerShape(16.dp))
            .testTag(tag)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, color = PlanPal.Text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        content()
    }
}

@Composable
private fun Overview(view: PlanCardView) {
    val title = stringResource(if (view.area == PlanArea.TRAVEL) R.string.chat_plan_v2_overview_trip else R.string.chat_plan_v2_overview)
    Panel(title, "plan_overview") {
        view.overview.forEach { row ->
            val (icon, label) = when (row.kind) {
                PlanCardView.OverviewKind.DESTINATION -> Icons.Filled.LocationOn to R.string.chat_plan_v2_destination
                PlanCardView.OverviewKind.DURATION -> Icons.Filled.CalendarMonth to R.string.chat_plan_v2_duration
                PlanCardView.OverviewKind.PEOPLE -> Icons.Filled.Group to R.string.chat_plan_v2_people_label
                PlanCardView.OverviewKind.BUDGET -> Icons.Filled.Paid to R.string.chat_plan_v2_budget
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(icon, contentDescription = null, tint = PlanPal.Accent, modifier = Modifier.size(22.dp))
                Text(stringResource(label), color = PlanPal.Muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.weight(1.3f)) {
                    val value = if (row.kind == PlanCardView.OverviewKind.PEOPLE) stringResource(R.string.chat_plan_v2_people, row.value.toInt()) else row.value
                    Text(value, color = PlanPal.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    row.sub?.let { Text("(= $it)", color = PlanPal.Muted, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
private fun Highlights(view: PlanCardView, manifest: PlanImageManifest) {
    Panel(stringResource(R.string.chat_plan_v2_highlights), "plan_highlights") {
        view.highlights.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                pair.forEach { h ->
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        PlanImage(
                            key = h.imageKey, area = view.area, manifest = manifest, glyph = view.area.emoji, glyphSize = 26,
                            modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(10.dp)),
                        )
                        Text(h.label, color = PlanPal.Text, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** The server's tips (a stop of this plan, or labelled general advice) — unchanged from v1. */
@Composable
private fun Tips(plan: TappyPlan) {
    val tips = plan.localTips.orEmpty().filter { it.text.isNotBlank() && (it.basis == "tool" || it.basis == "general") }
    if (tips.isEmpty()) return
    Panel(stringResource(R.string.chat_plan_local_tips_title), "plan_tips") {
        val general = stringResource(R.string.chat_plan_local_tip_general)
        tips.forEach { tip ->
            val lead = if (tip.basis == "tool" && !tip.place.isNullOrBlank()) "${tip.place}: " else "$general · "
            Text(lead + tip.text, color = PlanPal.Muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}

/** The server's cost lines, verbatim (already projected by [PlanPrice]: a non-amount never shows). */
@Composable
private fun CostLines(plan: TappyPlan) {
    val lines = plan.costBreakdown?.filterValues { it.isNotBlank() }.orEmpty()
    if (lines.isEmpty()) return
    Panel(stringResource(R.string.chat_plan_cost_title), "plan_costs") {
        lines.forEach { (k, v) ->
            Row(modifier = Modifier.fillMaxWidth()) {
                Text(k, color = PlanPal.Muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                Text(v, color = PlanPal.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

/**
 * "Xem kế hoạch đầy đủ trên Tappy": publishes THIS block (the share sheet's own path,
 * `POST /api/plans/share`) and opens the returned `/plan/<id>` page. Needs a signed-in account,
 * exactly like sharing; the reason is shown under the button when there is no link.
 */
@Composable
private fun FullPlanCta(planJson: String?) {
    val context = LocalContext.current
    val vm: PlanShareViewModel? = if (LocalInspectionMode.current) null else hiltViewModel(key = "plan-cta-${planJson?.hashCode()}")
    val state = vm?.state?.collectAsState()?.value ?: PlanShareState.Idle
    var wanted by remember(planJson) { mutableStateOf(false) }
    LaunchedEffect(state, wanted) {
        val ready = state as? PlanShareState.Ready
        if (wanted && ready != null) { wanted = false; openUrl(context, ready.link.url) }
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clip(RoundedCornerShape(26.dp))
                .background(PlanPal.Cta)
                .clickable(enabled = planJson != null) { wanted = true; vm?.publish(planJson) }
                .testTag("plan_full_cta")
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (wanted && state is PlanShareState.Preparing) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(stringResource(R.string.chat_plan_v2_full_cta).uppercase(), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
            Spacer(Modifier.width(8.dp))
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        }
        val failed = (state as? PlanShareState.Failed)?.outcome
        if (failed != null) {
            Text(
                text = stringResource(if (failed is PlanShareOutcome.SignInRequired) R.string.share_v6_plan_link_sign_in else R.string.share_v6_plan_link_failed),
                color = PlanPal.Muted,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

private fun openUrl(context: android.content.Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

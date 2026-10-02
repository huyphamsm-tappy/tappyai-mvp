package com.tappyai.app.scamshield

import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material.icons.automirrored.filled.MenuBook
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.personal.v3AccentSoft

// ── Scam Shield · the verdict cards (web `ScamShieldResult.tsx` + `ScamMessageResult.tsx`) ──
//
// The URL card and the message card share one skin: the level's tint on the whole card, the same
// six-level vocabulary, the same confidence badge. Every string is a resource or a value the
// server localized; the phone never words a verdict of its own.

internal class LevelTone(val fg: Color, val soft: Color, val border: Color, val icon: ImageVector, val labelRes: Int)

/**
 * 🚨 Exhaustive over [RiskLevel]: a level added to the enum breaks the build here until it is given
 * a deliberate appearance. HIGH's foreground is the feature-scoped `--ss-high` pair (dark and
 * saturated on the white card, bright on the dark one).
 */
@Composable
internal fun toneFor(level: RiskLevel): LevelTone {
    val dark = HomeV3.Background.luminance() < 0.5f
    return when (level) {
        // 02/10 (decision A7/A8): there is NO "safe" appearance. SAFE, LOW and the unresolved levels are all the same neutral slate
        // "no familiar signs recognised" — never green, never a shield-check glyph, never a reassuring word.
        RiskLevel.SAFE, RiskLevel.LOW -> LevelTone(HomeV3.OnSurfaceVariant, HomeV3.SurfaceVariant, HomeV3.Outline, Icons.Filled.GppMaybe, R.string.scam_verdict_unrecognized)
        RiskLevel.MEDIUM -> LevelTone(V3Tone.Amber, V3Tone.Amber.copy(alpha = 0.16f), V3Tone.Amber.copy(alpha = 0.38f), Icons.Filled.GppMaybe, R.string.scam_verdict_suspicious)
        RiskLevel.HIGH -> LevelTone(if (dark) SsHighDark else SsHighLight, SsHighSoft.copy(alpha = 0.16f), SsHighSoft.copy(alpha = 0.40f), Icons.Filled.GppMaybe, R.string.scam_verdict_familiar)
        RiskLevel.CRITICAL -> LevelTone(V3Tone.Rose, V3Tone.Rose.copy(alpha = 0.16f), V3Tone.Rose.copy(alpha = 0.42f), Icons.Filled.GppBad, R.string.scam_verdict_familiar)
        // Neutral slate + the "maybe" glyph: visibly not a verdict, visibly not a clean bill of health.
        RiskLevel.INCONCLUSIVE, RiskLevel.UNKNOWN -> LevelTone(HomeV3.OnSurfaceVariant, HomeV3.SurfaceVariant, HomeV3.Outline, Icons.Filled.GppMaybe, R.string.scam_verdict_unrecognized)
    }
}

/** The tone of a three-state kind (the server's own `verdict` can differ from the level mapping on a newer server). */
@Composable
internal fun toneFor(kind: VerdictKind): LevelTone = toneFor(
    when (kind) {
        VerdictKind.Familiar -> RiskLevel.HIGH
        VerdictKind.Suspicious -> RiskLevel.MEDIUM
        VerdictKind.Unrecognized -> RiskLevel.INCONCLUSIVE
    },
)

/** `--ss-high`: light `#B4400C`, dark `#FB923C`; the soft/border base is orange-500. */
internal val SsHighLight = Color(0xFFB4400C)
internal val SsHighDark = Color(0xFFFB923C)
internal val SsHighSoft = Color(0xFFF97316)

/** `LevelBadge`: the verdict pill in the level's tone. */
@Composable
internal fun LevelBadge(level: RiskLevel, small: Boolean = false) {
    val tone = toneFor(level)
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(tone.soft)
            .border(1.dp, tone.border, CircleShape)
            .padding(horizontal = if (small) 10.dp else 12.dp, vertical = if (small) 4.dp else 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(tone.icon, contentDescription = null, tint = tone.fg, modifier = Modifier.size(if (small) 13.dp else 15.dp))
        val label = if (small) {
            // The history list: the web's short badges (`scamVerdict.link.short.*`).
            when (VerdictKind.fromRisk(level)) {
                VerdictKind.Familiar -> R.string.scam_verdict_link_short_familiar
                VerdictKind.Suspicious -> R.string.scam_verdict_link_short_suspicious
                VerdictKind.Unrecognized -> R.string.scam_verdict_link_short_unrecognized
            }
        } else tone.labelRes
        Text(text = stringResource(label), color = tone.fg, fontSize = if (small) 11.sp else 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** The shared card head: glyph tile, level word + confidence, a sub-line, the score. */
@Composable
private fun VerdictHead(tone: LevelTone, title: String, subline: String?, sublineBold: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(modifier = Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(HomeV3.Surface), contentAlignment = Alignment.Center) {
            Icon(tone.icon, contentDescription = null, tint = tone.fg, modifier = Modifier.size(26.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = tone.fg, fontSize = 17.sp, lineHeight = 21.sp, fontWeight = FontWeight.ExtraBold)
            if (subline != null) {
                Text(
                    text = subline,
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = if (sublineBold) 12.5.sp else 12.sp,
                    fontWeight = if (sublineBold) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

/** `ScamShieldResult`: the URL verdict; the whole card takes the level's tint. */
@Composable
internal fun VerdictCard(result: ScamCheckResult, shareBusy: Boolean = false, shareError: String? = null, onShare: (() -> Unit)? = null) {
    val kind = VerdictKind.forLink(result)
    val tone = toneFor(kind)
    val titleRes = when (kind) {
        VerdictKind.Familiar -> R.string.scam_verdict_link_familiar_title
        VerdictKind.Suspicious -> R.string.scam_verdict_link_suspicious_title
        VerdictKind.Unrecognized -> R.string.scam_verdict_link_unrecognized_title
    }
    val bodyRes = when (kind) {
        VerdictKind.Familiar -> R.string.scam_verdict_link_familiar_body
        VerdictKind.Suspicious -> R.string.scam_verdict_link_suspicious_body
        VerdictKind.Unrecognized -> R.string.scam_verdict_unrecognized_body
    }
    Column(modifier = Modifier.fillMaxWidth().clip(V3PanelShape).background(tone.soft).border(1.dp, tone.border, V3PanelShape)) {
        VerdictHead(tone = tone, title = stringResource(titleRes), subline = result.url, sublineBold = false)
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // Never "this link is a scam" and never "safe": the wording is the web's (`scamVerdict.link.*`).
            Text(text = stringResource(bodyRes), color = HomeV3.OnSurface, fontSize = 13.5.sp, lineHeight = 19.sp, fontWeight = FontWeight.SemiBold)
            val reasons = result.evidence.filter { it.severity == SignalSeverity.WARNING || it.severity == SignalSeverity.CRITICAL }.take(6)
            if (reasons.isNotEmpty()) ReasonsSection(reasons)
            result.officialMatch?.let { OfficialSection(it) }
            // The web shows the engine's INCONCLUSIVE action only as the body above ("not repeated").
            val actions = if (kind == VerdictKind.Unrecognized) result.actions.filter { it.code != "INCONCLUSIVE" } else result.actions
            if (actions.isNotEmpty()) ActionsSection(actions)
            if (onShare != null) ShareLinkButton(busy = shareBusy, error = shareError, onClick = onShare)
            // Rows that read as reassurance ("certificate valid", "not on a blocklist") are not shown (web `EvidenceSection`).
            val details = result.evidence.filter { it.severity != SignalSeverity.SAFE }
            if (details.isNotEmpty()) EvidenceSection(details)
            DisclaimerLine()
        }
    }
}

/** "Cảnh báo cho mọi người" (web `ScamShareButton`): publishes the link verdict as a public page and shares its URL; the hint says so. */
@Composable
private fun ShareLinkButton(busy: Boolean, error: String?, onClick: () -> Unit) {
    Column {
        Row(
            modifier = Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(HomeV3.Purple)
                .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (busy) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
            else Icon(Icons.Filled.Share, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Text(text = stringResource(R.string.scam_share_button), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Text(text = stringResource(R.string.scam_share_hint), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 6.dp))
        if (error != null) {
            Text(text = error?.takeIf { it.isNotBlank() } ?: stringResource(R.string.scam_share_failed), color = V3Tone.Rose, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

/** The specific reasons (the engine's own warning / critical findings), always visible — the full list stays collapsed below. */
@Composable
internal fun ReasonsSection(items: List<EvidenceItem>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = stringResource(R.string.scam_verdict_reasons), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(10.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(modifier = Modifier.padding(top = 5.dp).size(8.dp).clip(CircleShape).background(if (item.severity == SignalSeverity.CRITICAL) V3Tone.Rose else V3Tone.Amber))
                Text(text = item.summary, color = HomeV3.OnSurface, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** `OfficialSection`: the neutral box with the brand, its website and hotline as links. */
@Composable
private fun OfficialSection(entity: OfficialEntity) {
    val tone = toneFor(RiskLevel.SAFE)
    val uriHandler = LocalUriHandler.current
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier.fillMaxWidth().clip(shape).background(tone.soft).border(1.dp, tone.border, shape).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Language, contentDescription = null, tint = tone.fg, modifier = Modifier.size(15.dp))
            Text(text = stringResource(R.string.scam_shield_v3_official), color = tone.fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        Text(text = entity.brand, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 2.dp))
        LinkLine(label = stringResource(R.string.scam_shield_v3_official_website), value = entity.website, tone = tone.fg) { runCatching { uriHandler.openUri(entity.website) } }
        entity.hotline?.takeIf { it.isNotBlank() }?.let { hotline ->
            LinkLine(label = stringResource(R.string.scam_shield_v3_official_hotline), value = hotline, tone = tone.fg) { runCatching { uriHandler.openUri("tel:" + hotline.replace(" ", "")) } }
        }
    }
}

@Composable
private fun LinkLine(label: String, value: String, tone: Color, onOpen: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = "$label:", color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
        Text(
            text = value,
            color = tone,
            fontSize = 12.sp,
            textDecoration = TextDecoration.Underline,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clickable(role = Role.Button, onClick = onOpen),
        )
    }
}

/** `ACTION_ICONS`, with `CircleAlert` for anything the backend adds later. */
private fun actionIcon(key: String): ImageVector = when (key) {
    "stop" -> Icons.Filled.GppBad
    "link" -> Icons.AutoMirrored.Filled.OpenInNew
    "phone" -> Icons.Filled.Phone
    "flag" -> Icons.Filled.Flag
    "warning" -> Icons.Filled.Warning
    "search" -> Icons.Filled.Search
    "check" -> Icons.Filled.CheckCircle
    else -> Icons.Outlined.ErrorOutline
}

/** `ActionsSection`: a primary action on the soft accent in the accent, the rest on the elevated surface. */
@Composable
private fun ActionsSection(actions: List<RecommendedAction>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = stringResource(R.string.scam_shield_v3_actions), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        // Labels come from the backend already written for a human in the user's language; the phone
        // does not invent advice of its own.
        actions.forEach { action ->
            val fg = if (action.isPrimary) HomeV3.Purple else HomeV3.OnSurfaceVariant
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (action.isPrimary) v3AccentSoft() else HomeV3.SurfaceVariant)
                    .padding(12.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(actionIcon(action.icon), contentDescription = null, tint = fg, modifier = Modifier.padding(top = 1.dp).size(16.dp))
                Text(text = action.label, color = fg, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = if (action.isPrimary) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}

/** `SEVERITY_COLOR` for the evidence dot. */
@Composable
private fun severityColor(severity: SignalSeverity): Color = when (severity) {
    SignalSeverity.SAFE -> V3Tone.Emerald
    SignalSeverity.INFO -> HomeV3.Purple
    SignalSeverity.WARNING -> V3Tone.Amber
    SignalSeverity.CRITICAL -> V3Tone.Rose
    SignalSeverity.UNKNOWN -> HomeV3.OnSurfaceVariant
}

/** `EvidenceSection`: collapsed by default; a dot, the source and the summary per item. */
@Composable
private fun EvidenceSection(items: List<EvidenceItem>) {
    var open by remember { mutableStateOf(false) }
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { open = !open }.padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = stringResource(R.string.scam_shield_v3_evidence), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
        }
        if (open) {
            Column(modifier = Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(10.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(modifier = Modifier.padding(top = 5.dp).size(8.dp).clip(CircleShape).background(severityColor(item.severity)))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = item.source, color = HomeV3.OnSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text(text = item.summary, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 2.dp))
                        }
                    }
                }
            }
        }
    }
}

// ── The message verdict (`ScamMessageResult.tsx`) ──

/** `Heading`: a small glyph and a 13sp semibold line. */
@Composable
internal fun SectionHeading(icon: ImageVector, text: String, color: Color = HomeV3.OnSurfaceVariant) {
    Row(modifier = Modifier.padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(15.dp))
        Text(text = text, color = color, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** `AdviceList`: Ban in rose for "stop", CheckCircle in emerald for "go"; rows on the elevated surface. */
@Composable
private fun AdviceList(items: List<AdviceItem>, stop: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(12.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(if (stop) Icons.Filled.Block else Icons.Filled.CheckCircle, contentDescription = null, tint = if (stop) V3Tone.Rose else V3Tone.Emerald, modifier = Modifier.padding(top = 1.dp).size(16.dp))
                Text(text = item.label, color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 17.sp)
            }
        }
    }
}

/** `SEVERITY_COLOR` of a message signal: low = accent, medium = amber, high = rose. */
@Composable
private fun messageSeverityColor(severity: String): Color = when (severity) {
    "high" -> V3Tone.Rose
    "medium" -> V3Tone.Amber
    else -> HomeV3.Purple
}

private fun scamTypeRes(key: String): Int? = when (key) {
    "telegram_account_phishing" -> R.string.scam_v3_msg_type_telegram_account_phishing
    "bank_phishing" -> R.string.scam_v3_msg_type_bank_phishing
    "government_impersonation" -> R.string.scam_v3_msg_type_government_impersonation
    "delivery_scam" -> R.string.scam_v3_msg_type_delivery_scam
    "ecommerce_refund_scam" -> R.string.scam_v3_msg_type_ecommerce_refund_scam
    "prize_scam" -> R.string.scam_v3_msg_type_prize_scam
    "investment_scam" -> R.string.scam_v3_msg_type_investment_scam
    "otp_phishing" -> R.string.scam_v3_msg_type_otp_phishing
    "remote_access_scam" -> R.string.scam_v3_msg_type_remote_access_scam
    "malware_distribution" -> R.string.scam_v3_msg_type_malware_distribution
    "romance_scam" -> R.string.scam_v3_msg_type_romance_scam
    "job_scam" -> R.string.scam_v3_msg_type_job_scam
    "tech_support_scam" -> R.string.scam_v3_msg_type_tech_support_scam
    "customer_support_impersonation" -> R.string.scam_v3_msg_type_customer_support_impersonation
    "loan_scam" -> R.string.scam_v3_msg_type_loan_scam
    "charity_scam" -> R.string.scam_v3_msg_type_charity_scam
    "other" -> R.string.scam_v3_msg_type_other
    else -> null
}

/** `v3.scam.msg.goal.*` — shared by the message card and the knowledge library. */
internal fun attackGoalRes(key: String): Int? = when (key) {
    "account_takeover" -> R.string.scam_v3_msg_goal_account_takeover
    "credential_theft" -> R.string.scam_v3_msg_goal_credential_theft
    "otp_interception" -> R.string.scam_v3_msg_goal_otp_interception
    "payment_fraud" -> R.string.scam_v3_msg_goal_payment_fraud
    "identity_theft" -> R.string.scam_v3_msg_goal_identity_theft
    "malware_installation" -> R.string.scam_v3_msg_goal_malware_installation
    "remote_access_compromise" -> R.string.scam_v3_msg_goal_remote_access_compromise
    "phishing" -> R.string.scam_v3_msg_goal_phishing
    "social_engineering" -> R.string.scam_v3_msg_goal_social_engineering
    "investment_scam" -> R.string.scam_v3_msg_goal_investment_scam
    "romance_scam" -> R.string.scam_v3_msg_goal_romance_scam
    "impersonation" -> R.string.scam_v3_msg_goal_impersonation
    "other" -> R.string.scam_v3_msg_goal_other
    else -> null
}

/**
 * The matched official scenario (web `ScenarioCard`, familiar / suspicious states): which one, the article's signs, and the source block.
 * Static, sourced text — a model never authored any of it. Ends with the web's rose line ("call 113").
 */
@Composable
private fun ScenarioCard(scenario: MessageScenario) {
    val uriHandler = LocalUriHandler.current
    val shape = RoundedCornerShape(12.dp)
    Column(modifier = Modifier.padding(top = 16.dp).fillMaxWidth().clip(shape).background(HomeV3.Surface).padding(14.dp)) {
        SectionHeading(Icons.AutoMirrored.Filled.MenuBook, stringResource(R.string.scam_verdict_scenario_heading))
        Text(text = scenario.title, color = HomeV3.OnSurface, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
        Text(text = stringResource(R.string.scam_verdict_scenario_number, scenario.officialNumber), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
        if (scenario.summary.isNotBlank()) {
            Text(text = scenario.summary, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 8.dp))
        }
        if (scenario.warningSigns.isNotEmpty()) {
            Column(modifier = Modifier.padding(top = 12.dp)) {
                Text(text = stringResource(R.string.scam_verdict_scenario_signs), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                Column(modifier = Modifier.padding(top = 4.dp, start = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    scenario.warningSigns.forEach { w ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(text = "•", color = HomeV3.OnSurface, fontSize = 12.5.sp)
                            Text(text = w, color = HomeV3.OnSurface, fontSize = 12.5.sp, lineHeight = 17.sp)
                        }
                    }
                }
            }
        }
        Column(modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(10.dp)) {
            Text(text = stringResource(R.string.scam_verdict_scenario_source), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            Text(text = "${scenario.sourceOrganization} — ${scenario.sourceTitle}", color = HomeV3.OnSurface, fontSize = 12.5.sp, modifier = Modifier.padding(top = 2.dp))
            if (scenario.sourceUrl.isNotBlank()) {
                Row(
                    modifier = Modifier.padding(top = 4.dp).clickable(role = Role.Button) { runCatching { uriHandler.openUri(scenario.sourceUrl) } },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(13.dp))
                    Text(text = stringResource(R.string.scam_verdict_scenario_source_open), color = HomeV3.Purple, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline)
                }
            }
            Text(text = stringResource(R.string.scam_verdict_scenario_guidance_note), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 6.dp))
        }
        Text(text = stringResource(R.string.scam_verdict_scenario_report), color = V3Tone.Rose, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
    }
}

/**
 * `ScamMessageResult` (web `ScamMessageResult.tsx`): the three-state verdict, the matched scenario, the goal, the signals, what they want,
 * what NOT to do, what to do now, the links, the extracted text, then "TappyAI does not replace the authorities". The verdict, scenario,
 * signals and advice are the SERVER's. NOT written to the device history; no score, no confidence, no quota line.
 */
@Composable
internal fun MessageResultCard(result: MessageAnalysis) {
    val kind = VerdictKind.fromWire(result.verdict) ?: VerdictKind.fromRisk(result.level)
    val tone = toneFor(kind)
    val dangerous = kind != VerdictKind.Unrecognized
    val typeLabel = if (dangerous) result.scamType?.let { scamTypeRes(it) }?.let { stringResource(it) } else null
    val titleRes = when (kind) {
        VerdictKind.Familiar -> R.string.scam_verdict_familiar
        VerdictKind.Suspicious -> R.string.scam_verdict_suspicious
        VerdictKind.Unrecognized -> R.string.scam_verdict_unrecognized
    }
    val bodyRes = when (kind) {
        VerdictKind.Familiar -> R.string.scam_verdict_familiar_body
        VerdictKind.Suspicious -> R.string.scam_verdict_suspicious_body
        VerdictKind.Unrecognized -> R.string.scam_verdict_unrecognized_body
    }
    Column(modifier = Modifier.fillMaxWidth().clip(V3PanelShape).background(tone.soft).border(1.dp, tone.border, V3PanelShape)) {
        VerdictHead(tone = tone, title = stringResource(titleRes), subline = typeLabel, sublineBold = true)

        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
            Text(
                text = stringResource(bodyRes),
                color = HomeV3.OnSurface,
                fontSize = 13.5.sp,
                lineHeight = 20.sp,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(HomeV3.Surface).padding(14.dp),
            )

            // Only a model-written summary (the server's AI switch ON) is shown here; the static wording is the body above.
            if (result.aiStatus == "used" && result.reasoningSummary.isNotBlank()) {
                Text(
                    text = result.reasoningSummary,
                    color = HomeV3.OnSurface,
                    fontSize = 13.5.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(HomeV3.Surface).padding(14.dp),
                )
            }

            result.scenario?.let { ScenarioCard(it) }

            result.attackGoal?.let { attackGoalRes(it) }?.let { goalRes ->
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    SectionHeading(Icons.Filled.MyLocation, stringResource(R.string.scam_v3_msg_goal))
                    Text(text = stringResource(goalRes), color = tone.fg, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                }
            }

            // The web hides the generic "other / rule" signal when a scenario matched.
            val signals = result.signals.filterNot { result.scenario != null && it.type == "other" && it.source == "rule" }
            if (signals.isNotEmpty()) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    SectionHeading(Icons.Filled.Info, stringResource(R.string.scam_verdict_reasons))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        signals.forEach { s ->
                            Row(
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(10.dp),
                                verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Box(modifier = Modifier.padding(top = 5.dp).size(8.dp).clip(CircleShape).background(messageSeverityColor(s.severity)))
                                Text(text = s.explanation, color = HomeV3.OnSurface, fontSize = 12.5.sp, lineHeight = 17.sp)
                            }
                        }
                    }
                }
            }

            if (result.requestedActions.isNotEmpty()) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    SectionHeading(Icons.Filled.MyLocation, stringResource(R.string.scam_v3_msg_wants))
                    Column(modifier = Modifier.padding(start = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        result.requestedActions.forEach { a ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(text = "•", color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp)
                                Text(text = a, color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, lineHeight = 17.sp)
                            }
                        }
                    }
                }
            }

            if (result.doNot.isNotEmpty()) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    SectionHeading(Icons.Filled.Block, stringResource(R.string.scam_v3_msg_doNot), color = V3Tone.Rose)
                    AdviceList(result.doNot, stop = true)
                }
            }

            if (result.doNow.isNotEmpty()) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    SectionHeading(Icons.Filled.CheckCircle, stringResource(R.string.scam_v3_msg_doNow), color = if (dangerous) V3Tone.Emerald else HomeV3.OnSurfaceVariant)
                    AdviceList(result.doNow, stop = false)
                }
            }

            if (result.urlChecks.isNotEmpty()) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    SectionHeading(Icons.Filled.Language, stringResource(R.string.scam_v3_msg_links))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        result.urlChecks.forEach { c ->
                            val level = if (c.checked && c.level != null) c.level else RiskLevel.INCONCLUSIVE
                            val t = toneFor(level)
                            Row(
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Box(modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(t.soft), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Filled.Language, contentDescription = null, tint = t.fg, modifier = Modifier.size(15.dp))
                                }
                                Text(text = displayHost(c.url), color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                if (c.checked) LevelBadge(level = level, small = true)
                                else Text(
                                    text = stringResource(R.string.scam_v3_msg_linkUnchecked),
                                    color = t.fg,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clip(CircleShape).background(t.soft).border(1.dp, t.border, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                            }
                        }
                    }
                }
            }

            result.extractedText?.let { text ->
                var open by remember { mutableStateOf(false) }
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { open = !open }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(Icons.Outlined.DocumentScanner, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(14.dp))
                        Text(text = stringResource(R.string.scam_v3_msg_extracted), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
                    }
                    if (open) {
                        Text(
                            text = text,
                            color = HomeV3.OnSurfaceVariant,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                            modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp).clip(RoundedCornerShape(8.dp)).background(HomeV3.SurfaceVariant).padding(12.dp),
                        )
                    }
                }
            }

            DisclaimerLine(modifier = Modifier.padding(top = 16.dp))
        }
    }
}

// ── The unresolved check ──

/**
 * A check that produced no verdict — the web's rose error box, inside the tool panel.
 *
 * 🚨 Worded as "we could not check this", never as "nothing found". `serverMessage` is preferred
 * when the backend sent one — it arrives already in the app's language via AppLanguageInterceptor,
 * and it says something specific ("you have used today's checks") that a generic local string
 * cannot.
 */
@Composable
internal fun UnresolvedCard(failure: ScamCheckFailure, forMessage: Boolean = false) {
    // Web `ScamShieldView`: a refusal code maps to its dictionary line (`ERROR_KEYS`), anything else — a network failure, a body we could
    // not read — is "checkFailed" (link / QR tabs) or "errFailed" (message tab). The server's own `message` is not shown.
    val message = when (failure) {
        is ScamCheckFailure.Refused -> stringResource(localFallbackFor(failure.code, forMessage))
        ScamCheckFailure.Offline, ScamCheckFailure.Timeout, ScamCheckFailure.Unknown ->
            stringResource(if (forMessage) R.string.scam_v3_msg_errFailed else R.string.scam_shield_error_generic)
    }
    val shape = RoundedCornerShape(12.dp)
    Text(
        text = message,
        color = V3Tone.Rose,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .clip(shape)
            .background(V3Tone.Rose.copy(alpha = 0.10f))
            .border(1.dp, V3Tone.Rose, shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    )
}

/** Used only when the server sent no message of its own (e.g. the request never reached it). */
private fun localFallbackFor(code: String, forMessage: Boolean = false): Int = when (code) {
    "rate_limit" -> R.string.scam_shield_error_rate_limit
    "daily_limit" -> R.string.scam_shield_error_daily_limit
    "invalid_input", "invalid_body" -> R.string.scam_shield_error_invalid_url
    "private_url" -> R.string.scam_shield_error_private_url
    "qr_decode_failed" -> R.string.scam_shield_error_qr_decode
    "qr_no_url" -> R.string.scam_shield_error_qr_no_url
    "no_image", "too_large", "invalid_content_type" -> R.string.scam_shield_error_qr_failed
    // Analyze Message (`ScamShieldView.tsx` `runMessage` / `pickScreenshot`).
    "invalid_image" -> R.string.scam_v3_msg_errImage
    "analyze_failed", "account_required", "account_error" -> R.string.scam_v3_msg_errFailed
    else -> if (forMessage) R.string.scam_v3_msg_errFailed else R.string.scam_shield_error_generic
}

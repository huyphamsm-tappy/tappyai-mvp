package com.tappyai.app.scamshield

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
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.AppLanguageResolver
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.personal.v3AccentSoft
import com.tappyai.app.scamshield.data.ScamScenario
import com.tappyai.app.scamshield.data.isOfficialSourceUrl

// ── Scam Shield · official anti-fraud knowledge library (web `ScamKnowledgeSection.tsx`) ──
//
// A browsable, STATIC list of scam scenarios from an official authority. Nothing here fetches,
// calls a model, or touches a quota: the dataset is a bundled asset, filtered in memory, rendered.
//
// 🚨 TWO KINDS OF TEXT, VISIBLY SEPARATED. Each open card shows the official text under
// "Thông tin từ nguồn chính thức" with the source link, and TappyAI's own guidance under a heading
// that says it is TappyAI's and not a quotation. The dataset keeps them in different fields
// (`official` / `guidance`), and this composable keeps them in different blocks. TappyAI is
// never the authority: every card names the organization, the publication date and the link.
//
// Every chrome string is a resource; scenario content is the dataset's Vietnamese, as published,
// in either UI language (the EN note says so).

internal class CategoryTone(val fg: Color, val soft: Color)

/** `CATEGORY_ICON`: Landmark / Bot / TrendingUp / ShoppingBag / DatabaseZap → Material. */
internal fun categoryIcon(category: String): ImageVector = when (category) {
    "impersonation" -> Icons.Filled.AccountBalance
    "ai_deepfake" -> Icons.Filled.SmartToy
    "investment_jobs" -> Icons.AutoMirrored.Filled.TrendingUp
    "online_trading" -> Icons.Filled.ShoppingBag
    "data_theft" -> Icons.Filled.Storage
    else -> Icons.Filled.GppMaybe
}

/** `CATEGORY_TONE`: one V3 hue per official group. */
@Composable
internal fun categoryTone(category: String): CategoryTone = when (category) {
    "impersonation" -> CategoryTone(V3Tone.Rose, V3Tone.Rose.copy(alpha = 0.12f))
    "ai_deepfake" -> CategoryTone(HomeV3.Purple, v3AccentSoft())
    "investment_jobs" -> CategoryTone(V3Tone.Emerald, V3Tone.Emerald.copy(alpha = 0.12f))
    "online_trading" -> CategoryTone(V3Tone.Amber, V3Tone.Amber.copy(alpha = 0.14f))
    "data_theft" -> CategoryTone(if (HomeV3.Background.luminance() < 0.5f) SsHighDark else SsHighLight, SsHighSoft.copy(alpha = 0.14f))
    else -> CategoryTone(HomeV3.OnSurfaceVariant, HomeV3.SurfaceVariant)
}

internal fun categoryLabelRes(category: String): Int = when (category) {
    "impersonation" -> R.string.scam_v3_kb_cat_impersonation
    "ai_deepfake" -> R.string.scam_v3_kb_cat_ai_deepfake
    "investment_jobs" -> R.string.scam_v3_kb_cat_investment_jobs
    "online_trading" -> R.string.scam_v3_kb_cat_online_trading
    "data_theft" -> R.string.scam_v3_kb_cat_data_theft
    else -> R.string.scam_v3_kb_all
}

/** `List`: a glyph in the given color and a 13sp line per item. */
@Composable
private fun GlyphList(items: List<String>, icon: ImageVector, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { line ->
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(top = 2.dp).size(14.dp))
                Text(text = line, color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 17.sp)
            }
        }
    }
}

@Composable
private fun SubHeading(text: String, color: Color) {
    Text(text = text, color = color, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
}

/** `ScenarioDetail`: the official block, the TappyAI block, the source's prevention block. */
@Composable
private fun ScenarioDetail(scenario: ScamScenario, viewModel: ScamShieldViewModel) {
    val dataset = viewModel.knowledgeDataset
    val group = viewModel.groupOf(scenario)
    val tone = categoryTone(scenario.category)
    val uriHandler = LocalUriHandler.current
    val english = AppLanguageResolver.currentTag() != AppLanguage.Vietnamese.tag
    val shape = RoundedCornerShape(12.dp)

    Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // ── Official block: verbatim text, source, dates. ──
        Column(
            modifier = Modifier.fillMaxWidth().clip(shape).background(V3Tone.Emerald.copy(alpha = 0.08f)).border(1.dp, V3Tone.Emerald.copy(alpha = 0.34f), shape).padding(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Verified, contentDescription = null, tint = V3Tone.Emerald, modifier = Modifier.size(15.dp))
                Text(text = stringResource(R.string.scam_v3_kb_official), color = V3Tone.Emerald, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
            }
            Text(text = scenario.official.summary, color = HomeV3.OnSurface, fontSize = 13.5.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 8.dp))
            if (group != null) {
                Text(
                    text = androidx.compose.ui.text.buildAnnotatedString {
                        pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold))
                        append("${group.officialNumber}. ${group.label}:")
                        pop()
                        append(" ${group.description}")
                    },
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = androidx.compose.ui.text.buildAnnotatedString {
                        append(stringResource(R.string.scam_v3_kb_source) + ": ")
                        pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold, color = HomeV3.OnSurface))
                        append(scenario.source.organization)
                        pop()
                    },
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.sp,
                )
                scenario.source.publishedAt?.let { Text(text = stringResource(R.string.scam_v3_kb_published) + " " + it, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp) }
                Text(text = stringResource(R.string.scam_v3_kb_verifiedAt) + " " + scenario.source.verifiedAt, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
                Text(text = stringResource(R.string.scam_v3_kb_officialNumber, scenario.officialNumber.toString()), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
            }
            // The source link: only an https official host is opened (the dataset's own rule).
            val openable = isOfficialSourceUrl(scenario.source.url)
            Row(
                modifier = Modifier
                    .padding(top = 8.dp)
                    .heightIn(min = 40.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(enabled = openable, role = Role.Button) { runCatching { uriHandler.openUri(scenario.source.url) } },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = V3Tone.Emerald, modifier = Modifier.size(14.dp))
                Text(
                    text = stringResource(R.string.scam_v3_kb_openSource) + ": " + scenario.source.title,
                    color = V3Tone.Emerald,
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    textDecoration = TextDecoration.Underline,
                )
            }
        }

        // ── TappyAI block: derived guidance, labelled as such. ──
        Column(modifier = Modifier.fillMaxWidth().clip(shape).background(HomeV3.SurfaceVariant).padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(15.dp))
                Text(text = stringResource(R.string.scam_v3_kb_guidance), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
            }
            Text(text = stringResource(R.string.scam_v3_kb_guidanceNote), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 2.dp))

            Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    SubHeading(stringResource(R.string.scam_v3_kb_signs), tone.fg)
                    GlyphList(scenario.guidance.warningSigns, Icons.Filled.GppMaybe, tone.fg)
                }
                Column {
                    SubHeading(stringResource(R.string.scam_v3_kb_requests), tone.fg)
                    GlyphList(scenario.guidance.commonRequests, Icons.Filled.MyLocation, tone.fg)
                    Text(text = stringResource(R.string.scam_v3_kb_goal), color = tone.fg, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                    Text(text = attackGoalRes(scenario.attackerGoal)?.let { stringResource(it) } ?: scenario.attackerGoal, color = HomeV3.OnSurface, fontSize = 13.sp)
                }
                Column {
                    SubHeading(stringResource(R.string.scam_v3_kb_doNot), V3Tone.Rose)
                    GlyphList(scenario.guidance.whatNotToDo, Icons.Filled.Block, V3Tone.Rose)
                }
                Column {
                    SubHeading(stringResource(R.string.scam_v3_kb_doNow), V3Tone.Emerald)
                    GlyphList(scenario.guidance.whatToDo, Icons.Filled.CheckCircle, V3Tone.Emerald)
                }
            }
        }

        // ── The source's own prevention measures + hotline, verbatim. ──
        Column(modifier = Modifier.fillMaxWidth().clip(shape).border(1.dp, HomeV3.Outline, shape).padding(14.dp)) {
            Text(text = stringResource(R.string.scam_v3_kb_prevention), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
            Box(modifier = Modifier.padding(top = 8.dp)) { GlyphList(dataset.official.preventionMeasures, Icons.Filled.CheckCircle, V3Tone.Emerald) }
            Row(modifier = Modifier.padding(top = 12.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Phone, contentDescription = null, tint = V3Tone.Rose, modifier = Modifier.padding(top = 2.dp).size(15.dp))
                Text(text = stringResource(R.string.scam_v3_kb_report) + ": " + dataset.official.reportAdvice, color = HomeV3.OnSurface, fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold)
            }
        }

        if (english) {
            Text(text = stringResource(R.string.scam_v3_kb_contentLanguage), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, lineHeight = 15.sp)
        }
    }
}

/** The section: header, the five official groups as filters, the count, the cards, see more/less. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ScamKnowledgeSection(viewModel: ScamShieldViewModel) {
    val scenarios = viewModel.knowledgeScenarios
    val shown = if (viewModel.knowledgeExpanded) scenarios else scenarios.take(ScamShieldViewModel.KNOWLEDGE_PREVIEW)
    val organization = scenarios.firstOrNull()?.source?.organization ?: viewModel.knowledgeDataset.source.organization

    ToolPanel {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(V3Tone.Emerald.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null, tint = V3Tone.Emerald, modifier = Modifier.size(17.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = stringResource(R.string.scam_v3_kb_title).uppercase(), color = HomeV3.OnSurface, fontSize = 16.sp, lineHeight = 20.sp, letterSpacing = 0.3.sp, fontWeight = FontWeight.Bold)
                Text(text = stringResource(R.string.scam_v3_kb_subtitle), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 2.dp))
                Row(modifier = Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Verified, contentDescription = null, tint = V3Tone.Emerald, modifier = Modifier.size(13.dp))
                    Text(
                        text = stringResource(R.string.scam_v3_kb_official) + " · " + stringResource(R.string.scam_v3_kb_source) + ": " + organization,
                        color = V3Tone.Emerald,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        // Category filters — the source's own five groups, plus "all". Wrapping, never scrolling.
        // Filters, not tabs: they narrow one list rather than switch panels.
        FlowRow(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TabChip(stringResource(R.string.scam_v3_kb_all), null, viewModel.knowledgeCategory == null) { viewModel.pickKnowledgeCategory(null) }
            viewModel.knowledgeCategories.forEach { id ->
                TabChip(stringResource(categoryLabelRes(id)), null, viewModel.knowledgeCategory == id) { viewModel.pickKnowledgeCategory(id) }
            }
        }

        Text(text = stringResource(R.string.scam_v3_kb_count, scenarios.size.toString()), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))

        Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            shown.forEach { s ->
                val tone = categoryTone(s.category)
                val open = viewModel.openScenarioId == s.id
                val rowShape = RoundedCornerShape(14.dp)
                Column(modifier = Modifier.fillMaxWidth().clip(rowShape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, rowShape).padding(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button) { viewModel.toggleScenario(s.id) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tone.soft), contentAlignment = Alignment.Center) {
                            Icon(categoryIcon(s.category), contentDescription = null, tint = tone.fg, modifier = Modifier.size(18.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = s.official.title, color = HomeV3.OnSurface, fontSize = 14.sp, lineHeight = 17.sp, fontWeight = FontWeight.Bold)
                            Text(text = s.official.summary, color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                        }
                        Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
                    }
                    if (open) ScenarioDetail(scenario = s, viewModel = viewModel)
                }
            }
        }

        if (scenarios.size > ScamShieldViewModel.KNOWLEDGE_PREVIEW) {
            Row(
                modifier = Modifier.padding(top = 12.dp).heightIn(min = 40.dp).clip(CircleShape).clickable(role = Role.Button, onClick = viewModel::toggleKnowledgeExpanded).padding(horizontal = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(text = stringResource(if (viewModel.knowledgeExpanded) R.string.scam_v3_kb_showLess else R.string.scam_v3_kb_showMore), color = HomeV3.Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Icon(if (viewModel.knowledgeExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(14.dp))
            }
        }
    }
}

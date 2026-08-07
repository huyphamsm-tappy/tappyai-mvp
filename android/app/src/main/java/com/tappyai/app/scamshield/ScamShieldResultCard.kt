package com.tappyai.app.scamshield

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material.icons.filled.GppGood
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.app.scamshield.data.ScamShieldActionDto
import com.tappyai.app.scamshield.data.ScamShieldEvidenceItemDto
import com.tappyai.app.scamshield.data.ScamShieldOfficialEntityDto
import com.tappyai.app.scamshield.data.ScamShieldResultDto
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * Port of the web's `ScamShieldResult.tsx` (main @ 11453de). Renders the server's `CheckResult`
 * and derives nothing from it beyond the two presentation thresholds the web itself applies
 * client-side: the confidence badge bands (80 / 50) and the severity dot colour.
 */

/** `LEVEL_KEY` on the web — the five risk levels and their labels. */
private fun levelLabelRes(level: String): Int = when (level.uppercase()) {
    "SAFE" -> R.string.scam_shield_result_safe
    "LOW" -> R.string.scam_shield_result_low
    "MEDIUM" -> R.string.scam_shield_result_medium
    "HIGH" -> R.string.scam_shield_result_high
    "CRITICAL" -> R.string.scam_shield_result_critical
    else -> R.string.scam_shield_result_medium
}

/** `LEVEL_STYLES.icon` — shield-check / shield-alert / shield-x, in that order of escalation. */
private fun levelIcon(level: String): ImageVector = when (level.uppercase()) {
    "SAFE", "LOW" -> Icons.Filled.GppGood
    "MEDIUM" -> Icons.Filled.GppMaybe
    else -> Icons.Filled.GppBad
}

/** `ACTION_ICONS` — the same seven keys, same fallback. */
private fun actionIcon(icon: String): ImageVector = when (icon) {
    "stop" -> Icons.Filled.GppBad
    "link" -> Icons.Filled.OpenInNew
    "phone" -> Icons.Filled.Phone
    "flag" -> Icons.Filled.Flag
    "warning" -> Icons.Filled.Warning
    "search" -> Icons.Filled.Search
    "check" -> Icons.Filled.CheckCircle
    else -> Icons.Filled.ErrorOutline
}

@Composable
private fun severityColor(severity: String): Color {
    val cat = tappyCategoryColors
    return when (severity) {
        "safe" -> cat.green.accent
        "info" -> cat.blue.accent
        "warning" -> cat.amber.accent
        "critical" -> cat.red.accent
        else -> MaterialTheme.colorScheme.outline
    }
}

@Composable
private fun levelAccent(level: String): Color {
    val cat = tappyCategoryColors
    return when (level.uppercase()) {
        "SAFE" -> cat.green.accent
        "LOW" -> cat.blue.accent
        "MEDIUM" -> cat.amber.accent
        "HIGH" -> cat.orange.accent
        else -> cat.red.accent
    }
}

@Composable
private fun levelContainer(level: String): Color {
    val cat = tappyCategoryColors
    return when (level.uppercase()) {
        "SAFE" -> cat.green.container
        "LOW" -> cat.blue.container
        "MEDIUM" -> cat.amber.container
        "HIGH" -> cat.orange.container
        else -> cat.red.container
    }
}

/** Web `ConfidenceBadge`: >= 80 high, >= 50 medium, otherwise low. */
@Composable
private fun ConfidenceBadge(confidence: Int) {
    val cat = tappyCategoryColors
    val (labelRes, color) = when {
        confidence >= 80 -> R.string.scam_shield_confidence_high to cat.green
        confidence >= 50 -> R.string.scam_shield_confidence_medium to cat.amber
        else -> R.string.scam_shield_confidence_low to cat.red
    }
    Text(
        text = stringResource(labelRes),
        style = MaterialTheme.typography.labelSmall,
        color = color.onContainer,
        modifier = Modifier
            .background(color.container, CircleShape)
            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
    )
}

@Composable
private fun OfficialSection(entity: ScamShieldOfficialEntityDto) {
    val cat = tappyCategoryColors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(cat.green.container, RoundedCornerShape(12.dp))
            .border(1.dp, cat.green.accent.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            Icon(Icons.Filled.Public, contentDescription = null, tint = cat.green.onContainer, modifier = Modifier.size(16.dp))
            Text(
                text = stringResource(R.string.scam_shield_official),
                style = MaterialTheme.typography.labelLarge,
                color = cat.green.onContainer,
            )
        }
        Text(entity.brand, style = MaterialTheme.typography.titleSmall, color = cat.green.onContainer)
        Text(
            text = stringResource(R.string.scam_shield_official_website) + ": " + entity.website,
            style = MaterialTheme.typography.bodySmall,
            color = cat.green.onContainer,
        )
        entity.hotline?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = stringResource(R.string.scam_shield_official_hotline) + ": " + it,
                style = MaterialTheme.typography.bodySmall,
                color = cat.green.onContainer,
            )
        }
    }
}

@Composable
private fun ActionsSection(actions: List<ScamShieldActionDto>) {
    // Web: `locale === 'vi' ? action.label_vi : action.label_en`. Both labels always arrive.
    val isVietnamese = LocalConfiguration.current.locales[0].language == "vi"
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
        Text(
            text = stringResource(R.string.scam_shield_actions),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        actions.forEach { action ->
            val primary = action.priority == "primary"
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        if (primary) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        RoundedCornerShape(8.dp),
                    )
                    .padding(TappySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                Icon(
                    actionIcon(action.icon),
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = if (primary) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = if (isVietnamese) action.label_vi else action.label_en,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (primary) FontWeight.Medium else FontWeight.Normal,
                    color = if (primary) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Collapsible, closed by default — the web's `useState(false)`. Hidden entirely when empty. */
@Composable
private fun EvidenceSection(items: List<ScamShieldEvidenceItemDto>) {
    if (items.isEmpty()) return
    var open by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { open = !open }
                .padding(vertical = TappySpacing.sm),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.scam_shield_evidence),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (open) {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                items.forEach { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                            .padding(TappySpacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    ) {
                        Column(modifier = Modifier.padding(top = 6.dp)) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = severityColor(item.severity),
                                modifier = Modifier.size(8.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            // Web renders only `source` and `summary` from each evidence item.
                            Text(item.source, style = MaterialTheme.typography.labelSmall)
                            Text(
                                item.summary,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ScamShieldResultCard(result: ScamShieldResultDto, modifier: Modifier = Modifier) {
    val accent = levelAccent(result.risk.level)
    val container = levelContainer(result.risk.level)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(container, RoundedCornerShape(16.dp))
            .border(1.dp, accent.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
            .padding(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                levelIcon(result.risk.level),
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(28.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(levelLabelRes(result.risk.level)),
                        style = MaterialTheme.typography.titleMedium,
                        color = accent,
                    )
                    ConfidenceBadge(result.risk.confidence)
                }
                Text(
                    text = result.url,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = result.risk.score.toString(),
                style = MaterialTheme.typography.headlineSmall,
                color = accent,
            )
        }

        result.officialMatch?.let { OfficialSection(it) }
        ActionsSection(result.actions)
        EvidenceSection(result.evidence.items)
    }
}

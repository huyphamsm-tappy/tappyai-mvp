package com.tappyai.app.scamshield

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.outlined.Info
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolBubble
import com.tappyai.app.tools.ToolCard
import com.tappyai.app.tools.ToolCta
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolNote
import com.tappyai.app.tools.ToolOrbit
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material.icons.filled.GppGood
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.Verified
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Scam Shield — B09 parity with the web `/scam-shield` page.
 *
 * ============================================================================
 * WHAT THIS SCREEN DOES AND DOES NOT DO
 * ============================================================================
 * It sends a URL to `POST /api/scam-shield/check` and renders the verdict. It contains no rules,
 * no domain list and no scoring. The engine, the provider fan-out, the official-brand directory
 * and the thresholds all live on the server and stay there — B01 was a CRITICAL scoring bug fixed
 * in one place, and a second implementation here would be a second place for it to come back.
 *
 * The web additionally offers QR-image upload (`/api/scam-shield/qr`). That is deliberately absent
 * rather than half-built: it needs image capture/picking and its own permission story, and a
 * disabled-looking tab is a clearer statement than a broken one.
 *
 * ============================================================================
 * FAIL-CLOSED PRESENTATION
 * ============================================================================
 * 🚨 A check that did not complete is shown as a check that did not complete. There is no path in
 * this file that renders reassurance without a backend verdict saying so, and INCONCLUSIVE (and
 * any level this build does not recognise) is drawn in neutral grey with the "unresolved" glyph —
 * never the green shield. That distinction is the whole reason the engine has that level.
 */
@Composable
fun ScamShieldScreen(
    onBack: () -> Unit,
    viewModel: ScamShieldViewModel = hiltViewModel(),
) {
    ToolV3Page(onBack = onBack) {
        ToolHero(
            hue = ToolHue.Navy,
            eyebrow = stringResource(R.string.tool_scam_eyebrow),
            title1 = stringResource(R.string.tool_scam_title1),
            title2 = stringResource(R.string.tool_scam_title2),
            body = stringResource(R.string.tool_scam_body),
            mascotRes = R.drawable.tappy_recommendation,
            scene = { ScamScene() },
        )

        // The check card (`.v3-scam-input` + CTA): the url field with the link glyph, then the CTA.
        ToolCard(title = stringResource(R.string.scam_shield_url_label), icon = Icons.Filled.Link) {
            ToolTextField(
                value = viewModel.url,
                onValueChange = viewModel::onUrlChange,
                placeholder = stringResource(R.string.scam_shield_url_placeholder),
                keyboardType = KeyboardType.Uri,
                leadingIcon = { Icon(Icons.Filled.Link, contentDescription = null, tint = HomeV3.OnSurfaceVariant) },
            )
            ToolCta(
                text = stringResource(
                    if (viewModel.state is ScamShieldUiState.Checking) R.string.scam_shield_checking
                    else R.string.scam_shield_check,
                ),
                hue = ToolHue.Navy,
                icon = Icons.Filled.Shield,
                onClick = viewModel::check,
                enabled = viewModel.url.isNotBlank(),
                loading = viewModel.state is ScamShieldUiState.Checking,
            )
        }

        when (val state = viewModel.state) {
            is ScamShieldUiState.Idle, is ScamShieldUiState.Checking -> Unit
            is ScamShieldUiState.Result -> VerdictCard(state.result)
            is ScamShieldUiState.Failed -> UnresolvedCard(state.failure)
        }

        ToolNote(text = stringResource(R.string.scam_shield_disclaimer), icon = Icons.Outlined.Info)
    }
}

/** The hero scene: a shield glyph in a glowing ring with two link chips, as on the web. */
@Composable
private fun BoxScope.ScamScene() {
    ToolOrbit(size = 220.dp, alignment = Alignment.Center, modifier = Modifier.offset(y = 6.dp))
    Box(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .offset(x = (-30).dp, y = 4.dp)
            .size(72.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF7C3AED), Color(0xFF4F6BFF)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Shield, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
    }
    ToolBubble(text = "https://…", a = Color(0xFF1E293B), b = Color(0xFF334155), alignment = Alignment.TopStart, modifier = Modifier.offset(x = 6.dp, y = 10.dp))
    ToolBubble(text = "✓ OK", a = Color(0xFF059669), b = Color(0xFF34D399), alignment = Alignment.CenterStart, modifier = Modifier.offset(x = 12.dp, y = 28.dp))
}

/**
 * How each level looks.
 *
 * 🚨 Exhaustive over [RiskLevel] on purpose: adding a level to the enum breaks the build here
 * until someone gives it a deliberate appearance, rather than letting it fall through to a
 * default that might look reassuring. Mirrors `LEVEL_STYLES` in the web's ScamShieldResult.tsx.
 */
private data class LevelAppearance(val color: Color, val icon: ImageVector, val labelRes: Int)

@Composable
private fun appearanceFor(level: RiskLevel): LevelAppearance = when (level) {
    RiskLevel.SAFE -> LevelAppearance(Color(0xFF16A34A), Icons.Filled.GppGood, R.string.scam_shield_level_safe)
    RiskLevel.LOW -> LevelAppearance(Color(0xFF2563EB), Icons.Filled.GppGood, R.string.scam_shield_level_low)
    RiskLevel.MEDIUM -> LevelAppearance(Color(0xFFCA8A04), Icons.Filled.GppMaybe, R.string.scam_shield_level_medium)
    RiskLevel.HIGH -> LevelAppearance(Color(0xFFEA580C), Icons.Filled.GppBad, R.string.scam_shield_level_high)
    RiskLevel.CRITICAL -> LevelAppearance(Color(0xFFDC2626), Icons.Filled.GppBad, R.string.scam_shield_level_critical)
    // Neutral slate + the "maybe" glyph, exactly as on the web: visibly not a verdict, and
    // visibly not a clean bill of health either.
    RiskLevel.INCONCLUSIVE -> LevelAppearance(Color(0xFF64748B), Icons.Filled.GppMaybe, R.string.scam_shield_level_inconclusive)
    RiskLevel.UNKNOWN -> LevelAppearance(Color(0xFF64748B), Icons.Filled.GppMaybe, R.string.scam_shield_level_inconclusive)
}

@Composable
private fun VerdictCard(result: ScamCheckResult) {
    val appearance = appearanceFor(result.level)
    var evidenceOpen by remember { mutableStateOf(false) }

    ToolCard(accent = true) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(appearance.color.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(appearance.icon, contentDescription = null, tint = appearance.color, modifier = Modifier.size(28.dp))
            }
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(appearance.labelRes),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = appearance.color,
                )
                Text(
                    text = result.url,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Text(
            text = stringResource(R.string.scam_shield_score, result.score, result.confidence),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = TappySpacing.md),
        )

        result.officialMatch?.let { entity ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                modifier = Modifier.padding(top = TappySpacing.md),
            ) {
                Icon(Icons.Filled.Verified, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.size(16.dp))
                Text(
                    text = stringResource(R.string.scam_shield_official_match, entity.brand, entity.website),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        if (result.actions.isNotEmpty()) {
            Column(
                verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                modifier = Modifier.padding(top = TappySpacing.md),
            ) {
                // Labels come from the backend already written for a human in the user's language;
                // the phone does not invent advice of its own.
                result.actions.forEach { action ->
                    Text(
                        text = "• ${action.label}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (action.isPrimary) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }

        if (result.evidence.isNotEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = TappySpacing.md)
                    .clip(TappyShapes.card)
                    .clickable { evidenceOpen = !evidenceOpen }
                    .padding(vertical = TappySpacing.sm),
            ) {
                Text(stringResource(R.string.scam_shield_evidence), style = MaterialTheme.typography.bodyMedium)
                Icon(
                    if (evidenceOpen) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = null,
                )
            }

            if (evidenceOpen) {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    result.evidence.forEach { item ->
                        Column {
                            Text(
                                text = "${item.source} — ${item.summary}",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                            )
                            if (item.detail.isNotBlank()) {
                                Text(
                                    text = item.detail,
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
}

/**
 * A check that produced no verdict.
 *
 * 🚨 Worded as "we could not check this", never as "nothing found". `serverMessage` is preferred
 * when the backend sent one — it arrives already in the app's language via AppLanguageInterceptor,
 * and it says something specific ("you have used today's checks") that a generic local string
 * cannot.
 */
@Composable
private fun UnresolvedCard(failure: ScamCheckFailure) {
    val message = when (failure) {
        is ScamCheckFailure.Refused -> failure.serverMessage ?: stringResource(localFallbackFor(failure.code))
        ScamCheckFailure.Offline -> stringResource(R.string.scam_shield_error_offline)
        ScamCheckFailure.Timeout -> stringResource(R.string.scam_shield_error_timeout)
        ScamCheckFailure.Unknown -> stringResource(R.string.scam_shield_error_generic)
    }

    // Neutral slate, like the web's unresolved state: visibly not a verdict either way.
    ToolCard {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(Color(0x2E64748B)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.GppMaybe, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(28.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = stringResource(R.string.scam_shield_unresolved_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(text = message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Used only when the server sent no message of its own (e.g. the request never reached it). */
private fun localFallbackFor(code: String): Int = when (code) {
    "rate_limit" -> R.string.scam_shield_error_rate_limit
    "daily_limit" -> R.string.scam_shield_error_daily_limit
    "invalid_input", "invalid_body" -> R.string.scam_shield_error_invalid_url
    "private_url" -> R.string.scam_shield_error_private_url
    else -> R.string.scam_shield_error_generic
}

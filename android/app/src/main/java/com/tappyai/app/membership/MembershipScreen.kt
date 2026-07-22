package com.tappyai.app.membership

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyComingSoonSheet
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Membership / Upgrade — mirrors the web `/subscription` page (Profile → Upgrade to Pro): hero,
 * Free-status banner, Free vs Pro pricing cards, and an FAQ. UI-only per owner scope:
 *  - No payment / Stripe / billing of any kind — the Upgrade CTA opens a [TappyComingSoonSheet].
 *  - Only the non-subscriber (Free) view is built; the Pro-subscribed state (amber banner, "You're
 *    on Pro", Manage/Cancel) is backend-gated and deferred (see TODO).
 *  - No monthly/yearly switch and no Restore Purchase — the web has neither.
 *  - Free banner shows no "X/10 messages" count (no real data). Prices are the real VND product
 *    prices. All colors come from the theme (no hex), including the Pro card's gradient.
 */
@Composable
fun MembershipScreen(
    onBack: () -> Unit,
    viewModel: MembershipViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var comingSoonFeature by remember { mutableStateOf<String?>(null) }
    val proSubscriptionFeatureName = stringResource(R.string.membership_pro_subscription_feature_name)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.membership_title), style = MaterialTheme.typography.titleLarge)
            }

            Hero()
            MembershipStatusBanner(uiState)
            FreeCard()
            ProCard(
                isPro = uiState.isPro,
                onUpgrade = { comingSoonFeature = proSubscriptionFeatureName },
            )
            FaqSection()
        }
    }

    comingSoonFeature?.let { feature ->
        TappyComingSoonSheet(
            featureName = feature,
            description = stringResource(R.string.coming_soon_description, feature),
            onDismiss = { comingSoonFeature = null },
        )
    }
}

@Composable
private fun Hero() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(TappyShapes.card)
                .background(MaterialTheme.colorScheme.secondary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.WorkspacePremium,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSecondary,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = stringResource(R.string.membership_hero_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Black,
        )
        Text(
            text = stringResource(R.string.membership_hero_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * Status banner reflecting the real subscription (GET /api/subscription): "You're on Pro" when
 * subscribed, else "You're on Free — remaining/limit messages today" from the live quota. Falls back
 * to the static Free line when the count is unknown (signed out or the call failed). Mirrors the web
 * `/subscription` banner.
 */
@Composable
private fun MembershipStatusBanner(uiState: MembershipUiState) {
    val text = when {
        uiState.isPro -> stringResource(R.string.membership_status_pro)
        uiState.remaining != null && uiState.freeDailyLimit != null ->
            stringResource(R.string.membership_status_free_count, uiState.remaining, uiState.freeDailyLimit)
        else -> stringResource(R.string.membership_free_status_banner)
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(TappySpacing.lg),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun FreeCard() {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            PlanHeader(
                name = stringResource(R.string.membership_plan_name_free),
                tagline = stringResource(R.string.membership_free_tagline),
                price = MembershipContent.FREE_PRICE,
                nameColor = MaterialTheme.colorScheme.onSurface,
                subColor = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            MembershipContent.freeFeatures().forEach { feature ->
                FeatureRow(
                    text = feature,
                    checkTint = MaterialTheme.colorScheme.onSurfaceVariant,
                    textColor = MaterialTheme.colorScheme.onSurface,
                )
            }
            // Disabled "current plan" marker, matching the web's non-interactive pill.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.input)
                    .border(1.dp, MaterialTheme.colorScheme.outline, TappyShapes.input)
                    .padding(vertical = TappySpacing.lg),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.membership_current_plan),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ProCard(isPro: Boolean, onUpgrade: () -> Unit) {
    val onGradient = MaterialTheme.colorScheme.onPrimary
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(
                Brush.linearGradient(
                    listOf(
                        MaterialTheme.colorScheme.primary,
                        MaterialTheme.colorScheme.tertiary,
                    ),
                ),
            )
            .padding(TappySpacing.xl),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.WorkspacePremium,
                            contentDescription = null,
                            tint = onGradient,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = stringResource(R.string.membership_plan_name_pro),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = onGradient,
                        )
                    }
                    Text(
                        text = stringResource(R.string.membership_pro_tagline),
                        style = MaterialTheme.typography.bodySmall,
                        color = onGradient.copy(alpha = 0.8f),
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = MembershipContent.PRO_PRICE,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black,
                        color = onGradient,
                    )
                    Text(
                        text = stringResource(R.string.membership_per_month),
                        style = MaterialTheme.typography.bodySmall,
                        color = onGradient.copy(alpha = 0.8f),
                    )
                }
            }
            MembershipContent.proFeatures().forEach { feature ->
                FeatureRow(text = feature, checkTint = onGradient, textColor = onGradient)
            }
            // Inverse CTA (surface pill + primary text) to stand out on the gradient, matching the
            // web. TappyButton has no "inverse on a colored surface" variant, so a small inline
            // pill is used rather than adding a design-system variant for this one site.
            if (isPro) {
                // Already subscribed → non-interactive "You're on Pro ✓", matching the web.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(TappyShapes.card)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(vertical = TappySpacing.lg),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.membership_pro_active_cta),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(TappyShapes.card)
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable(onClick = onUpgrade)
                        .padding(vertical = TappySpacing.lg),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm, Alignment.CenterHorizontally),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Bolt,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            text = stringResource(R.string.membership_upgrade_cta, MembershipContent.PRO_PRICE),
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanHeader(
    name: String,
    tagline: String,
    price: String,
    nameColor: Color,
    subColor: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                text = name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = nameColor,
            )
            Text(text = tagline, style = MaterialTheme.typography.bodySmall, color = subColor)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = price,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = nameColor,
            )
            Text(text = stringResource(R.string.membership_per_month), style = MaterialTheme.typography.bodySmall, color = subColor)
        }
    }
}

@Composable
private fun FeatureRow(text: String, checkTint: Color, textColor: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Check,
            contentDescription = null,
            tint = checkTint,
            modifier = Modifier.size(16.dp),
        )
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = textColor)
    }
}

@Composable
private fun FaqSection() {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
            Text(
                text = stringResource(R.string.membership_faq_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            MembershipContent.faqs().forEach { faq ->
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    Text(
                        text = faq.question,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = faq.answer,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

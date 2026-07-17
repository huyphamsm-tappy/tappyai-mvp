package com.tappyai.app.appconnections

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyComingSoonSheet
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

private data class IntegrationInfo(
    val provider: String,
    val emoji: String,
    val name: String,
    @StringRes val descriptionRes: Int,
    @StringRes val whatTappyGetsRes: Int,
)

private val INTEGRATIONS = listOf(
    IntegrationInfo(
        provider = "google_calendar",
        emoji = "📅",
        name = "Google Calendar",
        descriptionRes = R.string.appconn_calendar_description,
        whatTappyGetsRes = R.string.appconn_calendar_reads,
    ),
    IntegrationInfo(
        provider = "zalo",
        emoji = "💬",
        name = "Zalo",
        descriptionRes = R.string.appconn_zalo_description,
        whatTappyGetsRes = R.string.appconn_zalo_reads,
    ),
)

@Composable
fun AppConnectionsScreen(onBack: () -> Unit) {
    var connectingProvider by remember { mutableStateOf<String?>(null) }

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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.appconn_back),
                    )
                }
                Column {
                    Text(
                        text = stringResource(R.string.appconn_title),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.appconn_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            // Privacy note
            TappyCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(text = "🔒", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = stringResource(R.string.appconn_privacy_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            // Integration cards
            INTEGRATIONS.forEach { info ->
                IntegrationCard(
                    info = info,
                    onConnect = { connectingProvider = info.name },
                )
            }

            // What Tappy does with this data
            TappyCard(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    Text(
                        text = stringResource(R.string.appconn_usage_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    listOf(
                        "📅" to stringResource(R.string.appconn_usage_calendar),
                        "💬" to stringResource(R.string.appconn_usage_zalo),
                        "📊" to stringResource(R.string.appconn_usage_behavior),
                    ).forEach { (emoji, text) ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Text(text = emoji, style = MaterialTheme.typography.bodySmall)
                            Text(
                                text = text,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }

    connectingProvider?.let { name ->
        TappyComingSoonSheet(
            featureName = name,
            description = stringResource(R.string.appconn_coming_soon_description, name),
            onDismiss = { connectingProvider = null },
        )
    }
}

@Composable
private fun IntegrationCard(
    info: IntegrationInfo,
    onConnect: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.Top,
            ) {
                Text(text = info.emoji, style = MaterialTheme.typography.headlineMedium)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                ) {
                    Text(
                        text = info.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(info.descriptionRes),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // "Tappy only reads" box
                    TappyCard(modifier = Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                            Text(
                                text = stringResource(R.string.appconn_reads_label),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = stringResource(info.whatTappyGetsRes),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            TappyButton(
                text = stringResource(R.string.appconn_connect),
                onClick = onConnect,
                variant = TappyButtonVariant.Secondary,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

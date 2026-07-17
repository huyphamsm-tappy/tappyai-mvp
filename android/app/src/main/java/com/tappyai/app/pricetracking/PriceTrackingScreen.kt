package com.tappyai.app.pricetracking

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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.formatCompactVnd
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Price Tracking dashboard — mirrors the web `/profile/price-watches`. Two sections: active watches
 * (TrendingDown icon, primary color, target/current prices, delete → coming-soon) and triggered
 * watches (CheckCircle icon, green, hit price, notified date, 60% opacity). Preceded by a "How to
 * add" info card explaining that watches are created via chat, not from this page. Refresh reloads
 * the seeded preview + snackbar "Updated". Empty state CTA → Chat tab.
 */
@Composable
fun PriceTrackingScreen(
    onBack: () -> Unit,
    onOpenChat: () -> Unit,
    viewModel: PriceTrackingViewModel = hiltViewModel(),
) {
    val snackbarHostState = remember { SnackbarHostState() }

    // One-shot feedback from refresh ("Updated") / a failed refresh / a failed delete.
    LaunchedEffect(Unit) {
        viewModel.messages.collect { message ->
            snackbarHostState.showSnackbar(message = message, duration = SnackbarDuration.Short)
        }
    }

    androidx.compose.material3.Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
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
                // ---- Header ----
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                    Text(
                        text = stringResource(R.string.pricetracking_title),
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = viewModel::onRefresh) {
                        Icon(
                            Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.pricetracking_refresh_content_description),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // ---- How to add info card ----
                HowToAddCard()

                when {
                    viewModel.isLoading && viewModel.watches.isEmpty() -> {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            TappyLoadingIndicator()
                        }
                    }
                    viewModel.error != null && viewModel.watches.isEmpty() -> {
                        TappyErrorState(
                            title = stringResource(R.string.pricetracking_error_title),
                            message = viewModel.error,
                            retryText = stringResource(R.string.common_try_again),
                            onRetry = viewModel::retry,
                        )
                    }
                    viewModel.watches.isEmpty() -> {
                        EmptyWatchState(onGoToChat = onOpenChat)
                    }
                    else -> {
                        // ---- Active watches ----
                        if (viewModel.activeWatches.isNotEmpty()) {
                            ActiveWatchSection(
                                watches = viewModel.activeWatches,
                                maxActive = 10,
                                onDelete = { viewModel.onDelete(it) },
                            )
                        }

                        // ---- Triggered watches ----
                        if (viewModel.triggeredWatches.isNotEmpty()) {
                            TriggeredWatchSection(watches = viewModel.triggeredWatches)
                        }
                    }
                }
            }
        }
    }
}

/** Info card explaining that watches are created via chat, not from this page. */
@Composable
private fun HowToAddCard() {
    TappyCard {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                Icons.Filled.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                Text(
                    text = stringResource(R.string.pricetracking_how_to_add_title),
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = stringResource(R.string.pricetracking_how_to_add_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Empty state when no watches exist. */
@Composable
private fun EmptyWatchState(onGoToChat: () -> Unit) {
    TappyEmptyState(
        icon = Icons.AutoMirrored.Filled.TrendingDown,
        title = stringResource(R.string.pricetracking_empty_title),
        message = stringResource(R.string.pricetracking_empty_message),
        actionText = stringResource(R.string.pricetracking_go_to_chat),
        onAction = onGoToChat,
    )
}

/** Active watches section header + cards. */
@Composable
private fun ActiveWatchSection(
    watches: List<PriceWatch>,
    maxActive: Int,
    onDelete: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(
            text = stringResource(R.string.pricetracking_tracking_header, watches.size, maxActive),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            letterSpacing = 1.sp,
        )
        watches.forEach { watch ->
            ActiveWatchCard(watch = watch, onDelete = { onDelete(watch.id) })
        }
    }
}

/** Single active watch card: TrendingDown icon (primary) + product name + prices + delete. */
@Composable
private fun ActiveWatchCard(watch: PriceWatch, onDelete: () -> Unit) {
    TappyCard {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.TrendingDown,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = watch.productName,
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = stringResource(R.string.pricetracking_target_price, formatCompactVnd(watch.targetPrice)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (watch.currentPrice != null) {
                    Text(
                        text = stringResource(R.string.pricetracking_current_price, formatCompactVnd(watch.currentPrice)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (watch.lastChecked != null) {
                    Text(
                        text = stringResource(R.string.pricetracking_checked_date, formatWatchDate(watch.lastChecked)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
            }
            IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.pricetracking_delete_watch_content_description),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/** Triggered watches section header + cards. */
@Composable
private fun TriggeredWatchSection(watches: List<PriceWatch>) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(
            text = stringResource(R.string.pricetracking_notified_header, watches.size),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            letterSpacing = 1.sp,
        )
        watches.forEach { watch ->
            TriggeredWatchCard(watch = watch)
        }
    }
}

/** Single triggered watch card: CheckCircle (green) + product name + hit price + date, 60% opacity. */
@Composable
private fun TriggeredWatchCard(watch: PriceWatch) {
    TappyCard(modifier = Modifier.alpha(0.6f)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = Color(0xFF4CAF50),
                modifier = Modifier.size(24.dp),
            )
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = watch.productName,
                    style = MaterialTheme.typography.titleSmall,
                )
                if (watch.currentPrice != null) {
                    Text(
                        text = formatCompactVnd(watch.currentPrice),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF4CAF50),
                    )
                }
                if (watch.notifiedAt != null) {
                    Text(
                        text = stringResource(R.string.pricetracking_notified_date, formatWatchDate(watch.notifiedAt)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
            }
        }
    }
}

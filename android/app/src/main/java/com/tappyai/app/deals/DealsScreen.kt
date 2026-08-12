package com.tappyai.app.deals

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * Deals — mirrors the web `/deals`: a list of curated, daily-rotating deals from
 * `GET /api/deals`. Every card is an external link (opened via the system browser, matching the
 * web's `<a target="_blank">`) — there is no in-app booking/checkout, same "platform search link,
 * never a fake in-app CTA" rule the rest of the app follows.
 */
@Composable
fun DealsScreen(
    // Null when Deals is a top-level shell tab (Web parity: /deals is a primary nav destination):
    // the shell's TappyAppBar already shows the title, so the in-content back+title header is
    // suppressed. Non-null keeps the drill-in header for any push-navigation caller.
    onBack: (() -> Unit)? = null,
    viewModel: DealsViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    val uriHandler = LocalUriHandler.current

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxSize()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            if (onBack != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                    Text(text = stringResource(R.string.deals_title), style = MaterialTheme.typography.titleLarge)
                }
            }

            when (state) {
                UiState.Loading, UiState.Idle -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    TappyLoadingIndicator()
                }
                is UiState.Error -> TappyErrorState(
                    title = stringResource(R.string.deals_error_title),
                    message = state.message,
                    onRetry = viewModel::retry,
                )
                UiState.Empty -> TappyEmptyState(
                    icon = Icons.Filled.LocalOffer,
                    title = stringResource(R.string.deals_empty_title),
                    message = stringResource(R.string.deals_empty_message),
                )
                is UiState.Success -> DealsList(deals = state.data, onOpen = { uriHandler.openUri(it) })
            }
        }
    }
}

@Composable
private fun DealsList(deals: List<Deal>, onOpen: (String) -> Unit) {
    // Keys are derived up front rather than inline: `it.url` alone is not unique (see
    // [dealListKeys]), and a duplicate key crashes the whole tab during measure.
    val keys = remember(deals) { dealListKeys(deals) }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        itemsIndexed(items = deals, key = { index, _ -> keys[index] }) { _, deal ->
            // A blank url has nothing to open — `openUri("")` throws ActivityNotFoundException,
            // so such a card renders as plain (non-tappable) content instead.
            val url = deal.url.trim()
            DealCard(deal = deal, onClick = if (url.isEmpty()) null else ({ onOpen(url) }))
        }
    }
}

/** [onClick] is null for a deal with no url — the card then carries no tap affordance at all. */
@Composable
private fun DealCard(deal: Deal, onClick: (() -> Unit)?) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(colors.surfaceVariant)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = deal.emoji, style = MaterialTheme.typography.headlineSmall)

        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = deal.title,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (deal.badge != null) {
                    Box(
                        modifier = Modifier
                            .clip(TappyShapes.pill)
                            .background(tappyCategoryColors.red.accent)
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    ) {
                        Text(text = deal.badge, style = MaterialTheme.typography.labelSmall, color = colors.onError)
                    }
                }
            }
            Text(text = deal.discount, style = MaterialTheme.typography.bodyMedium, color = tappyCategoryColors.green.accent)
            Text(
                text = stringResource(R.string.deals_category_source_format, deal.category, deal.source),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
            )
        }

        // Only promise "opens externally" when there is actually something to open.
        if (onClick != null) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                contentDescription = stringResource(R.string.deals_opens_externally_description),
                tint = colors.onSurfaceVariant,
            )
        }
    }
}

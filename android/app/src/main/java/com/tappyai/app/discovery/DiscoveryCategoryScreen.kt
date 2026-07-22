package com.tappyai.app.discovery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappySearchBar
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Reusable browse template for one Discovery domain (e.g. Food & Cafés). Inline header (back +
 * domain title) — the app shell keeps the "Explore" top bar, so this adds a drill-down header
 * without modifying the shell. Search + sub-category chips + a result area that renders the
 * **real empty/loading state** (no fake venues). When results are connected they'll be
 * `TappyMediaCard`s keyed by the selected sub-category's stable `id`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoveryCategoryScreen(
    onBack: () -> Unit,
    viewModel: DiscoveryCategoryViewModel = hiltViewModel(),
) {
    val resultsState by viewModel.resultsState.collectAsStateWithLifecycle()
    val group = viewModel.group

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Column(
        modifier = Modifier
            .widthIn(max = TappyContainers.content)
            .fillMaxWidth()
            .fillMaxHeight()
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
            }
            Text(text = group.title(), style = MaterialTheme.typography.titleLarge)
        }

        TappySearchBar(
            query = viewModel.query,
            onQueryChange = viewModel::onQueryChange,
            placeholder = stringResource(R.string.discovery_category_search_placeholder, group.title()),
        )

        // Sub-category chips only when the domain has more than one category.
        if (group.categories.size > 1) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                items(items = group.categories, key = { it.id }) { category ->
                    FilterChip(
                        selected = category == viewModel.selectedCategory,
                        onClick = { viewModel.onSelectCategory(category) },
                        label = { Text(category.title()) },
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            when (resultsState) {
                UiState.Loading -> TappyLoadingIndicator()
                // Idle / Empty / Error → honest empty state (no data source yet).
                else -> TappyEmptyState(
                    icon = Icons.Filled.SearchOff,
                    title = stringResource(R.string.discovery_results_empty_title),
                    message = stringResource(R.string.discovery_results_empty_message),
                )
            }
        }
      }
    }
}

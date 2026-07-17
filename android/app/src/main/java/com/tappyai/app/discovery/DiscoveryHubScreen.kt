package com.tappyai.app.discovery

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappySearchBar
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.TappyWindowWidthClass
import com.tappyai.core.designsystem.theme.currentWindowWidthClass

/**
 * Discovery hub — the Explore tab's landing surface. A search entry and the five Discovery domain
 * groups as a responsive tile grid, mirroring the web's Explore page. Tapping a group drills into
 * [DiscoveryCategoryScreen]. (Personalized recommendations live on their own screen reached from
 * Home — "✨ Gợi ý cho bạn" — exactly as on the web, not embedded here.)
 */
@Composable
fun DiscoveryHubScreen(
    onOpenGroup: (DiscoveryGroup) -> Unit,
    viewModel: DiscoveryHubViewModel = hiltViewModel(),
) {
    val columns = when (currentWindowWidthClass()) {
        TappyWindowWidthClass.Compact -> 2
        TappyWindowWidthClass.Medium -> 3
        TappyWindowWidthClass.Expanded -> 4
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.feed)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            TappySearchBar(
                query = viewModel.query,
                onQueryChange = viewModel::onQueryChange,
                placeholder = stringResource(R.string.discovery_search_placeholder),
            )

            SectionHeader(title = stringResource(R.string.discovery_section_browse))
            GroupGrid(columns = columns, onOpenGroup = onOpenGroup)
        }
    }
}

@Composable
private fun GroupGrid(columns: Int, onOpenGroup: (DiscoveryGroup) -> Unit) {
    // Chunked rows rather than LazyVerticalGrid, since the hub sits inside a verticalScroll.
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        DiscoveryGroup.entries.chunked(columns).forEach { rowGroups ->
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                rowGroups.forEach { group ->
                    GroupTile(
                        group = group,
                        onClick = { onOpenGroup(group) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(columns - rowGroups.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun GroupTile(group: DiscoveryGroup, onClick: () -> Unit, modifier: Modifier = Modifier) {
    TappyCard(
        modifier = modifier
            .clip(TappyShapes.card)
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Icon(
                imageVector = group.icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
            Text(
                text = group.title(),
                style = MaterialTheme.typography.labelLarge,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
}

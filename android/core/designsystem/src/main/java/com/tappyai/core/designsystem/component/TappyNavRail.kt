package com.tappyai.core.designsystem.component

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.tappyai.core.designsystem.theme.TappyAITheme

/**
 * Side navigation rail — the Expanded-window counterpart of [TappyBottomNavBar], for
 * tablets/foldables/ChromeOS wide windows (docs/UI_GUIDELINES.md §16: the same top-level
 * destinations, relocated to the side rather than a sidebar/drawer). Takes the identical
 * [TappyNavItem] list + index-based selection contract as the bottom bar, so a caller switches
 * between the two purely on window width with one shared destination list as the source of
 * truth. Each `NavigationRailItem` resolves to a ≥48dp target and keeps its Tab role +
 * selected-state semantics; the spoken name comes from [TappyNavItem.contentDescription] on the
 * icon, with the visible label's semantics cleared so TalkBack reads it once (same a11y
 * contract as [TappyBottomNavBar]).
 */
@Composable
fun TappyNavRail(
    items: List<TappyNavItem>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationRail(modifier = modifier) {
        items.forEachIndexed { index, item ->
            NavigationRailItem(
                // See TappyBottomNavBar for why contentDescription is set on the item node (via
                // merging semantics{}) rather than the icon, with the label's semantics cleared.
                modifier = Modifier.semantics { contentDescription = item.contentDescription },
                selected = index == selectedIndex,
                onClick = { onSelect(index) },
                icon = { Icon(imageVector = item.icon, contentDescription = null) },
                label = { Text(item.label, modifier = Modifier.clearAndSetSemantics {}) },
            )
        }
    }
}

@TappyComponentPreviews
@Composable
private fun TappyNavRailPreview() {
    TappyAITheme(dynamicColor = false) {
        val items = remember {
            listOf(
                TappyNavItem("Home", Icons.Filled.Home),
                TappyNavItem("Chat", Icons.AutoMirrored.Filled.Chat),
                TappyNavItem("Explore", Icons.Filled.Explore),
            )
        }
        var selected by remember { mutableIntStateOf(0) }
        TappyNavRail(items = items, selectedIndex = selected, onSelect = { selected = it })
    }
}

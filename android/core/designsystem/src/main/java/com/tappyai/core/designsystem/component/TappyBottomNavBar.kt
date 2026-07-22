package com.tappyai.core.designsystem.component

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.tappyai.core.designsystem.theme.TappyAITheme

/**
 * One entry in a navigation surface (bottom bar or rail). Deliberately carries no route: the
 * design system stays ignorant of the app's information architecture, so the concrete
 * destinations (and their routes) live in `:app`'s own centralized definition and are the
 * single source of truth for both the nav chrome and the NavHost. This mirrors the decoupling
 * used elsewhere (design system owns *how* things look, `:app`/`features:*` own *what* the
 * destinations are).
 *
 * [contentDescription] is the item's spoken TalkBack label and its single accessibility source
 * — the nav components apply it to the icon and clear the visible [label]'s own semantics, so
 * the name is announced exactly once (not "Home Home"). Defaults to [label]; pass an explicit
 * value when the accessible name should differ from or enrich the visible text.
 */
data class TappyNavItem(
    val label: String,
    val icon: ImageVector,
    val contentDescription: String = label,
)

/**
 * Fixed bottom tab bar (docs/UI_GUIDELINES.md §16 — "no sidebar at any size", persists on
 * desktop/ChromeOS-wide windows too, just centered/constrained via the caller's container).
 * Each `NavigationBarItem` resolves to a ≥48dp Material touch target and keeps its Tab role +
 * selected-state semantics. The spoken name comes from [TappyNavItem.contentDescription] on the
 * icon; the visible label's semantics are cleared so TalkBack reads the name once, not twice.
 *
 * Generic over [items] + [selectedIndex]/[onSelect] (index-based) so the caller owns the
 * destination list — see [TappyNavItem]'s doc for why routes don't live here.
 */
@Composable
fun TappyBottomNavBar(
    items: List<TappyNavItem>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationBar(modifier = modifier) {
        items.forEachIndexed { index, item ->
            NavigationBarItem(
                // contentDescription is set on the merged item node (not the icon) so it becomes
                // the item's single spoken name alongside the framework's Tab role + selected
                // state; the visible label's own semantics are cleared so the name isn't read
                // twice. semantics{} merges (keeps selectable/role), unlike clearAndSetSemantics.
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
private fun TappyBottomNavBarPreview() {
    TappyAITheme(dynamicColor = false) {
        val items = remember {
            listOf(
                TappyNavItem("Home", Icons.Filled.Home),
                TappyNavItem("Chat", Icons.AutoMirrored.Filled.Chat),
                TappyNavItem("Explore", Icons.Filled.Explore),
            )
        }
        var selected by remember { mutableIntStateOf(0) }
        TappyBottomNavBar(items = items, selectedIndex = selected, onSelect = { selected = it })
    }
}

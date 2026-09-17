package com.tappyai.app.explore

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.core.designsystem.component.TappyNavItem

/**
 * The Explore tab's bottom navigation — the floating glass dock of the reference design
 * ("TappyAI — Immersive AI Discovery"): a rounded, translucent near-black bar with a thin light
 * border, lifted off the bottom edge, the active item drawn with the accent halo and accent label.
 *
 * Same [TappyNavItem]s, same indices, same `onSelect` as the shell's `TappyBottomNavBar` — only
 * the dress differs, and only the Explore tab wears it (the other tabs keep the app's bar). It
 * sits ABOVE the feed: the feed keeps [ExploreV3.DockClearance] free so its rail and caption end
 * above the dock, and the video runs underneath it, as the reference shows.
 */
@Composable
internal fun ExploreFloatingDock(
    items: List<TappyNavItem>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .navigationBarsPadding()
            .padding(start = ExploreV3.DockMargin, end = ExploreV3.DockMargin, bottom = ExploreV3.DockLift)
            .fillMaxWidth()
            .height(ExploreV3.DockHeight)
            .clip(RoundedCornerShape(28.dp))
            .background(ExploreV3.Glass)
            .border(1.dp, ExploreV3.GlassBorder, RoundedCornerShape(28.dp))
            .padding(horizontal = 6.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { index, item ->
            DockItem(
                item = item,
                selected = index == selectedIndex,
                onClick = { onSelect(index) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun DockItem(
    item: TappyNavItem,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Subtle, not showy: the accent fades in and out over the icon halo and the label.
    val tint by animateColorAsState(if (selected) ExploreV3.Purple else Color.White, label = "dock-tint")
    val halo by animateColorAsState(if (selected) ExploreV3.Glow else Color.Transparent, label = "dock-halo")
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
            .semantics { contentDescription = item.contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Tab,
                onClick = onClick,
            )
            .padding(vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(halo),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = item.icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = item.label,
            color = if (selected) ExploreV3.Purple else Color.White,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

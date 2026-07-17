package com.tappyai.app.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.theme.TappyContainers

/**
 * Stand-in content for a shell tab whose real feature hasn't been built yet (Phase 1C.1 is the
 * navigation shell only — no AI/Chat/Discovery/Maps/Profile logic). Each tab renders the same
 * empty-state shape, keyed off [HomeTab] so the icon/title stay in sync with the single source
 * of truth rather than being re-typed here. The `widthIn` cap keeps the content centered on
 * tablet/ChromeOS-wide windows instead of stretching edge to edge.
 */
@Composable
fun PlaceholderTabScreen(tab: HomeTab) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        val label = tab.title()
        TappyEmptyState(
            icon = tab.icon,
            title = label,
            message = stringResource(R.string.home_tab_placeholder_message, label),
            modifier = Modifier.widthIn(max = TappyContainers.content),
        )
    }
}

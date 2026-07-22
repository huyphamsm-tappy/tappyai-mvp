package com.tappyai.app.maps

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * The map surface. **Right now it renders a styled placeholder** — no Google Maps SDK, no
 * Play Services, no API key, no network, no location. It exists as a clean seam: a later phase
 * can replace this composable's body with a real `GoogleMap` (or MapLibre) **without changing
 * `MapsScreen`**, because the screen only ever calls `MapCanvas(modifier)` and stacks its own
 * search / filters / FABs on top.
 *
 * Deliberately lives in `:app/maps` and NOT in `core:designsystem`: the eventual real
 * implementation pulls in the Google Maps dependency, which must not leak into the app-agnostic,
 * lightweight design system (Architecture v3 keeps `core:designsystem` free of heavy SDKs).
 */
@Composable
fun MapCanvas(modifier: Modifier = Modifier) {
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        // Faint grid so it reads as a map placeholder rather than a blank panel.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val step = 48.dp.toPx()
            var x = 0f
            while (x < size.width) {
                drawLine(gridColor, start = androidx.compose.ui.geometry.Offset(x, 0f),
                    end = androidx.compose.ui.geometry.Offset(x, size.height), strokeWidth = 1f)
                x += step
            }
            var y = 0f
            while (y < size.height) {
                drawLine(gridColor, start = androidx.compose.ui.geometry.Offset(0f, y),
                    end = androidx.compose.ui.geometry.Offset(size.width, y), strokeWidth = 1f)
                y += step
            }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.Map,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(40.dp),
            )
            Text(
                text = stringResource(R.string.maps_preview_label),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

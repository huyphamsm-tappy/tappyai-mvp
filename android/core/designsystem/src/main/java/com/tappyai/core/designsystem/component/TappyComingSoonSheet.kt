package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Reusable "this feature isn't built yet" bottom sheet — the single, consistent way any
 * unfinished feature across the app tells the user it's on the way, instead of ad-hoc snackbars
 * or dead links. Content-driven ([featureName] + [description] are passed in), so it stays
 * app-agnostic like the library's other state components ([TappyEmptyState]/[TappyErrorState]);
 * it bakes in no product-specific copy or routing.
 *
 * Deliberately carries no notification/"remind me" logic (that's a later capability) — just an
 * honest message and a Close action.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TappyComingSoonSheet(
    featureName: String,
    description: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TappyBottomSheet(onDismiss = onDismiss, modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Icon(
                imageVector = Icons.Filled.RocketLaunch,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp),
            )
            Text(
                text = featureName,
                style = MaterialTheme.typography.titleLarge,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "Coming soon",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            TappyButton(
                text = "Close",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** Sheets render in their own window (see [TappyBottomSheet]'s preview note), so this previews
 *  the sheet's *content* on the rounded-top surface it would sit on. */
@TappyComponentPreviews
@Composable
private fun TappyComingSoonSheetContentPreview() {
    TappyAITheme(dynamicColor = false) {
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface, TappyShapes.sheet)
                .padding(TappySpacing.xl)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Icon(
                imageVector = Icons.Filled.RocketLaunch,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp),
            )
            Text("Music", style = MaterialTheme.typography.titleLarge)
            Text("Coming soon", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text(
                "This feature is on the way. Check back soon.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            TappyButton(text = "Close", onClick = {}, modifier = Modifier.fillMaxWidth())
        }
    }
}

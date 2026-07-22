package com.tappyai.app.profile

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tappyai.core.designsystem.theme.TappySpacing

/** Uppercase section label above a menu card (matches the web's `text-xs uppercase` headers).
 *  Shared by the Profile landing and Settings screens. */
@Composable
internal fun MenuSectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(start = TappySpacing.sm, bottom = TappySpacing.xs),
    )
}

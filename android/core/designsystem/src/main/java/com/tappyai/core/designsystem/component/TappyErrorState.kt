package com.tappyai.core.designsystem.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Generic error/failure state, matching [TappyEmptyState]'s layout so the two are visually
 * interchangeable depending on which the caller needs. Never renders raw exception text —
 * callers pass a human-readable [message]; server error detail must not reach this component
 * (matches the backend's own "never leak DB error text to the client" rule).
 */
@Composable
fun TappyErrorState(
    title: String,
    modifier: Modifier = Modifier,
    message: String? = null,
    retryText: String? = "Try again",
    onRetry: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(TappySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        if (message != null) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        if (retryText != null && onRetry != null) {
            TappyButton(text = retryText, onClick = onRetry, size = TappyButtonSize.Small)
        }
    }
}

@TappyComponentPreviews
@Composable
private fun TappyErrorStatePreview() {
    TappyAITheme(dynamicColor = false) {
        TappyErrorState(
            title = "Something went wrong",
            message = "Check your connection and try again.",
            onRetry = {},
        )
    }
}

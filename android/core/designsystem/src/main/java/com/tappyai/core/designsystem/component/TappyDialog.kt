package com.tappyai.core.designsystem.component

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes

/**
 * Centered confirm/alert dialog (docs/UI_GUIDELINES.md §17). For the full-content /
 * mobile-bottom-sheet case, use [TappyBottomSheet] instead — this is for short
 * confirm/cancel-style prompts only.
 */
@Composable
fun TappyDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dismissText: String? = "Cancel",
) {
    AlertDialog(
        modifier = modifier,
        onDismissRequest = onDismiss,
        shape = TappyShapes.card,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TappyButton(text = confirmText, onClick = onConfirm, size = TappyButtonSize.Small)
        },
        dismissButton = dismissText?.let {
            {
                TappyButton(
                    text = it,
                    onClick = onDismiss,
                    variant = TappyButtonVariant.Ghost,
                    size = TappyButtonSize.Small,
                )
            }
        },
    )
}

@TappyComponentPreviews
@Composable
private fun TappyDialogPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyDialog(
            title = "Delete this item?",
            message = "This action cannot be undone.",
            confirmText = "Delete",
            onConfirm = {},
            onDismiss = {},
        )
    }
}

package com.tappyai.core.designsystem.component

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.tappyai.core.designsystem.R
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes

/**
 * Centered confirm/alert dialog (docs/UI_GUIDELINES.md §17). For the full-content /
 * mobile-bottom-sheet case, use [TappyBottomSheet] instead — this is for short
 * confirm/cancel-style prompts only.
 *
 * 🚨 [dismissText] defaults to a RESOURCE, never a Kotlin literal. The default used to be the
 * string `"Cancel"`, and a default is precisely the value every caller that thinks about this
 * least ends up shipping: the account-deletion dialog rendered a Vietnamese title, a Vietnamese
 * message and a Vietnamese confirm button next to an English "Cancel" (V2-UAT-016). The
 * translation existed the whole time — `common_cancel` = "Hủy" — it just was not what the
 * component reached for. A hardcoded default in a shared component is a localization bug in every
 * screen that uses it at once, which is why this one is asserted by
 * `src/lib/i18n/androidHardcodedUiStrings.test.ts`.
 */
@Composable
fun TappyDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dismissText: String? = stringResource(R.string.tappy_dialog_dismiss),
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

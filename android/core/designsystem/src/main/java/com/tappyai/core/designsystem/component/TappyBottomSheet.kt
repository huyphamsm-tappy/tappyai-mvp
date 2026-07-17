package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Bottom-sheet modal (docs/UI_GUIDELINES.md §17): rounded top corners, slide-up on mobile.
 * `ModalBottomSheet` already respects `prefers-reduced-motion`-equivalent system settings and
 * locks background scroll/interaction while open, matching the guideline's modal rules.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TappyBottomSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(),
    content: @Composable () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = sheetState,
        shape = TappyShapes.sheet,
    ) {
        androidx.compose.foundation.layout.Box(modifier = Modifier.padding(TappySpacing.xl)) {
            content()
        }
    }
}

/**
 * `ModalBottomSheet` renders as a real window/`Popup`, which Compose's static Preview
 * renderer can't animate/host meaningfully — so instead of invoking [TappyBottomSheet]
 * itself, this previews its *content* on the same rounded-top surface it would sit on,
 * which is the standard workaround for previewing sheet content.
 */
@TappyComponentPreviews
@Composable
private fun TappyBottomSheetContentPreview() {
    TappyAITheme(dynamicColor = false) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface, TappyShapes.sheet)
                .padding(TappySpacing.xl),
        ) {
            Text("Sheet content")
        }
    }
}

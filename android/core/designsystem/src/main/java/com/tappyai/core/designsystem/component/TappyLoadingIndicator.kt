package com.tappyai.core.designsystem.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.tappyai.core.designsystem.R
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappySpacing

/** Full-width centered spinner for screen/section-level loading (not inline button loading —
 *  see [TappyButton]'s own `loading` param for that). */
@Composable
fun TappyLoadingIndicator(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.tappy_cd_loading)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(TappySpacing.xxxl)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}

@TappyComponentPreviews
@Composable
private fun TappyLoadingIndicatorPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyLoadingIndicator()
    }
}

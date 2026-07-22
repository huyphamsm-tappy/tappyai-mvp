package com.tappyai.core.designsystem.component

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.tappyai.core.designsystem.R
import com.tappyai.core.designsystem.theme.TappyAITheme

/**
 * Sticky top bar (docs/UI_GUIDELINES.md §16). Back button, when present, always carries a
 * localized `contentDescription` for TalkBack rather than relying on the icon alone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TappyAppBar(
    title: String,
    modifier: Modifier = Modifier,
    onBackClick: (() -> Unit)? = null,
    actions: @Composable () -> Unit = {},
) {
    CenterAlignedTopAppBar(
        modifier = modifier,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        navigationIcon = {
            if (onBackClick != null) {
                IconButton(onClick = onBackClick) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.tappy_cd_back),
                    )
                }
            }
        },
        actions = { actions() },
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(),
    )
}

@TappyComponentPreviews
@Composable
private fun TappyAppBarPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyAppBar(title = "Design System", onBackClick = {})
    }
}

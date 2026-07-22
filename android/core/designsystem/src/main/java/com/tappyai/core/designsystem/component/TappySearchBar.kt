package com.tappyai.core.designsystem.component

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import com.tappyai.core.designsystem.R
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyMinTouchTarget
import com.tappyai.core.designsystem.theme.TappyShapes

/**
 * Search input, same visual language as [TappyTextField] with a fixed leading search icon.
 * Defaults the keyboard's action button to "Search" (dismissing the keyboard on tap/Enter) rather
 * than a generic newline/Enter — every caller across the app is a real search field, never a
 * multi-line one, so this default needs no per-caller opt-in.
 */
@Composable
fun TappySearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search",
    onClear: () -> Unit = { onQueryChange("") },
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = { Text(placeholder) },
        singleLine = true,
        shape = TappyShapes.input,
        textStyle = MaterialTheme.typography.bodyMedium,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { keyboardController?.hide() }),
        leadingIcon = {
            Icon(imageVector = Icons.Filled.Search, contentDescription = null)
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = onClear, modifier = Modifier.size(TappyMinTouchTarget)) {
                    Icon(imageVector = Icons.Filled.Clear, contentDescription = stringResource(R.string.tappy_search_clear))
                }
            }
        },
    )
}

@TappyComponentPreviews
@Composable
private fun TappySearchBarPreview() {
    TappyAITheme(dynamicColor = false) {
        var query by remember { mutableStateOf("") }
        TappySearchBar(query = query, onQueryChange = { query = it })
    }
}

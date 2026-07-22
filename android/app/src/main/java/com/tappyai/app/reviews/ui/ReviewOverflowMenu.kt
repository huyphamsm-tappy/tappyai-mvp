package com.tappyai.app.reviews.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.tappyai.app.R

private val OverflowIconColor = Color(0xFFFFFFFF)
private val DeleteRed = Color(0xFFEF4444)

@Composable
internal fun ReviewOverflowMenu(
    onDelete: () -> Unit,
    onHide: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }

    IconButton(
        onClick = { expanded = true },
        modifier = modifier,
    ) {
        Icon(
            imageVector = Icons.Filled.MoreVert,
            contentDescription = stringResource(R.string.reviews_overflow_more_options),
            tint = OverflowIconColor,
            modifier = Modifier.size(20.dp),
        )
    }

    DropdownMenu(
        expanded = expanded,
        onDismissRequest = { expanded = false },
    ) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.reviews_overflow_delete_post), color = DeleteRed) },
            onClick = {
                expanded = false
                onDelete()
            },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = null,
                    tint = DeleteRed,
                )
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.reviews_overflow_hide_post)) },
            onClick = {
                expanded = false
                onHide()
            },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Filled.VisibilityOff,
                    contentDescription = null,
                )
            },
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000)
@Composable
private fun ReviewOverflowMenuPreview() {
    ReviewOverflowMenu(
        onDelete = {},
        onHide = {},
    )
}

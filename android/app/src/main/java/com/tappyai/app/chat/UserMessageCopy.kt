package com.tappyai.app.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** What is copied from a question the person sent: the text exactly as typed (an answer is copied as plain text; a question is never edited). Null when blank. */
internal fun userCopyText(text: String): String? = text.takeIf { it.isNotBlank() }

/** 01/11: the copy button under a question the person sent (web UserMessageCopy.tsx). */
@Composable
internal fun UserMessageCopyButton(text: String) {
    val value = userCopyText(text) ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    val label = stringResource(if (copied) R.string.chat_action_copied else R.string.chat_action_copy)
    IconButton(
        onClick = {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("TappyAI", value))
            copied = true
            scope.launch { delay(2000); copied = false }
        },
        modifier = Modifier.size(32.dp),
    ) {
        Icon(
            imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
            contentDescription = label,
            modifier = Modifier.size(14.dp),
            tint = if (copied) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
        )
    }
}

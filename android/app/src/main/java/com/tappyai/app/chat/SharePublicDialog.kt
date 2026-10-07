package com.tappyai.app.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.app.share.TappyShare

/**
 * "This is what others will see" — the explicit share step, Android edition.
 *
 * Mirrors `src/components/share/SharePreviewDialog.tsx`: the preview is what the SERVER
 * says the public will get (sanitized), the user may retitle, and only Confirm creates the
 * page. Then the public URL is handed to the system share sheet / clipboard — a `/r/<slug>`
 * URL passes [TappyShare.isShareableUrl], so the same rules as every other share apply.
 */
@Composable
fun SharePublicDialog(
    state: SharePublicState,
    onTitleChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    if (state is SharePublicState.Idle) return
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.chat_share_public_title)) },
        text = {
            when (state) {
                is SharePublicState.Loading, is SharePublicState.Publishing -> Column {
                    Text(stringResource(R.string.chat_share_public_loading))
                    Spacer(Modifier.height(12.dp))
                    CircularProgressIndicator()
                }
                is SharePublicState.Preview -> Column {
                    Text(stringResource(R.string.chat_share_public_hint), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.title,
                        onValueChange = onTitleChange,
                        label = { Text(stringResource(R.string.chat_share_public_title_field)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.chat_share_public_question), style = MaterialTheme.typography.labelSmall)
                    Text("“${state.preview.query}”", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.chat_share_public_answer), style = MaterialTheme.typography.labelSmall)
                    Text(state.preview.excerpt, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.chat_share_public_counts, state.preview.buttonCount, state.preview.imageCount),
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.chat_share_public_privacy), style = MaterialTheme.typography.bodySmall)
                    if (!state.preview.listed) {
                        Spacer(Modifier.height(4.dp))
                        Text(stringResource(R.string.chat_share_public_unlisted), style = MaterialTheme.typography.bodySmall)
                    }
                }
                is SharePublicState.Published -> Column {
                    Text(stringResource(R.string.chat_share_public_published))
                    Spacer(Modifier.height(8.dp))
                    Text(state.share.url, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 4.dp))
                }
                is SharePublicState.Failed -> Text(
                    stringResource(
                        when (state.reason) {
                            SharePublicFailure.AccountRequired -> R.string.chat_error_login_required
                            SharePublicFailure.RateLimited -> R.string.chat_share_public_rate_limited
                            SharePublicFailure.NotShareable -> R.string.chat_share_public_not_shareable
                            SharePublicFailure.Network -> R.string.chat_error_connection
                        },
                    ),
                )
                is SharePublicState.Idle -> Unit
            }
        },
        confirmButton = {
            when (state) {
                is SharePublicState.Preview -> TextButton(onClick = onConfirm) {
                    Text(stringResource(R.string.chat_share_public_confirm))
                }
                is SharePublicState.Published -> TextButton(onClick = { shareUrl(context, state.share.url, state.share.title); onDismiss() }) {
                    Text(stringResource(R.string.chat_action_share))
                }
                else -> Unit
            }
        },
        dismissButton = {
            when (state) {
                is SharePublicState.Published -> TextButton(onClick = { copyUrl(context, state.share.url); onDismiss() }) {
                    Text(stringResource(R.string.chat_share_public_copy))
                }
                else -> TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
            }
        },
    )
}

private fun shareUrl(context: Context, url: String, title: String) {
    if (!TappyShare.isShareableUrl(url)) return
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
        putExtra(Intent.EXTRA_TITLE, title)
        putExtra(Intent.EXTRA_SUBJECT, title)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.chat_share_public_title)))
}

private fun copyUrl(context: Context, url: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText("TappyAI", url))
}

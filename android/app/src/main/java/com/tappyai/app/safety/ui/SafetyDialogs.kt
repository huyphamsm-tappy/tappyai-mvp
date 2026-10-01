package com.tappyai.app.safety.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.app.safety.ReportOutcome
import com.tappyai.app.safety.ReportReason
import com.tappyai.app.safety.SAFETY_CONTACT_EMAIL
import com.tappyai.app.safety.messageRes
import com.tappyai.app.safety.removesFromFeed
import com.tappyai.app.share.TappyShare
import kotlinx.coroutines.launch

/** Opens the mail app addressed to support. A device without one simply does nothing. */
internal fun openSupportEmail(context: Context) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$SAFETY_CONTACT_EMAIL")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

internal fun openTermsPage(context: Context) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${TappyShare.CANONICAL_ORIGIN}/terms")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/**
 * The report sheet: the six reasons, then "Gửi báo cáo". [onSubmit] performs the call and answers
 * what the server did; the dialog shows that — sending / sent / not sent — and only a report the
 * server ACCEPTED ([removesFromFeed]) closes it and calls [onFiled]. A failure keeps the dialog
 * open with the reason still selected, so the person can retry, and never says "sent".
 */
@Composable
fun ReportDialog(
    title: String,
    onSubmit: suspend (ReportReason) -> ReportOutcome,
    onFiled: (ReportOutcome) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf<ReportReason?>(null) }
    var sending by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<ReportOutcome?>(null) }

    AlertDialog(
        onDismissRequest = { if (!sending) onDismiss() },
        title = { Text(title) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(stringResource(R.string.safety_report_prompt), style = MaterialTheme.typography.bodyMedium)
                ReportReason.values().forEach { reason ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !sending, role = Role.RadioButton) { selected = reason; failure = null },
                    ) {
                        RadioButton(selected = selected == reason, onClick = null, modifier = Modifier.padding(end = 12.dp, top = 8.dp, bottom = 8.dp))
                        Text(stringResource(reason.labelRes), style = MaterialTheme.typography.bodyLarge)
                    }
                }
                failure?.let {
                    Text(
                        text = stringResource(it.messageRes()),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                    Text(stringResource(R.string.safety_report_contact), style = MaterialTheme.typography.bodySmall)
                }
                TextButton(onClick = { openSupportEmail(context) }) { Text(SAFETY_CONTACT_EMAIL) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = selected != null && !sending,
                onClick = {
                    val reason = selected ?: return@TextButton
                    sending = true
                    failure = null
                    scope.launch {
                        val outcome = onSubmit(reason)
                        sending = false
                        if (outcome.removesFromFeed()) {
                            Toast.makeText(context, context.getString(outcome.messageRes()), Toast.LENGTH_SHORT).show()
                            onFiled(outcome)
                            onDismiss()
                        } else {
                            failure = outcome
                        }
                    }
                },
            ) { Text(stringResource(if (sending) R.string.safety_report_sending else R.string.safety_report_send)) }
        },
        dismissButton = {
            TextButton(enabled = !sending, onClick = onDismiss) { Text(stringResource(R.string.safety_report_cancel)) }
        },
    )
}

/** "Chặn {tên}?" — what blocking does, then Chặn / Hủy. Calls [onConfirm] once; the caller runs the request. */
@Composable
fun BlockConfirmDialog(
    name: String?,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.safety_block_title, name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.safety_user_default))) },
        text = { Text(stringResource(R.string.safety_block_message)) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(stringResource(R.string.safety_block_confirm)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.safety_report_cancel)) } },
    )
}

/**
 * The community-rules agreement shown before the first post or clip: one paragraph, a link to the
 * full Terms, the support address, and "Đồng ý và đăng". The choice is remembered by the caller
 * ([com.tappyai.app.safety.SafetyRepository.acceptTerms]); this dialog only asks.
 */
@Composable
fun UgcTermsDialog(
    onAgree: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.safety_terms_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stringResource(R.string.safety_terms_message), style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { openTermsPage(context) }) { Text(stringResource(R.string.safety_terms_read)) }
                Text(stringResource(R.string.safety_report_contact), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { openSupportEmail(context) }) { Text(SAFETY_CONTACT_EMAIL) }
            }
        },
        confirmButton = { TextButton(onClick = onAgree) { Text(stringResource(R.string.safety_terms_agree)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.safety_report_cancel)) } },
    )
}

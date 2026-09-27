package com.tappyai.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.app.account.data.DeleteOutcome
import com.tappyai.app.account.data.isDeleteConfirmWord

/**
 * In-app account deletion (UAT3 P0) — the Android twin of web `/profile/settings/delete-account`.
 *
 * Same contract as the web page: the published removal list and the "kept but no longer linked"
 * list first (strings_account_delete.xml ← web accountDelete.ts ← DELETE-ACCOUNT-COPY-DRAFT
 * §3/§3b), ONE typed word ("XÓA" / "DELETE", either language) to enable the red button, the server
 * re-checks the word. After "Deleted" the dialog shows what happens next; dismissing it signs out.
 */
@Composable
fun DeleteAccountDialog(
    phase: DeletePhase?,
    supportEmail: String,
    onDelete: (String) -> Unit,
    onTyping: () -> Unit,
    onDismiss: () -> Unit,
    onFinished: () -> Unit,
) {
    val answered = (phase as? DeletePhase.Answered)?.outcome
    if (answered == DeleteOutcome.Deleted) {
        AlertDialog(
            onDismissRequest = onFinished,
            title = { Text(stringResource(R.string.account_delete_done_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.account_delete_done_p1))
                    Text(stringResource(R.string.account_delete_done_p2, supportEmail), style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton(onClick = onFinished, modifier = Modifier.testTag("delete-done-ok")) { Text(stringResource(R.string.account_delete_done_ok)) } },
        )
        return
    }

    var typed by rememberSaveable { mutableStateOf("") }
    val inFlight = phase == DeletePhase.InFlight
    val word = stringResource(R.string.account_delete_confirm_word)
    val error = when (answered) {
        DeleteOutcome.Staff -> stringResource(R.string.account_delete_error_staff)
        DeleteOutcome.SignIn -> stringResource(R.string.account_delete_error_sign_in)
        DeleteOutcome.Failed, DeleteOutcome.NotAvailable -> stringResource(R.string.account_delete_error_failed)
        else -> null
    }

    AlertDialog(
        onDismissRequest = { if (!inFlight) onDismiss() },
        title = { Text(stringResource(R.string.settings_delete_account_self)) },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(stringResource(R.string.account_delete_warning), color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
                Text(stringResource(R.string.account_delete_removes_heading), fontWeight = FontWeight.Bold)
                REMOVES.forEach { Text("• " + stringResource(it), style = MaterialTheme.typography.bodySmall) }
                Text(stringResource(R.string.account_delete_kept_heading), fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.account_delete_kept_lead), style = MaterialTheme.typography.bodySmall)
                KEPT.forEach { Text("• " + stringResource(it), style = MaterialTheme.typography.bodySmall) }
                OutlinedTextField(
                    value = typed,
                    onValueChange = { typed = it; onTyping() },
                    label = { Text(stringResource(R.string.account_delete_confirm_label, word)) },
                    placeholder = { Text(word) },
                    singleLine = true,
                    enabled = !inFlight,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false),
                    modifier = Modifier.fillMaxWidth().testTag("delete-confirm-input"),
                )
                if (error != null) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("delete-error"))
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onDelete(typed) },
                enabled = isDeleteConfirmWord(typed) && !inFlight,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.testTag("delete-submit"),
            ) { Text(stringResource(if (inFlight) R.string.account_delete_deleting else R.string.account_delete_submit)) }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !inFlight) { Text(stringResource(R.string.account_delete_cancel)) } },
    )
}

private val REMOVES = listOf(
    R.string.account_delete_removes_1, R.string.account_delete_removes_2, R.string.account_delete_removes_3,
    R.string.account_delete_removes_4, R.string.account_delete_removes_5, R.string.account_delete_removes_6,
    R.string.account_delete_removes_7, R.string.account_delete_removes_8, R.string.account_delete_removes_9,
)
private val KEPT = listOf(R.string.account_delete_kept_1, R.string.account_delete_kept_2)

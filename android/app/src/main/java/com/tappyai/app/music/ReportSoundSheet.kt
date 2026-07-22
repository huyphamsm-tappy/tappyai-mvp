package com.tappyai.app.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappySpacing

/** Wire values for [ReportReason] — sent verbatim as `POST /api/music/tracks/{trackId}/report`'s
 *  `reason` field, matching the web's report sheet. */
enum class ReportReason(val wireValue: String) {
    Copyright("copyright"),
    Inappropriate("inappropriate"),
    Spam("spam"),
    Other("other"),
}

/**
 * Report-copyright sheet for Sound Detail — mirrors the web's report modal: a reason radio group
 * + optional details textarea, `POST`ed once via [onSubmit]. [isSubmitting] disables the submit
 * button and re-entrant taps while the request is in flight.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportSoundSheet(
    isSubmitting: Boolean,
    onSubmit: (reason: ReportReason, details: String?) -> Unit,
    onOpenCopyrightPolicy: () -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedReason by remember { mutableStateOf(ReportReason.Copyright) }
    var details by remember { mutableStateOf("") }

    TappyBottomSheet(onDismiss = onDismiss) {
        // Scrollable: reasons + details field + submit + the policy link together exceed the
        // sheet's height on a phone, and ModalBottomSheet does not scroll its content for you —
        // without this the submit button and the link below it are simply unreachable.
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Text(
                text = stringResource(R.string.music_report_sheet_title),
                style = MaterialTheme.typography.titleMedium,
            )

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                ReportReasonRow(
                    label = stringResource(R.string.music_report_reason_copyright),
                    selected = selectedReason == ReportReason.Copyright,
                    onSelect = { selectedReason = ReportReason.Copyright },
                )
                ReportReasonRow(
                    label = stringResource(R.string.music_report_reason_inappropriate),
                    selected = selectedReason == ReportReason.Inappropriate,
                    onSelect = { selectedReason = ReportReason.Inappropriate },
                )
                ReportReasonRow(
                    label = stringResource(R.string.music_report_reason_spam),
                    selected = selectedReason == ReportReason.Spam,
                    onSelect = { selectedReason = ReportReason.Spam },
                )
                ReportReasonRow(
                    label = stringResource(R.string.music_report_reason_other),
                    selected = selectedReason == ReportReason.Other,
                    onSelect = { selectedReason = ReportReason.Other },
                )
            }

            TappyTextField(
                value = details,
                onValueChange = { details = it },
                placeholder = stringResource(R.string.music_report_details_placeholder),
                singleLine = false,
                minLines = 3,
                maxLines = 5,
            )

            TappyButton(
                text = stringResource(R.string.music_report_submit),
                onClick = { onSubmit(selectedReason, details.trim()) },
                loading = isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            )

            // The web puts this link right here, under the submit button — not on the music
            // library — so a reporter can read the policy at the moment they're filing.
            Text(
                text = stringResource(R.string.music_copyright_policy_link),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenCopyrightPolicy)
                    .padding(TappySpacing.xs),
            )
        }
    }
}

@Composable
private fun ReportReasonRow(label: String, selected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
    }
}

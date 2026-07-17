package com.tappyai.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

/** A single numbered section (matches the web's `<h3>title</h3><p>body</p>` blocks). */
data class LegalSection(val title: String, val body: String)

/**
 * Shared layout for the legal documents (Terms, Privacy, music Copyright) — mirrors the web's
 * `TermsPage`/`PrivacyPage`/`CopyrightPolicyPage` structure (back + title header, a subtitle line,
 * numbered section list) so they share one layout instead of duplicating it. Static content only —
 * no backend, matching the web (these pages call no API; they render fixed legal text).
 *
 * [subtitle] is rendered verbatim, so each caller decides what belongs there: Terms and Privacy
 * pass a "Last updated: …" line; the copyright policy has no date on the web and passes its scope
 * line instead. (This used to be a `lastUpdated` value that the layout always prefixed with
 * "Last updated:", which produced "Last updated: Applies to music uploaded…" on the copyright page.)
 *
 * [LegalSection.title] must NOT carry its own number — this layout prefixes "1. ", "2. " by index,
 * so a numbered title renders as "1. 1. …".
 */
@Composable
fun LegalDocumentScreen(
    title: String,
    subtitle: String,
    sections: List<LegalSection>,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.common_back),
                    )
                }
                Text(text = title, style = MaterialTheme.typography.titleLarge)
            }

            TappyCard {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    sections.forEachIndexed { index, section ->
                        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                            Text(
                                text = "${index + 1}. ${section.title}",
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text(
                                text = section.body,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

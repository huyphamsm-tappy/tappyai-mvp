package com.tappyai.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * P4-06 — comparison on Android, presented as a BOTTOM SHEET (DD-005).
 *
 * Same semantic contract as web: at most four entities, at most six differing attributes,
 * identical rows folded away, an unknown value stated as unknown, and a recommendation that always
 * carries its reason. What MAY differ is the container, and here it must: a four-column table
 * inside a 360dp thread is unreadable, so the data that renders inline on the web opens in a sheet
 * on a phone. Same information, same actions, native presentation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShoppingComparisonSheet(
    comparison: ShoppingComparison,
    onDismiss: () -> Unit,
) {
    val (differing, identical) = partitionComparisonAttributes(comparison.entities, comparison.attributes)
    if (differing.isEmpty() && identical.isEmpty()) return

    TappyBottomSheet(onDismiss = onDismiss) {
        val colors = MaterialTheme.colorScheme
        val scroll = rememberScrollState()

        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.comparison_title, comparison.entities.size),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = colors.onSurface,
            )

            // The grid scrolls sideways inside the sheet; the sheet itself never does.
            Row(modifier = Modifier.horizontalScroll(scroll).padding(top = TappySpacing.lg)) {
                // Pinned attribute column, so a row keeps its meaning while the values scroll.
                Column(modifier = Modifier.width(112.dp)) {
                    Text(
                        text = stringResource(R.string.comparison_attribute),
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.onSurfaceVariant,
                    )
                    differing.forEach { attr ->
                        Text(
                            text = attr.label,
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.onSurfaceVariant,
                            modifier = Modifier.padding(top = TappySpacing.lg),
                        )
                    }
                }

                comparison.entities.forEach { entity ->
                    Column(modifier = Modifier.width(140.dp).padding(start = TappySpacing.lg)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = entity.label,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                                color = colors.onSurface,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (entity.key == comparison.recommendedKey) {
                            // Text, not just a colour — the mark must survive greyscale and TalkBack.
                            Text(
                                text = "✓ ${stringResource(R.string.comparison_recommended)}",
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.primary,
                                modifier = Modifier
                                    .padding(top = TappySpacing.xs)
                                    .clip(TappyShapes.pill)
                                    .background(colors.primary.copy(alpha = 0.12f))
                                    .padding(horizontal = TappySpacing.md, vertical = 2.dp),
                            )
                        }
                        differing.forEach { attr ->
                            val value = entity.values[attr.key]
                            Text(
                                text = value ?: stringResource(R.string.comparison_unknown),
                                style = MaterialTheme.typography.bodyMedium,
                                // An unknown reads as unknown — italic and muted, never blank.
                                fontStyle = if (value == null) FontStyle.Italic else FontStyle.Normal,
                                color = if (value == null) colors.onSurfaceVariant else colors.onSurface,
                                modifier = Modifier.padding(top = TappySpacing.lg),
                            )
                        }
                    }
                }
            }

            if (identical.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.comparison_same_for_all) + ": " +
                        identical.joinToString(" · ") { it.label },
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    modifier = Modifier.padding(top = TappySpacing.lg),
                )
            }

            comparison.reason?.let { reason ->
                HorizontalDivider(modifier = Modifier.padding(vertical = TappySpacing.lg))
                Text(
                    text = "${stringResource(R.string.comparison_reason)}: $reason",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurface,
                )
            }
        }
    }
}

/**
 * P4-06 — confirmation on Android, presented as a SHEET (DD-006).
 *
 * The visible action boundary: the user decides, the Controller executes. Mobile prefers a sheet
 * over a dialog, and swipe-to-dismiss resolves to CANCEL — there is no path where letting go of
 * the sheet performs the action. An abandoned prompt fails closed, exactly as on web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmationSheet(
    consequence: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    changes: List<String> = emptyList(),
    confirmLabel: String? = null,
    destructive: Boolean = false,
) {
    // Dismissing the sheet — by swipe, scrim tap or back — is a cancel, never a confirm.
    TappyBottomSheet(onDismiss = onCancel) {
        val colors = MaterialTheme.colorScheme
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Text(
                text = consequence,
                style = MaterialTheme.typography.bodyLarge,
                color = colors.onSurface,
            )

            if (changes.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    Text(
                        text = stringResource(R.string.confirm_what_changes),
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.onSurfaceVariant,
                    )
                    changes.forEach {
                        Text(
                            text = "· $it",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
            }

            com.tappyai.core.designsystem.component.TappyButton(
                text = confirmLabel ?: stringResource(R.string.confirm_confirm),
                onClick = onConfirm,
                modifier = Modifier.fillMaxWidth(),
                variant = if (destructive) {
                    com.tappyai.core.designsystem.component.TappyButtonVariant.Destructive
                } else {
                    com.tappyai.core.designsystem.component.TappyButtonVariant.Primary
                },
            )
            com.tappyai.core.designsystem.component.TappyButton(
                text = stringResource(R.string.confirm_cancel),
                onClick = onCancel,
                modifier = Modifier.fillMaxWidth(),
                variant = com.tappyai.core.designsystem.component.TappyButtonVariant.Ghost,
            )
        }
    }
}

package com.tappyai.app.profile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Shield
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.language.AppLanguage
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.component.TappyMenuRow
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Settings screen — mirrors the web `SettingsView`: "Options" section (Notifications, Memory,
 * Language) → "Other" section (Terms, Privacy) → version text → destructive "Sign out". UI-only:
 * "Notifications" drills into the real [com.tappyai.app.notifications.NotificationsScreen]; "Sign
 * out" calls the real [SettingsViewModel.signOut] (matches the web's `SignOutButton` —
 * `supabase.auth.signOut()`); "Language" opens a real picker backed by
 * [com.tappyai.app.language.LanguageManager] (mirrors the web's `LanguagePicker.tsx` — same two
 * options, same persist-and-apply behavior). Every row here now navigates somewhere real — nothing
 * on this screen is coming-soon. Inline back + title header, since the app shell keeps the
 * "Profile" top bar (shell is not modified).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenTappyKnows: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacy: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    var showLanguagePicker by remember { mutableStateOf(false) }
    var showDeleteRequestDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current

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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.common_back),
                    )
                }
                Text(text = stringResource(R.string.settings_title), style = MaterialTheme.typography.titleLarge)
            }

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                MenuSectionHeader(stringResource(R.string.settings_section_options))
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    TappyMenuRow(
                        icon = Icons.Filled.Notifications,
                        title = stringResource(R.string.settings_notifications),
                        onClick = onOpenNotifications,
                    )
                    HorizontalDivider()
                    TappyMenuRow(
                        icon = Icons.Filled.Psychology,
                        title = stringResource(R.string.settings_memory),
                        onClick = onOpenTappyKnows,
                    )
                    HorizontalDivider()
                    TappyMenuRow(
                        icon = Icons.Filled.Language,
                        title = stringResource(R.string.settings_language),
                        valueText = "${viewModel.language.flag} ${viewModel.language.displayName}",
                        onClick = { showLanguagePicker = true },
                    )
                    HorizontalDivider()
                    DarkModeRow(isDarkTheme = viewModel.isDarkTheme, onToggle = viewModel::toggleDarkTheme)
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                MenuSectionHeader(stringResource(R.string.settings_section_other))
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    TappyMenuRow(
                        icon = Icons.Filled.Description,
                        title = stringResource(R.string.settings_terms_of_service),
                        onClick = onOpenTerms,
                    )
                    HorizontalDivider()
                    TappyMenuRow(
                        icon = Icons.Filled.Shield,
                        title = stringResource(R.string.settings_privacy_policy),
                        onClick = onOpenPrivacy,
                    )
                }
            }

            Text(
                text = stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            TappyCard(contentPadding = PaddingValues(0.dp)) {
                TappyMenuRow(
                    icon = Icons.AutoMirrored.Filled.Logout,
                    title = if (viewModel.isSigningOut) {
                        stringResource(R.string.settings_signing_out)
                    } else {
                        stringResource(R.string.settings_sign_out)
                    },
                    showChevron = false,
                    danger = true,
                    onClick = viewModel::signOut,
                )
                HorizontalDivider()
                // Path B (Google Play account-deletion requirement): mirrors the web's stated
                // mechanism (profile/privacy §5) — a deletion *request* to support by email; there
                // is no self-service delete endpoint on web or backend. Opens the user's email app
                // prefilled; the account is not deleted automatically. UI-only, no backend.
                TappyMenuRow(
                    icon = Icons.Filled.DeleteForever,
                    title = stringResource(R.string.settings_delete_account),
                    showChevron = false,
                    danger = true,
                    onClick = { showDeleteRequestDialog = true },
                )
            }
            viewModel.errorMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    if (showDeleteRequestDialog) {
        val supportEmail = stringResource(R.string.support_email)
        val subject = stringResource(R.string.settings_delete_account_subject)
        val body = stringResource(R.string.settings_delete_account_body)
        val noEmailApp = stringResource(R.string.settings_delete_account_no_email_app, supportEmail)
        TappyDialog(
            title = stringResource(R.string.settings_delete_account_dialog_title),
            message = stringResource(R.string.settings_delete_account_dialog_message),
            confirmText = stringResource(R.string.settings_delete_account_confirm),
            onConfirm = {
                showDeleteRequestDialog = false
                launchAccountDeletionEmail(context, supportEmail, subject, body, noEmailApp)
            },
            onDismiss = { showDeleteRequestDialog = false },
        )
    }

    if (showLanguagePicker) {
        TappyBottomSheet(onDismiss = { showLanguagePicker = false }) {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                Text(text = stringResource(R.string.settings_language), style = MaterialTheme.typography.titleMedium)
                AppLanguage.entries.forEach { option ->
                    LanguageOptionRow(
                        option = option,
                        selected = option == viewModel.language,
                        onClick = {
                            viewModel.selectLanguage(option)
                            showLanguagePicker = false
                        },
                    )
                }
            }
        }
    }
}

/**
 * The reachable dark/light toggle — matches [TappyMenuRow]'s visual rhythm (icon tile + title)
 * but ends in a [Switch] instead of a chevron, since it's a direct action, not a drill-in.
 * Previously only reachable via [com.tappyai.app.showcase.DesignSystemShowcaseScreen], a
 * dev-only screen with no real navigation path from the app's UI.
 */
@Composable
private fun DarkModeRow(isDarkTheme: Boolean, onToggle: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(TappyShapes.input)
                .background(colors.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.DarkMode,
                contentDescription = null,
                tint = colors.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(
            text = stringResource(R.string.settings_dark_mode),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = isDarkTheme, onCheckedChange = { onToggle() })
    }
}

/**
 * Opens the user's email app prefilled with an account-deletion request to TappyAI support —
 * the native equivalent of the web's stated mechanism (profile/privacy §5: "contact support by
 * email"). `ACTION_SENDTO` with a `mailto:` URI targets email apps only. Guarded with the app's
 * established [ActivityNotFoundException] pattern (as in Scan/Maps): a device with no email app
 * falls back to a toast showing the address rather than crashing. No backend call — this only
 * composes an email; deletion is processed by support.
 */
private fun launchAccountDeletionEmail(
    context: android.content.Context,
    supportEmail: String,
    subject: String,
    body: String,
    noEmailAppMessage: String,
) {
    val intent = Intent(Intent.ACTION_SENDTO).apply {
        data = Uri.parse("mailto:")
        putExtra(Intent.EXTRA_EMAIL, arrayOf(supportEmail))
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
    }
    try {
        context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, noEmailAppMessage, Toast.LENGTH_LONG).show()
    }
}

@Composable
private fun LanguageOptionRow(option: AppLanguage, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(if (selected) colors.primaryContainer else colors.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = option.flag, style = MaterialTheme.typography.headlineSmall)
        Text(text = option.displayName, style = MaterialTheme.typography.bodyLarge)
    }
}

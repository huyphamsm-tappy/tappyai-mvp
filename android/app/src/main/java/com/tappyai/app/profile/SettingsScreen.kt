package com.tappyai.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.VolumeUp
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.language.AppLanguage
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyCard
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
    /** Navigates to the root graph's Login destination. Routed from `AppNavHost` because this
     *  screen's NavController is the Profile tab's nested one and cannot reach it. */
    onSignIn: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenTappyKnows: () -> Unit,
    onOpenGuide: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacy: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    var showLanguagePicker by remember { mutableStateOf(false) }

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
                    // Uses the same row component as everything else rather than introducing a
                    // Switch primitive this screen does not otherwise have. Turning this off does
                    // NOT stop notifications — see the string description, which says so, because
                    // the obvious wrong assumption about a sound toggle is that it silences the
                    // notifications themselves.
                    TappyMenuRow(
                        icon = Icons.Filled.VolumeUp,
                        title = stringResource(R.string.settings_tappy_notification_sound),
                        valueText = stringResource(
                            if (viewModel.tappyNotificationSoundEnabled) R.string.common_on
                            else R.string.common_off
                        ),
                        onClick = {
                            viewModel.setTappyNotificationSound(!viewModel.tappyNotificationSoundEnabled)
                        },
                    )
                    HorizontalDivider()
                    TappyMenuRow(
                        icon = Icons.Filled.Language,
                        title = stringResource(R.string.settings_language),
                        valueText = "${viewModel.language.flag} ${viewModel.language.displayName}",
                        onClick = { showLanguagePicker = true },
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                MenuSectionHeader(stringResource(R.string.settings_section_other))
                TappyCard(contentPadding = PaddingValues(0.dp)) {
                    // Usage guidance sits with the reference documents rather than in
                    // onboarding: onboarding runs once and cannot answer "how does this
                    // work?" later. This is the row a user can come back to.
                    TappyMenuRow(
                        icon = Icons.AutoMirrored.Filled.MenuBook,
                        title = stringResource(R.string.settings_how_to_use),
                        onClick = onOpenGuide,
                    )
                    HorizontalDivider()
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
                // A guest is offered sign-in, not sign-out. Signing out of an anonymous session
                // is meaningless and actively harmful: it mints a NEW anonymous identity, so the
                // conversation the guest just had becomes unreachable. Signing IN is what keeps
                // it — AuthRepository carries the anonymous conversations over automatically once
                // the authenticated session lands.
                if (viewModel.isAnonymous) {
                    TappyMenuRow(
                        icon = Icons.AutoMirrored.Filled.Login,
                        title = stringResource(R.string.settings_sign_in),
                        subtitle = stringResource(R.string.settings_sign_in_desc),
                        onClick = onSignIn,
                    )
                } else {
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
                }
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

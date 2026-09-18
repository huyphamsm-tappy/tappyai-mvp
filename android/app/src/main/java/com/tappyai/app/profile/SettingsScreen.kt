package com.tappyai.app.profile

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.BrightnessAuto
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Shield
import androidx.annotation.StringRes
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.AppearanceMode
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.language.AppLanguage
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.component.TappyMenuRow
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/** Mirrors SUPPORT_EMAIL in src/components/landing/config.ts — the one public support address,
 *  and the one /delete-account names as the fallback if a device has no email app. */
private const val SUPPORT_EMAIL = "support@tappyai.com"

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
 *
 * V3 dress (2026-09-14, from the approved design reference): the V3 palette (system-following,
 * as Home and "Tôi"), the header with the blurb and the official waving mascot (`tappy_wave`,
 * the same official file Home and "Tôi" draw — nothing generated), the two groups as bordered
 * navy cards whose rows carry a solid accent tile each (the SAME [TappyMenuRow], with its new
 * optional accent/value-colour/weight knobs), the version line, and the guest's sign-in as the
 * purple V3 card "Tôi" also uses. Same rows, same order, same actions, same ViewModel.
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
    var showAppearancePicker by remember { mutableStateOf(false) }
    var confirmDeleteAccount by remember { mutableStateOf(false) }
    val appearanceMode by viewModel.appearanceMode.collectAsStateWithLifecycle()
    val context = LocalContext.current

    V3HomeTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(HomeV3.Background)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth()
                    .padding(horizontal = TappySpacing.xl)
                    .padding(top = TappySpacing.md, bottom = TappySpacing.xxl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
            ) {
                SettingsV3Header(onBack = onBack)

                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    MenuSectionHeader(stringResource(R.string.settings_section_options))
                    ProfileGroupCard {
                        TappyMenuRow(
                            icon = Icons.Filled.Notifications,
                            title = stringResource(R.string.settings_notifications),
                            subtitle = stringResource(R.string.settings_notifications_desc),
                            accent = AccentBlue,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = onOpenNotifications,
                        )
                        SettingsDivider()
                        TappyMenuRow(
                            icon = Icons.Filled.Psychology,
                            title = stringResource(R.string.settings_memory),
                            subtitle = stringResource(R.string.settings_memory_desc),
                            accent = AccentPurple,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = onOpenTappyKnows,
                        )
                        SettingsDivider()
                        // Uses the same row component as everything else rather than introducing a
                        // Switch primitive this screen does not otherwise have. Turning this off does
                        // NOT stop notifications — see the string description, which says so, because
                        // the obvious wrong assumption about a sound toggle is that it silences the
                        // notifications themselves.
                        TappyMenuRow(
                            icon = Icons.Filled.VolumeUp,
                            title = stringResource(R.string.settings_tappy_notification_sound),
                            subtitle = stringResource(R.string.settings_tappy_notification_sound_desc),
                            valueText = stringResource(
                                if (viewModel.tappyNotificationSoundEnabled) R.string.common_on
                                else R.string.common_off
                            ),
                            valueColor = if (viewModel.tappyNotificationSoundEnabled) AccentGreen else null,
                            accent = AccentGreen,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = {
                                viewModel.setTappyNotificationSound(!viewModel.tappyNotificationSoundEnabled)
                            },
                        )
                        SettingsDivider()
                        TappyMenuRow(
                            icon = Icons.Filled.Language,
                            title = stringResource(R.string.settings_language),
                            subtitle = stringResource(R.string.settings_language_desc),
                            valueText = "${viewModel.language.flag} ${viewModel.language.displayName}",
                            valueColor = HomeV3.OnSurface,
                            accent = AccentOrange,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = { showLanguagePicker = true },
                        )
                        SettingsDivider()
                        // "Giao diện" (UAT 2026-09-17): the three-way appearance choice the Profile
                        // hub's "Ngôn ngữ, thông báo, giao diện" row has always promised. SYSTEM is
                        // the default and the only way back to it after the Home toggle pinned a side.
                        TappyMenuRow(
                            icon = Icons.Filled.DarkMode,
                            title = stringResource(R.string.settings_appearance),
                            subtitle = stringResource(R.string.settings_appearance_desc),
                            valueText = stringResource(appearanceLabel(appearanceMode)),
                            valueColor = HomeV3.OnSurface,
                            accent = AccentPurple,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = { showAppearancePicker = true },
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    MenuSectionHeader(stringResource(R.string.settings_section_other))
                    ProfileGroupCard {
                        // Usage guidance sits with the reference documents rather than in
                        // onboarding: onboarding runs once and cannot answer "how does this
                        // work?" later. This is the row a user can come back to.
                        TappyMenuRow(
                            icon = Icons.AutoMirrored.Filled.MenuBook,
                            title = stringResource(R.string.settings_how_to_use),
                            subtitle = stringResource(R.string.settings_how_to_use_desc),
                            accent = AccentBlue,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = onOpenGuide,
                        )
                        SettingsDivider()
                        TappyMenuRow(
                            icon = Icons.Filled.Description,
                            title = stringResource(R.string.settings_terms_of_service),
                            subtitle = stringResource(R.string.settings_terms_of_service_desc),
                            accent = AccentPurple,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = onOpenTerms,
                        )
                        SettingsDivider()
                        TappyMenuRow(
                            icon = Icons.Filled.Shield,
                            title = stringResource(R.string.settings_privacy_policy),
                            subtitle = stringResource(R.string.settings_privacy_policy_desc),
                            accent = AccentGreen,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = onOpenPrivacy,
                        )
                        SettingsDivider()
                        // Required by Google Play for any app that offers account creation, and
                        // documented publicly at /delete-account — the URL the Play listing points
                        // reviewers at. Its step 3 reads "Choose Request account deletion", so this
                        // row's label is fixed word-for-word by that page (guarded by
                        // src/lib/legal/accountDeletionParity.test.ts).
                        //
                        // Request-based on purpose: support verifies the requester owns the account
                        // before anything is erased. The app deletes nothing itself. The red tile is
                        // the destructive accent; the confirmation dialog below is unchanged.
                        TappyMenuRow(
                            icon = Icons.Filled.DeleteOutline,
                            title = stringResource(R.string.settings_delete_account),
                            subtitle = stringResource(R.string.settings_delete_account_desc),
                            accent = AccentRed,
                            titleFontWeight = FontWeight.SemiBold,
                            onClick = { confirmDeleteAccount = true },
                        )
                    }
                }

                Text(
                    text = stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.bodySmall,
                    color = HomeV3.OnSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                // A guest is offered sign-in, not sign-out. Signing out of an anonymous session
                // is meaningless and actively harmful: it mints a NEW anonymous identity, so the
                // conversation the guest just had becomes unreachable. Signing IN is what keeps
                // it — AuthRepository carries the anonymous conversations over automatically once
                // the authenticated session lands.
                if (viewModel.isAnonymous) {
                    SignInCard(onClick = onSignIn, subtitle = stringResource(R.string.settings_sign_in_desc))
                } else {
                    ProfileGroupCard {
                        TappyMenuRow(
                            icon = Icons.AutoMirrored.Filled.Logout,
                            title = if (viewModel.isSigningOut) {
                                stringResource(R.string.settings_signing_out)
                            } else {
                                stringResource(R.string.settings_sign_out)
                            },
                            showChevron = false,
                            danger = true,
                            titleFontWeight = FontWeight.SemiBold,
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
    }

    if (confirmDeleteAccount) {
        val subject = stringResource(R.string.settings_delete_account_email_subject)
        val body = stringResource(R.string.settings_delete_account_email_body)
        val noEmailApp = stringResource(R.string.settings_delete_account_no_email)
        TappyDialog(
            title = stringResource(R.string.settings_delete_account_confirm_title),
            message = stringResource(R.string.settings_delete_account_confirm_body),
            confirmText = stringResource(R.string.settings_delete_account_confirm_cta),
            onConfirm = {
                confirmDeleteAccount = false
                // ACTION_SENDTO with a mailto: URI resolves to email apps ONLY. ACTION_SEND would
                // offer the chooser every messaging app on the device, which is not what the
                // published flow says happens.
                val intent = Intent(Intent.ACTION_SENDTO).apply {
                    data = Uri.parse("mailto:$SUPPORT_EMAIL")
                    putExtra(Intent.EXTRA_SUBJECT, subject)
                    putExtra(Intent.EXTRA_TEXT, body)
                }
                // Not every device has an email app configured; /delete-account already tells the
                // user they can send the request themselves in that case, so say the same thing
                // here rather than throwing ActivityNotFoundException.
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                } else {
                    Toast.makeText(context, noEmailApp, Toast.LENGTH_LONG).show()
                }
            },
            onDismiss = { confirmDeleteAccount = false },
        )
    }

    if (showAppearancePicker) {
        TappyBottomSheet(onDismiss = { showAppearancePicker = false }) {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                Text(text = stringResource(R.string.settings_appearance), style = MaterialTheme.typography.titleMedium)
                AppearanceMode.entries.forEach { option ->
                    AppearanceOptionRow(
                        option = option,
                        selected = option == appearanceMode,
                        onClick = {
                            viewModel.selectAppearance(option)
                            showAppearancePicker = false
                        },
                    )
                }
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

/** "←", "Cài đặt", the blurb — and the official waving mascot in the upper right (`tappy_wave`). */
@Composable
private fun SettingsV3Header(onBack: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f).padding(end = TappySpacing.lg)) {
            IconButton(onClick = onBack, modifier = Modifier.offset(x = (-12).dp)) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.common_back),
                    tint = HomeV3.OnSurface,
                )
            }
            Text(
                text = stringResource(R.string.settings_title),
                color = HomeV3.OnSurface,
                fontSize = 32.sp,
                lineHeight = 36.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.settings_subtitle),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 14.sp,
                lineHeight = 19.sp,
                modifier = Modifier.padding(top = TappySpacing.sm),
            )
        }
        Image(
            painter = painterResource(R.drawable.tappy_wave),
            contentDescription = null,
            modifier = Modifier.size(128.dp).offset(x = 8.dp),
        )
    }
}

/** The thin divider between rows, indented past the icon tile as in the reference. */
@Composable
private fun SettingsDivider() {
    HorizontalDivider(color = HomeV3.Outline, modifier = Modifier.padding(start = 72.dp))
}

// The reference's accent tiles: blue, purple, green, orange, and the destructive red.
private val AccentBlue = Color(0xFF3B82F6)
private val AccentPurple = Color(0xFF7C5CFF)
private val AccentGreen = Color(0xFF14B58A)
private val AccentOrange = Color(0xFFF59E0B)
private val AccentRed = Color(0xFFEF4444)

/** The row label of a mode: Theo hệ thống / Sáng / Tối. */
@StringRes
internal fun appearanceLabel(mode: AppearanceMode): Int = when (mode) {
    AppearanceMode.System -> R.string.settings_appearance_system
    AppearanceMode.Light -> R.string.settings_appearance_light
    AppearanceMode.Dark -> R.string.settings_appearance_dark
}

/** Same row as the language picker's, with the mode's glyph in place of a flag. */
@Composable
private fun AppearanceOptionRow(option: AppearanceMode, selected: Boolean, onClick: () -> Unit) {
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
        Icon(
            imageVector = when (option) {
                AppearanceMode.System -> Icons.Filled.BrightnessAuto
                AppearanceMode.Light -> Icons.Filled.LightMode
                AppearanceMode.Dark -> Icons.Filled.DarkMode
            },
            contentDescription = null,
            tint = colors.onSurface,
        )
        Text(text = stringResource(appearanceLabel(option)), style = MaterialTheme.typography.bodyLarge)
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

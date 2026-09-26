package com.tappyai.app.notifications

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.annotation.StringRes
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3AccentPill
import com.tappyai.app.personal.V3GlyphTile
import com.tappyai.app.personal.V3Panel
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.personal.V3Tone
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Notifications preferences — mirrors the web `NotificationSettings` (Profile → Settings →
 * Notifications). Two blocks: a **push toggle card** and a **"What you'll receive" card** that
 * appears only while the toggle is on, exactly like the web reveals it only when subscribed.
 *
 * The switch is the "Tappy notifications" PREFERENCE ([NotificationPreferenceStore]: ON by
 * default, OFF only after the person switched it off, persisted). The OS PERMISSION is a separate
 * fact, shown as its own status line under the switch when the preference is ON but the device
 * blocks delivery — never folded into the switch, so a denied permission can never silently
 * rewrite the person's choice, and a default-ON preference never fires a permission dialog by
 * itself. The dialog is asked for only by the person's own tap: the switch going ON, or the
 * "Allow" action on the status line.
 *
 * Inline back header (the app shell keeps the top bar); content capped to
 * [TappyContainers.content] with `xl` edge padding per UI Consistency Baseline v1.
 */
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val pushEnabled by viewModel.pushEnabled.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val permissionState = remember { NotificationPermissionState(context) }
    // Re-read whenever the screen comes back to the front — the person may have just returned
    // from the system settings screen this page sends them to.
    var osGranted by remember { mutableStateOf(TappyNotificationPermission.isGranted(context)) }
    LifecycleResumeEffect(Unit) {
        osGranted = TappyNotificationPermission.isGranted(context)
        onPauseOrDispose { }
    }

    // Same permission pattern the chat mic already uses (ChatScreen's RECORD_AUDIO launcher) —
    // deliberately not a second permission framework.
    val requestPermission = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionState.hasBeenRequested = true
        // The OS answer is the OS's; it is shown on the status line. It does not rewrite the
        // person's own preference — a denial is "wanted, but blocked by the device", not "off".
        osGranted = granted
    }

    // The one place the OS is asked, and only on the person's own tap.
    val askOs: () -> Unit = {
        when (TappyNotificationPermission.actionFor(context, permissionState.hasBeenRequested)) {
            NotificationPermissionAction.NOT_REQUIRED,
            NotificationPermissionAction.ALREADY_GRANTED,
            -> osGranted = true

            NotificationPermissionAction.REQUEST ->
                requestPermission.launch(TappyNotificationPermission.PERMISSION)

            NotificationPermissionAction.DIRECT_TO_SETTINGS ->
                openAppNotificationSettings(context)
        }
    }

    // 2026-09-17: on the V3 personal page — this screen is what the V3 Inbox's settings control
    // opens (the web embeds `NotificationSettings` inside the Inbox panel), so it wears the same
    // ground, header and panel as the page that opens it. Content unchanged.
    V3PersonalPage(
        title = stringResource(R.string.notif_title),
        subtitle = null,
        onBack = onBack,
    ) {
        run {
            PushToggleCard(
                enabled = pushEnabled,
                osBlocked = pushEnabled && !osGranted,
                onToggle = { wanted ->
                    // The switch records the person's choice, ON or OFF, as-is. Turning it OFF
                    // never revokes anything and never asks. Turning it ON is the person's own
                    // tap, so it is also the moment to ask the OS if the OS has not yet allowed
                    // delivery — never on screen open, never because of the default.
                    viewModel.setPushEnabled(wanted)
                    if (wanted && !osGranted) askOs()
                },
                onAllow = askOs,
            )

            if (pushEnabled) {
                WhatYoullReceiveCard()
            }
        }
    }
}

@Composable
private fun PushToggleCard(enabled: Boolean, osBlocked: Boolean, onToggle: (Boolean) -> Unit, onAllow: () -> Unit) {
    V3Panel {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            V3GlyphTile(icon = Icons.Filled.Notifications, tint = HomeV3.Purple, size = 40.dp, radius = 12.dp, iconSize = 20.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = stringResource(R.string.notif_push_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    text = if (enabled) {
                        stringResource(R.string.notif_push_on_description)
                    } else {
                        stringResource(R.string.notif_push_off_description)
                    },
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            val toggleContentDescription = stringResource(R.string.notif_toggle_content_description)
            Switch(
                checked = enabled,
                onCheckedChange = onToggle,
                modifier = Modifier.semantics { contentDescription = toggleContentDescription },
                colors = SwitchDefaults.colors(checkedTrackColor = HomeV3.Purple),
            )
        }
        // The OS permission, as its own fact: the preference is ON, the device blocks delivery.
        if (osBlocked) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.notif_os_blocked),
                    color = V3Tone.Amber,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.weight(1f),
                )
                V3AccentPill(text = stringResource(R.string.notif_os_allow), onClick = onAllow)
            }
        }
    }
}

@Composable
private fun WhatYoullReceiveCard() {
    V3Panel {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Text(
                text = stringResource(R.string.notif_receive_header),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 10.sp,
                letterSpacing = 1.2.sp,
                fontWeight = FontWeight.SemiBold,
            )
            RECEIVE_ITEMS.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = item.emoji, fontSize = 17.sp)
                    Text(text = stringResource(item.textRes), color = HomeV3.OnSurface, fontSize = 13.5.sp)
                }
            }
            Text(text = stringResource(R.string.notif_receive_footer), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/**
 * Opens the system screen for this app's notifications, for the case where the permission was
 * already declined once and the OS will no longer show a dialog.
 *
 * Wrapped in [runCatching] because a settings activity is not guaranteed to exist on every OEM
 * build, and failing to open a screen must never take the app down.
 */
private fun openAppNotificationSettings(context: Context) {
    runCatching {
        context.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

private data class ReceiveItem(val emoji: String, @StringRes val textRes: Int)

// Static informational copy — the same "what you'll receive" reminders the web lists verbatim.
// Not notification data: no counts, no timestamps, nothing generated — just a description of the
// reminder categories the future backend will send. Resource IDs only (not resolved strings),
// since this is a top-level val outside any @Composable — resolved lazily via stringResource()
// above, same shape as ChatCategory.kt's Mood enum.
private val RECEIVE_ITEMS = listOf(
    ReceiveItem("🌅", R.string.notif_receive_morning_brief),
    ReceiveItem("🛍️", R.string.notif_receive_deals),
    ReceiveItem("🍜", R.string.notif_receive_lunch),
    ReceiveItem("📅", R.string.notif_receive_booking),
    ReceiveItem("📊", R.string.notif_receive_weekly_recap),
)

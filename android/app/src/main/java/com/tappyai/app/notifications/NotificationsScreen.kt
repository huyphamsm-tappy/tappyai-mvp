package com.tappyai.app.notifications

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.annotation.StringRes
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Notifications preferences — mirrors the web `NotificationSettings` (Profile → Settings →
 * Notifications). Two blocks: a **push toggle card** and a **"What you'll receive" card** that
 * appears only while the toggle is on, exactly like the web reveals it only when subscribed.
 *
 * UI-only: the switch flips a local [NotificationsViewModel] flag — no push engine, permission
 * request, persistence, or backend. Inline back header (the app shell keeps the top bar); content
 * capped to [TappyContainers.content] with `xl` edge padding per UI Consistency Baseline v1.
 *
 * The web's permission-gated states (unsupported / denied) are omitted: they require notification
 * permission logic, which is out of scope for this foundation.
 */
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val pushEnabled by viewModel.pushEnabled.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val permissionState = remember { NotificationPermissionState(context) }

    // Same permission pattern the chat mic already uses (ChatScreen's RECORD_AUDIO launcher) —
    // deliberately not a second permission framework.
    val requestPermission = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionState.hasBeenRequested = true
        // Reflect what the OS decided, not what the tap asked for. Showing the switch ON after a
        // denial would promise notifications that can never arrive.
        viewModel.setPushEnabled(granted)
    }

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
                Text(text = stringResource(R.string.notif_title), style = MaterialTheme.typography.titleLarge)
            }

            PushToggleCard(
                enabled = pushEnabled,
                onToggle = { wanted ->
                    // Turning push OFF never revokes anything and never asks: it is the user's
                    // in-app choice. Only turning it ON can need the OS permission.
                    if (!wanted) {
                        viewModel.setPushEnabled(false)
                    } else when (
                        TappyNotificationPermission.actionFor(context, permissionState.hasBeenRequested)
                    ) {
                        NotificationPermissionAction.NOT_REQUIRED,
                        NotificationPermissionAction.ALREADY_GRANTED,
                        -> viewModel.setPushEnabled(true)

                        NotificationPermissionAction.REQUEST ->
                            requestPermission.launch(TappyNotificationPermission.PERMISSION)

                        NotificationPermissionAction.DIRECT_TO_SETTINGS ->
                            openAppNotificationSettings(context)
                    }
                },
            )

            if (pushEnabled) {
                WhatYoullReceiveCard()
            }
        }
    }
}

@Composable
private fun PushToggleCard(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(TappyShapes.input)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Notifications,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.notif_push_title),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (enabled) {
                        stringResource(R.string.notif_push_on_description)
                    } else {
                        stringResource(R.string.notif_push_off_description)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            val toggleContentDescription = stringResource(R.string.notif_toggle_content_description)
            Switch(
                checked = enabled,
                onCheckedChange = onToggle,
                modifier = Modifier.semantics { contentDescription = toggleContentDescription },
            )
        }
    }
}

@Composable
private fun WhatYoullReceiveCard() {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Text(
                text = stringResource(R.string.notif_receive_header),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RECEIVE_ITEMS.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = item.emoji, style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = stringResource(item.textRes),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            Text(
                text = stringResource(R.string.notif_receive_footer),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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

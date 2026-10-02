package com.tappyai.app.notifications

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.messaging.MessagesPane
import com.tappyai.app.messaging.MessagesViewModel
import com.tappyai.app.personal.V3AccentPill
import com.tappyai.app.personal.V3Chip
import com.tappyai.app.personal.V3EmptyPanel
import com.tappyai.app.personal.V3ErrorLine
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3OutlinePill
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.reviews.data.NotificationSection
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.notificationSection
import com.tappyai.core.designsystem.component.TappyImage
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The Inbox — web `/profile/notifications` (`NotificationsView.tsx`, V3 Page 6), 2026-09-17.
 *
 * The page is `V3Shell` at phone width (title + subtitle, back), then ONE row of state and
 * actions: the category `ChipRow` (All · Xã hội · Ưu đãi · Khám phá · Hệ thống — the four values
 * the API emits), the "N chưa đọc" accent pill when there is a count, "Đánh dấu đã đọc" beside it,
 * and the settings control. Then the list: the three time sections (`notifSection`: VỪA XONG /
 * HÔM NAY / TUẦN NÀY) each a bordered 16dp panel of rows.
 *
 * A row is one of two shapes, decided by `isSocialGroup`: a like / follow / comment WITH actors
 * shows the avatar stack (up to three, 8dp step, panel-coloured ring, initial in the type's
 * colour when there is no picture); everything else shows the category glyph in the category's
 * tint — or the official Tappy mark (`/tappy/wave.png`, the same bytes as `tappy_wave`) when the
 * platform itself is speaking (`category == system`). Unread is QUIET: an accent dot in the
 * gutter and a brighter, bolder title. `+N` is how many notifications collapsed into the row —
 * a plain neutral chip, never styled as an unread count, because it is not one.
 *
 * The Messages tab (2026-09-17, second pass) is `com.tappyai.app.messaging` — the web's
 * `MessagesTab` over the `/api/messaging` routes, a separate store with its own count, never mixed
 * with the notification count.
 *
 * What is DELIBERATELY not here:
 *  - the old "Tappy gợi ý hôm nay · 3 quán bạn bè hay đến đang mở gần bạn" digest banner — its
 *    copy was static, and the V3 page has no such banner.
 *  - a Vietnam-pinned clock: the web formats `HH:mm` in Asia/Ho_Chi_Minh; a phone is where its
 *    reader is, so the row shows the device's own clock.
 *
 * Settings: the web toggles its `NotificationSettings` block inline; here the same control opens
 * the existing push-preference screen ([NotificationsScreen]) — one preferences UI, not two.
 */
@Composable
fun InboxScreen(
    onBack: () -> Unit,
    onOpenNotification: (ReviewGroupedNotification) -> Unit,
    onOpenSettings: () -> Unit,
    onSignIn: (() -> Unit)?,
    /** The Messages tab: a conversation row (or a freshly started thread) opens as its own screen. */
    onOpenThread: (String) -> Unit,
    viewModel: InboxViewModel = hiltViewModel(),
    messagesViewModel: MessagesViewModel = hiltViewModel(),
) {
    // The web's default tab is Messages.
    var tab by rememberSaveable { mutableIntStateOf(0) }
    V3PersonalPage(
        title = stringResource(R.string.inbox_v3_title),
        subtitle = stringResource(R.string.inbox_v3_subtitle),
        onBack = onBack,
    ) {
        when (viewModel.isSignedIn) {
            null -> V3Loading()
            false -> SignedOutState(onSignIn)
            true -> {
                // Each tab shows ITS OWN count, from ITS OWN store. Neither is derived from the other.
                InboxTabs(
                    tab = tab,
                    messageUnread = messagesViewModel.unreadTotal,
                    notificationUnread = viewModel.unreadCount,
                    onChange = { tab = it },
                )
                if (tab == 0) MessagesPane(viewModel = messagesViewModel, onOpenThread = onOpenThread)
                else InboxContent(viewModel = viewModel, onOpenNotification = onOpenNotification, onOpenSettings = onOpenSettings)
            }
        }
    }
}

/** `InboxTabs`: the underline tabs, each with its real count as an accent pill; zero renders nothing. */
@Composable
private fun InboxTabs(tab: Int, messageUnread: Int, notificationUnread: Int, onChange: (Int) -> Unit) {
    val entries = listOf(R.string.inbox_v3_messages to messageUnread, R.string.inbox_v3_announcements to notificationUnread)
    Column {
        Row(modifier = Modifier.fillMaxWidth()) {
            entries.forEachIndexed { i, (labelRes, count) ->
                val active = i == tab
                val label = stringResource(labelRes)
                Column(
                    modifier = Modifier.clickable(role = Role.Tab, onClickLabel = label) { onChange(i) }.padding(horizontal = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)) {
                        Text(text = label, color = if (active) HomeV3.Purple else HomeV3.OnSurfaceVariant, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        if (count > 0) {
                            Text(
                                text = count.toString(),
                                color = Color.White,
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.clip(CircleShape).background(HomeV3.Purple).padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }
                    Box(modifier = Modifier.width(if (active) 40.dp else 0.dp).height(2.dp).background(HomeV3.Purple))
                }
            }
        }
        HorizontalDivider(color = HomeV3.Outline, thickness = 1.dp)
    }
}

@Composable
private fun InboxContent(
    viewModel: InboxViewModel,
    onOpenNotification: (ReviewGroupedNotification) -> Unit,
    onOpenSettings: () -> Unit,
) {
    // ── Filters + actions ──
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            InboxCategory.entries.forEach { category ->
                V3Chip(
                    text = stringResource(category.labelRes()),
                    selected = viewModel.filter == category,
                    onClick = { viewModel.selectFilter(category) },
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // The global count, and only when there is one — the same `unread_count` a badge reads.
            if (viewModel.unreadCount > 0) {
                Text(
                    text = stringResource(R.string.inbox_v3_unread, viewModel.unreadCount),
                    color = Color.White,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(CircleShape).background(HomeV3.Purple).padding(horizontal = 10.dp, vertical = 5.dp),
                )
                V3OutlinePill(text = stringResource(R.string.inbox_v3_mark_all_read), icon = Icons.Filled.Check, onClick = viewModel::markAllRead)
            }
            Spacer(modifier = Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(HomeV3.Surface)
                    .border(1.dp, HomeV3.Outline, CircleShape)
                    .clickable(onClick = onOpenSettings, role = Role.Button, onClickLabel = stringResource(R.string.inbox_v3_settings)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Settings, contentDescription = stringResource(R.string.inbox_v3_settings), tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
            }
        }
    }

    // ── The list region ──
    val groups = viewModel.groups
    val visible = viewModel.visible
    when {
        viewModel.error != null && groups == null ->
            V3ErrorLine(message = viewModel.error!!, retryText = stringResource(R.string.common_try_again), onRetry = viewModel::load)
        groups == null || (viewModel.isLoading && groups.isEmpty()) -> V3Loading(height = 160.dp)
        groups.isEmpty() -> V3EmptyPanel(text = stringResource(R.string.inbox_v3_empty_all), icon = Icons.Filled.Notifications)
        visible.isNullOrEmpty() -> V3EmptyPanel(text = stringResource(R.string.inbox_v3_empty_filtered), icon = Icons.Outlined.Info)
        else -> {
            val nowMillis = System.currentTimeMillis()
            val bySection = visible.groupBy { notificationSection(it.createdAt, nowMillis) }
            NotificationSection.entries.forEach { section ->
                val rows = bySection[section].orEmpty()
                if (rows.isEmpty()) return@forEach
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = stringResource(section.labelRes()),
                        color = HomeV3.OnSurfaceVariant,
                        fontSize = 10.sp,
                        letterSpacing = 1.2.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 4.dp, top = 4.dp),
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(V3PanelShape)
                            .background(HomeV3.Surface)
                            .border(1.dp, HomeV3.Outline, V3PanelShape),
                    ) {
                        rows.forEachIndexed { index, group ->
                            if (index > 0) HorizontalDivider(color = HomeV3.Outline)
                            InboxRow(group = group, onOpen = onOpenNotification)
                        }
                    }
                }
            }
        }
    }
}

/** `NotifRow`. */
@Composable
internal fun InboxRow(group: ReviewGroupedNotification, onOpen: (ReviewGroupedNotification) -> Unit) {
    val interactive = group.url.isNotBlank()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (interactive) Modifier.clickable(onClick = { onOpen(group) }) else Modifier)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Unread marker — a dot in the gutter, aligned with the title.
        Box(
            modifier = Modifier
                .padding(top = 8.dp)
                .size(6.dp)
                .clip(CircleShape)
                .background(if (group.unread) HomeV3.Purple else Color.Transparent),
        )
        if (group.isSocial) ActorStack(group) else CategoryGlyph(group.category)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = group.title.ifBlank { group.text },
                color = if (group.unread) HomeV3.OnSurface else HomeV3.OnSurfaceVariant,
                fontSize = 13.5.sp,
                lineHeight = 18.sp,
                fontWeight = if (group.unread) FontWeight.SemiBold else FontWeight.Medium,
            )
            if (group.text.isNotBlank() && group.title.isNotBlank()) {
                Text(
                    text = group.text,
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(text = clockTime(group.createdAt), color = HomeV3.OnSurfaceVariant, fontSize = 11.sp)
            // A real count, and NOT an unread count: how many notifications collapsed into this row.
            if (group.count > 1) {
                Text(
                    text = stringResource(R.string.inbox_v3_count_more, group.count),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(CircleShape).background(HomeV3.SurfaceVariant).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}

/** Up to three actors, 36dp each, an 8dp step, a panel-coloured ring; an initial when there is no picture. */
@Composable
private fun ActorStack(group: ReviewGroupedNotification) {
    val actors = group.actors.take(3)
    val tint = notifTypeColor(group.type)
    Box(modifier = Modifier.width(if (actors.size > 1) 44.dp else 36.dp).height(36.dp)) {
        actors.forEachIndexed { index, actor ->
            Box(
                modifier = Modifier
                    .offset(x = (index * 8).dp)
                    .zIndex((3 - index).toFloat())
                    .size(36.dp)
                    .clip(CircleShape)
                    .border(2.dp, HomeV3.Surface, CircleShape)
                    .background(tint),
                contentAlignment = Alignment.Center,
            ) {
                if (!actor.avatar.isNullOrBlank()) {
                    TappyImage(url = actor.avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(36.dp).clip(CircleShape))
                } else {
                    val initial = actor.name.trim().split(' ').lastOrNull()?.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
                    Text(text = initial, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** The category glyph in the category's tint, or the Tappy mark when the platform speaks. */
@Composable
private fun CategoryGlyph(category: String) {
    val style = categoryStyle(category)
    Box(
        modifier = Modifier.size(36.dp).clip(CircleShape).background(style.color.copy(alpha = 0.13f)),
        contentAlignment = Alignment.Center,
    ) {
        if (category == "system") {
            Image(painter = painterResource(R.drawable.tappy_wave), contentDescription = null, modifier = Modifier.size(28.dp), contentScale = ContentScale.Fit)
        } else {
            Text(text = style.emoji, fontSize = 17.sp)
        }
    }
}

@Composable
private fun SignedOutState(onSignIn: (() -> Unit)?) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(modifier = Modifier.size(56.dp).clip(CircleShape).background(HomeV3.SurfaceVariant), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Notifications, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(26.dp))
        }
        Text(text = stringResource(R.string.inbox_v3_sign_in), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        if (onSignIn != null) V3AccentPill(text = stringResource(R.string.settings_sign_in), onClick = onSignIn)
    }
}

// ── The taxonomy (src/lib/notifications/inbox.ts: NOTIF_COLOR + CATEGORY_STYLE) ──

internal class InboxCategoryStyle(val color: Color, val emoji: String)

/** `CATEGORY_STYLE`; an unknown category wears the system tint, as on the web. */
internal fun categoryStyle(category: String): InboxCategoryStyle = when (category) {
    "social" -> InboxCategoryStyle(Color(0xFFFF6B35), "🎉")
    "deal" -> InboxCategoryStyle(Color(0xFFF59E0B), "🏷️")
    "explore" -> InboxCategoryStyle(Color(0xFF8B5CF6), "✨")
    else -> InboxCategoryStyle(Color(0xFF64748B), "🔔")
}

/** `NOTIF_COLOR`: the initial's ground for an actor without a picture. */
internal fun notifTypeColor(type: String): Color = when (type) {
    "like" -> Color(0xFFFF6B35)
    "follow" -> Color(0xFF1D9E75)
    "profile_view" -> Color(0xFF534AB7)
    "comment" -> Color(0xFF378ADD)
    else -> Color(0xFF8B5CF6)
}

private fun InboxCategory.labelRes(): Int = when (this) {
    InboxCategory.All -> R.string.inbox_v3_cat_all
    InboxCategory.Social -> R.string.inbox_v3_cat_social
    InboxCategory.Deal -> R.string.inbox_v3_cat_deal
    InboxCategory.Explore -> R.string.inbox_v3_cat_explore
    InboxCategory.System -> R.string.inbox_v3_cat_system
}

private fun NotificationSection.labelRes(): Int = when (this) {
    NotificationSection.JustNow -> R.string.reviews_notification_section_just_now
    NotificationSection.Today -> R.string.reviews_notification_section_today
    NotificationSection.ThisWeek -> R.string.reviews_notification_section_this_week
}

private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** `timeOf`: the clock time of a row; the date lives in the section heading. Blank on a malformed stamp. */
internal fun clockTime(iso: String, zone: ZoneId = ZoneId.systemDefault()): String = try {
    OffsetDateTime.parse(iso.trim().replace(' ', 'T')).atZoneSameInstant(zone).format(CLOCK)
} catch (_: Exception) {
    ""
}

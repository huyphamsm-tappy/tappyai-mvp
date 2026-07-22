package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.ui.graphics.Brush
import com.tappyai.app.R
import com.tappyai.app.reviews.data.NotificationSection
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.SEED_NOTIFICATIONS
import com.tappyai.app.reviews.data.formatRelativeTime
import com.tappyai.app.reviews.data.groupNotifications
import com.tappyai.app.reviews.data.notificationSection
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.theme.TappySpacing

private val NotifBackground = Color(0xFF000000)
private val NotifTextPrimary = Color(0xFFFFFFFF)
private val NotifTextSecondary = Color(0xB3FFFFFF)
private val NotifBadgeLike = Color(0xFFFE2C55)
private val NotifBadgeComment = Color(0xFF3B82F6)
private val NotifBadgeFollow = Color(0xFF8B5CF6)
private val NotifBadgeView = Color(0xFF6B7280)

@Composable
internal fun ReviewNotificationItem(
    notification: ReviewGroupedNotification,
    nowMillis: Long,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val leadActor = notification.actors.firstOrNull()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        Box {
            TappyAvatar(
                name = leadActor?.name ?: "",
                imageUrl = leadActor?.avatar,
                size = TappyAvatarSize.ListRow,
            )
            NotificationBadge(
                type = notification.type,
                modifier = Modifier.align(Alignment.BottomEnd),
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(
                text = buildNotificationText(notification),
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            if (notification.type == "comment" && notification.commentBody != null) {
                Text(
                    text = notification.commentBody,
                    color = NotifTextSecondary,
                    fontSize = 13.sp,
                    maxLines = 2,
                )
            }
            Text(
                text = formatRelativeTime(notification.createdAt, nowMillis),
                color = NotifTextSecondary,
                fontSize = 12.sp,
            )
        }
    }
}

internal fun LazyListScope.reviewNotificationItems(
    notifications: List<ReviewGroupedNotification>,
    nowMillis: Long,
    onNotificationClick: (ReviewGroupedNotification) -> Unit,
) {
    if (notifications.isEmpty()) {
        item(key = "notif-empty") {
            TappyEmptyState(
                icon = Icons.Filled.Notifications,
                title = stringResource(R.string.reviews_notification_empty_title),
                message = stringResource(R.string.reviews_notification_empty_message),
            )
        }
    } else {
        // Web parity: the Inbox groups rows under JUST NOW / TODAY / THIS WEEK headers. The list is
        // already sorted newest-first, so emitting the buckets in order preserves that ordering.
        val bySection = notifications.groupBy { notificationSection(it.createdAt, nowMillis) }
        NotificationSection.values().forEach { section ->
            val rows = bySection[section].orEmpty()
            if (rows.isNotEmpty()) {
                item(key = "notif-section-${section.name}") {
                    NotificationSectionHeader(section = section)
                }
                items(items = rows, key = { it.id }) { notification ->
                    ReviewNotificationItem(
                        notification = notification,
                        nowMillis = nowMillis,
                        onClick = { onNotificationClick(notification) },
                    )
                }
            }
        }
    }
}

/**
 * The Inbox "AI digest" banner — web parity (`reviews/page.tsx` InboxTab): a rounded gradient card
 * above the notification list that hands off to the Following feed. Web personalizes the subtext
 * from the user's taste prefs; those aren't plumbed into this screen, so it uses the web's own
 * DEFAULT copy (`reviews.bannerDefault`) rather than inventing a variant.
 */
@Composable
internal fun InboxDigestBanner(onClick: () -> Unit) {
    val accent = Color(0xFFFF6B35)
    Box(modifier = Modifier.padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp)) // rounded-2xl
                .background(
                    Brush.linearGradient(listOf(Color(0xFF1C0D00), Color(0xFF2A1500))),
                )
                .border(1.dp, accent.copy(alpha = 0.28f), RoundedCornerShape(16.dp))
                .clickable(onClick = onClick)
                .padding(14.dp), // p-3.5
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg), // gap-3
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp) // w-9 h-9
                    .clip(RoundedCornerShape(12.dp))
                    .background(accent.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "✨", fontSize = 18.sp)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.reviews_notification_banner_title),
                    color = accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(R.string.reviews_notification_banner_subtext),
                    color = NotifTextPrimary,
                    fontSize = 14.sp,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = Color(0xFF6B7280),
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun NotificationSectionHeader(section: NotificationSection) {
    Text(
        text = stringResource(
            when (section) {
                NotificationSection.JustNow -> R.string.reviews_notification_section_just_now
                NotificationSection.Today -> R.string.reviews_notification_section_today
                NotificationSection.ThisWeek -> R.string.reviews_notification_section_this_week
            },
        ),
        color = NotifTextSecondary,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
    )
}

@Composable
private fun NotificationBadge(type: String, modifier: Modifier = Modifier) {
    val (icon, color) = notificationBadgeConfig(type)
    Box(
        modifier = modifier
            .size(16.dp)
            .clip(CircleShape)
            .background(color),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(10.dp),
        )
    }
}

@Composable
private fun buildNotificationText(notification: ReviewGroupedNotification) =
    buildAnnotatedString {
        val actors = notification.actors
        withStyle(SpanStyle(color = NotifTextPrimary, fontWeight = FontWeight.SemiBold)) {
            append(actors.first().name)
        }
        if (actors.size > 1) {
            withStyle(SpanStyle(color = NotifTextSecondary)) {
                append(" ")
                append(stringResource(R.string.reviews_notification_others, actors.size - 1))
            }
        }
        withStyle(SpanStyle(color = NotifTextSecondary)) {
            append(" ${notification.text}")
        }
    }

private fun notificationBadgeConfig(type: String): Pair<ImageVector, Color> = when (type) {
    "like" -> Icons.Filled.Favorite to NotifBadgeLike
    "comment" -> Icons.Filled.ChatBubble to NotifBadgeComment
    "follow" -> Icons.Filled.PersonAdd to NotifBadgeFollow
    "profile_view" -> Icons.Filled.Visibility to NotifBadgeView
    else -> Icons.Filled.Notifications to NotifBadgeView
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 600)
@Composable
private fun NotificationListPreview() {
    val grouped = groupNotifications(SEED_NOTIFICATIONS)
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NotifBackground),
    ) {
        reviewNotificationItems(
            notifications = grouped,
            nowMillis = System.currentTimeMillis(),
            onNotificationClick = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 400)
@Composable
private fun NotificationEmptyPreview() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NotifBackground),
    ) {
        reviewNotificationItems(
            notifications = emptyList(),
            nowMillis = System.currentTimeMillis(),
            onNotificationClick = {},
        )
    }
}

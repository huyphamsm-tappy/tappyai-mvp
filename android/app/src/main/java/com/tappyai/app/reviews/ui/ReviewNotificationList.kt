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
import com.tappyai.app.R
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.SEED_NOTIFICATIONS
import com.tappyai.app.reviews.data.formatRelativeTime
import com.tappyai.app.reviews.data.groupNotifications
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
        items(items = notifications, key = { it.id }) { notification ->
            ReviewNotificationItem(
                notification = notification,
                nowMillis = nowMillis,
                onClick = { onNotificationClick(notification) },
            )
        }
    }
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

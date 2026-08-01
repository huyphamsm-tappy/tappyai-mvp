package com.tappyai.app.reviews.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R
import com.tappyai.app.reviews.data.parseIsoMillis

/**
 * Localized relative time for review comments + notifications. Mirrors the web's `ago()` full form
 * ("X phút/giờ/ngày trước") and the Review Detail's own timestamp, replacing the old compact
 * English-only formatter ("1m/1h/1d") that never followed the app language — so the notification
 * inbox and comment rows now match the rest of the app in both VI and EN. Reuses the same string
 * resources as the detail screen and the same robust timestamp parsing as the data layer.
 */
@Composable
fun reviewRelativeTime(createdAt: String, nowMillis: Long): String {
    val ms = parseIsoMillis(createdAt)
    if (ms == 0L) return stringResource(R.string.reviews_detail_time_just_now)
    val minutes = ((nowMillis - ms) / 60_000L).coerceAtLeast(0)
    return when {
        minutes < 1 -> stringResource(R.string.reviews_detail_time_just_now)
        minutes < 60 -> stringResource(R.string.reviews_detail_time_minutes_ago, minutes.toInt())
        minutes < 1440 -> stringResource(R.string.reviews_detail_time_hours_ago, (minutes / 60).toInt())
        minutes < 43200 -> stringResource(R.string.reviews_detail_time_days_ago, (minutes / 1440).toInt())
        else -> stringResource(R.string.reviews_detail_time_months_ago, (minutes / 43200).toInt())
    }
}

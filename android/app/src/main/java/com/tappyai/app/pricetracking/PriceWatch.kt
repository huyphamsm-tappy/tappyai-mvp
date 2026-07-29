package com.tappyai.app.pricetracking

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class PriceWatchStatus { ACTIVE, TRIGGERED }

data class PriceWatch(
    val id: String,
    val productName: String,
    val targetPrice: Long,
    val currentPrice: Long?,
    val status: PriceWatchStatus,
    val lastChecked: Long?,
    val notifiedAt: Long?,
    val createdAt: Long,
)

// Web parity (profile/price-watches/page.tsx:23-27): `toLocaleString('vi-VN', {dateStyle:'short',
// timeStyle:'short'})` → "18/07/2026 14:30" — VN date + time + year. The old "d MMM" (Locale.ENGLISH)
// dropped the year/time and showed an English month in a VI-first app.
private val watchDateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

fun formatWatchDate(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDateTime().format(watchDateFormatter)

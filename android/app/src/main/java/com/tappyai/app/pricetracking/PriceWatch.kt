package com.tappyai.app.pricetracking

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

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

private val relativeDateFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

fun formatWatchDate(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate().format(relativeDateFormatter)

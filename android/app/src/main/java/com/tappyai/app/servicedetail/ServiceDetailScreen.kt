package com.tappyai.app.servicedetail

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

private val TIME_SLOTS = listOf(
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00", "17:00",
    "18:00", "19:00", "20:00", "21:00",
)

private data class CategoryMeta(val emoji: String, val labelRes: Int)

private fun categoryMeta(type: String): CategoryMeta = when (type) {
    "spa" -> CategoryMeta("💆", R.string.service_category_spa)
    "hotel" -> CategoryMeta("🏨", R.string.service_category_hotel)
    "travel" -> CategoryMeta("✈️", R.string.service_category_travel)
    "shopping" -> CategoryMeta("🛍️", R.string.service_category_shopping)
    "entertainment" -> CategoryMeta("🎉", R.string.service_category_entertainment)
    else -> CategoryMeta("🍜", R.string.service_category_food) // web falls back to food
}

/**
 * Service detail + booking — mirrors the web `/service/[id]` page. Hero, name + Tappy rating,
 * category chip, address (opens maps), the user's past bookings here, community reviews, and the
 * booking form. Reached from a Saved place tap.
 */
@Composable
fun ServiceDetailScreen(
    onBack: () -> Unit,
    viewModel: ServiceDetailViewModel = hiltViewModel(),
) {
    val info = viewModel.info
    val reviewsState by viewModel.reviewsState.collectAsStateWithLifecycle()
    val myBookings by viewModel.myBookings.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    val meta = categoryMeta(info.type)

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            // Header row (back + name)
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(
                    text = info.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }

            // Hero banner
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .background(
                        Brush.linearGradient(
                            listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = meta.emoji, fontSize = 72.sp)
            }

            Column(
                modifier = Modifier.padding(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                ServiceHeader(info = info, meta = meta, reviewsState = reviewsState)

                if (info.address.isNotBlank()) {
                    AddressCard(address = info.address, onOpen = {
                        uriHandler.openUri("https://maps.google.com/?q=" + info.address)
                    })
                }

                if (myBookings.isNotEmpty()) {
                    MyBookingsSection(bookings = myBookings)
                }

                (reviewsState as? UiState.Success)?.data?.let { reviews ->
                    if (reviews.reviews.isNotEmpty()) {
                        CommunityReviewsSection(reviews = reviews)
                    }
                }

                BookingSection(viewModel = viewModel, onBack = onBack)
            }
        }
    }
}

@Composable
private fun ServiceHeader(info: ServiceInfo, meta: CategoryMeta, reviewsState: UiState<ServiceReviews>) {
    val avg = (reviewsState as? UiState.Success)?.data?.avgRating
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = info.name,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                modifier = Modifier.weight(1f),
            )
            if (avg != null) {
                Box(
                    modifier = Modifier
                        .clip(TappyShapes.pill)
                        .background(MaterialTheme.colorScheme.secondaryContainer)
                        .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
                ) {
                    Text(
                        text = stringResource(R.string.service_tappy_rating, avg),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                }
            }
        }
        Box(
            modifier = Modifier
                .clip(TappyShapes.pill)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
        ) {
            Text(
                text = meta.emoji + " " + stringResource(meta.labelRes),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AddressCard(address: String, onOpen: () -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth().clip(TappyShapes.card).clickable(onClick = onOpen)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.LocationOn,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.service_address_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = address,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun MyBookingsSection(bookings: List<MyBooking>) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(
                text = stringResource(R.string.service_my_bookings_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            bookings.forEach { b ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = buildString {
                            append(b.date)
                            b.time?.let { append(stringResource(R.string.service_booking_at_time, it)) }
                            if (b.guests > 1) append(stringResource(R.string.service_booking_guests_suffix, b.guests))
                        },
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    val (labelRes, container, onContainer) = when (b.status) {
                        MyBookingStatus.Confirmed -> Triple(
                            R.string.service_status_confirmed,
                            MaterialTheme.colorScheme.secondaryContainer,
                            MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                        MyBookingStatus.Cancelled -> Triple(
                            R.string.service_status_cancelled,
                            MaterialTheme.colorScheme.errorContainer,
                            MaterialTheme.colorScheme.onErrorContainer,
                        )
                        MyBookingStatus.Pending -> Triple(
                            R.string.service_status_pending,
                            MaterialTheme.colorScheme.tertiaryContainer,
                            MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(TappyShapes.pill)
                            .background(container)
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    ) {
                        Text(
                            text = stringResource(labelRes),
                            style = MaterialTheme.typography.labelSmall,
                            color = onContainer,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CommunityReviewsSection(reviews: ServiceReviews) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.service_community_reviews_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                reviews.avgRating?.let {
                    Text(
                        text = stringResource(R.string.service_avg_rating, it, reviews.reviews.size),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            reviews.reviews.forEach { r ->
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    Text(
                        text = "★".repeat(r.rating.coerceIn(0, 5)) + "☆".repeat((5 - r.rating).coerceIn(0, 5)),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                    if (r.body.isNotBlank()) {
                        Text(text = r.body, style = MaterialTheme.typography.bodySmall)
                    }
                    if (r.photos.isNotEmpty()) {
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                        ) {
                            r.photos.forEach { url ->
                                TappyImage(
                                    url = url,
                                    contentDescription = null,
                                    modifier = Modifier.size(72.dp).clip(TappyShapes.input),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun BookingSection(viewModel: ServiceDetailViewModel, onBack: () -> Unit) {
    val context = LocalContext.current

    if (viewModel.done) {
        BookingConfirmation(
            serviceName = viewModel.info.name,
            date = viewModel.date,
            time = viewModel.time,
            guests = viewModel.guests,
            name = viewModel.name,
            phone = viewModel.phone,
            notes = viewModel.notes,
            onShare = {
                val lines = buildString {
                    appendLine("📋 " + context.getString(R.string.service_booking_confirm_share_title))
                    appendLine("🏠 " + viewModel.info.name)
                    append("📅 " + viewModel.date)
                    if (viewModel.time.isNotBlank()) append(" • " + viewModel.time)
                    appendLine()
                    appendLine("👤 " + viewModel.name + " | 📞 " + viewModel.phone)
                    if (viewModel.guests > 1) appendLine("👥 " + viewModel.guests)
                    if (viewModel.notes.isNotBlank()) append("📝 " + viewModel.notes)
                }
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.service_booking_confirm_share_title))
                    putExtra(Intent.EXTRA_TEXT, lines.trim())
                }
                context.startActivity(Intent.createChooser(send, null))
            },
            onDone = onBack,
        )
        return
    }

    // Deliberately excludes "spa" — byte-for-byte matches the web's own showGuests list
    // (BookingForm.tsx: `['food', 'hotel', 'entertainment', 'travel'].includes(serviceType)`).
    // The web's guestLabel ternary has the same unreachable "spa" case this file mirrors; that's
    // a pre-existing inconsistency in the web itself; changing it here would break parity.
    val showGuests = viewModel.info.type in listOf("food", "hotel", "entertainment", "travel")
    var showDatePicker by remember { mutableStateOf(false) }

    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Text(
                text = stringResource(R.string.service_booking_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )

            TappyTextField(
                value = viewModel.name,
                onValueChange = viewModel::onNameChange,
                label = stringResource(R.string.service_booking_name_label),
                placeholder = stringResource(R.string.service_booking_name_hint),
            )
            TappyTextField(
                value = viewModel.phone,
                onValueChange = viewModel::onPhoneChange,
                label = stringResource(R.string.service_booking_phone_label),
                placeholder = stringResource(R.string.service_booking_phone_hint),
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone,
            )

            // Date (opens a picker; floor = today VN)
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                Text(
                    text = stringResource(R.string.service_booking_date_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(TappyShapes.input)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { showDatePicker = true }
                        .padding(TappySpacing.md),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(
                        text = viewModel.date.ifBlank { stringResource(R.string.service_booking_date_placeholder) },
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (viewModel.date.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            // Time slots
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                Text(
                    text = stringResource(R.string.service_booking_time_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    TIME_SLOTS.forEach { slot ->
                        val selected = viewModel.time == slot
                        Box(
                            modifier = Modifier
                                .clip(TappyShapes.pill)
                                .background(
                                    if (selected) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.surfaceVariant,
                                )
                                .clickable { viewModel.onTimeToggle(slot) }
                                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
                        ) {
                            Text(
                                text = slot,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (selected) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            // Guests stepper
            if (showGuests) {
                val guestLabelRes = when (viewModel.info.type) {
                    "hotel" -> R.string.service_booking_guests_rooms
                    "spa" -> R.string.service_booking_guests_people
                    else -> R.string.service_booking_guests_default
                }
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    Text(
                        text = stringResource(guestLabelRes),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        StepperButton(text = "−", onClick = { viewModel.onGuestsChange(-1) })
                        Text(
                            text = viewModel.guests.toString(),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        StepperButton(text = "+", onClick = { viewModel.onGuestsChange(1) })
                    }
                }
            }

            TappyTextField(
                value = viewModel.notes,
                onValueChange = viewModel::onNotesChange,
                label = stringResource(R.string.service_booking_notes_label),
                placeholder = stringResource(R.string.service_booking_notes_hint),
                singleLine = false,
                minLines = 2,
                maxLines = 4,
            )

            viewModel.errorMessage?.let {
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }

            TappyButton(
                text = stringResource(R.string.service_booking_submit),
                onClick = viewModel::onSubmit,
                enabled = !viewModel.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = stringResource(R.string.service_booking_footnote),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showDatePicker) {
        val minMillis = remember(viewModel.todayVN) {
            runCatching {
                LocalDate.parse(viewModel.todayVN).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            }.getOrDefault(0L)
        }
        val pickerState = rememberDatePickerState(
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis >= minMillis
            },
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        val picked = Instant.ofEpochMilli(millis).atZone(ZoneId.of("UTC")).toLocalDate()
                        viewModel.onDateChange(picked.format(DateTimeFormatter.ISO_LOCAL_DATE))
                    }
                    showDatePicker = false
                }) { Text(stringResource(R.string.common_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

@Composable
private fun StepperButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(TappyShapes.input)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun BookingConfirmation(
    serviceName: String,
    date: String,
    time: String,
    guests: Int,
    name: String,
    phone: String,
    notes: String,
    onShare: () -> Unit,
    onDone: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
                contentAlignment = Alignment.Center,
            ) { Text(text = "✅", fontSize = 28.sp) }
            Text(
                text = stringResource(R.string.service_booking_success_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.service_booking_success_message),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.input)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(text = serviceName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    text = "📅 " + date + (if (time.isNotBlank()) " • $time" else ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "👤 $name · 📞 $phone",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (guests > 1) {
                    Text(
                        text = stringResource(R.string.service_booking_guests_summary, guests),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (notes.isNotBlank()) {
                    Text(text = "📝 $notes", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            TappyButton(
                text = stringResource(R.string.service_booking_share),
                onClick = onShare,
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.service_booking_back))
            }
        }
    }
}

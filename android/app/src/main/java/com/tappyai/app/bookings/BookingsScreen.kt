package com.tappyai.app.bookings

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.StarBorder
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonSize
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappySkeleton
import com.tappyai.core.designsystem.theme.TappyCategoryColor
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * Bookings — mirrors the web `/profile/bookings` ("Lịch đặt chỗ"): a pending-status banner + a
 * list of booking cards (service emoji, name, customer, status badge, details, notes, actions).
 * Data is loaded by [BookingsViewModel] from `GET /api/bookings` (read-only — the web has no cancel/
 * delete). **Share** fires a real Android `ACTION_SEND` share sheet (local text, no backend);
 * **Review** opens the review composer with the booking's real place pre-filled, and appears under
 * the same conditions the web applies (see [BookingsViewModel]). Where the web expands an inline
 * form in the card, Android pushes its existing full-screen composer — a deliberate platform
 * difference, not a gap. Cards aren't tappable. The empty state's "Explore now" switches to Home.
 */
@Composable
fun BookingsScreen(
    onBack: () -> Unit,
    onExploreNow: () -> Unit,
    viewModel: BookingsViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    val context = LocalContext.current

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.bookings_title), style = MaterialTheme.typography.titleLarge)
            }

            when (state) {
                UiState.Loading -> LoadingSkeletons()
                is UiState.Error -> ErrorState(message = state.message, onRetry = viewModel::retry)
                UiState.Empty, UiState.Idle -> EmptyState(onExploreNow = onExploreNow)
                is UiState.Success -> BookingsList(
                    bookings = state.data,
                    onShare = { booking -> shareBooking(context, booking) },
                    onReview = viewModel::onReviewBooking,
                )
            }
        }
    }
}

@Composable
private fun ColumnScope.BookingsList(
    bookings: List<Booking>,
    onShare: (Booking) -> Unit,
    onReview: (Booking) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        if (bookings.any { it.status == BookingStatus.Pending }) {
            item(key = "pending-banner") { PendingBanner() }
        }
        items(items = bookings, key = { it.id }) { booking ->
            BookingCard(booking = booking, onShare = { onShare(booking) }, onReview = { onReview(booking) })
        }
    }
}

@Composable
private fun PendingBanner() {
    val amber = tappyCategoryColors.amber
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(amber.container)
            .padding(TappySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.bookings_pending_banner),
            style = MaterialTheme.typography.bodySmall,
            color = amber.onContainer,
        )
    }
}

@Composable
private fun BookingCard(booking: Booking, onShare: () -> Unit, onReview: () -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                verticalAlignment = Alignment.Top,
            ) {
                Text(text = emojiForServiceType(booking.serviceType), fontSize = 24.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = booking.serviceName,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "${booking.customerName} · ${booking.customerPhone}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                StatusBadge(status = booking.status)
            }

            DetailsRow(booking = booking)

            if (booking.notes != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(TappyShapes.input)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
                ) {
                    Text(
                        text = "“${booking.notes}”",
                        style = MaterialTheme.typography.bodySmall,
                        fontStyle = FontStyle.Italic,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                TappyButton(
                    text = stringResource(R.string.bookings_share_button),
                    onClick = onShare,
                    variant = TappyButtonVariant.Ghost,
                    size = TappyButtonSize.Small,
                    leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp)) },
                )
                if (booking.canReview) {
                    TappyButton(
                        text = stringResource(R.string.bookings_review_label),
                        onClick = onReview,
                        variant = TappyButtonVariant.Ghost,
                        size = TappyButtonSize.Small,
                        leadingIcon = { Icon(Icons.Filled.StarBorder, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DetailsRow(booking: Booking) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        DetailChip(icon = Icons.Filled.CalendarMonth, text = formatBookingDate(booking.dateMillis))
        if (booking.time != null) {
            DetailChip(icon = Icons.Filled.Schedule, text = booking.time)
        }
        if (booking.guests > 1) {
            DetailChip(icon = Icons.Filled.Group, text = guestsLabel(booking.guests))
        }
    }
}

@Composable
private fun DetailChip(icon: ImageVector, text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StatusBadge(status: BookingStatus) {
    val cat = tappyCategoryColors
    val (color: TappyCategoryColor, label) = when (status) {
        BookingStatus.Confirmed -> cat.green to stringResource(R.string.bookings_status_confirmed)
        BookingStatus.Cancelled -> cat.red to stringResource(R.string.bookings_status_cancelled)
        BookingStatus.Pending -> cat.amber to stringResource(R.string.bookings_status_pending)
    }
    Box(
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(color.container)
            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
    ) {
        Text(text = label, style = MaterialTheme.typography.labelMedium, color = color.onContainer)
    }
}

@Composable
private fun LoadingSkeletons() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        repeat(3) {
            TappySkeleton(modifier = Modifier.fillMaxWidth().height(120.dp), shape = TappyShapes.card)
        }
    }
}

@Composable
private fun ColumnScope.ErrorState(message: String, onRetry: () -> Unit) {
    TappyErrorState(
        title = stringResource(R.string.bookings_error_title),
        message = message,
        retryText = stringResource(R.string.common_try_again),
        onRetry = onRetry,
        modifier = Modifier.weight(1f).fillMaxWidth(),
    )
}

@Composable
private fun ColumnScope.EmptyState(onExploreNow: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterVertically),
    ) {
        Text(text = "📅", fontSize = 48.sp)
        Text(text = stringResource(R.string.bookings_empty_title), style = MaterialTheme.typography.titleMedium)
        Text(
            text = stringResource(R.string.bookings_empty_message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = TappySpacing.xl),
        )
        TappyButton(text = stringResource(R.string.bookings_explore_now), onClick = onExploreNow)
    }
}

private fun shareBooking(context: Context, booking: Booking) {
    val timeSuffix = booking.time?.let { context.getString(R.string.bookings_share_time_suffix, it) } ?: ""
    val text = buildList {
        add(context.getString(R.string.bookings_share_header))
        add("🏠 ${booking.serviceName}")
        add("📅 ${formatBookingDate(booking.dateMillis)}$timeSuffix")
        add("👤 ${booking.customerName} | 📞 ${booking.customerPhone}")
        if (booking.guests > 1) add("👥 ${guestsLabel(booking.guests)}")
        booking.notes?.let { add("📝 $it") }
    }.joinToString("\n")

    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.bookings_share_subject))
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.bookings_share_chooser_title)))
}

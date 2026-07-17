package com.tappyai.app.currency

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import java.text.NumberFormat
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/**
 * Currency converter — mirrors the web `/currency` page: an amount input with quick presets, a
 * from/to picker (12 currencies) with swap, and a live-computed result — no submit button, same
 * as the web, which recomputes on every keystroke/selection. Rates come once from the existing
 * `GET /api/rates` (no auth, same as the web). Reached from Home's "Currency" quick action,
 * replacing its former coming-soon sheet.
 */
@Composable
fun CurrencyScreen(
    onBack: () -> Unit,
    viewModel: CurrencyViewModel = hiltViewModel(),
) {
    var pickerTarget by remember { mutableStateOf<PickerTarget?>(null) }

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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.currency_title), style = MaterialTheme.typography.titleLarge)
            }

            AmountCard(
                amount = viewModel.amount,
                onAmountChange = viewModel::onAmountChange,
                onQuickAmount = viewModel::onQuickAmount,
            )

            CurrencySelectorsCard(
                from = viewModel.fromCurrency,
                to = viewModel.toCurrency,
                onOpenFrom = { pickerTarget = PickerTarget.From },
                onOpenTo = { pickerTarget = PickerTarget.To },
                onSwap = viewModel::swap,
            )

            ResultCard(
                loading = viewModel.loadingRates,
                converted = viewModel.converted,
                numAmount = viewModel.numAmount,
                from = viewModel.fromCurrency,
                to = viewModel.toCurrency,
                rate = viewModel.rate,
            )

            RateInfoFooter(
                fallback = viewModel.fallback,
                rateDateIso = viewModel.rateDateIso,
            )
        }
    }

    pickerTarget?.let { target ->
        CurrencyPickerSheet(
            selectedCode = if (target == PickerTarget.From) viewModel.fromCode else viewModel.toCode,
            onSelect = { currency ->
                if (target == PickerTarget.From) viewModel.onFromChange(currency.code) else viewModel.onToChange(currency.code)
                pickerTarget = null
            },
            onDismiss = { pickerTarget = null },
        )
    }
}

private enum class PickerTarget { From, To }

@Composable
private fun AmountCard(
    amount: String,
    onAmountChange: (String) -> Unit,
    onQuickAmount: (String) -> Unit,
) {
    // QUICK_AMOUNTS is constant, so this only ever runs once per composition, but hoisting via
    // remember (rather than a top-level `NumberFormat.getNumberInstance` call per label) keeps
    // the pattern consistent with ResultCard below.
    val vnFormatter = remember { NumberFormat.getNumberInstance(Locale("vi", "VN")) }
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(
                text = stringResource(R.string.currency_amount_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TappyTextField(
                value = amount,
                onValueChange = onAmountChange,
                placeholder = stringResource(R.string.currency_amount_placeholder),
                singleLine = true,
                keyboardType = KeyboardType.Decimal,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                QUICK_AMOUNTS.forEach { value ->
                    QuickAmountChip(
                        label = formatGrouped(value.toDouble(), vnFormatter),
                        selected = amount == value,
                        onClick = { onQuickAmount(value) },
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickAmountChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .clip(TappyShapes.input)
            .background(if (selected) colors.primary else colors.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (selected) colors.onPrimary else colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun CurrencySelectorsCard(
    from: Currency,
    to: Currency,
    onOpenFrom: () -> Unit,
    onOpenTo: () -> Unit,
    onSwap: () -> Unit,
) {
    TappyCard {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.Bottom,
        ) {
            CurrencySelectorField(label = stringResource(R.string.currency_from_label), currency = from, onClick = onOpenFrom, modifier = Modifier.weight(1f))
            IconButton(onClick = onSwap) {
                Icon(
                    imageVector = Icons.Filled.SwapHoriz,
                    contentDescription = stringResource(R.string.currency_swap_description),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
            CurrencySelectorField(label = stringResource(R.string.currency_to_label), currency = to, onClick = onOpenTo, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun CurrencySelectorField(
    label: String,
    currency: Currency,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(TappyShapes.input)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(onClick = onClick)
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "${currency.flag} ${currency.code}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Icon(
                imageVector = Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.height(18.dp),
            )
        }
    }
}

@Composable
private fun ResultCard(
    loading: Boolean,
    converted: Double?,
    numAmount: Double,
    from: Currency,
    to: Currency,
    rate: Double?,
) {
    // Hoisted once per composition instead of reconstructing a NumberFormat (locale lookup +
    // allocation) on every formatAmount call — this card recomposes on every keystroke in the
    // amount field via the ViewModel's debounced conversion, up to 4 calls per recomposition.
    val vnFormatter = remember { NumberFormat.getNumberInstance(Locale("vi", "VN")) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        val onColor = MaterialTheme.colorScheme.onPrimaryContainer
        when {
            loading -> Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // .size(), not .height() alone — height-only left the width unconstrained,
                // relying on the indicator's intrinsic default rather than a true 16dp circle.
                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = onColor, strokeWidth = 2.dp)
                Text(text = stringResource(R.string.currency_loading_rates), style = MaterialTheme.typography.bodySmall, color = onColor)
            }

            converted != null -> {
                Text(
                    text = stringResource(
                        R.string.currency_amount_equals,
                        formatAmount(numAmount, from.decimals, vnFormatter),
                        from.code,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = onColor,
                )
                Text(
                    text = formatAmount(converted, to.decimals, vnFormatter),
                    style = MaterialTheme.typography.headlineLarge,
                    color = onColor,
                )
                Text(
                    text = "${to.flag} ${to.code}",
                    style = MaterialTheme.typography.titleMedium,
                    color = onColor,
                )
                if (rate != null) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = TappySpacing.sm))
                    Text(
                        text = stringResource(
                            R.string.currency_rate_line,
                            from.code,
                            formatAmount(rate, if (to.decimals > 0) 4 else 2, vnFormatter),
                            to.code,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = onColor,
                    )
                    Text(
                        text = stringResource(
                            R.string.currency_rate_line,
                            to.code,
                            formatAmount(1 / rate, if (from.decimals > 0) 4 else 2, vnFormatter),
                            from.code,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = onColor,
                    )
                }
            }

            else -> Text(
                text = stringResource(R.string.currency_enter_amount_prompt),
                style = MaterialTheme.typography.bodySmall,
                color = onColor,
            )
        }
    }
}

@Composable
private fun RateInfoFooter(fallback: Boolean, rateDateIso: String?) {
    val formattedDate = remember(rateDateIso) { rateDateIso?.let(::formatRateDate) }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        val colors = MaterialTheme.colorScheme
        when {
            fallback -> Text(
                text = stringResource(R.string.currency_fallback_notice),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            formattedDate != null -> Text(
                text = stringResource(R.string.currency_rates_updated, formattedDate),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        Text(
            text = stringResource(R.string.currency_disclaimer),
            style = MaterialTheme.typography.bodySmall,
            color = colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CurrencyPickerSheet(
    selectedCode: String,
    onSelect: (Currency) -> Unit,
    onDismiss: () -> Unit,
) {
    TappyBottomSheet(onDismiss = onDismiss) {
        // heightIn(max=), not a fixed height() — a fixed 420dp demand overflows the sheet's
        // available space on a phone in landscape (<400dp tall); max lets it shrink to fit while
        // still capping how tall it grows on a normal portrait screen.
        LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
            items(CURRENCIES) { currency ->
                val isSelected = currency.code == selectedCode
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(currency) }
                        .padding(vertical = TappySpacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "${currency.flag} ${currency.code}",
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = currency.displayName(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = stringResource(R.string.currency_selected_description),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

/**
 * `toLocaleString('vi-VN', {minimumFractionDigits, maximumFractionDigits})` port. Takes a
 * caller-owned [NumberFormat] instead of constructing one per call (locale lookup + allocation) —
 * callers `remember` a single instance since this runs on every recomposition of the result card.
 * `NumberFormat` isn't thread-safe, but Compose recomposition is single-threaded, so sequential
 * reuse within one composition pass is safe.
 */
private fun formatAmount(value: Double, decimals: Int, formatter: NumberFormat): String {
    if (!value.isFinite()) return "—"
    formatter.minimumFractionDigits = decimals
    formatter.maximumFractionDigits = decimals
    return formatter.format(value)
}

/** Quick-amount chip labels — grouped, no decimals (matches `parseInt(v).toLocaleString('vi-VN')`). */
private fun formatGrouped(value: Double, formatter: NumberFormat): String {
    formatter.minimumFractionDigits = 0
    formatter.maximumFractionDigits = 3
    return formatter.format(value)
}

/** `time_last_update_utc` from open.er-api.com is RFC-1123-shaped; falls back to ISO. Returns
 *  null (line omitted) rather than fabricating a date, if genuinely unparseable. */
private fun formatRateDate(raw: String): String? {
    val instant = try {
        java.time.ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()
    } catch (_: DateTimeParseException) {
        try {
            java.time.OffsetDateTime.parse(raw).toInstant()
        } catch (_: Exception) {
            return null
        }
    }
    val local = instant.atZone(java.time.ZoneId.systemDefault())
    return "%02d/%02d/%04d".format(local.dayOfMonth, local.monthValue, local.year)
}

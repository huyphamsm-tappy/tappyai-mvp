package com.tappyai.app.currency

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Language
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolCard
import com.tappyai.app.tools.ToolChip
import com.tappyai.app.tools.ToolCoin
import com.tappyai.app.tools.ToolGlobe
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolOrbit
import com.tappyai.app.tools.ToolSegment
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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

    ToolV3Page(onBack = onBack) {
        ToolHero(
            hue = ToolHue.Navy,
            eyebrow = stringResource(R.string.smart_tool_currency),
            title1 = stringResource(R.string.currency_title),
            title2 = null,
            body = stringResource(R.string.tool_currency_subtitle),
            chips = listOf(
                ToolChip(Icons.Filled.Bolt, stringResource(R.string.tool_currency_chip_fast)),
                ToolChip(Icons.Filled.Verified, stringResource(R.string.tool_currency_chip_currencies, CURRENCIES.size)),
                ToolChip(Icons.Outlined.Language, stringResource(R.string.tool_currency_chip_source)),
            ),
            mascotRes = R.drawable.tappy_wave,
            scene = { CurrencyScene() },
        )
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

/** The hero scene: a soft globe, an orbit and three coin tokens ($ € ¥), as on the web. */
@Composable
private fun BoxScope.CurrencyScene() {
    ToolGlobe(size = 190.dp, alignment = Alignment.TopEnd, color = Color(0x662563EB), modifier = Modifier.offset(x = 24.dp, y = (-10).dp))
    ToolOrbit(size = 230.dp, alignment = Alignment.Center, modifier = Modifier.offset(y = 8.dp))
    ToolCoin(symbol = "$", a = Color(0xFF2563EB), b = Color(0xFF3B82F6), alignment = Alignment.TopStart, size = 44.dp, modifier = Modifier.offset(x = 8.dp, y = 26.dp))
    ToolCoin(symbol = "€", a = Color(0xFF7C3AED), b = Color(0xFFA78BFA), alignment = Alignment.TopEnd, size = 40.dp, modifier = Modifier.offset(x = (-6).dp, y = 4.dp))
    ToolCoin(symbol = "¥", a = Color(0xFFF59E0B), b = Color(0xFFFBBF24), alignment = Alignment.CenterEnd, size = 36.dp, modifier = Modifier.offset(x = (-10).dp, y = 30.dp))
}

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
    ToolCard(title = stringResource(R.string.currency_amount_label), icon = Icons.Filled.Paid) {
        ToolTextField(
            value = amount,
            onValueChange = onAmountChange,
            placeholder = stringResource(R.string.currency_amount_placeholder),
            singleLine = true,
            keyboardType = KeyboardType.Decimal,
            textSize = 28.sp,
            leadingIcon = { Icon(Icons.Filled.Paid, contentDescription = null, tint = HomeV3.Purple) },
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

@Composable
private fun QuickAmountChip(label: String, selected: Boolean, onClick: () -> Unit) {
    ToolSegment(text = label, selected = selected, onClick = onClick, minHeight = 44.dp)
}

@Composable
private fun CurrencySelectorsCard(
    from: Currency,
    to: Currency,
    onOpenFrom: () -> Unit,
    onOpenTo: () -> Unit,
    onSwap: () -> Unit,
) {
    ToolCard {
        Row(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.Bottom,
        ) {
            CurrencySelectorField(label = stringResource(R.string.currency_from_label), currency = from, onClick = onOpenFrom, modifier = Modifier.weight(1f))
            // The swap disc (`.v3-fx-swap`): the accent fill, sitting between the two selectors.
            Box(
                modifier = Modifier
                    .padding(bottom = 4.dp)
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(HomeV3.Purple)
                    .clickable(onClickLabel = stringResource(R.string.currency_swap_description), onClick = onSwap),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.SwapHoriz,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
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
        Text(text = label, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        val shape = RoundedCornerShape(16.dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clip(shape)
                .background(HomeV3.SurfaceVariant)
                .border(1.dp, HomeV3.Outline, shape)
                .clickable(onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "${currency.flag} ${currency.code}", color = HomeV3.OnSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Icon(imageVector = Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.height(18.dp))
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
    val shape = RoundedCornerShape(24.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(14.dp, shape, ambientColor = Color(0x733B82F6), spotColor = Color(0x733B82F6))
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF2563EB), Color(0xFF4F46E5), Color(0xFF6D28D9))))
            .border(1.dp, Color(0x5993C5FD), shape)
            .padding(TappySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        val onColor = Color.White
        Text(
            text = stringResource(R.string.tool_currency_result_label).uppercase(),
            color = Color(0xFFBFDBFE),
            fontSize = 12.5.sp,
            letterSpacing = 1.2.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 6.dp),
        )
        when {
            loading -> {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // .size(), not .height() alone — height-only left the width unconstrained,
                    // relying on the indicator's intrinsic default rather than a true 16dp circle.
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = onColor, strokeWidth = 2.dp)
                    Text(text = stringResource(R.string.currency_loading_rates), style = MaterialTheme.typography.bodySmall, color = onColor)
                }
                Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(modifier = Modifier.fillMaxWidth(0.66f).height(40.dp).clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.16f)))
                    Box(modifier = Modifier.fillMaxWidth(0.33f).height(14.dp).clip(RoundedCornerShape(7.dp)).background(Color.White.copy(alpha = 0.16f)))
                }
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
                    fontSize = 40.sp,
                    lineHeight = 46.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.5).sp,
                    color = onColor,
                )
                Text(
                    text = "${to.flag} ${to.code}",
                    style = MaterialTheme.typography.titleMedium,
                    color = onColor,
                )
                if (rate != null) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = TappySpacing.sm), color = Color.White.copy(alpha = 0.2f))
                    Text(
                        text = stringResource(
                            R.string.currency_rate_line,
                            from.code,
                            formatAmount(rate, rateDecimals(rate, to.decimals), vnFormatter),
                            to.code,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = onColor,
                    )
                    Text(
                        text = stringResource(
                            R.string.currency_rate_line,
                            to.code,
                            formatAmount(1 / rate, rateDecimals(1 / rate, from.decimals), vnFormatter),
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

/**
 * How many decimals a RATE needs to actually say something — B15.
 *
 * The two rate lines used a fixed count derived from the currency (`4` for a decimal currency,
 * `2` otherwise). That reads fine one way round and says nothing the other: 1 VND is 0.0000383
 * USD, and four decimals render it as
 *
 *     1 VND = 0,0000 USD
 *
 * — a true statement with no information in it. The inverse line was simply unusable for VND,
 * which is the app's primary currency.
 *
 * Rates are a SIGNIFICANT-FIGURES problem, not a fixed-decimals one. At or above 1 the old
 * behaviour was already right and is kept exactly, so nothing that reads well today changes.
 * Below 1, enough decimals are added to reach four significant figures — 0,00003828 — capped at 8
 * so a pathological rate cannot produce an endless string.
 */
private fun rateDecimals(value: Double, currencyDecimals: Int): Int {
    val base = if (currencyDecimals > 0) 4 else 2
    if (!value.isFinite() || value <= 0.0 || value >= 1.0) return base
    // leadingZeros(0.0000383) = 4; +4 significant figures = 8 decimals.
    val leadingZeros = kotlin.math.ceil(-kotlin.math.log10(value)).toInt() - 1
    return kotlin.math.min(8, kotlin.math.max(base, leadingZeros + 4))
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

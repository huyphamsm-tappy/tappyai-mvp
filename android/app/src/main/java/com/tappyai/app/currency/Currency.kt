package com.tappyai.app.currency

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * A convertible currency. [decimals] is the display precision (matches the web's
 * `toLocaleString('vi-VN', {minimumFractionDigits, maximumFractionDigits})` per-currency rule —
 * e.g. VND/JPY/KRW/TWD show no decimals, everything else shows 2). [nameRes] is the localized
 * display name, resolved via `stringResource()` (Composable call sites) — see [displayName].
 */
data class Currency(val code: String, @StringRes val nameRes: Int, val flag: String, val decimals: Int)

/** Mirrors the web `CURRENCIES` array (`src/app/currency/page.tsx`) exactly — same 12 currencies,
 *  same codes/flags/decimals/order — so the picker and formatting match the Web 1:1. Display names
 *  are localized (see `strings_currency.xml`) rather than mirroring the web's mixed-language copy. */
val CURRENCIES: List<Currency> = listOf(
    Currency("VND", R.string.currency_name_vnd, "🇻🇳", 0),
    Currency("USD", R.string.currency_name_usd, "🇺🇸", 2),
    Currency("EUR", R.string.currency_name_eur, "🇪🇺", 2),
    Currency("JPY", R.string.currency_name_jpy, "🇯🇵", 0),
    Currency("KRW", R.string.currency_name_krw, "🇰🇷", 0),
    Currency("GBP", R.string.currency_name_gbp, "🇬🇧", 2),
    Currency("AUD", R.string.currency_name_aud, "🇦🇺", 2),
    Currency("SGD", R.string.currency_name_sgd, "🇸🇬", 2),
    Currency("THB", R.string.currency_name_thb, "🇹🇭", 2),
    Currency("CNY", R.string.currency_name_cny, "🇨🇳", 2),
    Currency("HKD", R.string.currency_name_hkd, "🇭🇰", 2),
    Currency("TWD", R.string.currency_name_twd, "🇹🇼", 0),
)

@Composable
fun Currency.displayName(): String = stringResource(nameRes)

val DEFAULT_FROM_CODE = "VND"
val DEFAULT_TO_CODE = "USD"

/** Web's quick-amount presets, in order. */
val QUICK_AMOUNTS = listOf("100000", "500000", "1000000", "5000000")

/**
 * The USD-based rate table (`values["USD"] == 1`), plus provenance. [fallback] mirrors the
 * backend's own upstream-failure flag — when true, [values] is the backend's hardcoded estimate
 * table, not a live fetch (still safe to convert with, per the web's own behavior).
 */
data class Rates(val values: Map<String, Double>, val dateIso: String?, val fallback: Boolean)

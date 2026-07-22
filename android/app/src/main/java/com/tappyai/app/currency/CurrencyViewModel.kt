package com.tappyai.app.currency

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.currency.data.RatesRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Currency screen (`/currency` on the web). Loads the USD-based rate table once
 * from `GET /api/rates` and converts reactively as the user edits the amount/currencies/swaps —
 * there is no submit button on the web, and none here. The conversion arithmetic itself (not
 * business logic — the backend owns rate sourcing, not the from/to formula) is a direct port of
 * the web's own client-side math, since the web performs this same computation client-side with
 * no dedicated "convert" endpoint to call instead.
 *
 * Network-failure handling mirrors the web exactly, quirk included: the web's `fetch(...).catch(()
 * => setFallback(true))` sets `fallback=true` but leaves `rates` (and therefore any conversion)
 * null — it shows no error banner, just the fallback notice with an unconvertible empty state.
 * This ViewModel reproduces that same degrade rather than inventing a retry/error UI the web
 * doesn't have.
 */
@HiltViewModel
class CurrencyViewModel @Inject constructor(
    private val repository: RatesRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    var rates by mutableStateOf<Map<String, Double>?>(null)
        private set
    var rateDateIso by mutableStateOf<String?>(null)
        private set
    var fallback by mutableStateOf(false)
        private set
    var loadingRates by mutableStateOf(true)
        private set

    var amount by mutableStateOf("1000000")
        private set
    var fromCode by mutableStateOf(DEFAULT_FROM_CODE)
        private set
    var toCode by mutableStateOf(DEFAULT_TO_CODE)
        private set

    val fromCurrency: Currency get() = CURRENCIES.first { it.code == fromCode }
    val toCurrency: Currency get() = CURRENCIES.first { it.code == toCode }

    /**
     * Parsed like the web's `parseFloat(amount.replace(/[^0-9.]/g, '')) || 0` — including its
     * leading-prefix leniency. JS's `parseFloat` reads only the longest valid number from the
     * *start* of the string and ignores anything after (`parseFloat("1.000.000")` is `1`, not an
     * error); Kotlin's `toDoubleOrNull()` instead requires the whole string to be a valid double
     * and returns null for the same input, which the old `?: 0.0` fallback then silently turned
     * into 0 — a real behavior gap from the web on a Vietnamese-style grouped number, since
     * `KeyboardType.Decimal` (a keyboard hint only) doesn't block a second '.' the way the web's
     * native `type="number"` input does. [LEADING_NUMBER] isolates that same leading-prefix
     * substring before parsing, so this now degrades exactly like `parseFloat` instead of like
     * `Double.parse`.
     */
    val numAmount: Double
        get() {
            val filtered = amount.filter { it.isDigit() || it == '.' }
            val leading = LEADING_NUMBER.find(filtered)?.value.orEmpty()
            return leading.toDoubleOrNull() ?: 0.0
        }

    /** `1 [fromCode] = [rate] [toCode]`, or null while rates aren't loaded. */
    val rate: Double?
        get() {
            val r = rates ?: return null
            return when {
                fromCode == "USD" -> r[toCode] ?: 1.0
                toCode == "USD" -> 1.0 / (r[fromCode] ?: 1.0)
                else -> (r[toCode] ?: 1.0) / (r[fromCode] ?: 1.0)
            }
        }

    /** Null exactly when the web would show its "enter an amount" empty prompt — no rates yet,
     *  or nothing (positive) to convert. */
    val converted: Double?
        get() {
            val currentRate = rate ?: return null
            if (numAmount <= 0) return null
            return numAmount * currentRate
        }

    init {
        load()
    }

    private fun load() {
        loadingRates = true
        viewModelScope.launch {
            when (val result = repository.getRates()) {
                is NetworkResult.Success -> {
                    rates = result.data.values
                    rateDateIso = result.data.dateIso
                    fallback = result.data.fallback
                }
                is NetworkResult.Error -> {
                    logger.w(TAG, "getRates failed, degrading like the web: ${result.error}")
                    fallback = true
                }
            }
            loadingRates = false
        }
    }

    fun onAmountChange(value: String) {
        amount = value
    }

    fun onQuickAmount(value: String) {
        amount = value
    }

    fun onFromChange(code: String) {
        fromCode = code
    }

    fun onToChange(code: String) {
        toCode = code
    }

    fun swap() {
        val previousFrom = fromCode
        fromCode = toCode
        toCode = previousFrom
    }

    private companion object {
        const val TAG = "CurrencyViewModel"

        /** Longest `digits [ '.' digits ]` prefix — mirrors JS `parseFloat`'s number grammar. */
        val LEADING_NUMBER = Regex("^\\d*\\.?\\d*")
    }
}

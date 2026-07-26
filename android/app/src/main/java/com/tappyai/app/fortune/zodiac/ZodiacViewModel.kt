package com.tappyai.app.fortune.zodiac

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import com.tappyai.app.R
import com.tappyai.app.fortune.engine.FortunePeriod
import com.tappyai.app.fortune.engine.FortuneReading
import com.tappyai.app.fortune.engine.generateFortune
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

enum class ZodiacPeriod(@StringRes val labelRes: Int, val engine: FortunePeriod) {
    Day(R.string.fortune_period_today, FortunePeriod.Day),
    Week(R.string.fortune_period_this_week, FortunePeriod.Week),
    Month(R.string.fortune_period_this_month, FortunePeriod.Month),
}

@Composable
fun ZodiacPeriod.label(): String = stringResource(labelRes)

/** The sign plus the deterministic reading for the currently-selected period. */
data class ZodiacResult(val sign: ZodiacSign, val reading: FortuneReading)

@HiltViewModel
class ZodiacViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // Round-3 audit fix: restored from SavedStateHandle so a typed birth day/month survives
    // process death instead of resetting.
    var birthDay by mutableStateOf(savedStateHandle.get<String>(KEY_DAY).orEmpty())
        private set

    var birthMonth by mutableStateOf(savedStateHandle.get<String>(KEY_MONTH).orEmpty())
        private set

    var result by mutableStateOf<ZodiacResult?>(null)
        private set

    var period by mutableStateOf(ZodiacPeriod.Day)
        private set

    fun onBirthDayChange(value: String) {
        birthDay = value.filter { it.isDigit() }.take(2)
        savedStateHandle[KEY_DAY] = birthDay
    }

    fun onBirthMonthChange(value: String) {
        birthMonth = value.filter { it.isDigit() }.take(2)
        savedStateHandle[KEY_MONTH] = birthMonth
    }

    fun onSubmit() {
        val d = birthDay.toIntOrNull() ?: return
        val m = birthMonth.toIntOrNull() ?: return
        if (m !in 1..12) return
        // The web's equivalent form uses a native <input type="date">, which a browser structurally
        // never lets the user submit as an invalid calendar date (e.g. Feb 30) — there's no web
        // validation logic to mirror. Android's separate day/month text fields have no such platform
        // guard, so this checks the day against the actual month length. 2000 is a leap year, used
        // only as a reference for Feb's day count so Feb 29 stays valid — the zodiac sign itself
        // depends only on day+month, not year.
        val maxDay = java.time.YearMonth.of(2000, m).lengthOfMonth()
        if (d !in 1..maxDay) return
        val sign = getZodiacByDate(m, d)
        result = ZodiacResult(sign = sign, reading = readingFor(sign, period))
    }

    fun onPeriodChange(p: ZodiacPeriod) {
        period = p
        // Regenerate the reading for the new period from the already-resolved sign.
        result = result?.let { it.copy(reading = readingFor(it.sign, p)) }
    }

    private fun readingFor(sign: ZodiacSign, period: ZodiacPeriod): FortuneReading =
        generateFortune(sign.seedId, period.engine, ZODIAC_BANKS.getValue(sign.seedId))

    fun onReset() {
        result = null
        birthDay = ""
        birthMonth = ""
        period = ZodiacPeriod.Day
        savedStateHandle[KEY_DAY] = ""
        savedStateHandle[KEY_MONTH] = ""
    }

    private companion object {
        const val KEY_DAY = "zodiac_day"
        const val KEY_MONTH = "zodiac_month"
    }
}

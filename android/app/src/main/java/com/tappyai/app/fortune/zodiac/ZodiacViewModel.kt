package com.tappyai.app.fortune.zodiac

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import com.tappyai.app.R
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

enum class ZodiacPeriod(@StringRes val labelRes: Int) {
    Day(R.string.fortune_period_today),
    Week(R.string.fortune_period_this_week),
    Month(R.string.fortune_period_this_month),
}

@Composable
fun ZodiacPeriod.label(): String = stringResource(labelRes)

data class ZodiacResult(val sign: ZodiacSign, val readings: List<ZodiacReading>)

@HiltViewModel
class ZodiacViewModel @Inject constructor() : ViewModel() {

    var birthDay by mutableStateOf("")
        private set

    var birthMonth by mutableStateOf("")
        private set

    var result by mutableStateOf<ZodiacResult?>(null)
        private set

    var period by mutableStateOf(ZodiacPeriod.Day)
        private set

    fun onBirthDayChange(value: String) {
        birthDay = value.filter { it.isDigit() }.take(2)
    }

    fun onBirthMonthChange(value: String) {
        birthMonth = value.filter { it.isDigit() }.take(2)
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
        result = ZodiacResult(sign = sign, readings = getZodiacReadings(sign.id))
    }

    fun onPeriodChange(p: ZodiacPeriod) {
        period = p
    }

    fun onReset() {
        result = null
        birthDay = ""
        birthMonth = ""
        period = ZodiacPeriod.Day
    }
}

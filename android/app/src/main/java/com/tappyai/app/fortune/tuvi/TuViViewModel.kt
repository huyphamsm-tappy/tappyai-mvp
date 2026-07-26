package com.tappyai.app.fortune.tuvi

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

enum class TuViPeriod(@StringRes val labelRes: Int, val engine: FortunePeriod) {
    Day(R.string.fortune_period_today, FortunePeriod.Day),
    Week(R.string.fortune_period_this_week, FortunePeriod.Week),
    Month(R.string.fortune_period_this_month, FortunePeriod.Month),
}

@Composable
fun TuViPeriod.label(): String = stringResource(labelRes)

/** The can-chi (plus its Ngũ Hành) and the deterministic reading for the selected period. */
data class TuViResult(val canChi: CanChi, val nguHanh: String, val reading: FortuneReading)

@HiltViewModel
class TuViViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // Round-3 audit fix: restored from SavedStateHandle so a typed birth year survives process
    // death instead of resetting.
    var birthYear by mutableStateOf(savedStateHandle.get<String>(KEY_YEAR).orEmpty())
        private set

    var result by mutableStateOf<TuViResult?>(null)
        private set

    var period by mutableStateOf(TuViPeriod.Day)
        private set

    fun onBirthYearChange(value: String) {
        birthYear = value.filter { it.isDigit() }.take(4)
        savedStateHandle[KEY_YEAR] = birthYear
    }

    fun onSubmit() {
        val year = birthYear.toIntOrNull() ?: return
        if (year < 1900 || year > 2100) return
        val canChi = getCanChiByYear(year)
        result = TuViResult(
            canChi = canChi,
            nguHanh = getNguHanhByYear(year),
            reading = readingFor(canChi, period),
        )
    }

    fun onPeriodChange(p: TuViPeriod) {
        period = p
        result = result?.let { it.copy(reading = readingFor(it.canChi, p)) }
    }

    private fun readingFor(canChi: CanChi, period: TuViPeriod): FortuneReading =
        generateFortune(canChi.seedId, period.engine, CANCHI_BANKS.getValue(canChi.seedId))

    fun onReset() {
        result = null
        birthYear = ""
        period = TuViPeriod.Day
        savedStateHandle[KEY_YEAR] = ""
    }

    private companion object {
        const val KEY_YEAR = "tuvi_year"
    }
}

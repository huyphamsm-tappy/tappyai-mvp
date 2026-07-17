package com.tappyai.app.fortune.tuvi

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

enum class TuViPeriod(@StringRes val labelRes: Int) {
    Day(R.string.fortune_period_today),
    Week(R.string.fortune_period_this_week),
    Month(R.string.fortune_period_this_month),
}

@Composable
fun TuViPeriod.label(): String = stringResource(labelRes)

data class TuViResult(val canChi: CanChi, val readings: List<TuViReading>)

@HiltViewModel
class TuViViewModel @Inject constructor() : ViewModel() {

    var birthYear by mutableStateOf("")
        private set

    var result by mutableStateOf<TuViResult?>(null)
        private set

    var period by mutableStateOf(TuViPeriod.Day)
        private set

    fun onBirthYearChange(value: String) {
        birthYear = value.filter { it.isDigit() }.take(4)
    }

    fun onSubmit() {
        val year = birthYear.toIntOrNull() ?: return
        if (year < 1900 || year > 2100) return
        val canChi = getCanChiByYear(year)
        result = TuViResult(canChi = canChi, readings = getTuViReadings(canChi.id))
    }

    fun onPeriodChange(p: TuViPeriod) {
        period = p
    }

    fun onReset() {
        result = null
        birthYear = ""
        period = TuViPeriod.Day
    }
}

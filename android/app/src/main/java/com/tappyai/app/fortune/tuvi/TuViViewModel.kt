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
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.ZoneOffset
import javax.inject.Inject

/**
 * Tu-vi view modes — the day/week/month period readings plus the two richer tabs (web parity,
 * `TuViForm.tsx:21` `ViewMode = FortunePeriod | 'lifetime' | 'year'`). [period] is non-null only for
 * the three period modes.
 */
enum class TuViMode(@StringRes val labelRes: Int, val period: FortunePeriod?) {
    Day(R.string.fortune_period_today, FortunePeriod.Day),
    Week(R.string.fortune_period_this_week, FortunePeriod.Week),
    Month(R.string.fortune_period_this_month, FortunePeriod.Month),
    Lifetime(R.string.fortune_tuvi_mode_lifetime, null),
    Year(R.string.fortune_tuvi_mode_year, null),
}

@Composable
fun TuViMode.label(): String = stringResource(labelRes)

/** The resolved can-chi + its Ngũ Hành + the parsed birth date the engine seeds the tabs with. */
data class TuViResult(
    val canChi: CanChi,
    val nguHanh: String,
    val birthYear: Int,
    val birthMonth: Int,
    val birthDay: Int,
)

@HiltViewModel
class TuViViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    var birthDay by mutableStateOf(savedStateHandle.get<String>(KEY_DAY).orEmpty())
        private set
    var birthMonth by mutableStateOf(savedStateHandle.get<String>(KEY_MONTH).orEmpty())
        private set
    var birthYear by mutableStateOf(savedStateHandle.get<String>(KEY_YEAR).orEmpty())
        private set

    var result by mutableStateOf<TuViResult?>(null)
        private set

    var mode by mutableStateOf(TuViMode.Day)
        private set

    /** Current Vietnam calendar year — the By-Year picker's default + centre. */
    val vnYear: Int = LocalDate.now(ZoneOffset.ofHours(7)).year

    var selectedYear by mutableStateOf(vnYear)
        private set

    /** 11 options centred on the current VN year (web `YEAR_OPTIONS`, `TuViForm.tsx:30`). */
    val yearOptions: List<Int> = (vnYear - 5..vnYear + 5).toList()

    val canSubmit: Boolean
        get() = birthDay.toIntOrNull() != null && birthMonth.toIntOrNull() != null && birthYear.length == 4

    fun onBirthDayChange(value: String) {
        birthDay = value.filter { it.isDigit() }.take(2)
        savedStateHandle[KEY_DAY] = birthDay
    }

    fun onBirthMonthChange(value: String) {
        birthMonth = value.filter { it.isDigit() }.take(2)
        savedStateHandle[KEY_MONTH] = birthMonth
    }

    fun onBirthYearChange(value: String) {
        birthYear = value.filter { it.isDigit() }.take(4)
        savedStateHandle[KEY_YEAR] = birthYear
    }

    fun onSubmit() {
        val d = birthDay.toIntOrNull() ?: return
        val m = birthMonth.toIntOrNull() ?: return
        val y = birthYear.toIntOrNull() ?: return
        if (m !in 1..12 || y < 1900 || y > 2100) return
        val maxDay = java.time.YearMonth.of(y.coerceIn(1900, 2100), m).lengthOfMonth()
        if (d !in 1..maxDay) return
        result = TuViResult(
            canChi = getCanChiByYear(y),
            nguHanh = getNguHanhByYear(y),
            birthYear = y,
            birthMonth = m,
            birthDay = d,
        )
        selectedYear = vnYear
    }

    fun onModeChange(m: TuViMode) {
        mode = m
    }

    fun onSelectedYearChange(year: Int) {
        selectedYear = year
    }

    fun onReset() {
        result = null
        birthDay = ""
        birthMonth = ""
        birthYear = ""
        mode = TuViMode.Day
        selectedYear = vnYear
        savedStateHandle[KEY_DAY] = ""
        savedStateHandle[KEY_MONTH] = ""
        savedStateHandle[KEY_YEAR] = ""
    }

    private companion object {
        const val KEY_DAY = "tuvi_day"
        const val KEY_MONTH = "tuvi_month"
        const val KEY_YEAR = "tuvi_year"
    }
}

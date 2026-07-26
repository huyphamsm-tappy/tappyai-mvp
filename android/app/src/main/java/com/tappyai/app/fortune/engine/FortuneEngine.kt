package com.tappyai.app.fortune.engine

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.WeekFields
import kotlin.math.abs

/**
 * Deterministic, fully-local fortune engine — a Kotlin port of the web `src/lib/boi/fortuneEngine.ts`
 * (prod worktree cool-vaughan-b3c7ff). No LLM, no network: a djb2 hash of `(subject + time bucket)`
 * picks a line from static string banks, so the same subject on the same day/week/month always yields
 * the same reading, but a new period yields a new one. Byte-identical to the web given the same banks
 * and seed ids.
 *
 * Two parity traps this port handles (see the web-vs-Kotlin notes on [hashString]):
 *  1. `| 0` 32-bit signed wrap — Kotlin `Int` arithmetic already wraps at 32 bits.
 *  2. `Math.abs` on `Int.MIN_VALUE` stays negative in Kotlin — widen to `Long` before abs.
 */

enum class FortunePeriod { Day, Week, Month }

data class FortuneBanks(
    val love: List<String>,
    val career: List<String>,
    val money: List<String>,
    val health: List<String>,
    val luckyNumbers: List<Int>,
    val luckyColors: List<String>,
)

data class FortuneReading(
    val periodLabel: String,
    val love: String,
    val career: String,
    val money: String,
    val health: String,
    val score: Int,        // 1-5 stars
    val luckyNumber: Int,
    val luckyColor: String,
)

data class PeriodKey(val key: String, val label: String)

/**
 * djb2 hash → non-negative Long. Web (`fortuneEngine.ts:62-69`):
 * `h = 5381; h = (h*33 + charCode) | 0; return Math.abs(h)`.
 * - Accumulate in `Int`: Kotlin Int arithmetic wraps at 32 bits exactly like JS `| 0`.
 * - Widen to `Long` before `abs` so `Int.MIN_VALUE` maps to `2147483648` (matching JS's double
 *   `Math.abs`), instead of `abs(Int.MIN_VALUE)` staying negative.
 * All seed inputs are pure ASCII, so `Char.code` == JS `charCodeAt`.
 */
internal fun hashString(s: String): Long {
    var h = 5381
    for (c in s) h = h * 33 + c.code
    return abs(h.toLong())
}

internal fun <T> pick(seed: String, salt: String, arr: List<T>): T {
    require(arr.isNotEmpty()) { "pick() needs a non-empty array" }
    val h = hashString("$seed|$salt")
    return arr[(h % arr.size).toInt()]
}

internal fun pickIndexInRange(seed: String, salt: String, min: Int, max: Int): Int {
    val h = hashString("$seed|$salt")
    return min + (h % (max - min + 1)).toInt()
}

private fun pad2(n: Int): String = n.toString().padStart(2, '0')

/**
 * The time-bucket key + VN label for a period, using Vietnam (UTC+7) civil date. Web parity trap
 * (`fortuneEngine.ts:44-60`): the week key is `"{calendarYear}-W{isoWeek}"` — the ISO-8601 week
 * NUMBER but the plain calendar year prefix (NOT the ISO week-based year). [vnDate] is injectable so
 * the key derivation is testable; production passes the real VN date.
 */
fun getPeriodKey(period: FortunePeriod, vnDate: LocalDate = LocalDate.now(ZoneOffset.ofHours(7))): PeriodKey {
    val y = vnDate.year
    return when (period) {
        FortunePeriod.Day -> PeriodKey("$y-${pad2(vnDate.monthValue)}-${pad2(vnDate.dayOfMonth)}", "Hôm nay")
        FortunePeriod.Week -> {
            val w = vnDate.get(WeekFields.ISO.weekOfWeekBasedYear())
            PeriodKey("$y-W${pad2(w)}", "Tuần này")
        }
        FortunePeriod.Month -> PeriodKey("$y-${pad2(vnDate.monthValue)}", "Tháng này")
    }
}

/**
 * Deterministic reading for one subject (sign / can-chi) in one period. Same subjectId + same period
 * bucket → same result. Mirrors `generateFortune` (`fortuneEngine.ts:86-100`). [vnDate] injectable for
 * tests. NOTE: [subjectId] must be the web string id (e.g. `aries`, `ty2`) for cross-platform parity.
 */
fun generateFortune(
    subjectId: String,
    period: FortunePeriod,
    banks: FortuneBanks,
    vnDate: LocalDate = LocalDate.now(ZoneOffset.ofHours(7)),
): FortuneReading {
    val (key, label) = getPeriodKey(period, vnDate)
    val seed = "$subjectId|$key"
    return FortuneReading(
        periodLabel = label,
        love = pick(seed, "love", banks.love),
        career = pick(seed, "career", banks.career),
        money = pick(seed, "money", banks.money),
        health = pick(seed, "health", banks.health),
        score = pickIndexInRange(seed, "score", 3, 5),
        luckyNumber = pick(seed, "number", banks.luckyNumbers),
        luckyColor = pick(seed, "color", banks.luckyColors),
    )
}

package com.tappyai.app.fortune.engine

/**
 * Tu-vi "By-Year" + "Lifetime" generation — a Kotlin port of the year/monthly/life-stage half of
 * `src/lib/boi/fortuneEngine.ts` (prod worktree cool-vaughan-b3c7ff). Same deterministic djb2
 * engine ([hashString]/[pick]) as period readings, so outputs are byte-identical to web. The data
 * banks (YEAR_*, MONTH_BANKS, STAGE_*) live in `FortuneData.kt`; lifetime overviews in
 * `tuvi/LifetimeData.kt`. All models used by those data files are declared here.
 */

// ── Models referenced by FortuneData.kt / LifetimeData.kt ──
data class YearCompat(val label: String, val note: String)
data class StageDef(val key: String, val label: String, val ageRange: String, val emoji: String)
data class MonthBanks(
    val love: List<String>,
    val career: List<String>,
    val money: List<String>,
    val health: List<String>,
    val note: List<String>,
)
data class StageBank(val fate: List<String>, val career: List<String>, val love: List<String>)
data class LifetimeReading(
    val overview: String,
    val career: String,
    val love: String,
    val health: String,
    val advice: String,
)

// ── Result models ──
data class YearFortuneReading(
    val periodLabel: String,
    val yearAnimal: String,
    val compatLabel: String,
    val compatNote: String,
    val love: String,
    val career: String,
    val money: String,
    val health: String,
    val score: Int,
    val luckyNumber: Int,
    val luckyColor: String,
)

data class MonthlyFortune(
    val month: Int,
    val monthName: String,
    val love: String,
    val career: String,
    val money: String,
    val health: String,
    val note: String,
    val score: Int,
)

data class LifeStage(
    val label: String,
    val ageRange: String,
    val emoji: String,
    val fate: String,
    val career: String,
    val love: String,
)

internal val VN_MONTHS: List<String> = listOf(
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
    "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
    "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
)

/** Year fortune + can-chi (branch-offset) compatibility. Web `generateYearFortune`. */
fun generateYearFortune(subjectId: String, birthYear: Int, targetYear: Int): YearFortuneReading {
    val seed = "$subjectId|year-$targetYear"
    val subjectIdx = ((birthYear - 4) % 12 + 12) % 12
    val yearIdx = ((targetYear - 4) % 12 + 12) % 12
    val diff = (yearIdx - subjectIdx + 12) % 12
    val compat = YEAR_COMPAT[diff]
    return YearFortuneReading(
        periodLabel = "Năm $targetYear (${YEAR_ANIMALS[yearIdx]})",
        yearAnimal = YEAR_ANIMALS[yearIdx],
        compatLabel = compat.label,
        compatNote = compat.note,
        love = pick(seed, "love", YEAR_BANKS.love),
        career = pick(seed, "career", YEAR_BANKS.career),
        money = pick(seed, "money", YEAR_BANKS.money),
        health = pick(seed, "health", YEAR_BANKS.health),
        score = pickIndexInRange(seed, "score", 3, 5),
        luckyNumber = pick(seed, "number", YEAR_BANKS.luckyNumbers),
        luckyColor = pick(seed, "color", YEAR_BANKS.luckyColors),
    )
}

/** 12-month breakdown for a target year. Web `generateMonthlyBreakdown`. */
fun generateMonthlyBreakdown(
    subjectId: String,
    birthYear: Int,
    birthMonth: Int,
    birthDay: Int,
    targetYear: Int,
): List<MonthlyFortune> = (0 until 12).map { i ->
    val month = i + 1
    val seed = "$subjectId|by$birthYear|bm$birthMonth|bd$birthDay|y$targetYear|m$month"
    MonthlyFortune(
        month = month,
        monthName = VN_MONTHS[i],
        love = pick(seed, "love", MONTH_BANKS.love),
        career = pick(seed, "career", MONTH_BANKS.career),
        money = pick(seed, "money", MONTH_BANKS.money),
        health = pick(seed, "health", MONTH_BANKS.health),
        note = pick(seed, "note", MONTH_BANKS.note),
        score = pickIndexInRange(seed, "score", 2, 5),
    )
}

/** Four deterministic life stages. Web `generateLifeStages`. */
fun generateLifeStages(subjectId: String, birthMonth: Int, birthDay: Int): List<LifeStage> =
    STAGE_DEFS.map { def ->
        val banks = STAGE_BANKS.getValue(def.key)
        val seed = "$subjectId|bm$birthMonth|bd$birthDay|stage-${def.key}"
        LifeStage(
            label = def.label,
            ageRange = def.ageRange,
            emoji = def.emoji,
            fate = pick(seed, "fate", banks.fate),
            career = pick(seed, "career", banks.career),
            love = pick(seed, "love", banks.love),
        )
    }

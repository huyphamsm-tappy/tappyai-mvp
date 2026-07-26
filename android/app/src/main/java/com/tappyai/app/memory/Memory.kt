package com.tappyai.app.memory

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * What Tappy has learned about the user — mirrors the web `Memory` type on `/profile/tappy-knows`.
 * Every field is optional/possibly-empty; the screen renders a card only when its field has data.
 */
data class Memory(
    val locationBase: String?,
    val companions: String?,
    val timing: String?,
    val personality: String?,
    val preferences: MemoryPreferences,
    val budget: List<BudgetItem>,
    val history: List<String>,
    /** ISO-8601 last-updated timestamp from the backend, shown in the fact-count banner subtitle.
     *  Null when the row has never been written (web falls back to the "updates automatically" copy). */
    val updatedAt: String? = null,
)

data class MemoryPreferences(
    val food: List<String> = emptyList(),
    val spa: List<String> = emptyList(),
    val entertainment: List<String> = emptyList(),
    val shopping: List<String> = emptyList(),
    val avoid: List<String> = emptyList(),
)

data class BudgetItem(val category: String, val min: Int, val max: Int)

/** Response-style personalization (web `tappy_response_style`) — user preference, not memory data.
 *  [wireValue] is the exact token the web's localStorage/`/api/chat` `responseStyle` field uses
 *  (`src/app/profile/tappy-knows/page.tsx`'s `update()`, `src/app/api/chat/route.ts`'s `rs.tone`). */
enum class ResponseTone(@StringRes val labelRes: Int, val wireValue: String) {
    Friendly(R.string.memory_tone_friendly, "friendly"),
    Neutral(R.string.memory_tone_neutral, "neutral"),
    Formal(R.string.memory_tone_formal, "formal"),
}

enum class ResponseLength(@StringRes val labelRes: Int, val wireValue: String) {
    Short(R.string.memory_length_short, "short"),
    Detailed(R.string.memory_length_detailed, "detailed"),
}

/** [PreferencesDataSource][com.tappyai.core.datastore.PreferencesDataSource] keys shared between
 *  [MemoryViewModel] (writer) and `ChatViewModel` (reader) for the persisted response style. */
const val RESPONSE_STYLE_TONE_KEY = "response_style_tone"
const val RESPONSE_STYLE_LENGTH_KEY = "response_style_length"

@Composable
fun ResponseTone.label(): String = stringResource(labelRes)

@Composable
fun ResponseLength.label(): String = stringResource(labelRes)

/** Total remembered facts — mirrors the web `countFacts` (capped per group). */
fun Memory.factCount(): Int {
    var n = 0
    if (!locationBase.isNullOrBlank()) n++
    if (!companions.isNullOrBlank()) n++
    if (!timing.isNullOrBlank()) n++
    if (!personality.isNullOrBlank()) n++
    listOf(preferences.food, preferences.spa, preferences.entertainment, preferences.shopping, preferences.avoid)
        .forEach { if (it.isNotEmpty()) n += minOf(it.size, 3) }
    n += budget.size
    n += minOf(history.size, 5)
    return n
}

/** The banner's last-updated date, mirroring web `new Date(updated_at).toLocaleDateString('vi-VN')`
 *  → `dd/MM/yyyy`. Returns null on an unparseable/absent timestamp so the caller shows the
 *  "updates automatically" fallback (web parity). Defensive: never throws. */
fun formatMemoryUpdated(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return runCatching {
        java.time.OffsetDateTime.parse(iso).toLocalDate()
            .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }.getOrNull()
}

/** `200k–500k` / `under 500k`, mirroring the web `fmtVND` + `BudgetLabel` (kept as VND — it's data). */
fun formatBudget(item: BudgetItem): String {
    fun amount(n: Int): String {
        if (n >= 1_000_000) {
            val millions = n / 1_000_000.0
            return if (n % 1_000_000 == 0) "${millions.toInt()}M" else "%.1fM".format(millions)
        }
        return "${n / 1000}k"
    }
    return if (item.min > 0) "${amount(item.min)}–${amount(item.max)}" else "under ${amount(item.max)}"
}

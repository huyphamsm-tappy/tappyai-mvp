package com.tappyai.app.scamshield.data

import android.content.Context
import com.tappyai.app.scamshield.RiskLevel
import com.tappyai.app.scamshield.ScamCheckHistoryEntry
import com.tappyai.app.scamshield.ScamCheckResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * "Recent checks, on this device" — the Android form of the web's `lib/scam-shield/history.ts`
 * (`localStorage` key `tappy_scam_history`), 2026-09-17.
 *
 * 🚨 THIS IS NOT A SECURITY RECORD, AND NOTHING MAY EVER TREAT IT AS ONE. The authoritative answer
 * about a URL is the one `/api/scam-shield/check` returns, every time it is asked. This is a
 * convenience list so a visitor can see what they already checked without retyping it:
 *  - written only AFTER a real verdict ([record] takes a whole [ScamCheckResult] — the only way
 *    to have one is to have called the engine);
 *  - the three fields the list renders and nothing else — not the score, the evidence, the
 *    actions or the official match;
 *  - per device, never synced, and the UI says so;
 *  - re-checking a URL moves it to the top rather than adding a duplicate; old rows fall off
 *    past [LIMIT];
 *  - every stored row is re-validated on the way out, and a corrupt store reads as empty rather
 *    than throwing inside a safety tool.
 */
@Singleton
class ScamCheckHistoryStore @Inject constructor(@ApplicationContext context: Context, private val json: Json) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Serializable
    private data class Row(val url: String = "", val level: String = "", val checkedAt: Long = 0L)

    /** Most recent first; `[]` for missing, corrupt or foreign data. */
    fun read(): List<ScamCheckHistoryEntry> {
        val raw = runCatching { prefs.getString(KEY, null) }.getOrNull() ?: return emptyList()
        val rows = runCatching { json.decodeFromString<List<Row>>(raw) }.getOrNull() ?: return emptyList()
        return rows.mapNotNull { it.toEntry() }.sortedByDescending { it.checkedAt }.take(LIMIT)
    }

    /** Records one REAL result and returns the new list — also when the write fails. */
    fun record(result: ScamCheckResult, checkedAt: Long = System.currentTimeMillis()): List<ScamCheckHistoryEntry> {
        if (result.url.isBlank() || result.url.length > MAX_URL || result.level == RiskLevel.UNKNOWN) return read()
        val entry = ScamCheckHistoryEntry(url = result.url, level = result.level, checkedAt = checkedAt)
        val next = (listOf(entry) + read().filter { it.url != entry.url }).take(LIMIT)
        runCatching { prefs.edit().putString(KEY, json.encodeToString<List<Row>>(next.map { Row(it.url, it.level.name, it.checkedAt) })).apply() }
        return next
    }

    /** Forget everything on this device. */
    fun clear() {
        runCatching { prefs.edit().remove(KEY).apply() }
    }

    private fun Row.toEntry(): ScamCheckHistoryEntry? {
        if (url.isEmpty() || url.length > MAX_URL || checkedAt <= 0L) return null
        val parsed = RiskLevel.fromWire(level)
        if (parsed == RiskLevel.UNKNOWN) return null
        return ScamCheckHistoryEntry(url = url, level = parsed, checkedAt = checkedAt)
    }

    companion object {
        /** Namespaced like every other key this app owns. */
        const val PREFS = "tappy_scam_history"
        const val KEY = "entries"
        /** Recent, not permanent — the web's `HISTORY_LIMIT`. */
        const val LIMIT = 15
        private const val MAX_URL = 2048
    }
}

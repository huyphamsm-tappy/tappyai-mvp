package com.tappyai.app.chat.data

import com.tappyai.core.datastore.PreferencesDataSource
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The guest's 18+ self-declaration, stored on THIS device (owner decision D1 revised, 2026-09-17).
 *
 * Mirror of the web's `tappy_guest_age` cookie (`src/lib/account/guestAgeDeclaration.ts`): the
 * server reads the `x-tappy-age-declared` header FIRST, then the cookie, and evaluates the value
 * itself — `YYYY-MM-DD`, `YYYY` or `18plus`. An under-18 answer is persisted too, so the refusal
 * sticks on this device exactly as the cookie makes it stick in a browser.
 *
 * Only a GUEST sends the header. A signed-in account is gated by main #251 (`getAgeEligibility`)
 * and the server ignores the header for it; keeping it guest-only keeps the logs honest.
 */
@Singleton
class GuestAgeStore @Inject constructor(private val preferences: PreferencesDataSource) {
    suspend fun declared(): String? = preferences.getString(KEY)?.first()?.takeIf { it.isNotBlank() }

    suspend fun declare(value: String) = preferences.setString(KEY, value)

    /** The device's verdict, so an under-18 answer short-circuits locally without a request. */
    suspend fun status(today: LocalDate = LocalDate.now()): Status = statusOf(declared(), today)

    enum class Status { Unknown, Eligible, Ineligible }

    companion object {
        const val KEY = "guest_age_declaration"
        const val HEADER = "x-tappy-age-declared"
        const val ADULT = "18plus"

        /** Same evaluation the server runs (`evaluateGuestAge`): 18 on the day counts. */
        fun statusOf(raw: String?, today: LocalDate = LocalDate.now()): Status {
            val v = raw?.trim().orEmpty()
            if (v.isEmpty()) return Status.Unknown
            if (v == ADULT) return Status.Eligible
            if (Regex("^\\d{4}$").matches(v)) {
                // A bare year: `currentYear - year >= 18`, the server's own rule (`evaluateGuestAge`).
                val age = today.year - v.toInt()
                if (age < 0 || age > 120) return Status.Unknown
                return if (age >= 18) Status.Eligible else Status.Ineligible
            }
            val dob = runCatching { LocalDate.parse(v) }.getOrNull() ?: return Status.Unknown
            val age = java.time.Period.between(dob, today).years
            if (age < 0 || age > 120) return Status.Unknown
            return if (age >= 18) Status.Eligible else Status.Ineligible
        }

        /** What the birth-year picker stores. Bounded so a typo never becomes "18plus". */
        fun valueForBirthYear(year: Int, today: LocalDate = LocalDate.now()): String? =
            if (year in 1900..today.year) year.toString() else null
    }
}

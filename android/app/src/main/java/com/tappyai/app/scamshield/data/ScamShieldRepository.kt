package com.tappyai.app.scamshield.data

import com.tappyai.app.scamshield.ScamCheckFailure
import com.tappyai.app.scamshield.ScamCheckResult

/**
 * The one way the app asks whether a URL is a scam.
 *
 * Returns a sealed outcome rather than a nullable result so a caller cannot accidentally treat a
 * failed check as an absence of risk — see [ScamCheckOutcome].
 */
interface ScamShieldRepository {
    suspend fun check(url: String, preferVietnameseLabels: Boolean): ScamCheckOutcome
}

sealed interface ScamCheckOutcome {
    data class Verdict(val result: ScamCheckResult) : ScamCheckOutcome
    data class Failed(val failure: ScamCheckFailure) : ScamCheckOutcome
}

package com.tappyai.app.scamshield.data

import com.tappyai.app.scamshield.ScamCheckFailure
import com.tappyai.app.scamshield.MessageAnalysis
import com.tappyai.app.scamshield.ScamCheckResult

/**
 * The one way the app asks whether a URL is a scam.
 *
 * Returns a sealed outcome rather than a nullable result so a caller cannot accidentally treat a
 * failed check as an absence of risk — see [ScamCheckOutcome].
 */
interface ScamShieldRepository {
    suspend fun check(url: String, preferVietnameseLabels: Boolean): ScamCheckOutcome

    /** The QR path: the image's bytes go to `/api/scam-shield/qr`; the verdict is the same shape. */
    suspend fun checkQrImage(bytes: ByteArray, mimeType: String, preferVietnameseLabels: Boolean): ScamCheckOutcome

    /** Analyze Message: text and/or link and/or a screenshot to `/api/scam-shield/analyze`. */
    suspend fun analyzeMessage(text: String?, url: String?, image: ByteArray?, mimeType: String?, preferVietnameseLabels: Boolean): MessageAnalysisOutcome
}

/** A message verdict, or the reason there is none — never a safe answer by default. */
sealed interface MessageAnalysisOutcome {
    data class Verdict(val result: MessageAnalysis) : MessageAnalysisOutcome
    data class Failed(val failure: ScamCheckFailure) : MessageAnalysisOutcome
}

sealed interface ScamCheckOutcome {
    data class Verdict(val result: ScamCheckResult) : ScamCheckOutcome
    data class Failed(val failure: ScamCheckFailure) : ScamCheckOutcome
}

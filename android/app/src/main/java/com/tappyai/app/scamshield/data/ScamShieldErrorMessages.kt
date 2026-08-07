package com.tappyai.app.scamshield.data

import androidx.annotation.StringRes
import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import javax.inject.Inject

/**
 * Turns a Scam Shield failure into user-facing copy, reproducing the web's mapping exactly.
 *
 * The web keeps a single `ERROR_I18N` table keyed by the server's `error` code
 * (`src/app/scam-shield/ScamShieldView.tsx`), then falls back to a *mode-specific* string when the
 * code is absent or unknown:
 *
 *   URL check — unknown code -> `scamShield.error.checkFailed`, thrown fetch -> `…invalidUrl`
 *   QR  check — unknown code -> `scamShield.error.qrFailed`,   thrown fetch -> `…qrDecode`
 *
 * Those four fallbacks are not interchangeable, which is why [Mode] exists.
 */
class ScamShieldErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {

    /** Which endpoint failed — selects the fallback copy, exactly as the web does. */
    enum class Mode { URL, QR }

    fun toUserMessage(outcome: ScamShieldOutcome, mode: Mode): String = when (outcome) {
        is ScamShieldOutcome.Success -> stringProvider.get(unknownCodeFallback(mode))
        is ScamShieldOutcome.TransportError -> stringProvider.get(transportFallback(mode))
        is ScamShieldOutcome.ServerError ->
            stringProvider.get(ERROR_I18N[outcome.code] ?: unknownCodeFallback(mode))
    }

    @StringRes
    private fun unknownCodeFallback(mode: Mode): Int = when (mode) {
        Mode.URL -> R.string.scam_shield_error_check_failed
        Mode.QR -> R.string.scam_shield_error_qr_failed
    }

    @StringRes
    private fun transportFallback(mode: Mode): Int = when (mode) {
        Mode.URL -> R.string.scam_shield_error_invalid_url
        Mode.QR -> R.string.scam_shield_error_qr_decode
    }

    private companion object {
        /**
         * A literal port of the web's `ERROR_I18N`. Same ten codes, same targets, same order.
         * `invalid_body` is absent there too — it falls through to the mode fallback.
         */
        val ERROR_I18N: Map<String, Int> = mapOf(
            "rate_limit" to R.string.scam_shield_error_rate_limit,
            "daily_limit" to R.string.scam_shield_error_daily_limit,
            "invalid_input" to R.string.scam_shield_error_invalid_url,
            "private_url" to R.string.scam_shield_error_private_url,
            "check_failed" to R.string.scam_shield_error_check_failed,
            "qr_decode_failed" to R.string.scam_shield_error_qr_decode,
            "qr_no_url" to R.string.scam_shield_error_qr_no_url,
            "no_image" to R.string.scam_shield_error_qr_failed,
            "too_large" to R.string.scam_shield_error_qr_failed,
            "invalid_content_type" to R.string.scam_shield_error_qr_failed,
        )
    }
}

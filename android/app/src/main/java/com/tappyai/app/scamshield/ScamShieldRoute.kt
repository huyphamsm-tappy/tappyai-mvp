package com.tappyai.app.scamshield

import kotlinx.serialization.Serializable

/** Route for Scam Shield within the Home tab's nested NavHost — same pattern as
 *  [com.tappyai.app.currency.CurrencyRoute]/[com.tappyai.app.scan.ScanRoute]. */
sealed interface ScamShieldRoute {
    @Serializable
    data object Main : ScamShieldRoute
}

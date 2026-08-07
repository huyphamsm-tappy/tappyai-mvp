package com.tappyai.app.scamshield

import kotlinx.serialization.Serializable

/** Route for Scam Shield within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.scan.ScanRoute]/[com.tappyai.app.translate.TranslateRoute]. */
sealed interface ScamShieldRoute {
    @Serializable
    data object Main : ScamShieldRoute
}

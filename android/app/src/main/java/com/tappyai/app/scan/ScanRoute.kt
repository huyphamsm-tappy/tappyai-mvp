package com.tappyai.app.scan

import kotlinx.serialization.Serializable

/** Route for Scan within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.translate.TranslateRoute]/[com.tappyai.app.fortune.FortuneRoute]. */
sealed interface ScanRoute {
    @Serializable
    data object Main : ScanRoute
}

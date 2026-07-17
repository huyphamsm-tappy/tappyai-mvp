package com.tappyai.app.currency

import kotlinx.serialization.Serializable

/** Route for Currency within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.translate.TranslateRoute]/[com.tappyai.app.fortune.FortuneRoute]. */
sealed interface CurrencyRoute {
    @Serializable
    data object Main : CurrencyRoute
}

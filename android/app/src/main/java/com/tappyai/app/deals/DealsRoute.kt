package com.tappyai.app.deals

import kotlinx.serialization.Serializable

/** Route for Deals within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.currency.CurrencyRoute]/[com.tappyai.app.translate.TranslateRoute]. */
sealed interface DealsRoute {
    @Serializable
    data object Main : DealsRoute
}

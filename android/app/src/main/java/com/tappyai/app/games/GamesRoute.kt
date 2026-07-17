package com.tappyai.app.games

import kotlinx.serialization.Serializable

/** Route for Games within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.currency.CurrencyRoute]/[com.tappyai.app.deals.DealsRoute]. */
sealed interface GamesRoute {
    @Serializable
    data object Main : GamesRoute
}

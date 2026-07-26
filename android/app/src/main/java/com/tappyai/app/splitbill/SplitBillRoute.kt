package com.tappyai.app.splitbill

import kotlinx.serialization.Serializable

/** Route for the Split Bill calculator, hosted in the Home tab's nested NavHost (a Home
 *  quick-action, mirroring the web's `/split-bill` Home entry). */
sealed interface SplitBillRoute {
    @Serializable
    data object Main : SplitBillRoute
}

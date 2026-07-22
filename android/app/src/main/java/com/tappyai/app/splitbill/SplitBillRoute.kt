package com.tappyai.app.splitbill

import kotlinx.serialization.Serializable

/** Route for the Split Bill tool (web `/split-bill`), hosted in the Home tab's nested NavHost. */
sealed interface SplitBillRoute {
    @Serializable
    data object Main : SplitBillRoute
}

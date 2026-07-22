package com.tappyai.app.vietwriter

import kotlinx.serialization.Serializable

/** Route for VietWriter within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.translate.TranslateRoute]/[com.tappyai.app.scan.ScanRoute]. */
sealed interface VietWriterRoute {
    @Serializable
    data object Main : VietWriterRoute
}

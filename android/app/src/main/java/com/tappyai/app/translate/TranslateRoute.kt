package com.tappyai.app.translate

import kotlinx.serialization.Serializable

/** Route for Translate within the Home tab's own nested NavHost — same pattern as
 *  [com.tappyai.app.fortune.FortuneRoute]/[com.tappyai.app.music.MusicRoute]. */
sealed interface TranslateRoute {
    @Serializable
    data object Main : TranslateRoute
}

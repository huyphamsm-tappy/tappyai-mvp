package com.tappyai.app.music

import kotlinx.serialization.Serializable

/**
 * Routes for the Music flow, hosted inside the Home tab's nested NavHost (Home landing → Library →
 * Sound detail). Like `ProfileRoute`/`DiscoveryRoute`, an internal navigation space — never
 * emitted through the app-level navigator, and the 5-tab shell is untouched.
 */
sealed interface MusicRoute {
    @Serializable
    data object Library : MusicRoute

    @Serializable
    data class SoundDetail(val trackId: String) : MusicRoute

    /** The music copyright policy (`/copyright` on the web). Reached from Sound Detail's report
     *  sheet, which is exactly where the web links it from — not from the library. Lives in this
     *  route space rather than Profile's because Music is the only flow that reaches it. */
    @Serializable
    data object CopyrightPolicy : MusicRoute
}

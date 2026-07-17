package com.tappyai.app.home

import kotlinx.serialization.Serializable

/**
 * Route(s) for the Home tab's own nested NavHost. The landing (launchpad) is the start; the Music
 * flow ([com.tappyai.app.music.MusicRoute]) drills in from here. Like `ProfileRoute`/
 * `DiscoveryRoute`, internal to the tab — the 5-tab shell (`HomeRoute`) is untouched.
 */
sealed interface HomeTabRoute {
    @Serializable
    data object Landing : HomeTabRoute
}

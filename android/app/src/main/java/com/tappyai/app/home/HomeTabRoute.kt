package com.tappyai.app.home

import kotlinx.serialization.Serializable

/**
 * Route(s) for the Home tab's own nested NavHost. The landing (launchpad) is the start; the Music
 * flow ([com.tappyai.app.music.MusicRoute]) drills in from here. Like `ProfileRoute`, internal to
 * the tab — the 5-tab shell (`HomeRoute`) is untouched.
 */
sealed interface HomeTabRoute {
    @Serializable
    data object Landing : HomeTabRoute

    /** Tappy Together group-dining creation form (web parity: Home → `/group/new`). The screen is
     *  shared with the Profile tab's own entry; creating a group navigates on to the full-screen
     *  group detail via the app-level navigator (AppRoute.GroupDetail), independent of this host. */
    @Serializable
    data object GroupDining : HomeTabRoute
}

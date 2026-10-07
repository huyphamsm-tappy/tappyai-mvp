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

    /** Tappy Together create flow (web `/group/new`), reached from the Home launchpad — mirrors how
     *  `ProfileRoute.GroupDining` hosts the same `GroupDiningScreen`. Creating a group hands off to
     *  the top-level `AppRoute.GroupDetail` via the cross-cutting navigator. */
    @Serializable
    data object GroupDining : HomeTabRoute

    /** The Smart Tools catalogue (web `/tools`) — every tool, grouped as the web groups them,
     *  reached from Home's Smart Tools section ("Xem tất cả"). Each card opens the destination
     *  this host already routes to; the page adds no tool of its own. */
    @Serializable
    data object SmartTools : HomeTabRoute
}

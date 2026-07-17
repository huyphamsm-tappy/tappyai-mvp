package com.tappyai.app.discovery

import kotlinx.serialization.Serializable

/**
 * Routes for the Discovery tab's own nested NavHost (Hub → Category), private to the Explore
 * tab. Not `TappyRoute`s — like the shell's `HomeRoute`, these are an internal navigation space,
 * never emitted through the app-level navigator.
 */
sealed interface DiscoveryRoute {
    @Serializable
    data object Hub : DiscoveryRoute

    /** [groupId] is [DiscoveryGroup.id] — the screen resolves the group from it. */
    @Serializable
    data class Category(val groupId: String) : DiscoveryRoute
}

package com.tappyai.app.navigation

import com.tappyai.core.navigation.TappyRoute
import kotlinx.serialization.Serializable

/**
 * Composition-root-only routes — things that aren't any single feature's concern:
 *  - [HomeShell]: the post-auth application shell (Phase 1C.1), which itself hosts the five
 *    top-level tabs via its own nested NavHost. It lives in `:app` rather than a `features:home`
 *    module because the shell is a composition-root concern (it composes feature screens into
 *    tabs) and no real Home feature exists yet — see the Phase 1C.1 decision.
 *  - [DesignSystemShowcase]: the Phase 0 dev/reference screen. No longer the post-auth landing
 *    (that's now [HomeShell]); kept registered as a developer aid, reached programmatically.
 *  - [GroupDetail]: a full-screen group page (`/group/[id]` on the web) pushed *over* the shell.
 *    It lives at the app level rather than inside the Profile tab's nested nav because it is
 *    reached two ways — in-app after creating a group (Profile → Group dining → create) and via
 *    a shared-link deep link (`tappyai://group/{id}`) that arrives at `MainActivity` — and both
 *    routes must resolve to the same single registration.
 *  - [ComposerWithSound]: the review composer with a sound pre-attached (`/reviews/new?sound=`
 *    on the web), reached from Sound Detail's "Use this sound". It lives at the app level for the
 *    same structural reason as [GroupDetail]: Music (Sound Detail) is nested inside the Home tab's
 *    own NavHost, while the review composer normally lives inside the Reviews tab's NavHost — two
 *    separate `NavController`s that can't navigate into each other directly. This route composes
 *    the same `ReviewComposerHost` those tabs already reuse, just from a third call site.
 */
sealed interface AppRoute : TappyRoute {
    @Serializable
    data object HomeShell : AppRoute

    /**
     * The onboarding wizard, shown once right after a fresh login when the user isn't yet
     * onboarded — the native equivalent of the web's auth-callback redirect to `/onboarding`. On
     * finish it replaces itself with [HomeShell]. A returning, already-onboarded session never
     * lands here (see the post-login gate in `AppNavHost`).
     */
    @Serializable
    data object Onboarding : AppRoute

    @Serializable
    data object DesignSystemShowcase : AppRoute

    @Serializable
    data class GroupDetail(val groupId: String) : AppRoute

    @Serializable
    data class ComposerWithSound(val trackId: String, val trackTitle: String) : AppRoute

    /**
     * The review composer with a real place pre-filled, reached from a past booking's Review
     * button. Top-level for the same structural reason as [ComposerWithSound]: Bookings lives
     * inside the Profile tab's nested nav, the composer inside the Reviews tab's.
     *
     * [placeId] is the booking's actual `place_id`, not a slug of the name — the composer's usual
     * slugify fallback exists only for a free-text place, and using it here would break the web's
     * already-reviewed dedupe, which keys on the real id.
     */
    @Serializable
    data class ComposerForPlace(val placeId: String, val placeName: String) : AppRoute
}

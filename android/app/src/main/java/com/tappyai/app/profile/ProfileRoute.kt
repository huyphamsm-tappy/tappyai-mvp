package com.tappyai.app.profile

import kotlinx.serialization.Serializable

/**
 * Routes for the Profile tab's own nested NavHost (Hub → Settings → Notifications), private to the
 * Profile tab. Like the shell's `HomeRoute`, an internal navigation space — never emitted through
 * the app-level navigator. Every row in the Profile hub now has a real destination here; the
 * coming-soon fallback this doc used to describe no longer exists.
 */
sealed interface ProfileRoute {
    @Serializable
    data object Hub : ProfileRoute

    @Serializable
    data object Settings : ProfileRoute

    @Serializable
    data object Notifications : ProfileRoute

    @Serializable
    data object Membership : ProfileRoute

    @Serializable
    data object TappyKnows : ProfileRoute

    @Serializable
    data object ChatHistory : ProfileRoute

    @Serializable
    data object Saved : ProfileRoute

    @Serializable
    data object Bookings : ProfileRoute

    @Serializable
    data object Preferences : ProfileRoute

    @Serializable
    data object MyReviews : ProfileRoute

    @Serializable
    data object GroupDining : ProfileRoute

    @Serializable
    data object PriceTracking : ProfileRoute

    @Serializable
    data object AppConnections : ProfileRoute

    @Serializable
    data object AccountGraph : ProfileRoute

    @Serializable
    data object Account : ProfileRoute

    @Serializable
    data object AccountEdit : ProfileRoute

    @Serializable
    data object Terms : ProfileRoute

    @Serializable
    data object Privacy : ProfileRoute

    /** Reused from the Reviews feature (`ReviewComposerHost`) — reachable here too since My
     *  Reviews' "Post your first review" empty-state action needs a real destination, matching
     *  the web's `/profile/posts` → `/reviews/new` link. */
    @Serializable
    data object MyReviewsComposer : ProfileRoute

    /** Reused from the Reviews feature (`ReviewDetailScreen`) — reachable here so a Saved review
     *  row opens the real review, matching the web's `/profile/favorites` → `/reviews/{id}` link. */
    @Serializable
    data class ReviewDetail(val reviewId: String) : ProfileRoute

    /** Reused from the Reviews feature (`ReviewProfileScreen`), reached from [ReviewDetail]'s
     *  avatar tap. */
    @Serializable
    data class AuthorProfile(val userId: String) : ProfileRoute

    /**
     * Service detail + booking form, reached from a Saved place tap — the native equivalent of the
     * web's `/service/{slug}?name=&address=&type=&placeId=`. All args come from the tapped favorite
     * (the web passes exactly these query params); [serviceId] is the web's slug of the place name,
     * used as the booking's `service_id`.
     */
    @Serializable
    data class ServiceDetail(
        val serviceId: String,
        val name: String,
        val address: String,
        val type: String,
        val placeId: String,
    ) : ProfileRoute
}

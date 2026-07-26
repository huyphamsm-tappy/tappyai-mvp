package com.tappyai.app.music

import kotlinx.serialization.Serializable

/**
 * Routes for the Music flow, hosted inside the Home tab's nested NavHost (Home landing → Library →
 * Sound detail). Like `ProfileRoute`, an internal navigation space — never emitted through the
 * app-level navigator, and the 5-tab shell is untouched.
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

    /** Reused from the Reviews feature (`ReviewDetailScreen`) — reached from Sound Detail's "videos
     *  using this sound" grid, mirroring the web's `/reviews/{id}` link. Hosted in this route space
     *  (same pattern as `ProfileRoute.ReviewDetail`) so the Music flow keeps its own back stack. */
    @Serializable
    data class ReviewDetail(val reviewId: String) : MusicRoute

    /** Reused from the Reviews feature (`ReviewProfileScreen`), reached from a [ReviewDetail]'s
     *  avatar — mirrors `ProfileRoute.AuthorProfile`. */
    @Serializable
    data class AuthorProfile(val userId: String) : MusicRoute
}

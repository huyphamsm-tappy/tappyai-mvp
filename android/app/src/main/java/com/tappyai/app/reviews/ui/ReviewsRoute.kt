package com.tappyai.app.reviews.ui

import kotlinx.serialization.Serializable

sealed interface ReviewsRoute {
    @Serializable data object Feed : ReviewsRoute
    @Serializable data class Detail(val reviewId: String) : ReviewsRoute
    @Serializable data class AuthorProfile(val userId: String) : ReviewsRoute
    @Serializable data object Composer : ReviewsRoute
    @Serializable data object Notifications : ReviewsRoute
    @Serializable data object Search : ReviewsRoute

    /** The feed's music-disc bottom sheet — web parity `SoundSheet` (a compact `/sound/{id}`). */
    @Serializable data class SoundSheet(val trackId: String) : ReviewsRoute

    /** The signed-in user's own profile inside Explore (mirrors the web reviews ProfileTab). */
    @Serializable data object SelfProfile : ReviewsRoute
}

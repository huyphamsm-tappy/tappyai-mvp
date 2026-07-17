package com.tappyai.app.reviews.ui

import kotlinx.serialization.Serializable

sealed interface ReviewsRoute {
    @Serializable data object Feed : ReviewsRoute
    @Serializable data class Detail(val reviewId: String) : ReviewsRoute
    @Serializable data class AuthorProfile(val userId: String) : ReviewsRoute
    @Serializable data object Composer : ReviewsRoute
    @Serializable data object Notifications : ReviewsRoute
    @Serializable data object Search : ReviewsRoute
}

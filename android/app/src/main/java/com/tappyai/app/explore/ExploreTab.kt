package com.tappyai.app.explore

import androidx.compose.runtime.Composable
import com.tappyai.app.reviews.ui.ReviewsNavHost

@Composable
fun ExploreTab(onEditProfile: () -> Unit = {}) {
    ReviewsNavHost(onEditProfile = onEditProfile)
}

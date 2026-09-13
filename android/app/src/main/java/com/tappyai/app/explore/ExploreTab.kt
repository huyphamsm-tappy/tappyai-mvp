package com.tappyai.app.explore

import androidx.compose.runtime.Composable
import com.tappyai.app.reviews.ui.ReviewsNavHost

@Composable
fun ExploreTab(
    onEditProfile: () -> Unit = {},
    /** ✦ Hỏi Tappy: the shell's Chat-with-prefill navigation (the native `/chat?q=` bridge). */
    onAskTappy: ((String) -> Unit)? = null,
) {
    ReviewsNavHost(onEditProfile = onEditProfile, onAskTappy = onAskTappy)
}

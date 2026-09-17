package com.tappyai.app.explore

import androidx.compose.runtime.Composable
import com.tappyai.app.reviews.ui.ReviewsNavHost

@Composable
fun ExploreTab(
    onEditProfile: () -> Unit = {},
    /** ✦ Hỏi Tappy: the shell's Chat-with-prefill navigation (the native `/chat?q=` bridge). */
    onAskTappy: ((String) -> Unit)? = null,
    /** The self profile's sign-in state for a guest (root-graph Login, routed up like the Tôi tab's). */
    onSignIn: (() -> Unit)? = null,
) {
    ReviewsNavHost(onEditProfile = onEditProfile, onAskTappy = onAskTappy, onSignIn = onSignIn)
}

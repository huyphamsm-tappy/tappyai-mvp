package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.SEED_REVIEWS

private val FeedBackground = Color(0xFF000000)

/**
 * Standalone pager preview of the feed card layout, driven by seed fixtures. The live feed used
 * by the app is [ReviewsFeedScreen] in ReviewsScreens.kt (backend-backed via [ReviewsFeedViewModel]);
 * this file exists only to render the card stack in Android Studio's preview pane.
 */
@Composable
private fun ReviewsFeedContent(reviews: List<Review>) {
    val pagerState = rememberPagerState(pageCount = { reviews.size })

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(FeedBackground),
    ) {
        VerticalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
            beyondViewportPageCount = 1,
        ) { page ->
            ReviewCard(
                review = reviews[page],
                isMe = false,
                onLike = {},
                onSave = {},
                onComment = {},
                onShare = {},
                onAvatarClick = {},
                onDelete = {},
                onHide = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewsFeedContentPreview() {
    ReviewsFeedContent(reviews = SEED_REVIEWS)
}

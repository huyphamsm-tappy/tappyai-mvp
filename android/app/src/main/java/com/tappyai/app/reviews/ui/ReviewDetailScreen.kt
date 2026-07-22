package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewComment
import com.tappyai.app.reviews.data.SEED_COMMENTS
import com.tappyai.app.reviews.data.SEED_REVIEWS

private val DetailBackground = Color(0xFF000000)

/**
 * Standalone preview of the detail layout (card + comment list), driven by seed fixtures. The live
 * detail screen used by the app is [ReviewDetailScreen] in ReviewsScreens.kt (backend-backed via
 * [ReviewDetailViewModel]); this file exists only for the Android Studio preview pane.
 */
@Composable
private fun ReviewDetailContent(
    review: Review,
    comments: List<ReviewComment>,
) {
    val nowMillis = System.currentTimeMillis()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DetailBackground),
    ) {
        item(key = "review-card") {
            ReviewCard(
                review = review,
                isMe = false,
                onLike = {},
                onSave = {},
                onComment = {},
                onShare = {},
                onAvatarClick = {},
                onDelete = {},
                onHide = {},
                modifier = Modifier.fillMaxWidth(),
            )
        }

        reviewCommentItems(comments = comments, nowMillis = nowMillis)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewDetailPreview() {
    ReviewDetailContent(
        review = SEED_REVIEWS.first(),
        comments = SEED_COMMENTS,
    )
}

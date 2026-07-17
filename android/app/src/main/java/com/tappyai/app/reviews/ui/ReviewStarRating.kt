package com.tappyai.app.reviews.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing

private val StarFilled = Color(0xFFFBBF24)
private val StarEmpty = Color(0xFF374151)
private val LabelColor = Color(0xB3FFFFFF)

@Composable
internal fun ReviewStarRating(
    rating: Int,
    onRatingChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val ratingLabels = stringArrayResource(R.array.reviews_rating_labels)
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            for (i in 1..5) {
                IconButton(onClick = { onRatingChange(i) }) {
                    Icon(
                        imageVector = if (i <= rating) Icons.Filled.Star else Icons.Outlined.Star,
                        contentDescription = ratingLabels[i - 1],
                        tint = if (i <= rating) StarFilled else StarEmpty,
                        modifier = Modifier.size(30.dp),
                    )
                }
            }
        }
        if (rating in 1..5) {
            Text(
                text = ratingLabels[rating - 1],
                color = LabelColor,
                fontSize = 12.sp,
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 200)
@Composable
private fun StarRatingEmptyPreview() {
    ReviewStarRating(rating = 0, onRatingChange = {})
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 200)
@Composable
private fun StarRating4Preview() {
    ReviewStarRating(rating = 4, onRatingChange = {})
}

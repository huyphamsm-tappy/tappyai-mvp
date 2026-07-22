package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.core.designsystem.component.TappyImage

private val CarouselDotActive = Color(0xFFFFFFFF)
private val CarouselDotInactive = Color(0x66FFFFFF)
private val CarouselBadgeBackground = Color(0x99000000)
private val CarouselBadgeText = Color(0xFFFFFFFF)

@Composable
internal fun ReviewPhotoCarousel(
    photos: List<String>,
    modifier: Modifier = Modifier,
) {
    val pagerState = rememberPagerState(pageCount = { photos.size })

    Box(modifier = modifier) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            TappyImage(
                url = photos[page],
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }

        if (photos.size > 1) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 56.dp, end = 16.dp)
                    .background(CarouselBadgeBackground, RoundedCornerShape(12.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    text = "${pagerState.currentPage + 1}/${photos.size}",
                    color = CarouselBadgeText,
                    fontSize = 12.sp,
                )
            }

            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 56.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                for (i in photos.indices) {
                    val isActive = i == pagerState.currentPage
                    Box(
                        modifier = Modifier
                            .height(6.dp)
                            .width(if (isActive) 16.dp else 6.dp)
                            .clip(CircleShape)
                            .background(if (isActive) CarouselDotActive else CarouselDotInactive),
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ReviewPhotoCarouselPreview() {
    ReviewPhotoCarousel(
        photos = listOf(
            "https://images.unsplash.com/photo-1",
            "https://images.unsplash.com/photo-2",
            "https://images.unsplash.com/photo-3",
        ),
        modifier = Modifier.fillMaxSize(),
    )
}

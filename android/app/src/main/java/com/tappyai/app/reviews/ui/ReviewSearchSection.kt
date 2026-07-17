package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.theme.TappySpacing

private val SearchBackground = Color(0xFF000000)
private val SearchBarBackground = Color(0xFF1A1A1A)
private val SearchTextPrimary = Color(0xFFFFFFFF)
private val SearchTextSecondary = Color(0xB3FFFFFF)
private val SearchPlaceholder = Color(0x66FFFFFF)
private val SearchIconColor = Color(0x99FFFFFF)
private val SearchStarColor = Color(0xFFFBBF24)

@Composable
internal fun ReviewSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = {
            Text(stringResource(R.string.reviews_search_placeholder), color = SearchPlaceholder, fontSize = 15.sp)
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = SearchIconColor,
                modifier = Modifier.size(20.dp),
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = stringResource(R.string.reviews_search_clear_content_description),
                        tint = SearchIconColor,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = TextFieldDefaults.colors(
            focusedTextColor = SearchTextPrimary,
            unfocusedTextColor = SearchTextPrimary,
            cursorColor = SearchTextPrimary,
            focusedContainerColor = SearchBarBackground,
            unfocusedContainerColor = SearchBarBackground,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp)),
    )
}

@Composable
internal fun ReviewSearchResultItem(
    review: Review,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val displayName = review.profiles?.fullName ?: stringResource(R.string.reviews_anonymous_name)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TappyAvatar(
            name = displayName,
            imageUrl = review.profiles?.avatarUrl,
            size = TappyAvatarSize.ListRow,
        )

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = displayName,
                    color = SearchTextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (review.rating > 0) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            tint = SearchStarColor,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = review.rating.toString(),
                            color = SearchStarColor,
                            fontSize = 12.sp,
                        )
                    }
                }
            }

            Text(
                text = review.body,
                color = SearchTextSecondary,
                fontSize = 13.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Text(
                text = review.placeName,
                color = SearchPlaceholder,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

internal fun LazyListScope.reviewSearchItems(
    results: List<Review>,
    onResultClick: (Review) -> Unit,
) {
    if (results.isEmpty()) {
        item(key = "search-empty") {
            TappyEmptyState(
                icon = Icons.Filled.Search,
                title = stringResource(R.string.reviews_search_empty_title),
                message = stringResource(R.string.reviews_search_empty_message),
            )
        }
    } else {
        items(items = results, key = { it.id }) { review ->
            ReviewSearchResultItem(
                review = review,
                onClick = { onResultClick(review) },
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 700)
@Composable
private fun SearchWithResultsPreview() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SearchBackground)
            .padding(top = TappySpacing.xl),
    ) {
        ReviewSearchBar(
            query = "cà phê",
            onQueryChange = {},
            modifier = Modifier.padding(horizontal = TappySpacing.xl),
        )
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            reviewSearchItems(
                results = SEED_REVIEWS.take(4),
                onResultClick = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 500)
@Composable
private fun SearchEmptyPreview() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SearchBackground)
            .padding(top = TappySpacing.xl),
    ) {
        ReviewSearchBar(
            query = "xyz không có",
            onQueryChange = {},
            modifier = Modifier.padding(horizontal = TappySpacing.xl),
        )
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            reviewSearchItems(
                results = emptyList(),
                onResultClick = {},
            )
        }
    }
}

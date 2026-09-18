package com.tappyai.app.reviews.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.reviews.data.Liker
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

private val SheetBackground = Color(0xFF000000)
private val SheetScrim = Color(0x99000000)
private val SheetDragHandle = Color(0xFF666666)
private val SheetText = Color(0xFFFFFFFF)
private val SheetMuted = Color(0xFF9CA3AF)
private val SheetDivider = Color(0xFF1F2937)
private val LikeRed = Color(0xFFFE2C55)

/**
 * The people who like a post — the web `LikeListSheet` (2026-09-17), opened by tapping the like
 * COUNT. It is the count's control, never the heart's: the heart stays the like toggle on every
 * surface; this sheet is what the number does.
 *
 * `GET /api/reviews/{id}/likes` — the set of likes that EXIST RIGHT NOW (`review_likes`), paged
 * with `before`; an unliked person is simply absent. A liker with no profile row (an anonymous
 * session) still counts and is shown under the same fallback name the feed and the inbox use.
 * The shell is the comment sheet's — the other overlay over the black feed — so this is not a
 * second visual language.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReviewLikeListSheet(
    reviewId: String,
    onDismiss: () -> Unit,
    viewModel: ReviewLikeListViewModel = hiltViewModel(key = "likes:$reviewId"),
) {
    androidx.compose.runtime.LaunchedEffect(reviewId) { viewModel.load(reviewId) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = SheetBackground,
        scrimColor = SheetScrim,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = TappySpacing.md)
                    .size(width = 32.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(SheetDragHandle),
            )
        },
    ) {
        Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.7f)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Favorite, contentDescription = null, tint = LikeRed, modifier = Modifier.size(14.dp))
                Text(text = stringResource(R.string.reviews_likes_title), color = SheetText, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
            HorizontalDivider(color = SheetDivider)
            when {
                viewModel.isLoading -> Box(modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SheetMuted, modifier = Modifier.size(22.dp), strokeWidth = 2.5.dp)
                }
                viewModel.failed -> SheetLine(stringResource(R.string.reviews_likes_error))
                viewModel.likers.isEmpty() -> SheetLine(stringResource(R.string.reviews_likes_empty))
                else -> LazyColumn(modifier = Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 8.dp)) {
                    items(viewModel.likers, key = { it.id + it.createdAt }) { liker -> LikerRow(liker) }
                    if (viewModel.nextCursor != null) {
                        item(key = "more") {
                            Text(
                                text = stringResource(R.string.reviews_likes_more),
                                color = SheetMuted,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 12.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable(enabled = !viewModel.loadingMore, role = Role.Button, onClick = viewModel::loadMore)
                                    .padding(vertical = 8.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetLine(text: String) {
    Text(text = text, color = SheetMuted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp))
}

@Composable
private fun LikerRow(liker: Liker) {
    val name = liker.fullName?.trim()?.takeIf { it.isNotEmpty() } ?: stringResource(R.string.reviews_anonymous_name)
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Color(0xFFEC4899), Color(0xFF9333EA)))),
            contentAlignment = Alignment.Center,
        ) {
            if (!liker.avatarUrl.isNullOrBlank()) {
                TappyImage(url = liker.avatarUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(40.dp).clip(CircleShape))
            } else {
                Text(text = name.first().uppercaseChar().toString(), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(text = name, color = SheetText, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@HiltViewModel
class ReviewLikeListViewModel @Inject constructor(private val repository: ReviewsRepository) : ViewModel() {
    var likers by mutableStateOf<List<Liker>>(emptyList())
        private set
    var nextCursor by mutableStateOf<String?>(null)
        private set
    var isLoading by mutableStateOf(true)
        private set
    var loadingMore by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set
    private var reviewId: String = ""

    fun load(id: String) {
        if (reviewId == id && !failed) return
        reviewId = id; isLoading = true; failed = false
        viewModelScope.launch {
            when (val result = repository.getLikers(id, before = null)) {
                is NetworkResult.Success -> { likers = result.data.likers; nextCursor = result.data.nextCursor }
                is NetworkResult.Error -> failed = true
            }
            isLoading = false
        }
    }

    /** Append on paging — `before` doubles as "is this a page 2+", as on the web. */
    fun loadMore() {
        val cursor = nextCursor ?: return
        if (loadingMore) return
        loadingMore = true
        viewModelScope.launch {
            when (val result = repository.getLikers(reviewId, before = cursor)) {
                is NetworkResult.Success -> { likers = likers + result.data.likers; nextCursor = result.data.nextCursor }
                is NetworkResult.Error -> Unit
            }
            loadingMore = false
        }
    }
}

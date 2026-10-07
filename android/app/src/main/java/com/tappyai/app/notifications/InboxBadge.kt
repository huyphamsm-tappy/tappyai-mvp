package com.tappyai.app.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.app.reviews.ui.selfProfileAccess
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * The bell's unread badge — the web shell's `unreadCount` on `<Bell>` (`V3Shell.tsx`,
 * `NotificationProvider.tsx`): a rose count, capped at "99+", drawn only while the count is above
 * zero, from `GET /api/notifications` → `unread_count`. The same number the Inbox shows; the
 * Inbox's "mark all read" empties it on the next resume.
 *
 * Signed-in only — an anonymous session has no inbox, so nothing is requested and nothing is
 * drawn (the gate is the one the Inbox, Messages and the self profile apply). A failed refresh
 * keeps the previous count, exactly as the web provider does on a transient failure.
 */
@HiltViewModel
class InboxBadgeViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    var unreadCount by mutableStateOf(0)
        private set

    private var job: Job? = null

    /** Re-read the count; called on every resume of a screen that draws the bell. */
    fun refresh() {
        job?.cancel()
        job = viewModelScope.launch {
            val userId = authRepository.currentUserId()
            val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }
            if (userId == null || !selfProfileAccess(userId, anonymous)) {
                unreadCount = 0
                return@launch
            }
            when (val result = repository.getNotifications()) {
                is NetworkResult.Success -> unreadCount = result.data.unreadCount
                is NetworkResult.Error -> Unit // keep the previous count on a transient failure
            }
        }
    }
}

/** The web's label: the count, "99+" past ninety-nine. Pure. */
fun unreadBadgeLabel(count: Int): String = if (count > 99) "99+" else count.toString()

/** The rose pill at the bell's top-right corner; draws nothing at zero. */
@Composable
fun BoxScope.UnreadBadge(count: Int, modifier: Modifier = Modifier) {
    if (count <= 0) return
    Box(
        modifier = modifier
            .align(Alignment.TopEnd)
            .offset(x = 4.dp, y = (-4).dp)
            .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
            .clip(CircleShape)
            .background(Color(0xFFF43F5E))
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = unreadBadgeLabel(count), color = Color.White, fontSize = 9.sp, lineHeight = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

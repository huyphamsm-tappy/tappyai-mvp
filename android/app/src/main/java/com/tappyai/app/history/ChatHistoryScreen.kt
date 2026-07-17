package com.tappyai.app.history

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappySkeleton
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Chat History — mirrors the web `/profile/history`: a list of conversation rows (category emoji
 * tile + title + "N messages · relative time") with a per-row delete, plus an empty state.
 * Rows are loaded by [ChatHistoryViewModel] from `GET /api/conversations`; delete is a confirmed,
 * optimistic `DELETE /api/conversations`. Tapping a row calls [onResumeConversation] with the
 * conversation's id, which the shell wires to open the Chat tab loaded with that conversation's
 * history (read-only resume — new messages sent afterwards aren't persisted back, since Android
 * chat has no save/persist path at all yet, matching a fresh chat's behavior). The empty state's
 * "Start chat" switches to the Chat tab via [onStartChat]. The web has no search / grouping /
 * rename / pin / multi-select, so none are added here.
 */
@Composable
fun ChatHistoryScreen(
    onBack: () -> Unit,
    onStartChat: () -> Unit,
    onResumeConversation: (String) -> Unit,
    viewModel: ChatHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<Conversation?>(null) }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.history_title), style = MaterialTheme.typography.titleLarge)
            }

            when (val currentState = state) {
                UiState.Loading -> LoadingSkeletons()
                is UiState.Error -> TappyErrorState(
                    title = stringResource(R.string.history_error_title),
                    message = currentState.message,
                    retryText = stringResource(R.string.common_try_again),
                    onRetry = viewModel::retry,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                )
                UiState.Empty, UiState.Idle -> Column(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterVertically),
                ) {
                    TappyEmptyState(
                        icon = Icons.AutoMirrored.Filled.Message,
                        title = stringResource(R.string.history_empty_title),
                        message = stringResource(R.string.history_empty_message),
                    )
                    TappyButton(text = stringResource(R.string.history_start_chat), onClick = onStartChat)
                }
                is UiState.Success -> LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                ) {
                    items(items = currentState.data, key = { it.id }) { conv ->
                        ConversationRow(
                            conversation = conv,
                            now = viewModel.now,
                            onOpen = { onResumeConversation(conv.id) },
                            onDelete = { pendingDelete = conv },
                        )
                    }
                }
            }
        }
    }

    pendingDelete?.let { conv ->
        TappyDialog(
            title = stringResource(R.string.history_delete_dialog_title),
            message = stringResource(R.string.history_delete_dialog_message, conv.title),
            confirmText = stringResource(R.string.history_delete_confirm),
            onConfirm = {
                viewModel.delete(conv.id)
                pendingDelete = null
            },
            onDismiss = { pendingDelete = null },
        )
    }
}

@Composable
private fun LoadingSkeletons() {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        repeat(4) {
            TappySkeleton(modifier = Modifier.fillMaxWidth().height(64.dp), shape = TappyShapes.card)
        }
    }
}

@Composable
private fun ConversationRow(
    conversation: Conversation,
    now: Long,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(TappyShapes.input)
                    .clickable(onClick = onOpen),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(TappyShapes.input)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = emojiForCategory(conversation.category), fontSize = 20.sp)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = conversation.title,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(
                            R.string.history_messages_count_time,
                            conversation.messageCount,
                            formatRelativeTime(conversation.updatedAtMillis, now),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.history_delete_conversation_cd, conversation.title),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

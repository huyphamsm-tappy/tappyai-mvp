package com.tappyai.app.messaging

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.messaging.data.ThreadKind
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3OutlinePill
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.tools.ToolTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import kotlinx.coroutines.delay

/**
 * One conversation — the web `ThreadView` on a phone (2026-09-17): a header (back · avatar ·
 * title · a group's real member count, and NOTHING claiming presence), the messages as bubbles
 * (mine in the accent fill, theirs on the elevated panel), and a composer pinned above the
 * keyboard. Enter sends (`imeAction`); the send button is disabled on an empty draft.
 */
@Composable
fun ThreadScreen(onBack: () -> Unit, viewModel: ThreadViewModel = hiltViewModel()) {
    val listState = rememberLazyListState()

    LifecycleResumeEffect(Unit) {
        viewModel.poll()
        onPauseOrDispose { }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(ThreadViewModel.POLL_MS)
            viewModel.poll()
        }
    }
    LaunchedEffect(viewModel.appendTick) {
        if (viewModel.messages.isNotEmpty()) listState.animateScrollToItem(viewModel.messages.size)
    }

    val thread = viewModel.thread
    val fallback = stringResource(if (thread?.kind == ThreadKind.Group) R.string.msg_v3_unnamed_group else R.string.msg_v3_unknown_user)
    val title = thread?.title(viewModel.meId, fallback) ?: fallback
    val other = thread?.participants?.firstOrNull { it.userId != viewModel.meId }

    V3HomeTheme {
        Column(
            modifier = Modifier.fillMaxSize().background(HomeV3.Background).imePadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(modifier = Modifier.widthIn(max = TappyContainers.content).fillMaxSize()) {
                // ── Header ──
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.msg_v3_back), tint = HomeV3.OnSurface)
                    }
                    ThreadAvatar(url = if (thread?.kind == ThreadKind.Group) null else other?.avatarUrl, name = title, group = thread?.kind == ThreadKind.Group, size = 36.dp)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = title, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (thread?.kind == ThreadKind.Group) {
                            Text(text = stringResource(R.string.msg_v3_group_members, thread.participants.size), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
                        }
                    }
                }
                HorizontalDivider(color = HomeV3.Outline)

                // ── Messages ──
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    when {
                        viewModel.isLoading -> V3Loading(height = 160.dp)
                        viewModel.failed == ThreadViewModel.ThreadFailure.Load && viewModel.messages.isEmpty() -> Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(text = stringResource(R.string.msg_v3_error), color = V3Tone.Rose, fontSize = 13.sp, textAlign = TextAlign.Center)
                            V3OutlinePill(text = stringResource(R.string.common_try_again), onClick = viewModel::load)
                        }
                        viewModel.messages.isEmpty() -> Text(
                            text = stringResource(R.string.msg_v3_no_messages),
                            color = HomeV3.OnSurfaceVariant,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                        )
                        else -> LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            if (viewModel.hasMore) {
                                item(key = "older") {
                                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                        if (viewModel.loadingOlder) V3Loading(height = 36.dp)
                                        else V3OutlinePill(text = stringResource(R.string.msg_v3_load_older), onClick = viewModel::loadOlder)
                                    }
                                }
                            }
                            items(viewModel.messages, key = { it.id }) { message ->
                                val mine = message.senderId == viewModel.meId
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                                    Text(
                                        text = message.body,
                                        color = if (mine) Color.White else HomeV3.OnSurface,
                                        fontSize = 13.5.sp,
                                        lineHeight = 18.sp,
                                        modifier = Modifier
                                            .widthIn(max = 300.dp)
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(if (mine) HomeV3.Purple else HomeV3.SurfaceVariant)
                                            .padding(horizontal = 14.dp, vertical = 10.dp),
                                    )
                                }
                            }
                        }
                    }
                }

                if (viewModel.failed == ThreadViewModel.ThreadFailure.Send) {
                    Text(text = stringResource(R.string.msg_v3_send_error), color = V3Tone.Rose, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                }

                // ── Composer ──
                HorizontalDivider(color = HomeV3.Outline)
                Row(
                    modifier = Modifier.fillMaxWidth().background(HomeV3.Surface).padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ToolTextField(
                        value = viewModel.draft,
                        onValueChange = viewModel::onDraftChange,
                        placeholder = stringResource(R.string.msg_v3_composer),
                        singleLine = false,
                        maxLines = 5,
                        textSize = 13.5.sp,
                        modifier = Modifier.weight(1f),
                    )
                    val canSend = viewModel.draft.isNotBlank() && !viewModel.sending
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeV3.Purple.copy(alpha = if (canSend) 1f else 0.4f))
                            .clickable(enabled = canSend, role = Role.Button, onClickLabel = stringResource(R.string.msg_v3_send), onClick = viewModel::send),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.msg_v3_send), tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

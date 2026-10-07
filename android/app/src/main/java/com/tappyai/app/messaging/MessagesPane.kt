package com.tappyai.app.messaging

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.tappyai.app.R
import com.tappyai.app.history.formatRelativeTime
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.messaging.data.ChatThreadSummary
import com.tappyai.app.messaging.data.ThreadKind
import com.tappyai.app.personal.V3ErrorLine
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.personal.v3AccentSoft
import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.app.tools.ToolTextField
import com.tappyai.core.designsystem.component.TappyImage
import kotlinx.coroutines.delay
import java.time.OffsetDateTime

/**
 * The Messages tab of the Inbox — the web `MessagesTab` below `lg` (2026-09-17): ONE panel
 * holding the "Tin nhắn mới" action, the list filter, and the conversation rows; a row opens the
 * thread as its own screen (the web replaces the surface too — the only arrangement that leaves
 * room for a conversation on a phone). The new-conversation flow is a sheet over it.
 *
 * REAL COUNTS, REAL EMPTIES. `unreadCount` is the server's; zero renders nothing. With no
 * conversations the panel says so — no placeholder threads are ever rendered.
 */
@Composable
internal fun MessagesPane(
    viewModel: MessagesViewModel,
    onOpenThread: (String) -> Unit,
) {
    var composing by remember { mutableStateOf(false) }

    // The realtime channel's stand-in: re-read on resume and every POLL_MS while showing.
    LifecycleResumeEffect(Unit) {
        viewModel.refetch()
        onPauseOrDispose { }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(MessagesViewModel.POLL_MS)
            viewModel.refetch()
        }
    }

    val fallbackUser = stringResource(R.string.msg_v3_unknown_user)
    val fallbackGroup = stringResource(R.string.msg_v3_unnamed_group)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, V3PanelShape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 38.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(HomeV3.Purple)
                .clickable(role = Role.Button, onClick = { composing = true })
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        ) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            Text(text = stringResource(R.string.msg_v3_new), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }

        // Filters what is ALREADY LOADED — not message search (there is no index for one).
        ToolTextField(
            value = viewModel.query,
            onValueChange = viewModel::onQueryChange,
            placeholder = stringResource(R.string.msg_v3_search),
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp)) },
            textSize = 13.sp,
        )

        val visible = viewModel.visible(fallbackUser, fallbackGroup)
        when {
            viewModel.error != null && viewModel.threads == null ->
                V3ErrorLine(message = viewModel.error!!, retryText = stringResource(R.string.common_try_again), onRetry = viewModel::refetch)
            visible == null -> V3Loading(height = 120.dp)
            visible.isEmpty() -> Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(modifier = Modifier.size(56.dp).clip(CircleShape).background(HomeV3.SurfaceVariant), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(26.dp))
                }
                Text(text = stringResource(R.string.msg_v3_empty), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Text(text = stringResource(R.string.msg_v3_empty_hint), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, lineHeight = 17.sp, textAlign = TextAlign.Center)
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val now = System.currentTimeMillis()
                visible.forEach { thread ->
                    ThreadRow(thread = thread, meId = viewModel.meId, nowMillis = now, onClick = { onOpenThread(thread.id) })
                }
            }
        }
    }

    if (composing) {
        NewMessageSheet(
            viewModel = viewModel,
            onDismiss = { composing = false; viewModel.resetComposer() },
            onStarted = { threadId -> composing = false; onOpenThread(threadId) },
        )
    }
}

@Composable
private fun ThreadRow(thread: ChatThreadSummary, meId: String?, nowMillis: Long, onClick: () -> Unit) {
    val title = thread.title(meId, stringResource(if (thread.kind == ThreadKind.Group) R.string.msg_v3_unnamed_group else R.string.msg_v3_unknown_user))
    val other = thread.participants.firstOrNull { it.userId != meId }
    val unread = thread.unreadCount > 0
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ThreadAvatar(url = if (thread.kind == ThreadKind.Group) null else other?.avatarUrl, name = title, group = thread.kind == ThreadKind.Group, size = 40.dp)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = title,
                    color = HomeV3.OnSurface,
                    fontSize = 13.5.sp,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = formatRelativeTime(isoMillis(thread.lastMessage?.createdAt ?: thread.lastMessageAt), nowMillis),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 11.sp,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 2.dp)) {
                Text(
                    text = thread.lastMessage?.body ?: stringResource(R.string.msg_v3_no_messages),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (unread) {
                    Text(
                        text = thread.unreadCount.toString(),
                        color = Color.White,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(CircleShape).background(HomeV3.Purple).padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

/** The picture, the group glyph, or the initial on the soft accent disc — never a placeholder face. */
@Composable
internal fun ThreadAvatar(url: String?, name: String, group: Boolean, size: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier.size(size).clip(CircleShape).background(v3AccentSoft()),
        contentAlignment = Alignment.Center,
    ) {
        when {
            !url.isNullOrBlank() -> TappyImage(url = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size).clip(CircleShape))
            group -> Icon(Icons.Filled.Group, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(size * 0.45f))
            else -> Text(text = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?", color = HomeV3.Purple, fontSize = (size.value * 0.35f).sp, fontWeight = FontWeight.Bold)
        }
    }
}

internal fun isoMillis(iso: String): Long = try {
    OffsetDateTime.parse(iso.trim().replace(' ', 'T')).toInstant().toEpochMilli()
} catch (_: Exception) {
    0L
}

/**
 * The new-conversation flow — the web `NewMessageSheet`: search REAL accounts (the existing
 * `/api/users/search`, with its own rate limit and name-partial policy), pick one or more, start.
 * No directory listing and no suggested people, because neither exists as real data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewMessageSheet(viewModel: MessagesViewModel, onDismiss: () -> Unit, onStarted: (String) -> Unit) {
    val errorText = stringResource(R.string.msg_v3_error)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        V3HomeTheme {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = stringResource(R.string.msg_v3_new), color = HomeV3.OnSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.msg_v3_close), tint = HomeV3.OnSurfaceVariant) }
                }
                ToolTextField(
                    value = viewModel.peopleQuery,
                    onValueChange = viewModel::onPeopleQueryChange,
                    placeholder = stringResource(R.string.msg_v3_find_people),
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp)) },
                    textSize = 13.5.sp,
                )
                // A name only once more than one person is picked — the only case where the thread is a group.
                if (viewModel.selected.size > 1) {
                    ToolTextField(value = viewModel.groupName, onValueChange = viewModel::onGroupNameChange, placeholder = stringResource(R.string.msg_v3_group_name), textSize = 13.5.sp)
                }
                Column(modifier = Modifier.heightIn(min = 120.dp, max = 360.dp).verticalScroll(rememberScrollState())) {
                    when {
                        viewModel.peopleQuery.trim().length < MessagesViewModel.MIN_QUERY -> SheetHint(stringResource(R.string.msg_v3_search_hint))
                        viewModel.searching -> V3Loading(height = 72.dp)
                        viewModel.people.isEmpty() -> SheetHint(stringResource(R.string.msg_v3_no_results))
                        else -> viewModel.people.forEach { person -> PersonRow(person = person, picked = viewModel.selected.any { it.id == person.id }, onToggle = { viewModel.togglePerson(person) }) }
                    }
                }
                viewModel.startError?.let { Text(text = it, color = V3Tone.Rose, fontSize = 12.sp) }
                val count = viewModel.selected.size
                val enabled = count > 0 && !viewModel.starting
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 46.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(HomeV3.Purple.copy(alpha = if (enabled) 1f else 0.45f))
                        .clickable(enabled = enabled, role = Role.Button) { viewModel.start(errorText, onStarted) }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = if (count > 1) stringResource(R.string.msg_v3_start_chat_n, count) else stringResource(R.string.msg_v3_start_chat),
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun SheetHint(text: String) {
    Text(text = text, color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp))
}

@Composable
private fun PersonRow(person: UserSearchResult, picked: Boolean, onToggle: () -> Unit) {
    val name = person.fullName?.trim()?.takeIf { it.isNotEmpty() } ?: stringResource(R.string.msg_v3_unknown_user)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (picked) v3AccentSoft() else Color.Transparent)
            .clickable(role = Role.Checkbox, onClick = onToggle)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ThreadAvatar(url = person.avatarUrl, name = name, group = false, size = 36.dp)
        Text(text = name, color = HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (picked) Icon(Icons.Filled.Check, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(17.dp))
    }
}

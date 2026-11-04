package com.tappyai.app.messaging

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.messaging.data.ThreadKind
import com.tappyai.app.messaging.data.bubbleMetas
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3OutlinePill
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.safety.ReportTarget
import com.tappyai.app.safety.SafetyViewModel
import com.tappyai.app.safety.ui.AuthorSafetyMenu
import com.tappyai.app.safety.ui.ReportDialog
import com.tappyai.app.tools.ToolTextField
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyContainers
import kotlinx.coroutines.delay

/**
 * One conversation — the web `ThreadView` on a phone: a header (back · avatar · title · a group's real member count, and NOTHING claiming presence · the report / block menu of the other
 * person in a direct thread), the messages as bubbles (mine in the accent fill, theirs on the elevated panel; a group shows the sender's name once per run and a time under the last
 * bubble of a run — [bubbleMetas], the same rule as the web), pictures, a report menu beside other people's messages, and a composer pinned above the keyboard with the attach button.
 * Enter sends (`imeAction`); the send button is disabled on an empty draft with no picture. After a refused send the writing area is replaced by the same neutral sentence.
 */
@Composable
fun ThreadScreen(onBack: () -> Unit, viewModel: ThreadViewModel = hiltViewModel(), safety: SafetyViewModel = hiltViewModel()) {
    val listState = rememberLazyListState()
    val flags by safety.flags.collectAsStateWithLifecycle()
    var menuFor by remember { mutableStateOf<String?>(null) }
    var reportingId by remember { mutableStateOf<String?>(null) }

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

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) viewModel.pickPhoto(uri) }

    val thread = viewModel.thread
    val isGroup = thread?.kind == ThreadKind.Group
    val fallback = stringResource(if (isGroup) R.string.msg_v3_unnamed_group else R.string.msg_v3_unknown_user)
    val title = thread?.title(viewModel.meId, fallback) ?: fallback
    val other = thread?.participants?.firstOrNull { it.userId != viewModel.meId }
    val unknownUser = stringResource(R.string.msg_v3_unknown_user)
    val metas = remember(viewModel.messages, thread, viewModel.meId) {
        bubbleMetas(
            messages = viewModel.messages,
            meId = viewModel.meId,
            group = isGroup,
            nameOf = { id -> thread?.participants?.firstOrNull { it.userId == id }?.fullName?.trim()?.takeIf { it.isNotEmpty() } ?: unknownUser },
        )
    }

    reportingId?.let { id ->
        ReportDialog(
            title = stringResource(R.string.safety_report_message_title),
            notice = stringResource(R.string.safety_report_message_notice),
            onSubmit = { reason -> safety.report(ReportTarget.Message, id, reason) },
            onFiled = {},
            onDismiss = { reportingId = null },
        )
    }

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
                    ThreadAvatar(url = if (isGroup) null else other?.avatarUrl, name = title, group = isGroup, size = 36.dp)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = title, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (isGroup && thread != null) {
                            Text(text = stringResource(R.string.msg_v3_group_members, thread.participants.size), color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp)
                        }
                    }
                    // Report / block the other person of a 1:1 thread (both appear only while the server says it has the feature). A block closes the thread server-side; leaving is this screen's part.
                    if (!isGroup && other != null) {
                        Box(modifier = Modifier.width(52.dp)) {
                            AuthorSafetyMenu(userId = other.userId, userName = title, onBlockedChanged = { blocked -> if (blocked) onBack() })
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
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            if (viewModel.hasMore) {
                                item(key = "older") {
                                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                        if (viewModel.loadingOlder) V3Loading(height = 36.dp)
                                        else V3OutlinePill(text = stringResource(R.string.msg_v3_load_older), onClick = viewModel::loadOlder)
                                    }
                                }
                            }
                            items(viewModel.messages.size, key = { viewModel.messages[it].id }) { index ->
                                val message = viewModel.messages[index]
                                val meta = metas.getOrNull(index)
                                val mine = message.senderId == viewModel.meId
                                Column(
                                    modifier = Modifier.fillMaxWidth().padding(bottom = if (meta?.showTime == true) 6.dp else 0.dp),
                                    horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
                                ) {
                                    if (meta?.showName == true && meta.name != null) {
                                        Text(text = meta.name, color = HomeV3.OnSurfaceVariant, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp, bottom = 2.dp))
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Column(
                                            modifier = Modifier
                                                .widthIn(max = 300.dp)
                                                .clip(RoundedCornerShape(16.dp))
                                                .background(if (mine) HomeV3.Purple else HomeV3.SurfaceVariant)
                                                .padding(horizontal = if (message.media != null && message.body.isBlank()) 6.dp else 14.dp, vertical = if (message.media != null && message.body.isBlank()) 6.dp else 10.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            message.media?.let { media -> MessagePhoto(messageId = message.id, media = media) }
                                            if (message.body.isNotBlank()) {
                                                Text(text = message.body, color = if (mine) Color.White else HomeV3.OnSurface, fontSize = 13.5.sp, lineHeight = 18.sp)
                                            }
                                        }
                                        // Report THIS message (only someone else's, and only while the server says it has reports). Blocking the person is the header's job.
                                        if (!mine && flags.reports) {
                                            Box {
                                                IconButton(onClick = { menuFor = message.id }, modifier = Modifier.size(32.dp)) {
                                                    Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.safety_report_action), tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
                                                }
                                                DropdownMenu(expanded = menuFor == message.id, onDismissRequest = { menuFor = null }) {
                                                    DropdownMenuItem(
                                                        text = { Text(stringResource(R.string.msg_v3_report_message)) },
                                                        leadingIcon = { Icon(Icons.Filled.Flag, contentDescription = null) },
                                                        onClick = { menuFor = null; reportingId = message.id },
                                                    )
                                                }
                                            }
                                        }
                                    }
                                    if (meta?.showTime == true && meta.time.isNotEmpty()) {
                                        Text(text = meta.time, color = HomeV3.OnSurfaceVariant, fontSize = 10.5.sp, modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 2.dp))
                                    }
                                }
                            }
                        }
                    }
                }

                viewModel.failed?.takeIf { it != ThreadViewModel.ThreadFailure.Load }?.let { failure ->
                    Text(text = stringResource(failureTextRes(failure)), color = V3Tone.Rose, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                }

                // ── Composer ──
                HorizontalDivider(color = HomeV3.Outline)
                if (viewModel.locked) {
                    // The same neutral sentence the web shows: the server never says whether it was a block, so neither does this screen.
                    Text(
                        text = stringResource(R.string.msg_v3_cannot_send),
                        color = HomeV3.OnSurfaceVariant,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().background(HomeV3.Surface).padding(horizontal = 12.dp, vertical = 16.dp),
                    )
                } else {
                    Column(modifier = Modifier.fillMaxWidth().background(HomeV3.Surface).padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val photo = viewModel.photo
                        if (photo != null || viewModel.uploading) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (photo != null) {
                                    Box(modifier = Modifier.size(64.dp).clip(RoundedCornerShape(12.dp)).background(HomeV3.SurfaceVariant)) {
                                        TappyImage(url = photo.previewUri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp))
                                        IconButton(onClick = viewModel::removePhoto, modifier = Modifier.align(Alignment.TopEnd).size(22.dp).background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(11.dp))) {
                                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.msg_v3_remove_photo), tint = Color.White, modifier = Modifier.size(12.dp))
                                        }
                                    }
                                }
                                if (viewModel.uploading) {
                                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = HomeV3.Purple)
                                    Text(text = stringResource(R.string.msg_v3_uploading), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
                                }
                            }
                        }
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val canAttach = !viewModel.uploading && !viewModel.sending
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(HomeV3.SurfaceVariant.copy(alpha = if (canAttach) 1f else 0.5f))
                                    .clickable(enabled = canAttach, role = Role.Button, onClickLabel = stringResource(R.string.msg_v3_attach)) {
                                        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Filled.AddPhotoAlternate, contentDescription = stringResource(R.string.msg_v3_attach), tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(20.dp))
                            }
                            ToolTextField(
                                value = viewModel.draft,
                                onValueChange = viewModel::onDraftChange,
                                placeholder = stringResource(R.string.msg_v3_composer),
                                singleLine = false,
                                maxLines = 5,
                                textSize = 13.5.sp,
                                modifier = Modifier.weight(1f),
                            )
                            val canSend = (viewModel.draft.isNotBlank() || viewModel.photo != null) && !viewModel.sending && !viewModel.uploading
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
    }
}

/** What each failure says — the web's strings, one for one. The 404 sentence is neutral on purpose (never "blocked"). */
internal fun failureTextRes(failure: ThreadViewModel.ThreadFailure): Int = when (failure) {
    ThreadViewModel.ThreadFailure.Load -> R.string.msg_v3_error
    ThreadViewModel.ThreadFailure.Send -> R.string.msg_v3_send_error
    ThreadViewModel.ThreadFailure.SendLocked -> R.string.msg_v3_cannot_send
    ThreadViewModel.ThreadFailure.SendTooFast -> R.string.msg_v3_send_too_fast
    ThreadViewModel.ThreadFailure.PhotoType -> R.string.msg_v3_image_type
    ThreadViewModel.ThreadFailure.PhotoTooLarge -> R.string.msg_v3_image_too_large
    ThreadViewModel.ThreadFailure.PhotoBlocked -> R.string.msg_v3_image_blocked
    ThreadViewModel.ThreadFailure.PhotoScanUnavailable -> R.string.msg_v3_scan_unavailable
    ThreadViewModel.ThreadFailure.PhotoConsent, ThreadViewModel.ThreadFailure.PhotoUpload -> R.string.msg_v3_upload_error
}

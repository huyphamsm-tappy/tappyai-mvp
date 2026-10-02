package com.tappyai.app.history

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.personal.V3AccentPill
import com.tappyai.app.personal.V3Chip
import com.tappyai.app.personal.V3EmptyPanel
import com.tappyai.app.personal.V3ErrorLine
import com.tappyai.app.personal.V3GlyphTile
import com.tappyai.app.personal.V3Loading
import com.tappyai.app.personal.V3Panel
import com.tappyai.app.personal.V3PersonalPage
import com.tappyai.app.personal.V3Tone
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyDialog
import com.tappyai.core.designsystem.theme.TappySpacing

/** The web's three period filters: 7 days, 30 days, everything (`Period = 7 | 30 | 0`). */
private val PERIODS = listOf(7, 30, 0)
private const val DAY_MILLIS = 86_400_000L

/**
 * History — the web `/profile/history` (design/v3-phase4 `src/app/profile/history/HistoryView.tsx`),
 * native: the header panel (glyph tile + uppercase HISTORY + tagline), the category chips, the
 * "Đã hỏi AI" section card (count badge, description, conversation rows with the per-row
 * delete), the "Kế hoạch của bạn" card that links to the AI Planner, then — stacked under the
 * list at phone width, as the web does below `lg` — the period selector and the quick stats.
 *
 * 🚨 ONLY THE CATEGORIES THIS CLIENT CAN READ. The web also lists watched videos (read
 * server-side from `review_interactions` — no HTTP route exposes it, so Android cannot) and
 * Scam Shield link checks (the web's own `localStorage`; Android's Scam Shield keeps no local
 * history). Neither is drawn empty or faked; the chips are built from what exists, as on the web.
 *
 * Behaviour is exactly what it was: rows from `GET /api/conversations`, a confirmed optimistic
 * `DELETE`, tap → resume that conversation in Chat, the period filter is client-side.
 */
@Composable
fun ChatHistoryScreen(
    onBack: () -> Unit,
    onStartChat: () -> Unit,
    onResumeConversation: (String) -> Unit,
    onOpenPlanner: (() -> Unit)? = null,
    onOpenExplore: (() -> Unit)? = null,
    viewModel: ChatHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<Conversation?>(null) }
    var period by remember { mutableIntStateOf(0) }
    var showAll by remember { mutableStateOf(false) }

    // The tagline lives in the header panel below, as on the web; the page row keeps just the title.
    V3PersonalPage(title = stringResource(R.string.history_title), subtitle = null, onBack = onBack) {
        // ── Header ──
        V3Panel(padding = 20.dp) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                V3GlyphTile(Icons.Filled.History, HomeV3.Purple, size = 48.dp, radius = 16.dp, iconSize = 24.dp)
                Column {
                    Text(
                        text = stringResource(R.string.history_v3_title),
                        color = HomeV3.OnSurface,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 1.1.sp,
                    )
                    Text(text = stringResource(R.string.history_v3_tagline), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }

        when (val current = state) {
            UiState.Loading, UiState.Idle -> V3Loading(height = 160.dp)
            is UiState.Error -> V3Panel {
                V3ErrorLine(message = current.message, retryText = stringResource(R.string.common_try_again), onRetry = viewModel::retry)
            }
            UiState.Empty -> HistoryEmpty(onStartChat, onOpenExplore)
            is UiState.Success -> {
                val shown = remember(current.data, period, viewModel.now) {
                    if (period == 0) current.data else current.data.filter { viewModel.now - it.updatedAtMillis <= period * DAY_MILLIS }
                }
                // The chips are built from what exists: one real category plus "all" would offer a
                // control that changes nothing, so — as on the web — the row renders only with 2+ tabs.
                if (shown.isEmpty()) {
                    HistoryEmpty(onStartChat, onOpenExplore)
                } else {
                    val visibleRows = if (showAll) shown.take(20) else shown.take(3)
                    SectionCard(
                        icon = Icons.AutoMirrored.Filled.Message,
                        tone = HomeV3.Purple,
                        title = stringResource(R.string.history_v3_ai),
                        description = stringResource(R.string.history_v3_ai_desc),
                        count = shown.size,
                        action = if (shown.size > 3) stringResource(if (showAll) R.string.planner_collapse else R.string.history_v3_all) else null,
                        onAction = { showAll = !showAll },
                    ) {
                        visibleRows.forEach { conv ->
                            ConversationRow(
                                conversation = conv,
                                now = viewModel.now,
                                onOpen = { onResumeConversation(conv.id) },
                                onDelete = { pendingDelete = conv },
                            )
                        }
                    }
                }
                // ── Plans: a link, not a list — the Planner owns that derivation ──
                if (onOpenPlanner != null) {
                    SectionCard(
                        icon = Icons.Filled.CalendarMonth,
                        tone = V3Tone.Amber,
                        title = stringResource(R.string.history_v3_plans),
                        description = stringResource(R.string.history_v3_plans_desc),
                        action = stringResource(R.string.history_v3_plans_open),
                        onAction = onOpenPlanner,
                    )
                }

                // ── Period: a selector, not a chart ──
                V3Panel {
                    Text(text = stringResource(R.string.history_v3_period_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PERIODS.forEach { p ->
                            V3Chip(
                                text = stringResource(
                                    when (p) {
                                        7 -> R.string.history_v3_period_7
                                        30 -> R.string.history_v3_period_30
                                        else -> R.string.history_v3_period_all
                                    },
                                ),
                                selected = period == p,
                                onClick = { period = p },
                            )
                        }
                    }
                }

                // ── Quick stats: the real count over the rows the server returned ──
                V3Panel {
                    Text(text = stringResource(R.string.history_v3_stats_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(modifier = Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(HomeV3.SurfaceVariant), contentAlignment = Alignment.Center) {
                            Icon(Icons.AutoMirrored.Filled.Message, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(15.dp))
                        }
                        Text(text = stringResource(R.string.history_v3_ai), color = HomeV3.OnSurface, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
                        Text(text = shown.size.toString(), color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.Bold)
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

/** Calm and compact; the action goes to a real destination — Explore when wired, else Chat. */
@Composable
private fun HistoryEmpty(onStartChat: () -> Unit, onOpenExplore: (() -> Unit)?) {
    V3EmptyPanel(
        icon = Icons.Filled.History,
        title = stringResource(R.string.history_v3_empty),
        text = stringResource(R.string.history_v3_empty_hint),
        action = {
            if (onOpenExplore != null) V3AccentPill(text = stringResource(R.string.history_v3_empty_action), onClick = onOpenExplore, minHeight = 40.dp)
            else V3AccentPill(text = stringResource(R.string.history_start_chat), onClick = onStartChat, minHeight = 40.dp)
        },
    )
}

/** `SectionCard`: the 44dp toned glyph tile, the title with its count badge, the description, an optional link action, then the rows. */
@Composable
private fun SectionCard(
    icon: ImageVector,
    tone: Color,
    title: String,
    description: String,
    count: Int? = null,
    action: String? = null,
    onAction: (() -> Unit)? = null,
    content: (@Composable () -> Unit)? = null,
) {
    V3Panel {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            V3GlyphTile(icon, tone, size = 44.dp, radius = 16.dp, iconSize = 22.dp)
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(text = title, color = HomeV3.OnSurface, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                    if (count != null) {
                        Text(
                            text = count.toString(),
                            color = HomeV3.OnSurfaceVariant,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clip(CircleShape).background(HomeV3.SurfaceVariant).padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }
                Text(text = description, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 2.dp))
            }
            if (action != null && onAction != null) {
                Row(
                    modifier = Modifier.clip(CircleShape).clickable(onClickLabel = action, onClick = onAction).padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(text = action, color = HomeV3.Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(14.dp))
                }
            }
        }
        if (content != null) {
            Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { content() }
        }
    }
}

/** One conversation row (`rounded-xl p-2.5 bg-panel-elevated`): glyph tile, title, "N tin nhắn · when", the delete. */
@Composable
private fun ConversationRow(
    conversation: Conversation,
    now: Long,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier.fillMaxWidth().clip(shape).background(HomeV3.SurfaceVariant).padding(start = 10.dp, top = 4.dp, bottom = 4.dp, end = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Row(
            modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).clickable(onClick = onOpen).padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            V3GlyphTile(Icons.AutoMirrored.Filled.Message, HomeV3.Purple, size = 36.dp, radius = 10.dp, iconSize = 16.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = conversation.title, color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    text = stringResource(R.string.history_messages_count_time, conversation.messageCount, formatRelativeTime(conversation.updatedAtMillis, now)),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 11.5.sp,
                )
            }
        }
        IconButton(onClick = onDelete) {
            Icon(
                imageVector = Icons.Filled.Delete,
                contentDescription = stringResource(R.string.history_delete_conversation_cd, conversation.title),
                tint = HomeV3.OnSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

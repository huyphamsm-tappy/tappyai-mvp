package com.tappyai.app.chat

import android.app.Activity
import android.content.ActivityNotFoundException
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.net.Uri
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Mood
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonSize
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyChatBubble
import com.tappyai.core.designsystem.component.TappyChatRole
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.component.TappyMarkdown
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.util.Locale
import kotlin.math.ceil

@Composable
fun ChatScreen(viewModel: ChatViewModel = hiltViewModel()) {
    // Lifecycle-aware: an AI reply streams a token at a time, and plain collectAsState() keeps
    // recomposing this (invisible) tree on every token while the app is backgrounded. Pausing at
    // STOPPED stops that churn; the ViewModel's own stream is unaffected either way.
    val messages by viewModel.messages.collectAsStateWithLifecycle()
    val isResponding by viewModel.isAssistantResponding.collectAsStateWithLifecycle()
    val streamingText by viewModel.streamingText.collectAsStateWithLifecycle()
    val isLoadingConversation by viewModel.isLoadingConversation.collectAsStateWithLifecycle()
    val speakingMessageId = viewModel.speakingMessageId
    val feedback by viewModel.feedback.collectAsStateWithLifecycle()
    val dynamicPrompts by viewModel.dynamicPrompts.collectAsStateWithLifecycle()
    val reportedMessageIds by viewModel.reportedMessageIds.collectAsStateWithLifecycle()
    val isListening by viewModel.isListening.collectAsStateWithLifecycle()

    val listState = rememberLazyListState()
    LaunchedEffect(messages.size, isResponding) {
        val itemCount = messages.size + if (isResponding) 1 else 0
        if (itemCount > 0) listState.animateScrollToItem(itemCount - 1)
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
    Column(
        modifier = Modifier
            .widthIn(max = TappyContainers.content)
            .fillMaxWidth()
            .fillMaxHeight()
            .imePadding(),
    ) {
        if (isLoadingConversation) {
            Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                TappyLoadingIndicator()
            }
        } else if (messages.isEmpty() && !isResponding) {
            WelcomeState(
                category = viewModel.category,
                onMoodSelected = viewModel::onMoodSelected,
                onQuickPromptSelected = viewModel::onQuickPromptSelected,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                dynamicPrompts = dynamicPrompts,
            )
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(TappySpacing.xl),
                // Web parity: message list vertical rhythm is space-y-6 = 24px.
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xxxl),
            ) {
                items(items = messages, key = { it.id }) { message ->
                    val isLast = message.id == messages.lastOrNull()?.id
                    when (message.role) {
                        // User bubbles slide up on entry (web: animate-slide-up). Assistant replies
                        // are NOT re-animated on commit — they take over the streaming row's exact
                        // position seamlessly (only the cursor drops + actions/CTA fade in).
                        TappyChatRole.User -> Box(modifier = Modifier.messageAppear()) {
                            TappyChatBubble(role = TappyChatRole.User) {
                            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                                message.imageUri?.let { uri ->
                                    TappyImage(
                                        url = uri.toString(),
                                        contentDescription = null,
                                        modifier = Modifier
                                            .size(160.dp)
                                            .clip(TappyShapes.card),
                                    )
                                }
                                if (message.text.isNotBlank()) Text(message.text)
                            }
                            }
                        }
                        TappyChatRole.Assistant -> Row(
                            modifier = Modifier.fillMaxWidth(),
                            // Web parity: avatar↔text gap is gap-3 = 12px.
                            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
                        ) {
                          // Per-message mascot avatar (web parity: <TappyAvatar> beside each reply).
                          Image(
                              painter = painterResource(viewModel.category.mascot),
                              contentDescription = null,
                              modifier = Modifier
                                  .padding(top = 2.dp)
                                  .size(32.dp),
                          )
                          Column(modifier = Modifier.weight(1f)) {
                            // ONE bubble whose content interleaves markdown and inline photo
                            // galleries in stream order (web parity: formatMessage renders each run
                            // of image lines as a strip AT ITS POSITION, inside the bubble — a
                            // recommendation's photos belong to its block, never appended after the
                            // whole text). Restored/error messages have no segments → plain text.
                            val segments = message.segments.ifEmpty {
                                if (message.text.isNotBlank()) listOf(ReplySegment.Text(message.text)) else emptyList()
                            }
                            if (segments.isNotEmpty()) {
                                TappyChatBubble(role = TappyChatRole.Assistant) {
                                    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                                        segments.forEach { segment ->
                                            when (segment) {
                                                is ReplySegment.Text -> TappyMarkdown(segment.markdown)
                                                is ReplySegment.Images -> ChatImageCarousel(segment.urls)
                                            }
                                        }
                                    }
                                }
                            }
                            message.plan?.let { plan -> TripPlanCard(plan) }
                            if (!isResponding && !message.isError) {
                                Box(modifier = Modifier.fadeIn()) {
                                    MessageActionBar(
                                        text = message.text,
                                        messageId = message.id,
                                        isLastMessage = isLast,
                                        isSpeaking = speakingMessageId == message.id,
                                        feedback = feedback[message.id],
                                        isReported = message.id in reportedMessageIds,
                                        onToggleSpeak = { spokenText -> viewModel.onToggleSpeak(message.id, spokenText) },
                                        onToggleFeedback = { type -> viewModel.onToggleFeedback(message.id, type) },
                                        onReport = { viewModel.onReportMessage(message.id) },
                                        onRegenerate = viewModel::onRegenerate,
                                    )
                                }
                            }
                            // TTS player bar (web parity): the scrubber shown while THIS message reads
                            // aloud — play/pause, ±15s skip, elapsed + progress, speed, close.
                            if (speakingMessageId == message.id) {
                                TtsPlayerBar(
                                    mascot = viewModel.category.mascot,
                                    isPaused = viewModel.ttsIsPaused,
                                    speed = viewModel.ttsSpeed,
                                    elapsedSec = viewModel.ttsElapsedSec,
                                    progress = viewModel.ttsProgress,
                                    onPauseResume = viewModel::onTtsPauseResume,
                                    onSkip = viewModel::onTtsSkip,
                                    onCycleSpeed = viewModel::onTtsCycleSpeed,
                                    onClose = viewModel::onStopSpeak,
                                )
                            }
                            // Save-place affordance (web SavePlaceButton) — appears when the reply
                            // mentions a place; saves it to favorites.
                            if (!isResponding && !message.isError) {
                                SavePlaceButton(
                                    text = message.text,
                                    buttons = message.ctaButtons,
                                    onSaveFavorite = viewModel::addFavorite,
                                )
                            }
                            // An error bubble hides the full action bar above (like/dislike/report
                            // make no sense for a failed generation), but still needs a way back in —
                            // onRegenerate() already handles "last message is an error" correctly
                            // (drops it and re-sends the same history), this was just never reachable.
                            if (!isResponding && message.isError && isLast) {
                                TappyButton(
                                    text = stringResource(R.string.chat_action_regenerate),
                                    onClick = viewModel::onRegenerate,
                                    variant = TappyButtonVariant.Ghost,
                                    size = TappyButtonSize.Small,
                                    leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                )
                            }
                            // CTA buttons (maps/call/booking/internal_booking…) — web parity, shown
                            // under the reply once generation is done.
                            if (message.ctaButtons.isNotEmpty() && !isResponding) {
                                Box(modifier = Modifier.fadeIn()) {
                                    ChatCtaButtons(
                                        buttons = message.ctaButtons,
                                        onSaveFavorite = viewModel::addFavorite,
                                        onRemoveFavorite = viewModel::removeFavorite,
                                    )
                                }
                            }
                            if (message.followups.isNotEmpty() && isLast && !isResponding) {
                                FollowupChips(
                                    followups = message.followups,
                                    onSelect = viewModel::onFollowupSelected,
                                )
                            }
                          }
                        }
                    }
                }
                if (isResponding) {
                    item(key = "assistant-responding") {
                        AssistantStreamingRow(
                            mascot = viewModel.category.mascot,
                            streamingText = streamingText,
                        )
                    }
                }
            }
        }

        val context = LocalContext.current
        // In-app voice input (mirrors the web mic): request RECORD_AUDIO, then the ViewModel's
        // SpeechRecognizer drives live transcript + auto-send.
        val audioPermission = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission(),
        ) { granted -> if (granted) viewModel.startVoiceInput() }

        viewModel.pendingImageUri?.let { uri ->
            PendingImagePreview(uri = uri, onClear = viewModel::onClearPendingImage)
        }

        // Quick prompt chips (web parity: the 4 static action chips above the composer —
        // ChatInterface "Action chips" row). Always visible, disabled while responding.
        ChatActionChips(
            isResponding = isResponding,
            onSend = viewModel::onQuickPromptSelected,
            onPrefill = viewModel::onInputChange,
        )

        ChatComposer(
            input = viewModel.input,
            isResponding = isResponding,
            hasPendingImage = viewModel.pendingImageUri != null,
            onInputChange = viewModel::onInputChange,
            onEmojiPicked = viewModel::onEmojiPicked,
            onSend = viewModel::onSend,
            onStop = viewModel::onStop,
            isListening = isListening,
            onVoice = {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED
                ) {
                    viewModel.startVoiceInput()
                } else {
                    audioPermission.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
        )
    }
    }

}

@Composable
private fun WelcomeState(
    category: ChatCategory,
    onMoodSelected: (MoodChip) -> Unit,
    onQuickPromptSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    dynamicPrompts: List<String> = emptyList(),
) {
    // General category shows the backend's dynamic, time/memory-aware prompts when available;
    // specific categories (and the general fallback) use the static starter prompts.
    val prompts = if (category == ChatCategory.General && dynamicPrompts.isNotEmpty()) {
        dynamicPrompts
    } else {
        quickPrompts(category)
    }

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(TappySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        item {
            Spacer(Modifier.height(48.dp))
        }
        // Hero mascot — the owner's Otter pose for this category (mirrors the web welcome hero's
        // <TappyMascot pose={getTappyPose({category})} size={80} />). Art lives in res/drawable-nodpi.
        item {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                Image(
                    painter = painterResource(category.mascot),
                    contentDescription = category.label(),
                    modifier = Modifier.size(96.dp),
                )
                Text(
                    text = category.label(),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(R.string.chat_welcome_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Mood chips
        item {
            MoodChipsRow(onMoodSelected = onMoodSelected)
        }

        // Quick prompts
        item {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                prompts.forEach { prompt ->
                    QuickPromptCard(
                        text = prompt,
                        onClick = { onQuickPromptSelected(prompt) },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MoodChipsRow(onMoodSelected: (MoodChip) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.chat_mood_prompt_header),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            modifier = Modifier.fillMaxWidth(),
        ) {
            moodChips().forEach { mood ->
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .clickable { onMoodSelected(mood) }
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(text = mood.emoji, fontSize = 24.sp)
                    Text(
                        text = mood.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickPromptCard(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

// Web parity: follow-up chips are fully-rounded gray pills that WRAP (flex-wrap), pop in with a
// 70ms-per-index stagger, and immediately send on tap. (Web: bg-gray-100 border-gray-200
// text-gray-600 rounded-full text-xs font-medium px-3 py-1.5, animate-pop-in.)
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FollowupChips(
    followups: List<String>,
    onSelect: (String) -> Unit,
) {
    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.lg), // mt-3 = 12px
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // gap-2 = 8px
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        followups.forEachIndexed { index, chip ->
            FollowupChip(text = chip, index = index, onClick = { onSelect(chip) })
        }
    }
}

private val PopInEasing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

@Composable
private fun FollowupChip(text: String, index: Int, onClick: () -> Unit) {
    // pop-in: scale(0.92) translateY(4px) opacity0 -> scale(1) translateY(0) opacity1, staggered.
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(index * 70L)
        appeared = true
    }
    val progress by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = 280, easing = PopInEasing),
        label = "chip-pop$index",
    )
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .graphicsLayer {
                val s = 0.92f + 0.08f * progress
                scaleX = s
                scaleY = s
                translationY = (1f - progress) * 4.dp.toPx()
                alpha = progress
            }
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm), // px-3 py-1.5 = 12/6
    )
}

@Composable
private fun PendingImagePreview(uri: Uri, onClear: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Box {
            TappyImage(
                url = uri.toString(),
                contentDescription = null,
                modifier = Modifier
                    .size(64.dp)
                    .clip(TappyShapes.card),
            )
            IconButton(
                onClick = onClear,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f)),
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = stringResource(R.string.chat_clear_pending_image),
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun ChatComposer(
    input: String,
    isResponding: Boolean,
    hasPendingImage: Boolean,
    isListening: Boolean,
    onInputChange: (String) -> Unit,
    onEmojiPicked: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    onVoice: () -> Unit,
) {
    val canSend = input.isNotBlank() || hasPendingImage
    // Web parity: the composer's Smile button toggles an emoji panel; picking one inserts it
    // into the draft and closes the panel (ChatInterface `showEmojiPanel` + `insertEmoji`).
    var showEmojiPanel by remember { mutableStateOf(false) }
    Column {
        HorizontalDivider()
        if (showEmojiPanel) {
            EmojiPanel(onPick = { emoji ->
                showEmojiPanel = false
                onEmojiPicked(emoji)
            })
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            // Attach button hidden for MVP — AI Chat is text-only, matching the web
            // (ChatInterface: "Camera button hidden for MVP"). The staged-image plumbing
            // (pendingImageUri → preview → vision send) stays dormant like the web's hidden
            // file input, so re-enabling is a one-button change on both platforms.
            TappyTextField(
                value = input,
                onValueChange = onInputChange,
                placeholder = stringResource(R.string.chat_composer_placeholder),
                singleLine = false,
                maxLines = 6,
                modifier = Modifier.weight(1f),
            )
            // Emoji toggle — sits between the input and the mic, mirroring the web control order
            // (textarea → emoji → mic → send). Tinted while the panel is open (web accent state).
            IconButton(onClick = { showEmojiPanel = !showEmojiPanel }) {
                Icon(
                    imageVector = Icons.Filled.Mood,
                    contentDescription = stringResource(R.string.chat_action_emoji),
                    tint = if (showEmojiPanel) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Mic: while listening, it pulses red so the user can clearly tell recording is active
            // (mirrors the web's `isListening` state); tapping again stops.
            val micPulse by rememberInfiniteTransition(label = "mic").animateFloat(
                initialValue = 1f,
                targetValue = 1.3f,
                animationSpec = infiniteRepeatable(tween(600), RepeatMode.Reverse),
                label = "mic-scale",
            )
            IconButton(onClick = onVoice) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = stringResource(
                        if (isListening) R.string.chat_action_voice_stop else R.string.chat_action_voice_input,
                    ),
                    tint = if (isListening) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = if (isListening) Modifier.scale(micPulse) else Modifier,
                )
            }
            if (isResponding) {
                IconButton(onClick = onStop) {
                    Icon(
                        imageVector = Icons.Filled.Stop,
                        contentDescription = stringResource(R.string.chat_action_stop),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            } else {
                IconButton(onClick = onSend, enabled = canSend) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.chat_action_send),
                        tint = if (canSend) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                }
            }
        }
    }
}

/**
 * The web action-chip palettes — tailwind LIGHT-mode values, verbatim: chip 1 primary-50/600/200
 * (tailwind.config.ts custom palette), chip 2 accent-50/600/200, chips 3–4 tailwind default
 * blue/green 50/600/200. The chat shell renders light on Android (only Reviews is dark), so the
 * dark variants are deliberately not ported.
 */
private data class ChipColors(val bg: Color, val fg: Color, val border: Color)

private val ChipNearbyColors = ChipColors(Color(0xFFE5F1FF), Color(0xFF0062CC), Color(0xFF99C8FF))
private val ChipTonightColors = ChipColors(Color(0xFFFFF4E5), Color(0xFFCC7700), Color(0xFFFFD399))
private val ChipTripColors = ChipColors(Color(0xFFEFF6FF), Color(0xFF2563EB), Color(0xFFBFDBFE))
private val ChipPriceColors = ChipColors(Color(0xFFF0FDF4), Color(0xFF16A34A), Color(0xFFBBF7D0))

/**
 * The 4 static quick-prompt chips above the composer — a 1:1 port of the web's "Action chips" row
 * (ChatInterface.tsx; the web hardcodes these 4 buttons, there is no shared dynamic source):
 *  1. 📍 Nearby   → SENDS the nearby prompt. Web first best-effort resolves GPS and stores it for
 *     the request's location context; the Android chat request carries no location field yet, so
 *     here the chip sends the same prompt without a GPS lookup (gap noted for the location epic).
 *  2. 🌙 Tonight  → SENDS the full "plan my evening" prompt.
 *  3. ✈️ Trip     → PREFILLS the input with "Lịch trình ".
 *  4. 🎯 Price    → PREFILLS the input with "Tappy theo dõi ".
 * Row scrolls horizontally (web overflow-x-auto), chips are pills with per-chip tinted palettes,
 * and everything disables at 40% opacity while a reply streams (web disabled:opacity-40).
 */
@Composable
private fun ChatActionChips(
    isResponding: Boolean,
    onSend: (String) -> Unit,
    onPrefill: (String) -> Unit,
) {
    val chips = listOf(
        Triple(R.string.chat_chip_nearby, ChipNearbyColors, stringResource(R.string.chat_chip_nearby_prompt) to true),
        Triple(R.string.chat_chip_tonight, ChipTonightColors, stringResource(R.string.chat_chip_tonight_prompt) to true),
        Triple(R.string.chat_chip_trip, ChipTripColors, stringResource(R.string.chat_chip_trip_prefill) to false),
        Triple(R.string.chat_chip_price_watch, ChipPriceColors, stringResource(R.string.chat_chip_price_watch_prefill) to false),
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // web gap-2 = 8px
    ) {
        chips.forEach { (labelRes, colors, action) ->
            val (text, sends) = action
            Box(
                modifier = Modifier
                    .alpha(if (isResponding) 0.4f else 1f) // web disabled:opacity-40
                    .clip(CircleShape) // web rounded-full
                    .background(colors.bg)
                    .border(1.dp, colors.border, CircleShape)
                    .clickable(enabled = !isResponding) { if (sends) onSend(text) else onPrefill(text) }
                    .padding(horizontal = 12.dp, vertical = 6.dp), // web px-3 py-1.5
            ) {
                Text(
                    text = stringResource(labelRes),
                    fontSize = 12.sp, // web text-xs
                    fontWeight = FontWeight.Medium,
                    color = colors.fg,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * The 30 composer emojis — byte-identical to the web `EMOJIS` list (ChatInterface.tsx), in the
 * same 6-per-row order. Any edit must land on both platforms in the same change.
 */
private val COMPOSER_EMOJIS = listOf(
    "😀", "😄", "😂", "🤣", "😊", "😍",
    "🥰", "😘", "😎", "🤩", "😋", "😅",
    "😳", "😬", "🙈", "🤭", "🤔", "😏",
    "😢", "😭", "😞", "😤", "😡", "😱",
    "👍", "❤️", "🙏", "🎉", "🔥", "💯",
)

/**
 * The web emoji panel (ChatInterface "Chọn biểu cảm" card): header + a 6-column grid of
 * [COMPOSER_EMOJIS]; tapping one inserts it and closes the panel. Web floats a w-64 card above
 * the composer; here the same card renders in-flow right above the input row, end-aligned.
 */
@Composable
private fun EmojiPanel(onPick: (String) -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        contentAlignment = Alignment.CenterEnd,
    ) {
        Column(
            modifier = Modifier
                .width(256.dp) // web w-64
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                .padding(TappySpacing.lg), // web p-3
        ) {
            Text(
                text = stringResource(R.string.chat_emoji_panel_title).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.sp, // web tracking-wide
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = TappySpacing.md), // web mb-2
            )
            COMPOSER_EMOJIS.chunked(6).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs)) { // web gap-1
                    row.forEach { emoji ->
                        Box(
                            modifier = Modifier
                                .size(36.dp) // web w-9 h-9
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onPick(emoji) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(text = emoji, fontSize = 20.sp) // web text-xl
                        }
                    }
                }
            }
        }
    }
}

/**
 * Read-aloud scrubber shown while a message speaks — web parity `MessageActionBar` TTS player.
 * mascot · play/pause · «15 / 15» skip · elapsed · progress · speed(1/1.5/2×) · close.
 */
@Composable
private fun TtsPlayerBar(
    mascot: Int,
    isPaused: Boolean,
    speed: Float,
    elapsedSec: Int,
    progress: Float,
    onPauseResume: () -> Unit,
    onSkip: (Int) -> Unit,
    onCycleSpeed: () -> Unit,
    onClose: () -> Unit,
) {
    val onSurfaceVariant = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.md) // mt-2 = 8px
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md), // px-3 py-2
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), // gap-1.5 = 6px
    ) {
        Image(painter = painterResource(mascot), contentDescription = null, modifier = Modifier.size(24.dp))
        IconButton(onClick = onPauseResume, modifier = Modifier.size(28.dp)) {
            Icon(
                imageVector = if (isPaused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
        Text(
            text = "«15",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = onSurfaceVariant,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { onSkip(-15) }.padding(2.dp),
        )
        Text(
            text = "15»",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = onSurfaceVariant,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { onSkip(15) }.padding(2.dp),
        )
        Text(
            text = formatMinSec(elapsedSec),
            style = MaterialTheme.typography.bodySmall,
            color = onSurfaceVariant,
            modifier = Modifier.widthIn(min = 32.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(4.dp)
                .clip(CircleShape)
                .background(onSurfaceVariant.copy(alpha = 0.3f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
        Text(
            text = speedLabel(speed) + "x",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable { onCycleSpeed() }
                .padding(horizontal = TappySpacing.sm, vertical = 2.dp)
                .widthIn(min = 28.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        IconButton(onClick = onClose, modifier = Modifier.size(24.dp)) {
            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.chat_action_stop_read_aloud), modifier = Modifier.size(14.dp), tint = onSurfaceVariant)
        }
    }
}

private fun formatMinSec(totalSec: Int): String {
    val s = totalSec.coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}

private fun speedLabel(speed: Float): String = when (speed) {
    1.5f -> "1.5"
    2f -> "2"
    else -> "1"
}

/**
 * The in-flight assistant reply. Mirrors the real assistant Row (mascot avatar + text column) so the
 * committed message takes over its exact position seamlessly. Before the first token it shows the
 * thinking dots + a rotating hint (web parity — no skeleton); once text arrives it renders the smooth
 * typewriter reveal + a blinking cursor.
 */
@Composable
private fun AssistantStreamingRow(mascot: Int, streamingText: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .messageAppear(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg), // gap-3 = 12px
    ) {
        Image(
            painter = painterResource(mascot),
            contentDescription = null,
            modifier = Modifier
                .padding(top = 2.dp)
                .size(32.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            val smooth = rememberSmoothText(streamingText, active = true)
            if (smooth.isEmpty()) {
                Row(
                    modifier = Modifier.height(28.dp), // web h-7
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // gap-2 = 8px
                ) {
                    TypingDots()
                    Text(
                        text = rememberRotatingHint(),
                        style = MaterialTheme.typography.bodySmall, // text-xs
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                StreamingMarkdown(smooth)
            }
        }
    }
}

/**
 * The streaming reply rendered live (same bubble/typography as the final message) with a blinking ▋
 * cursor — web parity `streaming-cursor`. The snapshot is segmented every frame, so each
 * recommendation's photo gallery appears inline AT ITS POSITION while later text is still
 * streaming below it (web: formatMessage over the accumulated stream). A half-arrived trailing
 * `![…](…` is hidden until complete so raw URLs never flash mid-typewriter; the cursor rides the
 * last text segment (or stands alone right after a gallery).
 */
@Composable
private fun StreamingMarkdown(text: String) {
    val cursorOn = rememberCursorBlink()
    val segments = ChatResponseParser.segment(ChatResponseParser.trimPartialImage(text))
    TappyChatBubble(role = TappyChatRole.Assistant) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            if (segments.isEmpty()) {
                TappyMarkdown(if (cursorOn) "▋" else "")
            } else {
                segments.forEachIndexed { index, segment ->
                    val isLast = index == segments.lastIndex
                    when (segment) {
                        is ReplySegment.Text ->
                            TappyMarkdown(if (isLast && cursorOn) "${segment.markdown}▋" else segment.markdown)
                        is ReplySegment.Images -> {
                            ChatImageCarousel(segment.urls)
                            if (isLast) TappyMarkdown(if (cursorOn) "▋" else "")
                        }
                    }
                }
            }
        }
    }
}

/**
 * Web parity: `useSmoothText`. Reveals [target] a few chars per frame — `max(2, ceil(backlog/8))` —
 * so bursty network chunks turn into a smooth typewriter instead of jumping in blocks. Snaps to the
 * full text when [active] becomes false; resets to empty when the target shrinks (new message).
 */
@Composable
private fun rememberSmoothText(target: String, active: Boolean): String {
    val latestTarget = rememberUpdatedState(target)
    var shown by remember { mutableStateOf(if (active) "" else target) }
    LaunchedEffect(active) {
        if (!active) {
            shown = latestTarget.value
            return@LaunchedEffect
        }
        while (isActive) {
            val t = latestTarget.value
            shown = when {
                shown.length > t.length -> ""
                shown.length < t.length -> {
                    val gap = t.length - shown.length
                    val step = maxOf(2, ceil(gap / 8.0).toInt())
                    t.substring(0, minOf(t.length, shown.length + step))
                }
                else -> shown
            }
            withFrameNanos { }
        }
    }
    return shown
}

/** Rotating "thinking" hint, cycled every 1800ms (web parity THINK_HINTS). */
@Composable
private fun rememberRotatingHint(): String {
    val hints = listOf(
        stringResource(R.string.chat_think_hint_1),
        stringResource(R.string.chat_think_hint_2),
        stringResource(R.string.chat_think_hint_3),
    )
    var index by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(1800L)
            index = (index + 1) % hints.size
        }
    }
    return hints[index]
}

/** 1s step-end blink for the streaming cursor (web `@keyframes blink`). */
@Composable
private fun rememberCursorBlink(): Boolean {
    var on by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(500L)
            on = !on
        }
    }
    return on
}

/** Pre-first-token dots — web `pulseDot`: 6px circles, scale 0↔1 over 1.4s, staggered 0.2s/0.4s. */
@Composable
private fun TypingDots() {
    val transition = rememberInfiniteTransition(label = "typing")
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) { index ->
            val scale by transition.animateFloat(
                initialValue = 0f,
                targetValue = 0f,
                animationSpec = infiniteRepeatable(
                    animation = keyframes {
                        durationMillis = 1400
                        0f at 0
                        1f at 560
                        0f at 1120
                        0f at 1400
                    },
                    repeatMode = RepeatMode.Restart,
                    initialStartOffset = StartOffset(index * 200),
                ),
                label = "dot$index",
            )
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        alpha = 0.5f + 0.5f * scale
                    }
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onSurfaceVariant),
            )
        }
    }
}

/** Web `animate-slide-up`: translateY(10px)→0 + fade, 0.3s ease-out, once on first appearance. */
@Composable
private fun Modifier.messageAppear(): Modifier {
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val progress by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = 300, easing = LinearOutSlowInEasing),
        label = "msg-appear",
    )
    return this.graphicsLayer {
        alpha = progress
        translationY = (1f - progress) * 10.dp.toPx()
    }
}

/** Web `animate-fade-in`: opacity 0→1 over 0.2s, once on first appearance. */
@Composable
private fun Modifier.fadeIn(): Modifier {
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val a by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = 200),
        label = "fade-in",
    )
    return this.graphicsLayer { alpha = a }
}

package com.tappyai.app.chat

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
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
import com.tappyai.core.designsystem.component.TappySkeleton
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import java.util.Locale

@Composable
fun ChatScreen(viewModel: ChatViewModel = hiltViewModel()) {
    // Lifecycle-aware: an AI reply streams a token at a time, and plain collectAsState() keeps
    // recomposing this (invisible) tree on every token while the app is backgrounded. Pausing at
    // STOPPED stops that churn; the ViewModel's own stream is unaffected either way.
    val messages by viewModel.messages.collectAsStateWithLifecycle()
    val isResponding by viewModel.isAssistantResponding.collectAsStateWithLifecycle()
    val isLoadingConversation by viewModel.isLoadingConversation.collectAsStateWithLifecycle()
    val speakingMessageId = viewModel.speakingMessageId
    val feedback by viewModel.feedback.collectAsStateWithLifecycle()
    val dynamicPrompts by viewModel.dynamicPrompts.collectAsStateWithLifecycle()
    val reportedMessageIds by viewModel.reportedMessageIds.collectAsStateWithLifecycle()

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
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                items(items = messages, key = { it.id }) { message ->
                    val isLast = message.id == messages.lastOrNull()?.id
                    when (message.role) {
                        TappyChatRole.User -> TappyChatBubble(role = TappyChatRole.User) {
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
                        TappyChatRole.Assistant -> Column {
                            TappyChatBubble(role = TappyChatRole.Assistant) {
                                TappyMarkdown(message.text)
                            }
                            if (!isResponding && !message.isError) {
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
                            if (message.followups.isNotEmpty() && isLast && !isResponding) {
                                FollowupChips(
                                    followups = message.followups,
                                    onSelect = viewModel::onFollowupSelected,
                                )
                            }
                        }
                    }
                }
                if (isResponding) {
                    item(key = "assistant-responding") {
                        TappyChatBubble(role = TappyChatRole.Assistant) {
                            AssistantRespondingContent()
                        }
                    }
                }
            }
        }

        val context = LocalContext.current
        val pickImage = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.PickVisualMedia(),
        ) { uri -> uri?.let(viewModel::onImagePicked) }

        val voiceRecognitionFailedMessage = stringResource(R.string.chat_voice_recognition_failed)
        val recognizeSpeech = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (spoken != null) {
                viewModel.onInputChange(if (viewModel.input.isBlank()) spoken else "${viewModel.input} $spoken")
            } else if (result.resultCode != Activity.RESULT_CANCELED) {
                Toast.makeText(context, voiceRecognitionFailedMessage, Toast.LENGTH_SHORT).show()
            }
        }

        viewModel.pendingImageUri?.let { uri ->
            PendingImagePreview(uri = uri, onClear = viewModel::onClearPendingImage)
        }

        ChatComposer(
            input = viewModel.input,
            isResponding = isResponding,
            hasPendingImage = viewModel.pendingImageUri != null,
            onInputChange = viewModel::onInputChange,
            onSend = viewModel::onSend,
            onStop = viewModel::onStop,
            onAttach = {
                pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            },
            onVoice = {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.forLanguageTag(viewModel.speechLocaleTag))
                }
                try {
                    recognizeSpeech.launch(intent)
                } catch (_: ActivityNotFoundException) {
                    Toast.makeText(context, voiceRecognitionFailedMessage, Toast.LENGTH_SHORT).show()
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
        // Hero emoji placeholder (will be replaced by Tappy mascot art)
        item {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = category.emoji,
                        fontSize = 40.sp,
                    )
                }
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

@Composable
private fun FollowupChips(
    followups: List<String>,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        items(followups) { chip ->
            AssistChip(
                onClick = { onSelect(chip) },
                label = { Text(chip, style = MaterialTheme.typography.labelMedium) },
            )
        }
    }
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
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    onAttach: () -> Unit,
    onVoice: () -> Unit,
) {
    val canSend = input.isNotBlank() || hasPendingImage
    Column {
        HorizontalDivider()
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            IconButton(onClick = onAttach) {
                Icon(
                    imageVector = Icons.Filled.AttachFile,
                    contentDescription = stringResource(R.string.chat_action_attach_image),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TappyTextField(
                value = input,
                onValueChange = onInputChange,
                placeholder = stringResource(R.string.chat_composer_placeholder),
                singleLine = false,
                maxLines = 6,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onVoice) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = stringResource(R.string.chat_action_voice_input),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
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

@Composable
private fun AssistantRespondingContent() {
    var streaming by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(TYPING_TO_STREAMING_MS)
        streaming = true
    }
    if (streaming) StreamingPlaceholder() else TypingIndicator()
}

@Composable
private fun TypingIndicator() {
    val transition = rememberInfiniteTransition(label = "typing")
    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
        repeat(3) { index ->
            val alpha by transition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 600, delayMillis = index * 150),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "dot$index",
            )
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha)),
            )
        }
    }
}

@Composable
private fun StreamingPlaceholder() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        listOf(1f, 0.95f, 0.6f).forEach { fraction ->
            Box(modifier = Modifier.fillMaxWidth(fraction)) {
                TappySkeleton(height = 14.dp)
            }
        }
    }
}

private const val TYPING_TO_STREAMING_MS = 900L

package com.tappyai.app.chat

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.tappyai.core.designsystem.theme.tappyCategoryColors
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.launch
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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

    // Device location for chat search bias (web parity): use it if already granted, otherwise ask
    // once on entry (mirrors the web's on-mount geolocation prompt). Fully optional — chat works
    // without it, so a denial just means no location bias.
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result -> if (result.values.any { it }) viewModel.refreshLocation() }
    LaunchedEffect(Unit) {
        if (viewModel.hasLocationPermission()) {
            viewModel.refreshLocation()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION),
            )
        }
    }
    val isLoadingConversation by viewModel.isLoadingConversation.collectAsStateWithLifecycle()
    val speakingMessageId = viewModel.speakingMessageId
    val feedback by viewModel.feedback.collectAsStateWithLifecycle()
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
                                // While streaming with nothing revealed yet, show the typing/searching
                                // indicator inside the bubble; otherwise reveal the (growing) text.
                                if (message.streaming && message.text.isBlank()) {
                                    AssistantRespondingContent()
                                } else {
                                    TappyMarkdown(message.text)
                                }
                            }
                            // [TAPPY_PLAN] itinerary card, rendered from the parsed plan (web parity).
                            message.plan?.let { plan ->
                                Spacer(modifier = Modifier.size(TappySpacing.sm))
                                TripPlanCard(plan = plan)
                            }
                            if (message.ctaButtons.isNotEmpty()) {
                                CtaButtonsRow(buttons = message.ctaButtons)
                            }
                            // "Save place" affordance (web SavePlaceButton) on completed replies.
                            if (!message.streaming && !message.isError && message.text.isNotBlank()) {
                                SavePlaceButton(
                                    detectedName = detectFirstPlaceName(message.text, message.ctaButtons),
                                    onSave = { name -> viewModel.savePlace(name) },
                                )
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
                // The pre-first-token indicator now lives inside the streaming assistant message
                // (see the Assistant branch above), so no separate bottom "responding" item is
                // needed — that would double up with the streaming bubble.
            }
        }

        val context = LocalContext.current
        val voiceRecognitionFailedMessage = stringResource(R.string.chat_voice_recognition_failed)
        val recognizeSpeech = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (spoken != null) {
                // Web parity (ChatInterface.tsx `recognition.onresult` + `onend`): the transcript is
                // appended to the composer and then auto-sends after a short, cancellable window.
                // Previously this only filled the composer, so a dictated message never sent itself.
                viewModel.onVoiceResult(spoken)
            } else if (result.resultCode != Activity.RESULT_CANCELED) {
                Toast.makeText(context, voiceRecognitionFailedMessage, Toast.LENGTH_SHORT).show()
            }
        }

        viewModel.pendingImageUri?.let { uri ->
            PendingImagePreview(uri = uri, onClear = viewModel::onClearPendingImage)
        }

        // Web parity (ChatInterface.tsx action chips): a scrollable row above the composer.
        ChatActionChips(
            enabled = !isResponding,
            onSendPrompt = viewModel::onQuickPromptSelected,
            onPrefill = viewModel::onInputChange,
        )

        // Web parity (ChatInterface.tsx voice status line): while a dictated turn is queued the user
        // gets a tappable notice that stops the send and hands the text back for editing.
        val composerFocus = remember { FocusRequester() }
        if (viewModel.voiceAutoSendPending) {
            VoiceAutoSendNotice(
                onCancel = {
                    viewModel.cancelVoiceAutoSend()
                    composerFocus.requestFocus()
                },
            )
        }

        ChatComposer(
            input = viewModel.input,
            isResponding = isResponding,
            hasPendingImage = viewModel.pendingImageUri != null,
            focusRequester = composerFocus,
            onInputChange = viewModel::onInputChange,
            onSend = viewModel::onSend,
            onStop = viewModel::onStop,
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
) {
    val prompts = quickPrompts(category)

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(TappySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        item {
            Spacer(Modifier.height(48.dp))
        }
        // Hero: the official Tappy mascot pose for this category (was a 🤖 emoji stand-in, the same
        // fallback the web's <TappyMascot> uses until the art exists). Container size, shape,
        // background and spacing are unchanged — only the glyph became the artwork.
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
                    Image(
                        painter = painterResource(category.mascotRes),
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
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

/**
 * Web-parity-sync fix: renders the model's `[CTA_BUTTONS]` recommendations as real tappable
 * buttons — mirrors `ChatInterface.tsx`'s CTA rendering (primary = filled, secondary =
 * outlined). The prompt (`promptBuilder.ts`) explicitly forbids the model from ever emitting
 * `type="internal_booking"` — every button in practice links to an external platform — so every
 * button opens externally via [Intent.ACTION_VIEW], same degrade-on-no-handler pattern already
 * used by Maps' external links.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SavePlaceButton(detectedName: String, onSave: suspend (String) -> Boolean) {
    var open by remember { mutableStateOf(false) }
    var name by remember(detectedName) { mutableStateOf(detectedName) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    when {
        saved -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            Icon(Icons.Filled.Check, contentDescription = null, tint = Color(0xFF4CAF50), modifier = Modifier.size(16.dp))
            Text(stringResource(R.string.chat_save_place_saved), style = MaterialTheme.typography.labelMedium, color = Color(0xFF4CAF50))
        }
        open -> Row(
            modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TappyTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = stringResource(R.string.chat_save_place_hint),
                modifier = Modifier.weight(1f),
            )
            TappyButton(
                text = stringResource(R.string.chat_save_place_action),
                onClick = {
                    if (name.isBlank() || saving) return@TappyButton
                    scope.launch {
                        saving = true
                        saved = onSave(name)
                        saving = false
                    }
                },
                enabled = !saving && name.isNotBlank(),
                size = TappyButtonSize.Small,
            )
        }
        else -> TappyButton(
            text = stringResource(R.string.chat_save_place),
            onClick = { open = true },
            variant = TappyButtonVariant.Ghost,
            size = TappyButtonSize.Small,
            leadingIcon = { Icon(Icons.Filled.BookmarkBorder, contentDescription = null, modifier = Modifier.size(16.dp)) },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CtaButtonsRow(buttons: List<ChatCtaButton>) {
    val context = LocalContext.current
    FlowRow(
        modifier = Modifier.padding(top = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        buttons.forEach { button ->
            TappyButton(
                text = button.label,
                onClick = {
                    try {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(button.url)))
                    } catch (_: ActivityNotFoundException) {
                        // No app/browser installed to handle it — no-op, same degrade pattern
                        // used elsewhere for external links.
                    }
                },
                variant = if (button.primary) TappyButtonVariant.Primary else TappyButtonVariant.Secondary,
                size = TappyButtonSize.Small,
            )
        }
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

// Web parity (ChatInterface.tsx EMOJIS): the composer emoji-panel character set, same order.
private val CHAT_EMOJIS = listOf(
    "😀", "😄", "😂", "🤣", "😊", "😍",
    "🥰", "😘", "😎", "🤩", "😋", "😅",
    "😳", "😬", "🙈", "🤭", "🤔", "😏",
    "😢", "😭", "😞", "😤", "😡", "😱",
    "👍", "❤️", "🙏", "🎉", "🔥", "💯",
)

/**
 * The voice grace-window notice — the web's `!isListening && pendingSend` status button
 * (`ChatInterface.tsx`): same orange accent as the mic, same "tap to edit before it sends" affordance.
 * Android has no listening/error counterparts because the system `RecognizerIntent` dialog owns both
 * of those states (it shows its own "listening" UI and its own "didn't catch that" retry).
 */
@Composable
private fun VoiceAutoSendNotice(onCancel: () -> Unit) {
    Row(
        modifier = Modifier
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs)
            .clip(TappyShapes.pill)
            .background(TAPPY_MIC_ORANGE.copy(alpha = 0.12f))
            .clickable(onClick = onCancel)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(TAPPY_MIC_ORANGE),
        )
        Text(
            text = stringResource(R.string.chat_voice_auto_send_pending),
            style = MaterialTheme.typography.labelSmall,
            color = TAPPY_MIC_ORANGE,
        )
    }
}

/** Web parity (ChatInterface.tsx "Nút microphone màu cam #FF9500"): Tappy's mic accent, shared by
 *  the idle mic button and the voice auto-send notice. */
private val TAPPY_MIC_ORANGE = Color(0xFFFF9500)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChatComposer(
    input: String,
    isResponding: Boolean,
    hasPendingImage: Boolean,
    focusRequester: FocusRequester,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    onVoice: () -> Unit,
) {
    val canSend = input.isNotBlank() || hasPendingImage
    var showEmojiPanel by remember { mutableStateOf(false) }
    Column {
        HorizontalDivider()
        // Web parity (ChatInterface.tsx composer): input → emoji → mic → send, no attachment
        // (image attach removed — Chat is a TEXT-ONLY MVP). The Smile button opens an emoji grid
        // that inserts characters into the text field; it stays open so several can be added.
        if (showEmojiPanel) {
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                CHAT_EMOJIS.forEach { emoji ->
                    Text(
                        text = emoji,
                        fontSize = 22.sp,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onInputChange(input + emoji) }
                            .padding(6.dp),
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            TappyTextField(
                value = input,
                onValueChange = onInputChange,
                placeholder = stringResource(R.string.chat_composer_placeholder),
                singleLine = false,
                maxLines = 6,
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester),
            )
            // Emoji toggle (web parity: the composer's Smile button).
            IconButton(onClick = { showEmojiPanel = !showEmojiPanel }) {
                Icon(
                    imageVector = Icons.Filled.EmojiEmotions,
                    contentDescription = stringResource(R.string.chat_action_emoji),
                    tint = if (showEmojiPanel) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onVoice) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = stringResource(R.string.chat_action_voice_input),
                    // The idle mic is Tappy's orange accent, not the neutral on-surface tint.
                    tint = TAPPY_MIC_ORANGE,
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

// Web parity (ChatInterface.tsx action chips): a scrollable row of quick-action pills above the
// composer. Nearby + Tonight SEND their prompt immediately (web `append`); Trip + Price watch
// PREFILL the input (web `setInput`) so the user finishes the sentence. Colours mirror web
// (primary / accent-purple / blue / green).
@Composable
private fun ChatActionChips(
    enabled: Boolean,
    onSendPrompt: (String) -> Unit,
    onPrefill: (String) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val cat = tappyCategoryColors
    val nearbyPrompt = stringResource(R.string.chat_chip_nearby_prompt)
    val tonightPrompt = stringResource(R.string.chat_chip_tonight_prompt)
    val tripPrefill = stringResource(R.string.chat_chip_trip_prefill)
    val priceWatchPrefill = stringResource(R.string.chat_chip_price_watch_prefill)
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        item {
            ChatChip(stringResource(R.string.chat_chip_nearby), colors.primaryContainer, colors.onPrimaryContainer, enabled) { onSendPrompt(nearbyPrompt) }
        }
        item {
            ChatChip(stringResource(R.string.chat_chip_tonight), cat.purple.container, cat.purple.onContainer, enabled) { onSendPrompt(tonightPrompt) }
        }
        item {
            ChatChip(stringResource(R.string.chat_chip_trip), cat.blue.container, cat.blue.onContainer, enabled) { onPrefill(tripPrefill) }
        }
        item {
            ChatChip(stringResource(R.string.chat_chip_price_watch), cat.green.container, cat.green.onContainer, enabled) { onPrefill(priceWatchPrefill) }
        }
    }
}

@Composable
private fun ChatChip(
    label: String,
    containerColor: Color,
    contentColor: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        color = contentColor,
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(containerColor)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
    )
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

package com.tappyai.app.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.app.chat.data.MessageFeedback
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Per-message action bar below each assistant reply — mirrors the Web's `MessageActionBar`.
 * Copy, Share, read-aloud (on-device TTS) and Regenerate are client-side; Like/Dislike/Report post
 * to `/api/message-feedback`, which needs the conversation to be persisted first (Android now saves
 * on every completed reply, exactly as the web does — see [ChatViewModel.persistConversation]).
 *
 * Feedback state is hoisted into [ChatViewModel] rather than kept as local `remember` state, so a
 * thumb survives its row scrolling out of the LazyColumn and back. [isLastMessage] gates Regenerate,
 * matching the web only exposing `reload()` on the latest reply.
 */
@Composable
fun MessageActionBar(
    text: String,
    messageId: Long,
    isLastMessage: Boolean,
    isSpeaking: Boolean,
    feedback: MessageFeedback?,
    isReported: Boolean,
    onToggleSpeak: (spokenText: String) -> Unit,
    onToggleFeedback: (MessageFeedback) -> Unit,
    onReport: () -> Unit,
    onRegenerate: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var copyState by remember { mutableStateOf(false) }
    var showMore by remember { mutableStateOf(false) }

    val liked = feedback == MessageFeedback.Like
    val disliked = feedback == MessageFeedback.Dislike

    val iconSize = Modifier.size(16.dp)
    val tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
    val activeLike = MaterialTheme.colorScheme.primary
    val activeDislike = MaterialTheme.colorScheme.error

    val copyLabel = stringResource(R.string.chat_action_copy)
    val shareLabel = stringResource(R.string.chat_action_share)
    val shareChooserTitle = stringResource(R.string.chat_share_chooser_title)
    val likeLabel = stringResource(R.string.chat_action_like)
    val dislikeLabel = stringResource(R.string.chat_action_dislike)
    val readAloudLabel = stringResource(R.string.chat_action_read_aloud)
    val stopReadAloudLabel = stringResource(R.string.chat_action_stop_read_aloud)
    val regenerateLabel = stringResource(R.string.chat_action_regenerate)
    val moreLabel = stringResource(R.string.chat_action_more)

    Row(
        modifier = Modifier.padding(top = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        // Copy
        IconButton(
            onClick = {
                copyToClipboard(context, stripMarkdown(text))
                copyState = true
                scope.launch { delay(2000); copyState = false }
            },
            modifier = Modifier.size(32.dp),
        ) {
            Icon(
                imageVector = if (copyState) Icons.Filled.Check else Icons.Filled.ContentCopy,
                contentDescription = copyLabel,
                modifier = iconSize,
                tint = if (copyState) MaterialTheme.colorScheme.primary else tint,
            )
        }

        // Share — plain text only (markdown stripped), no URL, matching the web's navigator.share()
        // call (`{ text, title: 'TappyAI' }`, no `url` field).
        IconButton(
            onClick = {
                val plain = stripMarkdown(text)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, plain)
                    putExtra(Intent.EXTRA_TITLE, "TappyAI")
                }
                context.startActivity(Intent.createChooser(intent, shareChooserTitle))
            },
            modifier = Modifier.size(32.dp),
        ) {
            Icon(Icons.Filled.Share, contentDescription = shareLabel, modifier = iconSize, tint = tint)
        }

        // Like — toggle/switch semantics live in the ViewModel, matching the web's handleLike.
        IconButton(
            onClick = { onToggleFeedback(MessageFeedback.Like) },
            modifier = Modifier.size(32.dp),
        ) {
            Icon(
                Icons.Filled.ThumbUp,
                contentDescription = likeLabel,
                modifier = iconSize,
                tint = if (liked) activeLike else tint,
            )
        }

        // Dislike
        IconButton(
            onClick = { onToggleFeedback(MessageFeedback.Dislike) },
            modifier = Modifier.size(32.dp),
        ) {
            Icon(
                Icons.Filled.ThumbDown,
                contentDescription = dislikeLabel,
                modifier = iconSize,
                tint = if (disliked) activeDislike else tint,
            )
        }

        // Read aloud — on-device TextToSpeech, the native equivalent of the web's
        // window.speechSynthesis-backed useTTS hook. Toggles: tapping while speaking stops it.
        IconButton(
            onClick = { onToggleSpeak(stripMarkdown(text)) },
            modifier = Modifier.size(32.dp),
        ) {
            Icon(
                imageVector = if (isSpeaking) Icons.Filled.Stop else Icons.AutoMirrored.Filled.VolumeUp,
                contentDescription = if (isSpeaking) stopReadAloudLabel else readAloudLabel,
                modifier = iconSize,
                tint = if (isSpeaking) MaterialTheme.colorScheme.primary else tint,
            )
        }

        // Regenerate (last message only) — mirrors the web only exposing reload() on the last turn.
        if (isLastMessage) {
            IconButton(
                onClick = onRegenerate,
                modifier = Modifier.size(32.dp),
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = regenerateLabel, modifier = iconSize, tint = tint)
            }
        }

        // More — Copy Plaintext / Copy ID / Report, matching the web's dropdown item-for-item.
        Box {
            IconButton(
                onClick = { showMore = true },
                modifier = Modifier.size(32.dp),
            ) {
                Icon(Icons.Filled.MoreHoriz, contentDescription = moreLabel, modifier = iconSize, tint = tint)
            }
            DropdownMenu(expanded = showMore, onDismissRequest = { showMore = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_more_copy_plaintext)) },
                    leadingIcon = { Icon(Icons.Filled.Description, contentDescription = null, modifier = iconSize) },
                    onClick = {
                        copyToClipboard(context, stripMarkdown(text))
                        showMore = false
                    },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_more_copy_id)) },
                    leadingIcon = { Icon(Icons.Filled.Tag, contentDescription = null, modifier = iconSize) },
                    onClick = {
                        copyToClipboard(context, messageId.toString())
                        showMore = false
                    },
                )
                HorizontalDivider()
                DropdownMenuItem(
                    enabled = !isReported,
                    text = {
                        Text(
                            text = if (isReported) {
                                stringResource(R.string.chat_more_reported)
                            } else {
                                stringResource(R.string.chat_more_report)
                            },
                            color = MaterialTheme.colorScheme.error,
                        )
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Filled.Flag,
                            contentDescription = null,
                            modifier = iconSize,
                            tint = MaterialTheme.colorScheme.error,
                        )
                    },
                    onClick = {
                        onReport()
                        showMore = false
                    },
                )
            }
        }
    }
}

private fun copyToClipboard(context: Context, value: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("TappyAI", value))
}

private fun stripMarkdown(text: String): String =
    text
        .replace(Regex("\\*\\*(.*?)\\*\\*"), "$1")
        .replace(Regex("\\*(.*?)\\*"), "$1")
        .replace(Regex("#{1,3}\\s"), "")
        .replace(Regex("\\[([^]]+)]\\([^)]+\\)"), "$1")
        .replace(Regex("`([^`]+)`"), "$1")
        .replace(Regex("^- ", RegexOption.MULTILINE), "• ")
        .replace(Regex("^>\\s?", RegexOption.MULTILINE), "")
        .replace(Regex("---+"), "")
        .trim()

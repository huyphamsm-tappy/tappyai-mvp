package com.tappyai.app.translate

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolBubble
import com.tappyai.app.tools.ToolButton
import com.tappyai.app.tools.ToolCard
import com.tappyai.app.tools.ToolCta
import com.tappyai.app.tools.ToolError
import com.tappyai.app.tools.ToolGlobe
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolNote
import com.tappyai.app.tools.ToolOrbit
import com.tappyai.app.tools.ToolShimmer
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * Translate — the web `/translate` page (design/v3-phase4 `src/app/translate/page.tsx`), native:
 * the indigo hero ("Kết nối thế giới bằng ngôn ngữ", globe + orbit + greeting bubbles, the
 * welcome pose), the SOURCE card (textarea, counter, clear), the TARGET card (language selector),
 * the big gradient CTA, the note, then the shimmer while translating and the accent RESULT card
 * with read-aloud and copy.
 *
 * Behaviour is exactly what it was: a bounded text input, the 30-language target picker, one
 * call to the existing `POST /api/translate` (server-side AI, no client business logic), then
 * device TTS + copy on the result. No sign-in required (IP rate-limited), as on the web.
 */
@Composable
fun TranslateScreen(
    onBack: () -> Unit,
    viewModel: TranslateViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    var showLanguagePicker by remember { mutableStateOf(false) }

    ToolV3Page(onBack = onBack) {
        ToolHero(
            hue = ToolHue.Indigo,
            eyebrow = stringResource(R.string.tool_translate_eyebrow),
            title1 = stringResource(R.string.tool_translate_title1),
            title2 = stringResource(R.string.tool_translate_title2),
            body = stringResource(R.string.tool_translate_body, LANGUAGES.size),
            subtitle = stringResource(R.string.tool_translate_subtitle),
            mascotRes = R.drawable.tappy_welcome,
            scene = { TranslateScene(viLabel = LANGUAGES.first().displayName()) },
        )

        ToolCard(title = stringResource(R.string.translate_input_label), icon = Icons.Outlined.Edit) {
            ToolTextField(
                value = viewModel.inputText,
                onValueChange = viewModel::onInputTextChange,
                placeholder = stringResource(R.string.translate_input_placeholder),
                singleLine = false,
                minLines = 5,
                maxLines = 8,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.translate_char_counter, viewModel.inputText.length),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 13.sp,
                )
                if (viewModel.inputText.isNotBlank()) {
                    ToolButton(text = stringResource(R.string.translate_clear), onClick = viewModel::clear)
                }
            }
        }

        ToolCard(title = stringResource(R.string.translate_target_label), icon = Icons.Outlined.Language) {
            val shape = RoundedCornerShape(16.dp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .clip(shape)
                    .background(HomeV3.SurfaceVariant)
                    .border(1.dp, HomeV3.Outline, shape)
                    .clickable(onClick = { showLanguagePicker = true })
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = viewModel.targetLanguage.displayName(), color = HomeV3.OnSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Icon(imageVector = Icons.Filled.ExpandMore, contentDescription = null, tint = HomeV3.OnSurfaceVariant)
            }
        }

        ToolCta(
            text = if (viewModel.isTranslating) stringResource(R.string.translate_action_translating) else stringResource(R.string.translate_action_translate),
            hue = ToolHue.Indigo,
            icon = Icons.Filled.Translate,
            onClick = viewModel::translate,
            enabled = viewModel.inputText.isNotBlank(),
            loading = viewModel.isTranslating,
        )

        ToolNote(text = stringResource(R.string.translate_footer_note), icon = Icons.Outlined.Lightbulb)

        viewModel.errorMessage?.let { ToolError(it) }

        if (viewModel.isTranslating && viewModel.translation == null) {
            ToolCard(accent = true) { ToolShimmer() }
        }

        viewModel.translation?.let { translation ->
            TranslateResultCard(
                translation = translation,
                languageName = viewModel.targetLanguage.displayName(),
                isSpeaking = viewModel.isSpeaking,
                ttsAvailable = viewModel.ttsAvailable,
                onReadAloud = { viewModel.speak(translation, viewModel.targetLanguage.ttsTag) },
                onCopy = { copyToClipboard(context, translation) },
            )
        }
    }

    if (showLanguagePicker) {
        LanguagePickerSheet(
            selectedCode = viewModel.targetLanguage.code,
            onSelect = { language ->
                viewModel.onTargetLanguageChange(language)
                showLanguagePicker = false
            },
            onDismiss = { showLanguagePicker = false },
        )
    }
}

/** The hero scene: a soft globe, an orbit ring and four greeting bubbles, as on the web. */
@Composable
private fun BoxScope.TranslateScene(viLabel: String) {
    ToolGlobe(size = 190.dp, alignment = Alignment.TopEnd, color = Color(0x662563EB), modifier = Modifier.offset(x = 24.dp, y = (-10).dp))
    ToolOrbit(size = 230.dp, alignment = Alignment.Center, modifier = Modifier.offset(y = 8.dp))
    ToolBubble(text = "Hello", a = Color(0xFF2563EB), b = Color(0xFF3B82F6), alignment = Alignment.TopStart, modifier = Modifier.offset(x = 4.dp, y = 4.dp))
    ToolBubble(text = viLabel, a = Color(0xFF7C3AED), b = Color(0xFFA78BFA), alignment = Alignment.TopEnd, modifier = Modifier.offset(x = (-4).dp, y = 16.dp))
    ToolBubble(text = "こんにちは", a = Color(0xFF1E293B), b = Color(0xFF334155), alignment = Alignment.CenterStart, modifier = Modifier.offset(y = 18.dp))
    ToolBubble(text = "안녕하세요", a = Color(0xFF1E293B), b = Color(0xFF334155), alignment = Alignment.CenterEnd, modifier = Modifier.offset(y = 30.dp))
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun LanguagePickerSheet(
    selectedCode: String,
    onSelect: (Language) -> Unit,
    onDismiss: () -> Unit,
) {
    com.tappyai.core.designsystem.component.TappyBottomSheet(onDismiss = onDismiss) {
        // heightIn(max=), not a fixed height() — see CurrencyScreen's identical picker sheet fix.
        LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
            items(LANGUAGES) { language ->
                val isSelected = language.code == selectedCode
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(language) }
                        .padding(vertical = TappySpacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = language.displayName(),
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    )
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = stringResource(R.string.translate_selected_description),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun TranslateResultCard(
    translation: String,
    languageName: String,
    isSpeaking: Boolean,
    ttsAvailable: Boolean,
    onReadAloud: () -> Unit,
    onCopy: () -> Unit,
) {
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }
    ToolCard(title = stringResource(R.string.translate_result_header, languageName), icon = Icons.Filled.Translate, accent = true) {
        Text(text = translation, color = HomeV3.OnSurface, fontSize = 16.sp, lineHeight = 24.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            if (ttsAvailable) {
                ToolButton(
                    text = if (isSpeaking) stringResource(R.string.translate_action_stop) else stringResource(R.string.translate_action_read_aloud),
                    icon = if (isSpeaking) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                    onClick = onReadAloud,
                )
            }
            ToolButton(
                text = if (copied) stringResource(R.string.translate_action_copied) else stringResource(R.string.translate_action_copy),
                icon = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                onClick = {
                    onCopy()
                    copied = true
                },
            )
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("Translation", text))
}

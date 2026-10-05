package com.tappyai.core.designsystem.component

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Text input matching docs/UI_GUIDELINES.md §10 (12dp radius, ≥16sp text so no iOS-style
 * zoom concern applies, but kept ≥16sp on Android too for touch-target/readability parity).
 * Error text is exposed both visually (helper text below) and to accessibility services via
 * `semantics { error(...) }` so TalkBack announces the error, not just shows red text.
 */
/**
 * Whether a key event is the Enter that submits: a key-DOWN of Enter (main or numpad) without Shift.
 * Shift+Enter is the line break, as on the web composer. Pure, so the rule is unit-testable
 * without a native key event.
 */
fun enterSubmits(key: Key, type: KeyEventType, shiftPressed: Boolean): Boolean =
    type == KeyEventType.KeyDown && (key == Key.Enter || key == Key.NumPadEnter) && !shiftPressed

/**
 * The [androidx.compose.ui.text.input.TextFieldValue] overload — for fields that must survive IME
 * COMPOSITION.
 *
 * A `String`-valued text field cannot. Compose rebuilds its internal `TextFieldValue` from whatever
 * String it is handed, with a collapsed selection and NO composing region, so every keystroke that
 * round-trips through hoisted state cancels whatever the IME was assembling. ASCII survives that,
 * because each key commits on its own; Vietnamese Telex does not, because "q-u-a-n-s" has to stay
 * composing across five keystrokes before it becomes "quán". Same for VNI, and for Japanese and
 * Chinese IMEs.
 *
 * The String overload below is unchanged and still correct for the other seventeen screens, whose
 * fields are short, ASCII-ish and not composed. Only a caller that needs composition should use
 * this one, and it should keep the value in its OWN state so nothing outside can reset it mid-word.
 */
@Composable
fun TappyTextField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    errorText: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    /**
     * When set, ENTER SUBMITS instead of breaking the line — the way the web composer sends.
     *
     * Two paths reach it, because Android has two Enters: the soft keyboard's action key (the IME
     * action becomes Send, so Gboard draws a send key and fires [KeyboardActions.onSend]) and a
     * hardware/Bluetooth/emulator-host Enter, which never goes through the IME action and would
     * otherwise be typed into a multi-line field as a newline. Shift+Enter still breaks the line,
     * as on web. Null keeps the field's default behaviour (Enter = newline on a multi-line field).
     *
     * Measured on Pixel_8 (UAT 2026-09-12): with `singleLine = false` and no action, both Enters
     * inserted a newline and only the send arrow sent.
     */
    onSubmit: (() -> Unit)? = null,
    /**
     * Web chat composer look (`ChatInterface.tsx`: `bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm`, no outline, focus ring
     * `primary-500/50`): a filled field with 16dp corners. Default false keeps the outlined field every other screen uses.
     */
    filled: Boolean = false,
) {
    val isError = errorText != null

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { if (isError) error(errorText!!) }
                .then(
                    if (onSubmit != null) {
                        Modifier.onPreviewKeyEvent { event ->
                            if (enterSubmits(event.key, event.type, event.isShiftPressed)) {
                                onSubmit()
                                true
                            } else false
                        }
                    } else Modifier,
                ),
            enabled = enabled,
            isError = isError,
            singleLine = singleLine,
            minLines = minLines,
            maxLines = maxLines,
            label = label?.let { { Text(it) } },
            placeholder = placeholder?.let { { Text(it) } },
            shape = if (filled) RoundedCornerShape(16.dp) else TappyShapes.input,
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = if (onSubmit != null) ImeAction.Send else ImeAction.Default,
            ),
            keyboardActions = KeyboardActions(onSend = { onSubmit?.invoke() }),
            visualTransformation = visualTransformation,
            textStyle = if (filled) MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp) else MaterialTheme.typography.bodyMedium,
            colors = if (filled) webComposerFieldColors() else OutlinedTextFieldDefaults.colors(),
        )
        if (isError) {
            Text(
                text = errorText.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(start = TappySpacing.lg, top = TappySpacing.xs),
            )
        }
    }
}

@Composable
fun TappyTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    errorText: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    // Auto-grows from [minLines] up to [maxLines], then scrolls internally beyond that — e.g. a
    // chat composer passes singleLine=false, maxLines=6. Default keeps single-line behavior.
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    val isError = errorText != null

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { if (isError) error(errorText!!) },
            enabled = enabled,
            isError = isError,
            singleLine = singleLine,
            minLines = minLines,
            maxLines = maxLines,
            label = label?.let { { Text(it) } },
            placeholder = placeholder?.let { { Text(it) } },
            shape = TappyShapes.input,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            visualTransformation = visualTransformation,
            textStyle = MaterialTheme.typography.bodyMedium,
            colors = OutlinedTextFieldDefaults.colors(),
        )
        if (isError) {
            Text(
                text = errorText.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(start = TappySpacing.lg, top = TappySpacing.xs),
            )
        }
    }
}

@TappyComponentPreviews
@Composable
private fun TappyTextFieldPreview() {
    TappyAITheme(dynamicColor = false) {
        Column(modifier = Modifier.padding(TappySpacing.xl)) {
            TappyTextField(value = "", onValueChange = {}, label = "Label")
            TappyTextField(value = "", onValueChange = {}, label = "Error", errorText = "Required")
        }
    }
}

/**
 * Web chat composer field colours (`ChatInterface.tsx`): `bg-gray-100 dark:bg-gray-800` fill (gray-100 #F3F4F6 / gray-800 #1F2937), text
 * gray-900 / gray-100, placeholder gray-400 (#9CA3AF), no outline; focus = `ring-2 ring-primary-500/50` (#007AFF at 50%).
 */
@Composable
private fun webComposerFieldColors(): TextFieldColors {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val container = if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6)
    val text = if (dark) Color(0xFFF3F4F6) else Color(0xFF111827)
    val placeholder = Color(0xFF9CA3AF)
    val ring = Color(0xFF007AFF).copy(alpha = 0.5f)
    return OutlinedTextFieldDefaults.colors(
        focusedContainerColor = container, unfocusedContainerColor = container, disabledContainerColor = container,
        focusedBorderColor = ring, unfocusedBorderColor = Color.Transparent, disabledBorderColor = Color.Transparent,
        focusedTextColor = text, unfocusedTextColor = text,
        focusedPlaceholderColor = placeholder, unfocusedPlaceholderColor = placeholder,
        cursorColor = Color(0xFF007AFF),
    )
}

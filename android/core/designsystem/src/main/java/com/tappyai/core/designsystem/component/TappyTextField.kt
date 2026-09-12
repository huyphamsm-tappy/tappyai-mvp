package com.tappyai.core.designsystem.component

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
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

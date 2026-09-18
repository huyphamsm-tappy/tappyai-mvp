package com.tappyai.app.chat

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import com.tappyai.core.designsystem.component.enterSubmits
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The chat composer sends on Enter — web parity.
 *
 * UAT on Pixel_8 (2026-09-12) measured the defect: with `singleLine = false` and no IME action,
 * Gboard's enter key AND a hardware Enter both inserted a newline; only the arrow sent. The fix
 * is one optional parameter on the design system's composing text field: [enterSubmits] decides
 * the hardware path (pure, pinned here), and the IME action becomes Send for the soft keyboard.
 */
class ChatComposerEnterTest {

    @Test
    fun `Enter down without Shift submits - main and numpad`() {
        assertTrue(enterSubmits(Key.Enter, KeyEventType.KeyDown, shiftPressed = false))
        assertTrue(enterSubmits(Key.NumPadEnter, KeyEventType.KeyDown, shiftPressed = false))
    }

    @Test
    fun `Shift+Enter breaks the line instead, as on web`() {
        assertFalse(enterSubmits(Key.Enter, KeyEventType.KeyDown, shiftPressed = true))
    }

    @Test
    fun `key-up and other keys never submit`() {
        assertFalse(enterSubmits(Key.Enter, KeyEventType.KeyUp, shiftPressed = false))
        assertFalse(enterSubmits(Key.A, KeyEventType.KeyDown, shiftPressed = false))
        assertFalse(enterSubmits(Key.Tab, KeyEventType.KeyDown, shiftPressed = false))
    }

    @Test
    fun `the field turns Enter into Send on both paths only when asked to`() {
        val src = File(findSrc("core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyTextField.kt")).readText()
        assertTrue("soft keyboard: the IME action is Send", src.contains("imeAction = if (onSubmit != null) ImeAction.Send else ImeAction.Default"))
        assertTrue(src.contains("keyboardActions = KeyboardActions(onSend = { onSubmit?.invoke() })"))
        assertTrue("hardware keyboard: Enter is intercepted before the field types it", src.contains("Modifier.onPreviewKeyEvent { event ->"))
        assertTrue(src.contains("if (enterSubmits(event.key, event.type, event.isShiftPressed)) {"))
        // Fields that did not ask keep their behaviour: the modifier is only added with a handler.
        assertTrue(src.contains("if (onSubmit != null) {\n                        Modifier.onPreviewKeyEvent") || src.contains("if (onSubmit != null) {\r\n                        Modifier.onPreviewKeyEvent"))
    }

    @Test
    fun `the composer sends on Enter through the same gate as the arrow, and keeps composing`() {
        val screen = File(findSrc("app/src/main/java/com/tappyai/app/chat/ChatScreen.kt")).readText()
        assertTrue(screen.contains("onSubmit = { if (canSend && !isResponding) onSend() },"))
        assertTrue("the arrow still sends", screen.contains("IconButton(onClick = onSend, enabled = canSend)"))
        assertTrue("still multi-line for Shift+Enter and long drafts", screen.contains("singleLine = false,") && screen.contains("maxLines = 6,"))
        assertTrue("the Vietnamese IME fix (TextFieldValue-held composing region) is untouched",
            screen.contains("var field by remember { mutableStateOf(TextFieldValue(input)) }"))
        assertTrue(screen.contains("val canSend = input.isNotBlank() || hasPendingImage"))
    }

    private fun findSrc(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.path
            dir = dir.parentFile
        }
        error("$rel not found")
    }
}

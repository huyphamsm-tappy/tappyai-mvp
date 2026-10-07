package com.tappyai.app.share

import com.tappyai.app.config.ProductFlagsDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28: the web hides the "public link" share row when SHOW_PUBLIC_SHARE is off
 * (`ShareMenu.tsx`, served to clients as `GET /api/config` → `flags.publicShare`). Android always
 * showed it. Android now reads the same flag and hides the row unless the server says it is on —
 * fail-closed: an unreachable config never shows a sharing control the server may have switched off.
 */
class PublicShareFlagTest {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `reads flags publicShare from the config response`() {
        val on = json.decodeFromString<ProductFlagsDto>("""{"flags":{"showMusic":false,"publicShare":true},"onboarding":{}}""")
        val off = json.decodeFromString<ProductFlagsDto>("""{"flags":{"publicShare":false}}""")
        val absent = json.decodeFromString<ProductFlagsDto>("""{"flags":{}}""")
        assertTrue(on.flags.publicShare)
        assertFalse(off.flags.publicShare)
        assertFalse("fail-closed when the key is missing", absent.flags.publicShare)
    }

    @Test
    fun `the chat share sheet only gets the public-link row when the flag is on`() {
        val bar = File("src/main/java/com/tappyai/app/chat/MessageActionBar.kt").readText()
        assertTrue(bar.contains("onPublicLink = if (publicShareEnabled) { { if (onSharePublic()) shareArtifact = null } } else null"))
        val screen = File("src/main/java/com/tappyai/app/chat/ChatScreen.kt").readText()
        assertTrue(screen.contains("publicShareEnabled = publicShareEnabled,"))
        assertEquals(1, Regex("""productFlags\.publicShare""").findAll(File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt").readText()).count())
    }
}

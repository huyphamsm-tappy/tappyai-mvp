package com.tappyai.app.chat

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * Regression guard for the Planner Stop root cause.
 *
 * `NetworkModule` installs an [okhttp3.logging.HttpLoggingInterceptor] as an APPLICATION
 * interceptor. At `Level.BODY` such an interceptor reads the ENTIRE response body before handing
 * it back to the caller, which silently destroys streaming: `/api/chat` delivers the reply
 * token-by-token, so a debug build showed an empty bubble for the whole reply and then everything
 * at once when the stream closed.
 *
 * The user-visible consequence was the Planner Stop bug: tapping Stop mid-reply parsed an EMPTY
 * accumulated buffer, so an itinerary the server had already sent was lost — and no amount of
 * ViewModel-level correctness could recover it, because the tokens had never reached the app.
 * Measured on device: persisted assistant turn was 0 chars at BODY, 1442 chars (with a complete
 * `[TAPPY_PLAN]…[/TAPPY_PLAN]`) at HEADERS.
 *
 * Release builds were never affected — `isDebug=false` already selected `Level.NONE` — which is
 * exactly why this survived so long: it only ever broke the builds used for UAT.
 *
 * This is a source-level assertion because constructing the real client needs AuthInterceptor and
 * TokenAuthenticator; the property being guarded is a constant in the module's source.
 */
class StreamingNotBufferedByLoggingTest {

    private fun networkModuleSource(): File {
        // Walk up from the module dir to the android/ root, then down to core:network.
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "core/network/src/main/java/com/tappyai/core/network/NetworkModule.kt")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("NetworkModule.kt not found — did the module move?")
    }

    @Test
    fun `the guard can actually find NetworkModule`() {
        // Without this, every assertion below would be vacuous if the file were ever relocated.
        val src = networkModuleSource().readText()
        assertNotNull(src)
        assertTrue("expected the OkHttp client provider", src.contains("provideOkHttpClient"))
        assertTrue("expected the logging interceptor", src.contains("HttpLoggingInterceptor"))
    }

    @Test
    fun `the http logger never runs at BODY level`() {
        val code = networkModuleSource()
            .readLines()
            .filterNot { it.trimStart().startsWith("//") } // ignore the explanatory comment block
            .joinToString("\n")

        assertFalse(
            "HttpLoggingInterceptor.Level.BODY buffers the whole response body, which breaks the " +
                "/api/chat token stream and makes Stop parse an empty buffer (Planner Stop bug). " +
                "Use HEADERS.",
            code.contains("HttpLoggingInterceptor.Level.BODY") || code.contains("Level.BODY"),
        )
    }

    @Test
    fun `the http logger still redacts the Authorization header`() {
        // The level was lowered to HEADERS, not removed — keep the original security property
        // (token present but redacted) that this interceptor block was written for.
        val code = networkModuleSource().readText()
        assertTrue(code.contains("""redactHeader("Authorization")"""))
    }
}

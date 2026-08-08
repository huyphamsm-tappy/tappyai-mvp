package com.tappyai.app.auth

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the four anonymous-session lifecycle invariants that have no reachable seam in a JVM
 * unit test: `AuthRepository` needs a live `SupabaseClient` and `EncryptedTokenStorage` needs the
 * Android Keystore, so both are only constructible on a device. Same approach, and the same
 * reason, as [com.tappyai.app.chat.StreamingNotBufferedByLoggingTest].
 *
 * Each invariant below is one a refactor could plausibly undo while everything still compiles and
 * every other test stays green — and each failure mode is silent and data-losing, which is why
 * they are pinned at all rather than left to review.
 */
class AnonymousSessionLifecycleTest {

    private fun source(relativePath: String): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relativePath)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("$relativePath not found — did the module move?")
    }

    /** Source with `//` comment lines dropped, so an assertion can never be satisfied (or
     *  defeated) by prose in a doc comment describing the very thing being guarded. */
    private fun code(relativePath: String): String = source(relativePath)
        .readLines()
        .filterNot { it.trimStart().startsWith("//") || it.trimStart().startsWith("*") }
        .joinToString("\n")

    private val authRepository =
        "features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt"
    private val tokenStorage =
        "core/security/src/main/java/com/tappyai/core/security/EncryptedTokenStorage.kt"

    @Test
    fun `the guard can actually find both files`() {
        // Without this, every assertion below would pass vacuously if a file were relocated.
        assertTrue(code(authRepository).contains("suspend fun ensureAnonymousSession()"))
        assertTrue(code(tokenStorage).contains("override fun clearTokens()"))
    }

    /**
     * Sign-out must land on an ANONYMOUS session, not on Login. The app stays usable and chat
     * keeps working on the guest quota — that is the product decision this feature ships.
     */
    @Test
    fun `signOut returns the user to an anonymous session`() {
        val src = code(authRepository)
        val signOut = src.substringAfter("suspend fun signOut()").substringBefore("\n    /**")

        assertTrue(
            "signOut() must call ensureAnonymousSession(); without it the user is dropped to " +
                "Login, which is exactly the state anonymous chat exists to remove",
            signOut.contains("ensureAnonymousSession()"),
        )
        assertTrue(
            "clearTokens() must run BEFORE the new anonymous session is minted, so the previous " +
                "account's token can never be reused or left in storage alongside it",
            signOut.indexOf("clearTokens()") < signOut.indexOf("ensureAnonymousSession()"),
        )
    }

    /**
     * Every call to `POST /api/auth/anonymous` mints a NEW `auth.users` row. Two concurrent
     * callers would therefore create two throwaway accounts and strand the first one's
     * conversations — unreachable forever, since nothing else holds that token.
     */
    @Test
    fun `anonymous session minting is single-flight and skipped when a session exists`() {
        val src = code(authRepository)
        val fn = src.substringAfter("suspend fun ensureAnonymousSession()")
            .substringBefore("\n    /**")

        assertTrue(
            "must return early when a session already exists, otherwise app launch with a " +
                "restored session would still mint a duplicate anonymous account",
            fn.contains("currentSessionOrNull() != null) return"),
        )
        assertTrue(
            "must be single-flight — concurrent callers each minting an identity is the " +
                "failure mode that silently orphans a user's history",
            fn.contains("anonymousMintInFlight.compareAndSet(false, true)"),
        )
        assertTrue(
            "the in-flight flag must be released in a finally block, or one failed mint " +
                "permanently blocks every later attempt for the process lifetime",
            fn.contains("finally {") && fn.contains("anonymousMintInFlight.set(false)"),
        )
    }

    /**
     * The pending claim is the ONLY handle on an anonymous user's conversations once sign-in
     * replaces their session. A blanket `prefs.edit().clear()` in clearTokens() — the obvious
     * and previously-correct implementation — wipes it during sign-out and permanently orphans
     * that history, with no error anywhere.
     */
    @Test
    fun `clearing session tokens does not wipe the pending anonymous claim`() {
        val src = code(tokenStorage)
        val fn = src.substringAfter("override fun clearTokens()").substringBefore("override fun")

        assertFalse(
            "clearTokens() must not use edit().clear() — it would also delete the pending " +
                "anonymous claim that has to survive the sign-out/sign-in transition",
            fn.contains(".clear()"),
        )
        assertTrue(fn.contains("remove(KEY_ACCESS_TOKEN)"))
        assertTrue(fn.contains("remove(KEY_REFRESH_TOKEN)"))
        assertFalse(
            "the pending claim key must never be removed here",
            fn.contains("KEY_PENDING_ANON_CLAIM"),
        )
    }

    /**
     * A transport failure must KEEP the pending token so a later attempt can still rescue the
     * conversations; only a definitive 4xx (the server has ruled, and will rule the same way
     * again) clears it. Clearing on any failure is the tempting simplification, and it silently
     * loses history exactly when the network is worst.
     */
    @Test
    fun `a failed claim keeps the pending token unless the server rejected it definitively`() {
        val src = code(authRepository)
        val fn = src.substringAfter("suspend fun claimPendingAnonymousConversations()")
            .substringBefore("\n    private fun persistSession()")

        assertTrue(
            "only a 4xx may clear the pending claim",
            fn.contains("if (e.code() in 400..499) tokenProvider.clearPendingAnonymousClaim()"),
        )
        // The generic catch must not clear: it covers timeouts, DNS failures and 5xx, all retryable.
        val genericCatch = fn.substringAfter("catch (e: Exception)")
        assertFalse(
            "the catch-all must not clear the pending claim — a timeout is retryable and " +
                "clearing here strands the user's conversations permanently",
            genericCatch.contains("clearPendingAnonymousClaim()"),
        )
    }
}

package com.tappyai.app.uat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Google sign-in on the UAT build (real SM-A127F, 2026-10-07).
 *
 * Sequence measured: (1) no Android OAuth client for `com.tappyai.app.staging` + the debug SHA-1 ->
 * `UNREGISTERED_ON_API_CONSOLE` straight after the account picker (the picker itself appears BEFORE that
 * check); (2) client registered -> Google issues the ID token, then Supabase UAT answers
 * `Unacceptable audience in id_token: [<release web client>]`, because the uat variant still sent the
 * release/prod Web client ID as `serverClientId` while its backend is the UAT Supabase project.
 *
 * Pinned here: the uat variant takes its OWN Web client ID (a local, untracked property, like the UAT
 * Supabase URL/anon key), the release/default value is untouched, and the app's Credential Manager request
 * uses whatever BuildConfig carries — nothing is hardcoded in Kotlin.
 */
class UatGoogleClientConfigTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/build.gradle.kts").isFile || File(it, "build.gradle.kts").isFile && File(it, "app/src").isDirectory }
        .let { if (File(it, "app/build.gradle.kts").isFile) it else it }

    private fun gradle(): String = File(root(), "app/build.gradle.kts").readText().replace("\r\n", "\n")

    private fun uatBlock(): String {
        val g = gradle()
        val start = g.indexOf("create(\"uat\") {")
        check(start > 0) { "uat build type missing" }
        return g.substring(start, g.indexOf("        release {", start))
    }

    @Test
    fun `the uat variant sets its own Google web client ID from an untracked property`() {
        val g = gradle()
        assertTrue(g.contains("val uatGoogleWebClientId = uatProp(\"TAPPYAI_UAT_GOOGLE_WEB_CLIENT_ID\")"))
        assertTrue(uatBlock().contains("buildConfigField(\"String\", \"GOOGLE_WEB_CLIENT_ID\", \"\\\"\$uatGoogleWebClientId\\\"\")"))
    }

    @Test
    fun `the default and release client ID still come from the release property`() {
        val g = gradle()
        assertTrue(g.contains("releaseProp(\"TAPPYAI_GOOGLE_WEB_CLIENT_ID\""))
        val defaultCfg = g.substringBefore("buildTypes {")
        assertTrue(defaultCfg.contains("buildConfigField(\"String\", \"GOOGLE_WEB_CLIENT_ID\", \"\\\"\$googleWebClientId\\\"\")"))
        assertFalse("release must never read the UAT property", g.substringAfter("        release {").contains("uatGoogleWebClientId"))
    }

    @Test
    fun `the id is a Google web client in the same project as the Android clients, and is not in tracked files`() {
        val ids = Regex("\"?(\\d{12,}-[a-z0-9]+\\.apps\\.googleusercontent\\.com)\"?").findAll(gradle()).map { it.groupValues[1] }.toList()
        assertTrue("no client ID may be committed in build.gradle.kts: $ids", ids.isEmpty())
    }

    @Test
    fun `Credential Manager asks for exactly the BuildConfig client ID`() {
        val module = File(root(), "app/src/main/java/com/tappyai/app/di/AppModule.kt").readText()
        assertTrue(module.contains("fun provideGoogleWebClientId(): String = BuildConfig.GOOGLE_WEB_CLIENT_ID"))
        val client = File(root(), "features/auth/src/main/java/com/tappyai/features/auth/data/GoogleSignInClient.kt").readText()
        assertTrue(client.contains("GetSignInWithGoogleOption.Builder(googleWebClientId)"))
    }

    @Test
    fun `a uat BuildConfig carries a Google web client ID of the shared project`() {
        if (com.tappyai.app.BuildConfig.BUILD_TYPE != "uat") return
        val id = com.tappyai.app.BuildConfig.GOOGLE_WEB_CLIENT_ID
        assertTrue(id, id.endsWith(".apps.googleusercontent.com"))
        assertEquals("1023373437508", id.substringBefore('-'))
    }
}

package com.tappyai.app.uat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The e2e test hook (session import + clipboard text) exists ONLY in the `uat` source set. The
 * `main`, `debug` and `release` trees never mention it, so no other variant can compile or declare
 * it. The build-output half of the proof — the merged release manifest does not contain it — is
 * `android/e2e/scripts/verify-release-clean.mjs`.
 */
class UatTestHookOnlyInUatTest {

    private val src = File("src")

    private fun mentions(dir: File): List<String> =
        dir.walkTopDown().filter { it.isFile }.filter { it.readText().contains("UatTestHook") }.map { it.path }.toList()

    @Test
    fun `the hook lives in the uat source set`() {
        assertTrue(src.resolve("uat/java/com/tappyai/app/uat/UatTestHookActivity.kt").isFile)
        assertTrue(src.resolve("uat/AndroidManifest.xml").readText().contains(".uat.UatTestHookActivity"))
    }

    @Test
    fun `no other source set mentions it`() {
        for (set in listOf("main", "debug", "release", "staging")) {
            val dir = src.resolve(set)
            if (dir.exists()) assertFalse("$set mentions the uat hook: ${mentions(dir)}", mentions(dir).isNotEmpty())
        }
    }
}

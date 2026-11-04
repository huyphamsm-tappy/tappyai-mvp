package com.tappyai.app.security

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Security audit 04/11 (A-01, A-04, A-07): nothing of the app is copied to a cloud backup or an `adb backup`. The Supabase session
 * (kept by supabase-kt in ordinary preferences), the guest's age declaration and the scan history are personal data that the old
 * per-file exclusion list did not cover; everything the app needs again is on the server (account, chats, reviews), so the whole backup is off.
 * The two rule files stay as a second line (the auth-token and callback-state exclusions are pinned by AuthCallbackStateGuardTest).
 */
class BackupPolicyTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/AndroidManifest.xml").isFile }

    private val manifest get() = File(root(), "app/src/main/AndroidManifest.xml").readText().replace("\r\n", "\n")

    @Test
    fun `the application opts out of backup`() {
        assertTrue(manifest.contains("android:allowBackup=\"false\""))
        assertTrue("never switched back on", !manifest.contains("android:allowBackup=\"true\""))
    }

    @Test
    fun `the exclusion rule files are still referenced`() {
        assertTrue(manifest.contains("android:dataExtractionRules=\"@xml/data_extraction_rules\""))
        assertTrue(manifest.contains("android:fullBackupContent=\"@xml/backup_rules\""))
    }
}

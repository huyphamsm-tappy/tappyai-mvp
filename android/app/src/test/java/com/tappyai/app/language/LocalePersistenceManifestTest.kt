package com.tappyai.app.language

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The in-app language must survive process death on API < 33.
 *
 * WHY THIS IS A MANIFEST TEST. `AppCompatDelegate.setApplicationLocales()` is persisted by the
 * PLATFORM only from API 33. Below that, AppCompat persists it itself — but only when it can find
 * the `autoStoreLocales` metadata on `AppLocalesMetadataHolderService`. With no such node it keeps
 * the locale in the current process and nothing more, and `minSdk` is 26. Nothing in a JVM unit
 * test can exercise that code path (it needs a real framework and a real restart), and the
 * emulator this repo verifies on is API 35, where the platform hides the bug entirely. The node's
 * presence is therefore the only part that can be pinned mechanically — and its absence is exactly
 * what the ADR-027 audit found.
 *
 * What it protects, concretely: `applyDefaultIfUnset()` writes the product default `vi` on first
 * run and `AppLanguageResolver` reads AppCompat's state back on every request. Without the node,
 * a restart makes that read return null, so an en-US handset renders English and asks the backend
 * for `Accept-Language: en` — for a product whose default is Vietnamese.
 */
class LocalePersistenceManifestTest {

    private fun projectFile(relativePath: String): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relativePath)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("$relativePath not found — did the module move?")
    }

    private val manifest: String
        get() = projectFile("app/src/main/AndroidManifest.xml").readText()

    /** The `<service>…</service>` element that declares [name], or null when there is none. */
    private fun serviceElement(name: String): String? {
        val at = manifest.indexOf(name)
        if (at < 0) return null
        val open = manifest.lastIndexOf("<service", at)
        val close = manifest.indexOf("</service>", at)
        if (open < 0 || close < 0) return null
        return manifest.substring(open, close + "</service>".length)
    }

    @Test
    fun `declares AppLocalesMetadataHolderService with autoStoreLocales true`() {
        val service = serviceElement("androidx.appcompat.app.AppLocalesMetadataHolderService")
        assertTrue(
            "no <service> declares androidx.appcompat.app.AppLocalesMetadataHolderService — " +
                "below API 33 the in-app language is then lost on every process restart",
            service != null,
        )
        assertTrue(
            "the service declares no autoStoreLocales metadata, which is the only part AppCompat reads",
            service!!.contains("android:name=\"autoStoreLocales\""),
        )
        assertTrue(
            "autoStoreLocales must be \"true\"; any other value leaves persistence off",
            Regex("android:name=\"autoStoreLocales\"[\\s\\S]*?android:value=\"true\"").containsMatchIn(service),
        )
    }

    @Test
    fun `the holder service is never started or exported`() {
        // It is a metadata carrier, not a component. Enabling or exporting it would be a real
        // service in the app's surface for no reason.
        val service = serviceElement("androidx.appcompat.app.AppLocalesMetadataHolderService")!!
        assertTrue("the holder service must stay disabled", service.contains("android:enabled=\"false\""))
        assertTrue("the holder service must not be exported", service.contains("android:exported=\"false\""))
    }
}

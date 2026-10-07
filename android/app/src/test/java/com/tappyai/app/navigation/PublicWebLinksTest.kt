package com.tappyai.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * App Links (prepared) — the app claims exactly `https://<origin>/r/<slug>` and nothing else, and
 * the manifest alias that would deliver those links is OFF unless the build enables it.
 */
class PublicWebLinksTest {

    private val origin = "https://www.tappyai.com"

    @Test
    fun `a public result link on our origin resolves to its slug`() {
        assertEquals("AbCdEfGh12", PublicWebLinks.publicResultSlug("$origin/r/AbCdEfGh12", origin))
        assertEquals("AbCdEfGh12", PublicWebLinks.publicResultSlug("$origin/r/AbCdEfGh12/", origin))
        assertEquals("AbCdEfGh12", PublicWebLinks.publicResultSlug("$origin/r/AbCdEfGh12?src=share_out", origin))
        assertEquals("AbCdEfGh12", PublicWebLinks.publicResultSlug("https://WWW.TAPPYAI.COM/r/AbCdEfGh12", origin))
        assertTrue(PublicWebLinks.isPublicResultLink("$origin/r/AbCdEfGh12", origin))
    }

    @Test
    fun `another origin, http, a non-slug, or any other path is not claimed`() {
        for (bad in listOf(
            "https://evil.example/r/AbCdEfGh12",
            "http://www.tappyai.com/r/AbCdEfGh12",
            "$origin/r/short",
            "$origin/r/AbCdEfGh12x",
            "$origin/r/AbCdEfGh1!",
            "$origin/r/AbCdEfGh12/og.png",
            "$origin/food",
            "$origin/chat?q=x",
            "$origin/",
            "not a url",
            "",
        )) {
            assertNull(bad, PublicWebLinks.publicResultSlug(bad, origin))
            assertFalse(bad, PublicWebLinks.isPublicResultLink(bad, origin))
        }
    }

    @Test
    fun `the manifest alias carries an autoVerify https filter for r-slash only and is gated by the build flag`() {
        val manifest = listOf("src/main/AndroidManifest.xml", "app/src/main/AndroidManifest.xml", "android/app/src/main/AndroidManifest.xml")
            .map { File(it) }.firstOrNull { it.exists() }?.readText()
            ?: error("AndroidManifest.xml not found from ${File(".").absolutePath}")
        val alias = manifest.substringAfter("<activity-alias", "").substringBefore("</activity-alias>")
        assertTrue("alias present", alias.isNotEmpty())
        assertTrue(alias.contains("android:name=\".PublicLinkActivity\""))
        assertTrue(alias.contains("android:targetActivity=\".MainActivity\""))
        assertTrue(alias.contains("android:enabled=\"@bool/tappy_app_links_enabled\""))
        assertTrue(alias.contains("android:autoVerify=\"true\""))
        assertTrue(alias.contains("android:scheme=\"https\""))
        assertTrue(alias.contains("android:host=\"\${tappyPublicHost}\""))
        assertTrue(alias.contains("android:pathPrefix=\"/r/\""))
        // Never a catch-all, never a private path.
        assertFalse(alias.contains("pathPattern"))
        assertFalse(alias.contains("/chat"))
        assertFalse(alias.contains("/api"))
        // The flag defaults OFF in gradle: only an explicit "true" property enables the alias.
        val gradle = listOf("build.gradle.kts", "app/build.gradle.kts", "android/app/build.gradle.kts")
            .map { File(it) }.firstOrNull { it.exists() }?.readText() ?: error("build.gradle.kts not found")
        assertTrue(gradle.contains("resValue(\"bool\", \"tappy_app_links_enabled\", (project.findProperty(\"TAPPYAI_APP_LINKS_ENABLED\")?.toString() == \"true\").toString())"))
    }
}

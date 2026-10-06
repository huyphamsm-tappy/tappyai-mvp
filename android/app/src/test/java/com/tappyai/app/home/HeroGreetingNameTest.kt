package com.tappyai.app.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The hero greets by the web's first-name rule (`src/app/(app)/(home)/page.tsx` at Web final
 * a43948d): `full_name.split(' ').pop() || email.split('@')[0]`. Found on a real device: the whole
 * display name ("Huy Phạm") reached a one-line hero and was cut to "Hi Huy Pha…".
 */
class HeroGreetingNameTest {

    @Test
    fun `greets by the last word of the display name like the web`() {
        assertEquals("Phạm", heroGreetingName("Huy Phạm", "a@b.c"))
        assertEquals("Linh", heroGreetingName("Linh", null))
        assertEquals("C", heroGreetingName("  A   B  C  ", null))
    }

    @Test
    fun `a long full name never reaches the hero whole`() {
        assertEquals("Nguyên", heroGreetingName("Nguyễn Thị Minh Khánh Hoàng Phương Nguyên", null))
    }

    @Test
    fun `falls back to the email local part exactly as the web does`() {
        assertEquals("huy.p", heroGreetingName("", "huy.p@example.com"))
        assertEquals("huy.p", heroGreetingName("   ", " huy.p@example.com "))
        assertEquals("huy.p", heroGreetingName(null, "huy.p@example.com"))
    }

    @Test
    fun `no name and no email means the guest welcome, never an invented name`() {
        assertNull(heroGreetingName(null, null))
        assertNull(heroGreetingName("", ""))
        assertNull(heroGreetingName("  ", "@example.com"))
    }

    @Test
    fun `the named welcome stays the web greetUser string in both languages`() {
        val vi = java.io.File(findRes("values-vi/strings_home.xml")).readText()
        val en = java.io.File(findRes("values/strings_home.xml")).readText()
        // Web final: 'v3.home.greetUser' is "Hi {name}!" in BOTH locales (src/lib/i18n/v3/web.ts), so
        // "Hi" in Vietnamese is the contract, not a missing translation.
        assertEquals(true, vi.contains("name=\"home_v3_greeting_named\">Hi %1\$s!"))
        assertEquals(true, en.contains("name=\"home_v3_greeting_named\">Hi %1\$s!"))
    }

    private fun findRes(rel: String): String {
        var dir: java.io.File? = java.io.File(".").absoluteFile
        while (dir != null) {
            val f = java.io.File(dir, "app/src/main/res/$rel")
            if (f.exists()) return f.path
            val g = java.io.File(dir, "src/main/res/$rel")
            if (g.exists()) return g.path
            dir = dir.parentFile
        }
        error("res/$rel not found")
    }
}

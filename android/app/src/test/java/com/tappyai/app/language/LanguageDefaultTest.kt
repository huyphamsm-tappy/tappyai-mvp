package com.tappyai.app.language

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * TappyAI is a Vietnamese-first product, so "the user has not chosen a language" must mean
 * Vietnamese — not "whatever locale the handset is set to".
 *
 * That distinction is the whole bug: 1118 of 1119 string keys are translated, but with no explicit
 * choice AppCompat fell back to the device locale, so an `en-US` phone resolved `values/` and the
 * user saw an English UI end to end. Reproduced on a fresh install on 2026-09-08.
 */
class LanguageDefaultTest {

    @Test
    fun `vietnamese is the tag the product defaults to`() {
        assertEquals("vi", AppLanguage.Vietnamese.tag)
    }

    @Test
    fun `both product languages map from their backend tags`() {
        // `profiles.language` stores exactly these two values.
        assertEquals(AppLanguage.Vietnamese, AppLanguage.fromTag("vi"))
        assertEquals(AppLanguage.English, AppLanguage.fromTag("en"))
    }

    @Test
    fun `an unknown or absent tag is not silently coerced to a language`() {
        // Null is what lets the caller apply the product default deliberately, rather than a wrong
        // language arriving as if it had been chosen.
        assertNull(AppLanguage.fromTag(null))
        assertNull(AppLanguage.fromTag(""))
        assertNull(AppLanguage.fromTag("fr"))
    }
}

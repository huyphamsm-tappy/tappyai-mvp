package com.tappyai.app.music

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Regression for the CC-BY attribution reconstruction ([attributionFor]) — the legal credit the
 * Sound Detail screen must show for curated (Jamendo) tracks. Mirrors the web `attributionFor`
 * (`src/app/sound/[trackId]/page.tsx`): a Jamendo `mp3d.jamendo.com/?trackid=<id>` audio URL is the
 * only recognised source, everything else yields no attribution (never a fabricated credit).
 */
class SoundAttributionTest {

    @Test
    fun `jamendo audio url reconstructs CC-BY attribution`() {
        val attribution = attributionFor("https://mp3d.jamendo.com/?trackid=1893103&format=mp31")
        requireNotNull(attribution)
        assertEquals("CC-BY", attribution.license)
        assertEquals("Jamendo", attribution.provider)
        assertEquals("https://www.jamendo.com/track/1893103", attribution.source)
    }

    @Test
    fun `non-jamendo url has no attribution`() {
        assertNull(attributionFor("https://example.com/audio/original-sound.mp3"))
        assertNull(attributionFor("https://cdn.tappyai.com/sounds/abc.mp3"))
    }

    @Test
    fun `null or blank url has no attribution`() {
        assertNull(attributionFor(null))
        assertNull(attributionFor(""))
    }
}

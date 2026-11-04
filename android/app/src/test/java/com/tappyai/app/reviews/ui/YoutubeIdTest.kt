package com.tappyai.app.reviews.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Security audit 04/11 (A-02): the YouTube id that is written into the embed page's HTML is a plain 11-character id, never markup. */
class YoutubeIdTest {

    @Test
    fun `a watch link and a short link give their 11-character id`() {
        assertEquals("dQw4w9WgXcQ", extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?t=10"))
        assertEquals("a-_B1c2D3e4", extractYoutubeId("https://www.youtube.com/watch?v=a-_B1c2D3e4&list=x"))
    }

    @Test
    fun `an id carrying a quote, angle bracket, space or any other character plays nothing`() {
        assertNull(extractYoutubeId("https://youtu.be/x\"onload=\"alert(1)"))
        assertNull(extractYoutubeId("https://youtu.be/dQw4w9WgXc\"><script>"))
        assertNull(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9 WgXcQ"))
        assertNull(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXc'"))
    }

    @Test
    fun `an id that is too short or too long, and a link that is not YouTube, give nothing`() {
        assertNull(extractYoutubeId("https://youtu.be/short"))
        assertNull(extractYoutubeId("https://youtu.be/dQw4w9WgXcQextra"))
        assertNull(extractYoutubeId("https://example.com/watch?v=dQw4w9WgXcQ"))
    }
}

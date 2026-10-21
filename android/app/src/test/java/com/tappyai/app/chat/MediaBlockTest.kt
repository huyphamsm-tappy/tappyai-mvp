package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `[TAPPY_MEDIA]` / `[TAPPY_TASK]` / `[TAPPY_RANK]` on the client. Twin of web `mediaHosts.ts`:
 * the raw JSON never shows, and no URL outside the allow-lists survives parsing.
 */
class MediaBlockTest {

    private val prose = "Tin mới hôm nay."

    private fun news(src: String, href: String) =
        """[TAPPY_MEDIA]{"v":1,"kind":"news","items":[{"src":"$src","href":"$href","label":"VnExpress","title":"Tiêu đề"}]}[/TAPPY_MEDIA]"""

    @Test
    fun `a valid news block is parsed and removed from the prose`() {
        val parsed = ChatResponseParser.parse(prose + news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://vnexpress.net/bai-1.html"))

        assertEquals(prose, parsed.text)
        val block = parsed.media.single() as MediaBlock.News
        assertEquals("https://i1-vnexpress.vnecdn.net/a.jpg", block.items.single().src)
        assertFalse(parsed.streamText.contains("TAPPY_MEDIA", ignoreCase = true))
    }

    @Test
    fun `an image or page host outside the allow-list drops the item`() {
        val parsed = ChatResponseParser.parse(prose + news("https://evil.example/a.jpg", "https://vnexpress.net/bai-1.html"))
        assertEquals(prose, parsed.text)
        assertTrue(parsed.media.isEmpty())

        val badPage = ChatResponseParser.parse(prose + news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://evil.example/x"))
        assertTrue(badPage.media.isEmpty())
    }

    @Test
    fun `http, credentials, internal names and IP literals are never allowed`() {
        for (src in listOf(
            "http://i1-vnexpress.vnecdn.net/a.jpg",
            "https://user:pw@i1-vnexpress.vnecdn.net/a.jpg",
            "https://localhost/a.jpg",
            "https://127.0.0.1/a.jpg",
            "https://[::1]/a.jpg",
            "https://upload.wikimedia.org.evil.example/a.jpg",
        )) {
            assertFalse(src, MediaBlocks.isAllowedImage(src))
        }
        assertTrue(MediaBlocks.isAllowedImage("https://upload.wikimedia.org/wikipedia/commons/a.jpg"))
    }

    @Test
    fun `a Wikipedia link must be an article page`() {
        assertTrue(MediaBlocks.isAllowedPage("https://vi.wikipedia.org/wiki/Ha_Noi"))
        assertFalse(MediaBlocks.isAllowedPage("https://vi.wikipedia.org/w/index.php?search=x"))
        assertFalse(MediaBlocks.isAllowedPage("https://vi.wikipedia.org/wiki/A?x=1"))
    }

    @Test
    fun `entity card keeps a valid subject and drops a disallowed image only`() {
        val body = """{"v":1,"kind":"entity","entity":{"name":"Hà Nội","summary":"Thủ đô của Việt Nam.","image":"https://evil.example/i.jpg","href":"https://vi.wikipedia.org/wiki/H%C3%A0_N%E1%BB%99i","source":"Wikipedia"}}"""
        val parsed = ChatResponseParser.parse("$prose[TAPPY_MEDIA]$body[/TAPPY_MEDIA]")

        val card = (parsed.media.single() as MediaBlock.Entities).entities.single()
        assertEquals("Hà Nội", card.name)
        assertEquals(null, card.image)
        assertEquals(prose, parsed.text)
    }

    @Test
    fun `a comparison keeps at most three distinct subjects`() {
        fun e(n: Int) = """{"name":"E$n","summary":"s$n","href":"https://en.wikipedia.org/wiki/E$n"}"""
        val body = """{"v":1,"kind":"entities","entities":[${e(1)},${e(1)},${e(2)},${e(3)},${e(4)}]}"""
        val parsed = ChatResponseParser.parse("[TAPPY_MEDIA]$body[/TAPPY_MEDIA]")

        assertEquals(listOf("E1", "E2", "E3"), (parsed.media.single() as MediaBlock.Entities).entities.map { it.name })
    }

    @Test
    fun `a malformed, truncated or wrong-version block is invisible and yields nothing`() {
        for (raw in listOf(
            "$prose[TAPPY_MEDIA]{not json[/TAPPY_MEDIA]",
            "$prose[TAPPY_MEDIA]{\"v\":1,\"kind\":\"news\",\"items\":[{\"sr",
            "$prose[TAPPY_MEDIA]{\"v\":2,\"kind\":\"news\",\"items\":[]}[/TAPPY_MEDIA]",
            "$prose[/TAPPY_MEDIA]",
        )) {
            val parsed = ChatResponseParser.parse(raw)
            assertEquals(raw, prose, parsed.text)
            assertTrue(raw, parsed.media.isEmpty())
            assertFalse(raw, parsed.streamText.contains("TAPPY_MEDIA", ignoreCase = true))
        }
    }

    @Test
    fun `task and rank control blocks never reach the text, closed or truncated`() {
        val closed = ChatResponseParser.parse(
            """$prose[TAPPY_TASK]{"kind":"x","constraints":[],"servings":null,"missing":[]}[/TAPPY_TASK]""" +
                """[TAPPY_RANK]{"picks":[{"name":"A","why":"b"}],"none":false}[/TAPPY_RANK]""",
        )
        assertEquals(prose, closed.text)

        val cut = ChatResponseParser.parse("$prose[TAPPY_RANK]{\"picks\":[{\"na")
        assertEquals(prose, cut.text)
        assertFalse(cut.streamText.contains("TAPPY_RANK", ignoreCase = true))
    }

    @Test
    fun `other markers around a media block still parse`() {
        val parsed = ChatResponseParser.parse(
            prose + news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://vnexpress.net/bai-1.html") + "[FOLLOWUPS]Thêm tin|Tin khác[/FOLLOWUPS]",
        )
        assertEquals(prose, parsed.text)
        assertEquals(listOf("Thêm tin", "Tin khác"), parsed.followups)
        assertEquals(1, parsed.media.size)
    }
}

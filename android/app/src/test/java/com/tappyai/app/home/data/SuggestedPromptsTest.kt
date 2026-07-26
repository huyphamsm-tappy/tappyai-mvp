package com.tappyai.app.home.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/** Pins the /api/suggested-prompts response parse (web `{prompts:[{text,textEn,emoji,category}]}`). */
class SuggestedPromptsTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `parses the prompts array with both locales`() {
        val payload = """
            {"prompts":[
              {"text":"Ăn gì tối nay?","textEn":"What to eat tonight?","emoji":"🍜","category":"food"},
              {"text":"Cà phê yên tĩnh gần đây?","textEn":"A quiet café nearby?","emoji":"☕","category":"food"}
            ],"hour":19,"dayOfWeek":3,"gender":null}
        """.trimIndent()
        val response = json.decodeFromString<SuggestedPromptsResponseDto>(payload)
        assertEquals(2, response.prompts.size)
        assertEquals("Ăn gì tối nay?", response.prompts[0].text)
        assertEquals("What to eat tonight?", response.prompts[0].textEn)
        assertEquals("food", response.prompts[0].category)
    }

    @Test
    fun `missing fields default to empty`() {
        val response = json.decodeFromString<SuggestedPromptsResponseDto>("""{"prompts":[{"text":"Hi"}]}""")
        assertEquals("Hi", response.prompts[0].text)
        assertEquals("", response.prompts[0].textEn)
    }
}

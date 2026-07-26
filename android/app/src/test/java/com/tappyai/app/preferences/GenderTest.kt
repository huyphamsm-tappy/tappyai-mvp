package com.tappyai.app.preferences

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Pins the Gender ↔ Supabase-auth-metadata wire mapping against the web (`'male' | 'female'`). */
class GenderTest {

    @Test
    fun `wire values and parsing match the web contract`() {
        assertEquals("female", Gender.Female.wire)
        assertEquals("male", Gender.Male.wire)
        assertEquals(Gender.Male, Gender.fromWire("male"))
        assertEquals(Gender.Female, Gender.fromWire("female"))
        assertNull(Gender.fromWire(null))
        assertNull(Gender.fromWire("other"))
        assertNull(Gender.fromWire(""))
    }
}

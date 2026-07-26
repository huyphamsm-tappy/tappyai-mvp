package com.tappyai.app.fortune.tarot

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the full 78-card deck (web parity, `tarotData.ts` = 22 major + 56 generated minor). The
 * baseline shipped only the 22 major arcana; this pins the count, id uniqueness, and the generated
 * minor-card shape so a future edit can't silently drop back to a partial deck.
 */
class TarotDeckTest {

    @Test
    fun `deck has all 78 cards with unique ids`() {
        assertEquals(78, TAROT_DECK.size)
        assertEquals(78, TAROT_DECK.map { it.id }.toSet().size)
        assertEquals((0..77).toList(), TAROT_DECK.map { it.id }.sorted())
    }

    @Test
    fun `first minor card is Ace of Wands, generated from the templates`() {
        val ace = TAROT_DECK[22] // first minor after 22 major (ids 0..21)
        assertEquals("Ace Gậy", ace.nameVi)
        assertEquals("🔥", ace.emoji)
        assertEquals(listOf("khởi đầu", "công việc"), ace.keywordsUpright)
        assertTrue(ace.meaningUpright.endsWith("đặc biệt trong lĩnh vực công việc, đam mê và hành động."))
    }

    @Test
    fun `each of the 4 suits contributes 14 ranks`() {
        val minor = TAROT_DECK.drop(22)
        assertEquals(56, minor.size)
        listOf("Gậy", "Cốc", "Kiếm", "Tiền").forEach { suit ->
            assertEquals(14, minor.count { it.nameVi.endsWith(" $suit") })
        }
    }
}

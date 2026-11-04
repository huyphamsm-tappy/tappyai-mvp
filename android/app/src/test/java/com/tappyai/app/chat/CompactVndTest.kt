package com.tappyai.app.chat

import com.tappyai.core.common.formatCompactVnd
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Review 02/11: the compact price on a shopping card and in price tracking cut instead of rounding ("25.990.000" read "25.9 triệu", a
 * lower price than the shop's), used a point where Vietnamese reads a comma, and showed "0k" for a price under 1.000 and a cut "Nk" for
 * one between 1.000 and 999.999. A card must not state a price the server did not (the rule in ShoppingDecisionCard.priceRangeText).
 */
class CompactVndTest {
    @Test fun `millions are rounded to one decimal with a comma`() {
        assertEquals("26 triệu", formatCompactVnd(25_990_000))
        assertEquals("25,8 triệu", formatCompactVnd(25_800_000))
        assertEquals("2 triệu", formatCompactVnd(2_000_000))
        assertEquals("1,5 triệu", formatCompactVnd(1_500_000))
        assertEquals("1 triệu", formatCompactVnd(1_049_999))
    }

    @Test fun `just under a million that rounds up reads as a million`() {
        assertEquals("1 triệu", formatCompactVnd(999_960))
    }

    @Test fun `thousands keep their exact value`() {
        assertEquals("250k", formatCompactVnd(250_000))
        assertEquals("249.500đ", formatCompactVnd(249_500))
        assertEquals("500đ", formatCompactVnd(500))
    }
}

package com.tappyai.app.chat

import androidx.compose.ui.unit.Constraints
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The price pill in a plan item carries no weight, so Row measures it before the weighted name
 * group and offers it the whole row. When the model wrote a price as a sentence
 * ("~450.000 VND (2 người, 2 tô phở + nước)") the pill measured 428px of a 487px row and the place
 * name was left ~20px — too narrow for any word, so Compose broke it between characters and
 * "Phở Việt Nam" rendered one letter per line.
 *
 * These pin the rule that bounds the pill. The layout phase itself needs a device; what is covered
 * here is the arithmetic, and above all the width the name is guaranteed.
 */
class PlanItemPriceWidthTest {

    /**
     * Content width of the name/price row on the device the bug was reported on: 720x1600 at
     * density 300, i.e. a scale of 1.875, measured from a uiautomator dump of the rendered card.
     */
    private val rowPx = 507

    /** PLAN_NAME_MIN_WIDTH — 120dp at that same 1.875 scale. */
    private val reservePx = 225

    private val minFraction = 0.35f

    @Test
    fun `pill gives up the reserved width when it would otherwise take the row`() {
        assertEquals(282, cappedMaxWidthPx(rowPx, reservePx, minFraction))
    }

    @Test
    fun `a price that already fits is measured unchanged`() {
        // The cap only bounds the measurement — a pill narrower than the cap keeps its intrinsic
        // width, so rows with an ordinary price ("Free", "~200k") lay out exactly as before.
        val cap = cappedMaxWidthPx(rowPx, reservePx, minFraction)
        assertTrue("an ordinary price must still be free to size itself", cap > 200)
    }

    @Test
    fun `whatever the price, the name group is left the full reserve`() {
        // The contract the fix rests on. Asserted across the range of row widths the app lays out
        // in — phone portrait through an unfolded foldable — rather than at one measured width,
        // since the failure was that the name group could be left almost nothing.
        for (row in intArrayOf(400, 487, 640, 900, 1400)) {
            val left = row - cappedMaxWidthPx(row, reservePx, minFraction)
            assertTrue("row $row px left the name only $left px", left >= reservePx)
        }
    }

    @Test
    fun `pill never vanishes on a very narrow row`() {
        // A row narrower than the reserve would otherwise cap the pill at zero and erase the price.
        val narrow = 200
        val cap = cappedMaxWidthPx(narrow, reservePx, minFraction)
        assertEquals(70, cap)
        assertTrue("the price must keep some width", cap > 0)
    }

    @Test
    fun `the reserve covers the word that was breaking mid-word`() {
        val gapPx = 15      // TappySpacing.sm between the name group and the pill, at 1.875
        val emojiPx = 45    // the emoji and its gap sit inside the name group, ahead of the text
        val nameTextPx = rowPx - cappedMaxWidthPx(rowPx, reservePx, minFraction) - gapPx - emojiPx

        // At the previous 96dp reserve the name text measured 125px and "PASTEUR" — which runs to
        // ~140px in this style — broke as "PASTEU" / "R". Both figures come from a uiautomator dump
        // of the rendered card, not from an estimate.
        assertTrue("name text width was $nameTextPx px, still too narrow", nameTextPx >= 140)
    }

    @Test
    fun `an unbounded parent is passed through untouched`() {
        // A horizontally scrolling parent offers Infinity; subtracting from it would silently
        // truncate the pill to just under Int.MAX_VALUE.
        assertEquals(Constraints.Infinity, cappedMaxWidthPx(Constraints.Infinity, reservePx, minFraction))
    }
}

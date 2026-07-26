package com.tappyai.app.splitbill

import java.text.NumberFormat
import java.util.Locale

/**
 * Pure split-bill math, mirroring the web `/split-bill` page (`src/app/split-bill/page.tsx`).
 * No backend — a self-contained calculator. Kept separate from the screen so the arithmetic is
 * unit-testable in isolation.
 */
object SplitBillCalculator {

    val TIP_PRESETS = listOf(0, 5, 10, 15, 20)
    const val MIN_PEOPLE = 2
    const val MAX_PEOPLE = 20

    /** Web: `activeTip = customTip !== '' ? parseFloat(customTip) || 0 : tip`. A non-blank custom
     *  field overrides the preset; an unparseable custom value counts as 0. */
    fun activeTipPercent(tipPreset: Int, customTip: String): Double =
        if (customTip.isNotBlank()) customTip.toDoubleOrNull() ?: 0.0 else tipPreset.toDouble()

    /** Web: `parseFloat(total.replace(/[^0-9.]/g, '')) || 0`. */
    fun parseAmount(raw: String): Double =
        raw.replace(Regex("[^0-9.]"), "").toDoubleOrNull() ?: 0.0

    fun grandTotal(total: Double, tipPercent: Double): Double = total * (1 + tipPercent / 100)

    fun perPerson(grandTotal: Double, people: Int): Double = if (people > 0) grandTotal / people else 0.0

    fun tipAmount(total: Double, tipPercent: Double): Double = total * tipPercent / 100

    /** One person's custom share = their amount grossed up by the tip. */
    fun personShare(amount: Double, tipPercent: Double): Double = amount * (1 + tipPercent / 100)
}

/** vi-VN grouped integer formatting (web `n.toLocaleString('vi-VN', {maximumFractionDigits:0})`). */
fun formatSplitAmount(value: Double): String {
    val nf = NumberFormat.getNumberInstance(Locale("vi", "VN"))
    nf.maximumFractionDigits = 0
    return nf.format(value)
}

/** The tip PERCENT label, mirroring web `String(activeTip)`: a whole percent shows with no decimal
 *  (10 → "10"), a fractional custom tip keeps its decimal (12.5 → "12.5"). Not currency-formatted —
 *  it is a percentage, so it must not be rounded to an integer or thousands-grouped. */
fun formatTipPercent(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()

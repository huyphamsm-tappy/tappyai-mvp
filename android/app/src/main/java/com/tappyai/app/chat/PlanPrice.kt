package com.tappyai.app.chat

/**
 * A plan price is shown only when it IS a price — the Android mirror of `src/lib/plans/planPrice.ts`.
 *
 * The planning prompt tells the model to write the literal sentinel "chưa có giá" / "price not
 * available" for a step, a cost-breakdown line or the budget when the tools returned no price. The
 * plan card, the Planner and the share text then painted that sentinel in the PRICE slot (a price
 * chip, a budget row), so "no price" read as if it were one — the class of F-052.
 *
 * Applied once, in [ChatResponseParser.parse], so every consumer of [TappyPlan] reads the projected
 * plan. The verbatim `planJson` sent to `POST /api/plans/share` is re-projected by the server.
 *
 * A value is kept when it states an amount — it has a digit ("150.000đ", "200k", "1,2 triệu") or
 * says the thing is free ("Miễn phí", "Free": an amount of zero). Everything else is dropped, never
 * rewritten.
 */
object PlanPrice {
    private val NO_PRICE = Regex(
        """(?iu)chưa\s*có\s*giá|chưa\s*rõ\s*giá|không\s*rõ\s*giá|price\s*not\s*available|no\s*price|\bn/a\b|\bunknown\b""",
    )

    // No `\b` after "phí": a Unicode-letter lookahead, so the rule matches the web one exactly.
    private val FREE = Regex("""(?iu)^(?:miễn\s*phí|free)(?!\p{L})""")
    private val DIGIT = Regex("""\d""")

    /** The value when it is an actual amount (or "free"); null otherwise. */
    @JvmStatic
    fun amount(raw: String?): String? {
        val v = raw?.trim().orEmpty()
        if (v.isEmpty() || NO_PRICE.containsMatchIn(v)) return null
        return if (DIGIT.containsMatchIn(v) || FREE.containsMatchIn(v)) v else null
    }

    /** The same plan with every price-bearing field that is not an amount removed. */
    @JvmStatic
    fun project(plan: TappyPlan): TappyPlan = plan.copy(
        budgetTotal = amount(plan.budgetTotal),
        costBreakdown = plan.costBreakdown
            ?.mapNotNull { (k, v) -> amount(v)?.let { k to it } }
            ?.toMap()
            ?.takeIf { it.isNotEmpty() },
        days = plan.days.map { day -> day.copy(items = day.items.map { it.copy(price = amount(it.price)) }) },
    )
}

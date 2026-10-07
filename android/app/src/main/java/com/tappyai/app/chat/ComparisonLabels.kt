package com.tappyai.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/**
 * Resolves the comparison's user-facing strings from resources.
 *
 * Kept separate so [shoppingComparisonFrom] stays pure Kotlin with no Android dependency — the
 * derivation rules (what is unknown, what counts as identical, when a recommendation may be
 * marked) are then testable on the JVM without Compose or a resource context.
 *
 * The price formatter delegates to [priceRangeText], the same function the decision card uses, so
 * a range shown in the comparison can never disagree with the range shown above it.
 */
@Composable
fun comparisonLabels(): ComparisonLabels {
    val unknown = stringResource(R.string.shopping_decision_no_price)
    val sellerCountLabel = stringResource(R.string.comparison_seller_count, 0)
    return ComparisonLabels(
        price = stringResource(R.string.comparison_attr_price),
        match = stringResource(R.string.comparison_attr_match),
        sellers = stringResource(R.string.comparison_attr_sellers),
        unknown = stringResource(R.string.comparison_unknown),
        matchExact = stringResource(R.string.shopping_decision_match_exact),
        matchDifferent = stringResource(R.string.shopping_decision_match_different),
        matchUnknown = stringResource(R.string.shopping_decision_match_unknown),
        // Resource formatting needs the count up front, so the zero-form is templated once and the
        // real count substituted — avoids a stringResource call inside a non-composable lambda.
        sellerCount = { n -> sellerCountLabel.replaceFirst("0", n.toString()) },
        priceRange = { low, high -> priceRangeText(low, high, unknown) },
    )
}

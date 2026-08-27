package com.tappyai.app.chat

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing
import java.text.NumberFormat
import java.util.Locale

/**
 * Renders the grounded shopping DECISION carried by the server's `[TAPPY_SHOPPING]` marker — the
 * Android counterpart of the web `ShoppingDecision.tsx` and the iOS `ShoppingDecisionView`.
 *
 * It GROUPS NOTHING and INFERS NOTHING. Every configuration, price range, seller and verdict is
 * read straight off the server object; a value the server sent as `null` renders as
 * "Chưa rõ" / "Not stated", never as a fabricated number. That rule is the whole reason the card
 * exists rather than letting the model narrate the listing table itself.
 *
 * Before this existed, Android had no parser for the marker and rendered the raw JSON payload into
 * the chat — the production P0 this fixes.
 */
@Composable
fun ShoppingDecisionCard(decision: ShoppingDecision, modifier: Modifier = Modifier) {
    val recommended = decision.entities.firstOrNull { it.recommended == true }
        ?: decision.entities.firstOrNull()
        ?: return
    val others = decision.entities.filter { it.key != recommended.key }
    val rec = decision.recommendation

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        // ── The pick ────────────────────────────────────────────────────────
        Text(
            text = stringResource(R.string.chat_shopping_recommended).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = recommended.config.ifBlank { stringResource(R.string.chat_shopping_unknown) },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        MatchChip(recommended.matchesRequest)
        PriceLine(recommended)

        // Sellers for the recommended configuration. The recommended seller (when the server named
        // one) leads; the rest follow so the user can still see the spread without the card
        // implying the cheapest is an offer for a different machine.
        val featured = recommended.offers.firstOrNull { it.seller != null && it.seller == rec?.seller }
        val ordered = listOfNotNull(featured) + recommended.offers.filter { it !== featured }
        ordered.forEach { OfferRow(it) }

        // ── Why, and what you give up ───────────────────────────────────────
        val reasons = rec?.reasons.orEmpty()
        if (reasons.isNotEmpty()) {
            Text(
                text = stringResource(R.string.chat_shopping_why),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
            reasons.forEach {
                Text("• ${it.evidence}", style = MaterialTheme.typography.bodySmall)
            }
        }
        rec?.tradeOff?.let {
            Text(
                text = stringResource(R.string.chat_shopping_tradeoff),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text("• ${it.evidence}", style = MaterialTheme.typography.bodySmall)
        }
        if (rec?.conditional == true) {
            Text(
                text = stringResource(R.string.chat_shopping_conditional),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // ── Alternatives, only when the server actually supplied them ───────
        if (others.isNotEmpty()) {
            Text(
                text = stringResource(R.string.chat_shopping_other_options),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
            others.forEach { entity ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = entity.config.ifBlank { stringResource(R.string.chat_shopping_unknown) },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    MatchChip(entity.matchesRequest)
                    PriceLine(entity)
                    entity.offers.forEach { OfferRow(it) }
                }
            }
        }
    }
}

/** The server's `matchesRequest` verdict, shown verbatim — never re-derived on the client. */
@Composable
private fun MatchChip(match: String?) {
    val label = when (match) {
        "khop" -> stringResource(R.string.chat_shopping_match_khop)
        "khac" -> stringResource(R.string.chat_shopping_match_khac)
        "chua_ro" -> stringResource(R.string.chat_shopping_match_chua_ro)
        else -> return // an unknown verdict says nothing rather than guessing
    }
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/**
 * Price range. A missing bound is stated as unknown — the server sends `null` when no listing in
 * the group carried a structured price, and showing 0 there would be a fabricated claim.
 */
@Composable
private fun PriceLine(entity: ShoppingEntity) {
    val low = entity.priceLow
    val high = entity.priceHigh
    val text = when {
        low == null && high == null -> stringResource(R.string.chat_shopping_unknown)
        low != null && high != null && low != high -> "${vnd(low)} – ${vnd(high)}"
        else -> vnd(low ?: high!!)
    }
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary,
    )
}

/** One seller row. Tapping opens that seller's own listing — never a search page we invented. */
@Composable
private fun OfferRow(offer: ShoppingOffer) {
    val context = LocalContext.current
    val url = offer.url
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (url.isNullOrBlank()) Modifier
                else Modifier.clickable {
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                }
            )
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = offer.seller ?: stringResource(R.string.chat_shopping_unknown),
                style = MaterialTheme.typography.bodySmall,
            )
            offer.condition?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        offer.price?.let {
            Text(
                text = vnd(it),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (!url.isNullOrBlank()) {
            Icon(
                imageVector = Icons.Filled.OpenInNew,
                contentDescription = stringResource(R.string.chat_shopping_view),
                modifier = Modifier.padding(start = 6.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/** Grouped VND, matching how prices read everywhere else in the app. */
private fun vnd(value: Double): String =
    NumberFormat.getNumberInstance(Locale("vi", "VN")).format(value.toLong()) + "₫"

package com.tappyai.app.deals

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.booleanResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.brand.BrandLogo
import com.tappyai.app.brand.hasBrandLogo
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyImage
import kotlinx.coroutines.delay
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * Deals — mirrors the web `/deals`: a list of curated, daily-rotating deals from
 * `GET /api/deals`. Every card is an external link (opened via the system browser, matching the
 * web's `<a target="_blank">`) — there is no in-app booking/checkout, same "platform search link,
 * never a fake in-app CTA" rule the rest of the app follows.
 */
@Composable
fun DealsScreen(
    // Null when Deals is a top-level shell tab (Web parity: /deals is a primary nav destination):
    // the shell's TappyAppBar already shows the title, so the in-content back+title header is
    // suppressed. Non-null keeps the drill-in header for any push-navigation caller.
    onBack: (() -> Unit)? = null,
    viewModel: DealsViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    val uriHandler = LocalUriHandler.current

    // The feed is localized SERVER-side — `category` and `description` arrive already translated,
    // chosen by the `?lang=` the request carried — so switching language has to refetch, not just
    // re-resolve strings. Keyed on the resolved resources, the same authority that chose the
    // subtitle and the "via X" line beside the cards, so the two cannot disagree.
    // See [DealsViewModel.onLanguageResolved]; this replaces a load in the ViewModel's init.
    val english = booleanResource(R.bool.resources_are_english)
    LaunchedEffect(english) { viewModel.onLanguageResolved(english) }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxSize()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            if (onBack != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                    Text(text = stringResource(R.string.deals_title), style = MaterialTheme.typography.titleLarge)
                }
            }

            when (state) {
                UiState.Loading, UiState.Idle -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    TappyLoadingIndicator()
                }
                is UiState.Error -> TappyErrorState(
                    title = stringResource(R.string.deals_error_title),
                    message = state.message,
                    onRetry = viewModel::retry,
                )
                UiState.Empty -> TappyEmptyState(
                    icon = Icons.Filled.LocalOffer,
                    title = stringResource(R.string.deals_empty_title),
                    message = stringResource(R.string.deals_empty_message),
                )
                is UiState.Success -> DealsList(
                    deals = state.data,
                    onOpen = { deal ->
                        // Web parity: fire the click counter, then open the link regardless.
                        viewModel.onDealOpen(deal)
                        uriHandler.openUri(deal.officialUrl)
                    },
                )
            }
        }
    }
}

@Composable
private fun DealsList(deals: List<Deal>, onOpen: (Deal) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val keys = remember(deals) { dealListKeys(deals) }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        // Web parity (deals.subtitle): curated-count line above the list.
        item {
            Text(
                text = stringResource(R.string.deals_subtitle, deals.size),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                modifier = Modifier.padding(bottom = TappySpacing.xs),
            )
        }
        // 🚨 Keys come from [dealListKeys], never straight from a field. Every DTO field decodes
        // with a default, so one the backend stops sending turns every deal's key blank and
        // Compose throws `Key "" was already used` at measure time — the whole tab dies before it
        // draws. That happened once already, on `officialUrl`.
        itemsIndexed(items = deals, key = { index, _ -> keys[index] }) { _, deal ->
            DealCard(deal = deal, onOpen = { onOpen(deal) })
        }
        // Web parity (deals.disclosure*, MFS 3.10): commercial-nature disclosure under the list.
        item {
            Text(
                text = stringResource(R.string.deals_disclosure),
                style = MaterialTheme.typography.labelSmall,
                color = colors.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = TappySpacing.lg),
            )
        }
    }
}

/** Maps a VN category label to a palette colour, mirroring the web `CATEGORY_COLORS` set. Each web
 *  category maps to the nearest colour in Android's 7-colour palette (web sky→blue, yellow→amber,
 *  emerald/teal→green, indigo→purple, rose→pink). Every category web colours must colour here too —
 *  previously "Vận chuyển" (e.g. Grab/Be) and others fell through to no badge. */
@Composable
private fun categoryColor(category: String) = when (category) {
    "Điện tử" -> tappyCategoryColors.blue
    "Mua sắm" -> tappyCategoryColors.orange
    "Ăn uống", "Gia dụng", "Siêu thị" -> tappyCategoryColors.green
    "Du lịch", "Sách" -> tappyCategoryColors.purple
    "Vận chuyển" -> tappyCategoryColors.blue
    "Tiết kiệm" -> tappyCategoryColors.amber
    "Thời trang", "Làm đẹp" -> tappyCategoryColors.pink
    else -> null
}

@Composable
private fun DealCard(deal: Deal, onOpen: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(colors.surfaceVariant)
            .clickable(onClick = onOpen)
            .padding(TappySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        // Logo tile (48dp), three-step fallback — BRAND_ASSETS.md §8, identical on every platform:
        //   1. the registry's official mark, which WINS for a known partner
        //   2. the deal's own logoImage from the API
        //   3. the partner's initial
        // Android shipped only step 3, so every card showed "S", "T", "G" where the web showed the
        // real Shopee, TikTok Shop and Grab marks. The API is not at fault and needs no change:
        // `logoImage` is null on every current row by design, and the registry deliberately
        // outranks per-content images for partners it knows.
        if (hasBrandLogo(deal.partnerName)) {
            BrandLogo(partnerName = deal.partnerName, size = 48.dp)
        } else {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(TappyShapes.input)
                    .background(tappyCategoryColors.orange.container),
                contentAlignment = Alignment.Center,
            ) {
                if (deal.logoImage != null) {
                    TappyImage(url = deal.logoImage, contentDescription = null, modifier = Modifier.fillMaxSize().clip(TappyShapes.input))
                } else {
                    Text(
                        text = deal.partnerName.firstOrNull()?.uppercase() ?: "?",
                        style = MaterialTheme.typography.titleMedium,
                        color = tappyCategoryColors.orange.onContainer,
                    )
                }
            }
        }

        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = deal.title,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                // Discount badge — only when the deal carries one (web parity).
                deal.discountLabel?.let { label ->
                    Box(
                        modifier = Modifier
                            .clip(TappyShapes.pill)
                            .background(tappyCategoryColors.red.accent)
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    ) {
                        Text(text = label, style = MaterialTheme.typography.labelSmall, color = colors.onError)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                // Colour keyed by the language-independent categoryKey (stable vi label); the
                // pill text shows the localized category.
                categoryColor(deal.categoryKey)?.let { catColor ->
                    Box(
                        modifier = Modifier
                            .clip(TappyShapes.pill)
                            .background(catColor.container)
                            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
                    ) {
                        Text(text = deal.category, style = MaterialTheme.typography.labelSmall, color = catColor.onContainer)
                    }
                }
                CountdownLabel(endAt = deal.endAt)
            }

            deal.description?.takeIf { it.isNotBlank() }?.let { description ->
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            deal.voucherCode?.let { code -> VoucherChip(code = code) }

            Text(
                text = stringResource(R.string.deals_via_source, deal.partnerName),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
            )
        }

        Icon(
            imageVector = Icons.AutoMirrored.Filled.OpenInNew,
            contentDescription = stringResource(R.string.deals_opens_externally_description),
            tint = colors.onSurfaceVariant,
        )
    }
}

/** Countdown pill: nothing / "🔥 Ending Soon" / "N days left" (with a clock), per [promoCountdown]. */
@Composable
private fun CountdownLabel(endAt: String?) {
    val countdown = remember(endAt) { promoCountdown(endAt, System.currentTimeMillis()) }
    when (countdown) {
        PromoCountdown.None -> Unit
        PromoCountdown.Soon -> Text(
            text = stringResource(R.string.deals_ending_soon),
            style = MaterialTheme.typography.labelSmall,
            color = tappyCategoryColors.red.accent,
        )
        is PromoCountdown.Days -> Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Schedule, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(11.dp))
            Text(
                text = if (countdown.days == 1) stringResource(R.string.deals_day_left)
                else stringResource(R.string.deals_days_left, countdown.days),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Copyable voucher chip. Its own clickable — copying must NOT open the deal or fire the click POST
 *  (web `stopPropagation` + `preventDefault`). Shows a 1.5s "copied" state. */
@Composable
private fun VoucherChip(code: String) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) { delay(1500); copied = false }
    }
    Row(
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(tappyCategoryColors.orange.container)
            .clickable {
                clipboard.setText(AnnotatedString(code))
                copied = true
            }
            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (copied) stringResource(R.string.deals_code_copied)
            else "${stringResource(R.string.deals_voucher_label)}: $code",
            style = MaterialTheme.typography.labelSmall,
            color = tappyCategoryColors.orange.onContainer,
        )
        Icon(
            imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
            contentDescription = stringResource(R.string.deals_copy_code),
            tint = tappyCategoryColors.orange.onContainer,
            modifier = Modifier.size(12.dp),
        )
    }
}

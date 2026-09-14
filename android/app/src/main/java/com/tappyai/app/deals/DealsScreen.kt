package com.tappyai.app.deals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ChatBubbleOutline
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.booleanResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.brand.BrandLogo
import com.tappyai.app.brand.hasBrandLogo
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors
import kotlinx.coroutines.delay

/**
 * Deals — the V3 surface (master mockup `05_37_58 PM`) over the SAME `GET /api/deals` feed the
 * previous list rendered. One screen, one route, one ViewModel, one repository: the composition
 * changed, the architecture did not.
 *
 * ── What the mockup shows that the feed does not have ────────────────────────
 * Checked against the live feed on 2026-09-08 (7 deals):
 *   · `discountLabel` — null on 7/7. So NO "-50%" badge is drawn. The percentages in the mockup are
 *     illustrative, and rendering them would be inventing a promotion the partner never offered.
 *   · `bannerImage` / `logoImage` — null on 7/7. No product photography and no brand marks exist,
 *     and none ship as app assets, so the card uses a neutral monogram tile instead of borrowed
 *     artwork.
 *   · "Ăn uống" appears as a filter pill and as ShopeeFood's badge in the mockup, but ShopeeFood's
 *     real category is "Mua sắm". The pills are built from the categories the data actually has.
 *
 * Everything else in the mockup IS real: the seven partners, their descriptions, their categories,
 * their official URLs, and `isFeatured` — which is what "Deal nổi bật hôm nay" now means, rather
 * than a guess about which cards look best.
 *
 * ── Kept from the previous list, because they are DATA, not composition ──────
 *   · the feed is localized server-side, so it is re-fetched when the app language changes
 *     ([DealsViewModel.onLanguageResolved]);
 *   · opening a deal fires the popularity counter first ([DealsViewModel.onDealOpen], web parity);
 *   · a real `voucherCode` renders as a copyable chip and a real `endAt` as a countdown — both null
 *     on every current row, so both are absent today and appear the day the feed carries them;
 *   · a partner the brand registry knows gets its official mark (BRAND_ASSETS.md §8); the monogram
 *     tile is the fallback for the rest, never a borrowed logo.
 */
@Composable
fun DealsScreen(
    // Null when Deals is a top-level shell tab: the shell's app bar owns the title, so the in-content
    // back button is suppressed. Non-null keeps the drill-in header for push-navigation callers.
    onBack: (() -> Unit)? = null,
    /**
     * Opens the existing Chat with a prefilled question. Null when the caller has no Chat to route
     * to, and then the "ask Tappy" affordances are not drawn at all rather than drawn dead — the
     * mockup's CTA is only worth showing when it really goes somewhere.
     */
    onAskTappy: ((String) -> Unit)? = null,
    viewModel: DealsViewModel = hiltViewModel(),
) {
    val state = viewModel.uiState
    val uriHandler = LocalUriHandler.current

    // See [DealsViewModel.onLanguageResolved]; this replaces a load in the ViewModel's init.
    val english = booleanResource(R.bool.resources_are_english)
    LaunchedEffect(english) { viewModel.onLanguageResolved(english) }

    // Web parity: fire the click counter, then open the link regardless. A deal whose
    // `officialUrl` decoded blank has no destination and is not counted either.
    val openDeal: (Deal) -> Unit = { deal ->
        deal.officialUrl.takeIf { it.isNotBlank() }?.let { url ->
            viewModel.onDealOpen(deal)
            uriHandler.openUri(url)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        DealsHeader(onBack = onBack)

        when (state) {
            UiState.Loading, UiState.Idle ->
                Box(Modifier.fillMaxSize(), Alignment.Center) { TappyLoadingIndicator() }
            is UiState.Error -> TappyErrorState(
                title = stringResource(R.string.deals_error_title),
                message = state.message,
                onRetry = viewModel::retry,
            )
            is UiState.Empty -> TappyEmptyState(
                icon = Icons.Filled.LocalOffer,
                title = stringResource(R.string.deals_empty_title),
                message = stringResource(R.string.deals_empty_message),
            )
            is UiState.Success -> {
                val deals = viewModel.visibleDeals
                val featured = deals.filter { it.isFeatured }.ifEmpty { deals }
                val keys = remember(featured) { dealListKeys(featured) }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = TappySpacing.lg, end = TappySpacing.lg, bottom = TappySpacing.xxxl,
                    ),
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
                ) {
                    if (onAskTappy != null) {
                        item(key = "hero") {
                            // Read in composition, not in the click handler — stringResource is a
                            // @Composable and cannot be called from a lambda that runs on tap.
                            val generalPrefill = stringResource(R.string.deals_ask_general_prefill)
                            AskTappyHero(
                                partners = state.data.map { it.partnerName }.distinct(),
                                onAsk = { onAskTappy(generalPrefill) },
                            )
                        }
                    }
                    item(key = "daily") { DailyUpdateStrip() }
                    item(key = "categories") {
                        CategoryPills(
                            categories = viewModel.categories,
                            selected = viewModel.selectedCategory,
                            onSelect = viewModel::onCategorySelected,
                        )
                    }
                    if (state.data.isNotEmpty()) {
                        item(key = "platforms") {
                            PlatformRail(deals = state.data, onOpen = openDeal)
                        }
                    }
                    item(key = "featured-title") {
                        SectionHeader(title = stringResource(R.string.deals_featured_title))
                    }
                    if (featured.isEmpty()) {
                        item(key = "featured-empty") {
                            Text(
                                text = stringResource(R.string.deals_filter_empty),
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = TappySpacing.lg),
                            )
                        }
                    }
                    // Two columns, paired manually so the whole page stays ONE LazyColumn — a
                    // nested LazyVerticalGrid inside a scrolling parent has no bounded height.
                    itemsIndexed(
                        items = featured.chunked(2),
                        key = { index, _ -> "row-" + (keys.getOrNull(index * 2) ?: index.toString()) },
                    ) { _, pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                            pair.forEach { deal ->
                                DealCard(
                                    deal = deal,
                                    modifier = Modifier.weight(1f),
                                    onAskTappy = onAskTappy,
                                    onOpen = { openDeal(deal) },
                                )
                            }
                            // Keeps a lone final card at column width instead of stretching it.
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DealsHeader(onBack: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.common_back),
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            // As a shell tab the app bar above already reads "Deals", so repeating the title here
            // would print it twice. The subtitle is the part the mockup adds that the shell has no
            // way to show, so it is kept on its own; a drill-in caller (onBack != null) has no app
            // bar of its own and gets the full title.
            if (onBack != null) {
                Text(
                    text = stringResource(R.string.deals_v3_title),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                text = stringResource(R.string.deals_v3_subtitle),
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // The mockup's search and bell are NOT drawn: Deals has no search of its own, and no daily
        // deal subscription exists to toggle. A button that does nothing is worse than its absence.
    }
}

/** The "Hỏi Tappy trước khi mua" banner. Its CTA opens the real Chat with a real prefill. */
@Composable
private fun AskTappyHero(partners: List<String>, onAsk: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF1E2A78), Color(0xFF3B2E8F))))
            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(20.dp))
            .padding(TappySpacing.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.tappy_shopping),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(76.dp),
            )
            Column(modifier = Modifier.weight(1f).padding(start = TappySpacing.md)) {
                Text(
                    text = stringResource(R.string.deals_hero_title),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.deals_hero_body),
                    fontSize = 12.5.sp,
                    color = Color(0xFFCBD5E1),
                    lineHeight = 18.sp,
                )
            }
        }
        Spacer(Modifier.height(TappySpacing.md))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF8B7CFF))))
                .clickable(onClick = onAsk)
                .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.deals_hero_cta),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(TappySpacing.sm))
            Icon(
                Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(17.dp),
            )
        }
        // "Các nền tảng Tappy đang tổng hợp" — the partner names the feed really returned. No brand
        // logos: the feed sends `logoImage: null` for every deal and none ship as app assets, so
        // these are name chips rather than borrowed marks.
        if (partners.isNotEmpty()) {
            Spacer(Modifier.height(TappySpacing.md))
            Text(
                text = stringResource(R.string.deals_hero_platforms_label),
                fontSize = 10.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF94A3B8),
            )
            Spacer(Modifier.height(TappySpacing.sm))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                items(partners) { name ->
                    Text(
                        text = name,
                        fontSize = 11.sp,
                        color = Color.White,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0x1FFFFFFF))
                            .padding(horizontal = TappySpacing.sm, vertical = 5.dp),
                    )
                }
            }
        }
    }
}

/**
 * The daily-update strip.
 *
 * Informational only. The mockup pairs it with a "Nhận deal mỗi ngày" subscribe button, and that
 * button is deliberately absent: `NotificationsViewModel` holds a local flag whose own comment says
 * nothing is actually subscribed, so the control would promise a daily notification the product
 * cannot send.
 */
@Composable
private fun DailyUpdateStrip() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Bolt,
            contentDescription = null,
            tint = Color(0xFFF59E0B),
            modifier = Modifier.size(19.dp),
        )
        Text(
            text = stringResource(R.string.deals_daily_note),
            fontSize = 12.5.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = TappySpacing.sm),
        )
    }
}

@Composable
private fun CategoryPills(categories: List<String>, selected: String?, onSelect: (String?) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        item(key = "all") {
            CategoryPill(
                label = stringResource(R.string.deals_filter_all),
                isSelected = selected == null,
                onClick = { onSelect(null) },
            )
        }
        items(categories, key = { it }) { category ->
            CategoryPill(
                label = category,
                isSelected = selected == category,
                onClick = { onSelect(if (selected == category) null else category) },
            )
        }
    }
}

@Composable
private fun CategoryPill(label: String, isSelected: Boolean, onClick: () -> Unit) {
    val base = Modifier
        .clip(RoundedCornerShape(999.dp))
        .heightIn(min = 40.dp)
    Box(
        modifier = (
            if (isSelected) base.background(Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF8B7CFF))))
            else base
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(999.dp))
            )
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 13.5.sp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** "Khám phá deal theo sàn" — one tile per real partner in the feed. */
@Composable
private fun PlatformRail(deals: List<Deal>, onOpen: (Deal) -> Unit) {
    val partners = remember(deals) { deals.distinctBy { it.partnerSlug.ifBlank { it.partnerName } } }
    Column {
        SectionHeader(
            title = stringResource(R.string.deals_platforms_title),
            subtitle = stringResource(R.string.deals_platforms_subtitle),
        )
        Spacer(Modifier.height(TappySpacing.md))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            items(partners, key = { it.partnerSlug.ifBlank { it.partnerName } }) { deal ->
                Column(
                    modifier = Modifier
                        .width(96.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable { onOpen(deal) }
                        .padding(vertical = TappySpacing.md),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    PartnerMark(deal = deal, size = 44.dp)
                    Spacer(Modifier.height(TappySpacing.sm))
                    Text(
                        text = deal.partnerName,
                        fontSize = 11.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(horizontal = 6.dp),
                    )
                }
            }
        }
    }
}

/**
 * The partner's mark, three-step fallback — BRAND_ASSETS.md §8, identical on every platform:
 *   1. the brand registry's official mark, which WINS for a known partner (Shopee, TikTok Shop,
 *      Grab…) — the marks the app is licensed to ship;
 *   2. the deal's own `logoImage` from the feed — and, should that image fail to load, the
 *      monogram below rather than a blank tile;
 *   3. a monogram tile in the category colour.
 * Never a brand logo the app does not have a licence to ship. Shared with the Home "Ưu đãi hôm
 * nay" rail (2026-09-14): one mark, the same three steps, on both surfaces the web's Deals card
 * language reaches.
 */
@Composable
internal fun PartnerMark(deal: Deal, size: androidx.compose.ui.unit.Dp) {
    if (hasBrandLogo(deal.partnerName)) {
        BrandLogo(partnerName = deal.partnerName, size = size, decorative = true)
        return
    }
    val colors = categoryAccent(deal.categoryKey)
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(colors.container),
        contentAlignment = Alignment.Center,
    ) {
        val logo = deal.logoImage
        val monogram: @Composable () -> Unit = {
            Text(
                text = deal.partnerName.trim().take(1).uppercase(),
                fontSize = (size.value * 0.42f).sp,
                fontWeight = FontWeight.Bold,
                color = colors.onContainer,
            )
        }
        if (logo != null) {
            TappyImage(
                url = logo,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
                onError = monogram,
            )
        } else {
            monogram()
        }
    }
}

@Composable
private fun SectionHeader(title: String, subtitle: String? = null) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (subtitle != null) {
            Text(text = subtitle, fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DealCard(
    deal: Deal,
    onOpen: () -> Unit,
    onAskTappy: ((String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    // Colour keyed by the language-independent categoryKey, so a language switch cannot recolour
    // the card; the chip TEXT is the localized category.
    val colors = categoryAccent(deal.categoryKey)
    val hasUrl = deal.officialUrl.isNotBlank()
    val askPrefill = stringResource(R.string.deals_ask_deal_prefill, deal.partnerName)

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(TappySpacing.md),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PartnerMark(deal = deal, size = 34.dp)
            Column(modifier = Modifier.weight(1f).padding(start = TappySpacing.sm)) {
                Text(
                    text = deal.partnerName,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 3.dp),
                ) {
                    if (deal.category.isNotBlank()) {
                        Text(
                            text = deal.category,
                            fontSize = 10.5.sp,
                            color = colors.onContainer,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(colors.container)
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                    CountdownLabel(endAt = deal.endAt)
                }
            }
        }

        // The deal's own words. `description` is the partner's pitch; `title` is usually just the
        // partner name, so it is only shown when it says something the source line does not.
        val body = deal.description?.takeIf { it.isNotBlank() } ?: deal.title
        Text(
            text = body,
            fontSize = 13.5.sp,
            lineHeight = 19.sp,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(R.string.deals_via_source, deal.partnerName),
            fontSize = 11.5.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        // Deal artwork only when the feed carries it. No placeholder photography, and NO discount
        // badge — `discountLabel` is null across the whole live feed, so drawing one would invent a
        // promotion. When the feed does carry a discount, it is shown as the partner stated it.
        deal.bannerImage?.let { image ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(76.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
            ) {
                TappyImage(
                    url = image,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        deal.discountLabel?.takeIf { it.isNotBlank() }?.let { discount ->
            Text(
                text = discount,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFEF4444))
                    .padding(horizontal = TappySpacing.sm, vertical = 3.dp),
            )
        }

        // Copyable promo code — its own clickable, so copying never opens the deal or fires the
        // click POST (web `stopPropagation` + `preventDefault`). Null on every current row.
        deal.voucherCode?.let { code -> VoucherChip(code = code) }

        Spacer(Modifier.height(2.dp))
        if (onAskTappy != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(999.dp))
                    .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(999.dp))
                    .clickable { onAskTappy(askPrefill) }
                    .padding(vertical = TappySpacing.sm),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.ChatBubbleOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(15.dp),
                )
                Text(
                    text = stringResource(R.string.deals_ask_about),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 5.dp),
                )
            }
        }
        // "Lấy deal" is drawn only for a deal that really has a destination. A deal whose
        // `officialUrl` decoded blank gets no button rather than a button that goes nowhere.
        if (hasUrl) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpen)
                    .padding(vertical = TappySpacing.xs),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.deals_get),
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Icon(
                    Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 5.dp).size(14.dp),
                )
            }
        }
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
            fontSize = 10.5.sp,
            color = tappyCategoryColors.red.accent,
        )
        is PromoCountdown.Days -> Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.Schedule,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(11.dp),
            )
            Text(
                text = if (countdown.days == 1) stringResource(R.string.deals_day_left)
                else stringResource(R.string.deals_days_left, countdown.days),
                fontSize = 10.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Copyable voucher chip. Shows a 1.5s "copied" state. */
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
            fontSize = 11.sp,
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

/**
 * A stable accent for a category name, from the theme's own palette.
 *
 * Deliberately derived from the STRING rather than a hardcoded map: the feed's categories are
 * server-supplied ("Mua sắm", "Vận chuyển", "Du lịch" today), so a fixed map would silently fall
 * back to one colour the moment the backend adds or renames one. Hashing gives every category a
 * consistent colour without claiming to know what the categories are, and every colour comes from
 * [tappyCategoryColors], so light and dark both stay theme-safe. Callers pass the
 * language-independent [Deal.categoryKey], so the colour survives a language switch.
 */
@Composable
private fun categoryAccent(category: String): com.tappyai.core.designsystem.theme.TappyCategoryColor {
    val palette = tappyCategoryColors
    val options = listOf(
        palette.blue, palette.purple, palette.amber,
        palette.pink, palette.orange, palette.green,
    )
    val index = if (category.isBlank()) 0 else (category.hashCode().toUInt() % options.size.toUInt()).toInt()
    return options[index]
}

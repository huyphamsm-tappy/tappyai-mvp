package com.tappyai.app.home

import androidx.compose.ui.draw.drawBehind
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.LocalCafe
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.booleanResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.deals.Deal
import com.tappyai.app.deals.PartnerMark
import com.tappyai.app.deals.dealListKeys
import com.tappyai.app.history.Conversation
import com.tappyai.app.recommendations.Recommendation
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.history.emojiForCategory
import com.tappyai.app.history.formatRelativeTime
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * The Home tab's launchpad (Phase 1C.1 — full UI skeleton, no network, no cross-feature
 * business logic). Mirrors the web Home's structure at MVP fidelity, but every data-driven
 * section renders its **real** state off [HomeViewModel] (currently [UiState.Empty]) rather than
 * mock content — so later phases only connect data. Navigation targets are honest too: tiles
 * that map to an existing shell tab switch to it via [onNavigateToTab]; features with no screen
 * yet surface a "coming soon" message instead of a dead link.
 *
 * Lives in `:app` (not a `features:home` module) per the approved Phase 1C.1 decision — the
 * shell and its tab content are composition-root concerns until real feature modules exist.
 */
@Composable
fun HomeScreen(
    onNavigateToTab: (HomeTab) -> Unit,
    onOpenChatWithCategory: (String) -> Unit,
    onOpenChatWithPrefill: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenMusic: () -> Unit,
    onOpenRecommendations: () -> Unit,
    onOpenTranslate: () -> Unit,
    onOpenCurrency: () -> Unit,
    onOpenDeals: () -> Unit,
    onOpenGames: () -> Unit,
    onOpenScan: () -> Unit,
    onOpenScamShield: () -> Unit,
    onOpenVietWriter: () -> Unit,
    onOpenTappyTogether: () -> Unit,
    onOpenSplitBill: () -> Unit,
    /** The Smart Tools catalogue page (web `/tools`) — the section's "Xem tất cả". */
    onOpenSmartTools: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val recentActivity by viewModel.recentActivityState.collectAsStateWithLifecycle()
    val communityVideos by viewModel.communityVideosState.collectAsStateWithLifecycle()
    val deals by viewModel.dealsState.collectAsStateWithLifecycle()
    val recommendations by viewModel.recommendationsState.collectAsStateWithLifecycle()
    val userName by viewModel.userName.collectAsStateWithLifecycle()
    // The hero heading is the EXISTING time-of-day engine ([HomeGreeting] through
    // [HomeViewModel.greeting]): 7 local-time slots × weekday/weekend × day-of-month rotation, the
    // same text the web computes for the same day. Read on each composition (no timer), in the
    // language the resolved resources chose — the pre-V3 contract, restored 2026-09-14 after the
    // regression audit (the V3 rebuild had replaced it with a static line). The V3 name line rides
    // above it — see [heroGreeting].
    val engineGreeting = viewModel.greeting(booleanResource(R.bool.resources_are_english))
    val resources = LocalContext.current.resources
    val hero = heroGreeting(
        engineGreeting,
        userName,
        named = { name -> resources.getString(R.string.home_v3_greeting_named, name) },
        generic = { resources.getString(R.string.home_v3_greeting_generic) },
    )

    // The whole Home surface renders in the V3 palette, in whichever appearance the system asks
    // for — see [V3HomeTheme] for why this is a scoped override rather than a theme change.
    V3HomeTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(HomeV3.Background)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth()
                    .padding(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                // ── PRIMARY AI BLOCK (master mockup 05_07_31) ─────────────────────────────
                // Header (drawn by the shell) -> hero -> ask box -> quick suggestions. The pills
                // are prompts, so they belong to the ask interaction rather than to the content
                // below it; the mockup places them the same way.
                // The mockup reads the greeting and the ask box as one block, so they get their
                // own tighter spacing instead of the section rhythm the rest of the page uses.
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xxl)) {
                    V3HeroSection(hero = hero)
                    V3AskBar(onClick = { onNavigateToTab(HomeTab.Chat) })
                }
                V3QuickSuggestionsSection(
                    onOpenChat = { onNavigateToTab(HomeTab.Chat) },
                    onOpenChatWithPrefill = onOpenChatWithPrefill,
                    onOpenTranslate = onOpenTranslate,
                    onOpenSplitBill = onOpenSplitBill,
                    onOpenVietWriter = onOpenVietWriter,
                    onOpenRecommendations = onOpenRecommendations,
                )

                // ── FIRST CONTENT SECTION ─────────────────────────────────────────────────
                // Personalization leads: what Tappy has picked for this person outranks any
                // catalogue of features.
                V3RecommendationsSection(
                    state = recommendations,
                    onOpenRecommendations = onOpenRecommendations,
                )

                // ── REMAINING DISCOVERY CONTENT ───────────────────────────────────────────
                V3DiscoverBanner(onClick = onOpenDeals)
                // "Cảnh báo lừa đảo" (owner, 2026-09-17): its own section, IMMEDIATELY ABOVE
                // "Ưu đãi hôm nay". The tool also stays in the Smart Tools drawer below, where
                // the whole registry is catalogued (DD-002: no tool leaves the drawer).
                V3ScamShieldSection(onOpenScamShield = onOpenScamShield)
                V3DealsSection(state = deals, onOpenDeals = onOpenDeals)
                CommunityVideosSection(
                    state = communityVideos,
                    onOpenExplore = { onNavigateToTab(HomeTab.Explore) },
                )
                // The five-category pill row under "Kham pha theo linh vuc" — the single
                // category-discovery surface on Home now, and the one that keeps "Spa & Beauty"
                // reachable.
                CategoryChipsSection(onOpenCategory = onOpenChatWithCategory)
                // "Xem bói hôm nay" used to sit here (three emoji tiles). Removed 2026-09-14: the
                // Fortune hub is a Smart Tools destination (`SmartToolId.Fortune` → the Smart
                // Tools page → `FortuneRoute.Hub`), so the Home tiles duplicated it.
                SuggestionsSection(onOpenChatWithPrefill = onOpenChatWithPrefill)
                RecentActivitySection(state = recentActivity, onOpenConversation = onOpenConversation)

                // ── SMART TOOLS ───────────────────────────────────────────────────────────
                // One home for what used to be three separate sections, and the last major
                // section on the page: the tools are a utility drawer, not something that should
                // compete with discovery content for attention on the way down.
                SmartToolsSection(
                    onOpenScan = onOpenScan,
                    onOpenScamShield = onOpenScamShield,
                    onOpenVietWriter = onOpenVietWriter,
                    onOpenTranslate = onOpenTranslate,
                    onOpenSplitBill = onOpenSplitBill,
                    onOpenCurrency = onOpenCurrency,
                    onOpenMusic = onOpenMusic,
                    onOpenTappyTogether = onOpenTappyTogether,
                    onOpenSmartTools = onOpenSmartTools,
                )
            }
        }
    }
}

// Web hero palette (tailwind primary-500/600, accent-500/300 — the exact hero gradient stops).
private val HeroPrimary500 = Color(0xFF007AFF)
private val HeroPrimary600 = Color(0xFF0062CC)
private val HeroAccent500 = Color(0xFFFF9500)
private val HeroAccent300 = Color(0xFFFFBD66)
private val Primary400 = Color(0xFF3391FF)

/**
 * The V3 welcome hero (front-page redesign 2026-09-14, from the owner's approved mockup).
 *
 *   Hi Huy! 👋                          ┌──────────┐   the welcome line is the anchor; under it the
 *   Cơm trưa chưa?                      │  mascot  │   time-of-day engine's two lines, verbatim —
 *   Hỏi Tappy trước khi Google nha 😄   │  + glow  │   Tappy greeting and keeping company, not a
 *                                       └──────────┘   dashboard header
 *
 * No card, no border: the mascot sits on the page ground over a soft radial glow with a few
 * sparkles, to the right of the copy and never over it. [hero] comes from [heroGreeting]: the V3
 * welcome ("Hi {name}! 👋" for a known name, the guest line otherwise), then the engine's first
 * line as the contextual title and its second as the supporting line — the dynamic heading
 * restored 2026-09-14 (regression audit), in the mockup's hierarchy (welcome 28sp › title 20sp ›
 * supporting 15sp) rather than as a 30sp headline.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun V3HeroSection(hero: HeroGreeting) {
    // The copy column (welcome › title › supporting › status pills) sets the hero's height; the
    // mascot is drawn over it in an unbounded 0dp-high slot, so a short greeting never leaves a
    // dead band under the copy and a long one never collides with the mascot's feet.
    Box(modifier = Modifier.fillMaxWidth().heightIn(min = 212.dp)) {
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .height(0.dp)
                .wrapContentHeight(unbounded = true, align = Alignment.Top),
        ) {
            Box(modifier = Modifier.size(250.dp).offset(x = 44.dp, y = (-18).dp)) {
                // Radial AI glow behind the mascot. A real radial gradient rather than a blurred
                // circle: Modifier.blur clips to its own layer bounds, which drew the glow as a
                // visible rectangle.
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .offset(x = 20.dp, y = (-18).dp)
                        .size(320.dp)
                        .background(Brush.radialGradient(listOf(HomeV3.HeroGlow, Color.Transparent))),
                )
                Image(
                    painter = painterResource(R.drawable.tappy_wave),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        // Sparkle accents, mirroring the mockup's particle cluster around the mascot.
        Sparkle(size = 12.dp, alpha = 0.9f, x = 240.dp, y = 4.dp)
        Sparkle(size = 8.dp, alpha = 0.7f, x = 232.dp, y = 168.dp)
        Sparkle(size = 7.dp, alpha = 0.55f, x = 356.dp, y = 136.dp)
        Column(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 10.dp)
                .fillMaxWidth(0.62f),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Text(
                text = hero.welcome,
                fontSize = 36.sp,
                lineHeight = 42.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp,
                color = HomeV3.OnSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = hero.title,
                fontSize = 24.sp,
                lineHeight = 29.sp,
                fontWeight = FontWeight.Bold,
                color = HomeV3.OnSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                // The engine's second line; the static tagline only if a template ever lacks one.
                text = hero.supporting ?: stringResource(R.string.home_v3_hero_tagline),
                fontSize = 16.sp,
                lineHeight = 21.sp,
                color = HomeV3.OnSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            // The two status pills under the copy (mockup): a live dot + "Luôn sẵn sàng", and the
            // three-word promise. Visual reinforcement in the owner's approved wording, not a claim
            // computed from anything. They wrap inside the copy column so they never run under the
            // mascot.
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
                modifier = Modifier.padding(top = TappySpacing.sm),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(StatusGreen.copy(alpha = 0.16f))
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(StatusGreen))
                    Text(text = stringResource(R.string.home_v3_status_ready), fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, color = StatusGreen)
                }
                Text(
                    text = stringResource(R.string.home_v3_status_traits),
                    fontSize = 13.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium,
                    color = HomeV3.OnSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(HomeV3.SurfaceVariant)
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                )
            }
        }
    }
}

private val StatusGreen = Color(0xFF34D399)

/** One decorative sparkle dot in the hero's particle cluster. */
@Composable
private fun BoxScope.Sparkle(size: androidx.compose.ui.unit.Dp, alpha: Float, x: androidx.compose.ui.unit.Dp, y: androidx.compose.ui.unit.Dp) {
    Icon(
        imageVector = Icons.Filled.AutoAwesome,
        contentDescription = null,
        tint = HomeV3.Blue.copy(alpha = alpha),
        modifier = Modifier.align(Alignment.TopStart).offset(x = x, y = y).size(size),
    )
}

/**
 * The V3 ask box, per the mockup: a tall pill with the placeholder, a microphone glyph and a
 * large purple sparkle action.
 *
 * Still a tap target that opens the Chat tab rather than an inline field — the composer, its
 * history and its voice input all live in Chat, and a second one here would be a second chat
 * implementation. The microphone is part of that single target rather than a separate control,
 * so it never implies that recording starts on Home.
 */
@Composable
private fun V3AskBar(onClick: () -> Unit) {
    val shape = RoundedCornerShape(34.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            // The soft blue/purple halo that makes this THE action on the page.
            .shadow(elevation = 18.dp, shape = shape, ambientColor = HomeV3.Purple.copy(alpha = 0.55f), spotColor = HomeV3.Purple.copy(alpha = 0.55f))
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, Brush.linearGradient(listOf(HomeV3.Purple.copy(alpha = 0.55f), HomeV3.Blue.copy(alpha = 0.45f))), shape)
            .clickable(onClickLabel = stringResource(R.string.home_v3_ask_action), onClick = onClick)
            .padding(start = TappySpacing.xxl, end = TappySpacing.md, top = TappySpacing.md, bottom = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.home_v3_ask_placeholder),
            fontSize = 17.sp,
            color = HomeV3.OnSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.Filled.Mic,
            contentDescription = null,
            tint = HomeV3.OnSurfaceVariant,
            modifier = Modifier.size(24.dp),
        )
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(HomeV3.ActionGradient),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

private data class V3QuickAction(
    val icon: ImageVector,
    @StringRes val labelRes: Int,
    /** The one-line blurb under the label — the mockup's, in the owner's approved wording. */
    @StringRes val descRes: Int,
    /** The icon tile's gradient — presentation only, one warm/cool hue per card as in the mockup. */
    val tile: List<Color>,
    val onClick: () -> Unit,
)

private val QuickTileOrange = listOf(Color(0xFFFF8A4C), Color(0xFFFF5F6D))
private val QuickTileBlue = listOf(Color(0xFF4F8CFF), Color(0xFF6A5CFF))
private val QuickTileGreen = listOf(Color(0xFF34D399), Color(0xFF10B981))
private val QuickTilePink = listOf(Color(0xFFFF6FB5), Color(0xFFD946EF))
private val QuickTileViolet = listOf(Color(0xFF8B7BFF), Color(0xFF6D4AFF))
private val QuickTileAmber = listOf(Color(0xFFFFA94D), Color(0xFFFF7A3D))

/**
 * "Goi y nhanh" — six outlined pills in a 2x3 grid, as in the master mockup.
 *
 * Every pill goes somewhere real. Five map straight onto the mockup's own actions; the mockup's
 * fourth, "Kiem tra link lua dao", needs Scam Shield, which does not exist on this Android branch.
 * It is therefore NOT rendered — no dead pill, no fake screen, and no unrelated feature wearing
 * its label. To keep the 2x3 grid whole, that fourth slot carries AI caption writing, a shipped
 * capability presented under its own name and never under the scam-check one.
 *
 * The two conversational pills open Chat pre-filled, which is the app's real behaviour for a
 * question like this — not a stub.
 */
@Composable
private fun V3QuickSuggestionsSection(
    onOpenChat: () -> Unit,
    onOpenChatWithPrefill: (String) -> Unit,
    onOpenTranslate: () -> Unit,
    onOpenSplitBill: () -> Unit,
    onOpenVietWriter: () -> Unit,
    onOpenRecommendations: () -> Unit,
) {
    val cafePrompt = stringResource(R.string.home_v3_quick_cafe_prompt)
    val planPrompt = stringResource(R.string.home_v3_quick_plan_prompt)
    val actions = listOf(
        V3QuickAction(Icons.Outlined.LocalCafe, R.string.home_v3_quick_cafe, R.string.home_v3_quick_cafe_desc, QuickTileOrange) { onOpenChatWithPrefill(cafePrompt) },
        V3QuickAction(Icons.Outlined.Translate, R.string.home_v3_quick_translate, R.string.home_v3_quick_translate_desc, QuickTileBlue, onOpenTranslate),
        V3QuickAction(Icons.Outlined.People, R.string.home_v3_quick_splitbill, R.string.home_v3_quick_splitbill_desc, QuickTileGreen, onOpenSplitBill),
        V3QuickAction(Icons.Outlined.EditNote, R.string.home_v3_quick_caption, R.string.home_v3_quick_caption_desc, QuickTilePink, onOpenVietWriter),
        V3QuickAction(Icons.Outlined.Place, R.string.home_v3_quick_travel, R.string.home_v3_quick_travel_desc, QuickTileViolet, onOpenRecommendations),
        V3QuickAction(Icons.Outlined.CalendarMonth, R.string.home_v3_quick_plan, R.string.home_v3_quick_plan_desc, QuickTileAmber) { onOpenChatWithPrefill(planPrompt) },
    )

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        V3SectionHeading(
            title = stringResource(R.string.home_v3_quick_title),
            linkText = stringResource(R.string.home_v3_deals_see_all),
            // "See all" opens Chat empty. It used to carry the first pill's cafe prompt, which
            // made a generic link behave like one specific suggestion.
            onLinkClick = onOpenChat,
        )
        actions.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg), modifier = Modifier.height(IntrinsicSize.Min)) {
                row.forEach { action ->
                    V3QuickPill(action = action, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/**
 * One quick suggestion — front-page redesign: a compact gradient icon tile, the suggestion, and a
 * chevron on a dark rounded surface. The label is the existing suggestion string; the mockup's
 * one-line blurbs under each label have no authored copy, so none is drawn.
 */
@Composable
private fun V3QuickPill(action: V3QuickAction, modifier: Modifier = Modifier) {
    val label = stringResource(action.labelRes)
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier = modifier
            .fillMaxHeight()
            .heightIn(min = 96.dp)
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline.copy(alpha = 0.7f), shape)
            .clickable(onClickLabel = label, onClick = action.onClick)
            .padding(start = 10.dp, end = 6.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Brush.linearGradient(action.tile)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = action.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        // A 412dp phone gives each card ~110dp of text: the label may take two lines and the
        // blurb two, which is what keeps the mockup's title-over-blurb hierarchy legible here.
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = label,
                fontSize = 14.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = HomeV3.OnSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(action.descRes),
                fontSize = 11.5.sp,
                lineHeight = 14.sp,
                color = HomeV3.OnSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = HomeV3.OnSurfaceVariant.copy(alpha = 0.7f),
            modifier = Modifier.size(16.dp),
        )
    }
}

/**
 * "Goi y danh cho ban" — the personalized place rail.
 *
 * The mockup's cards carry photography, a star rating and a review count. The Android
 * [Recommendation] model carries placeId, placeName and matchedSignals and nothing else, so none
 * of those three exist here and none are invented: the card shows the real place name and the
 * real matched signal, over a tinted panel that is plainly decoration rather than a stand-in
 * photograph. Reproducing the mockup's card would require backend work, which is out of scope.
 */
@Composable
private fun V3RecommendationsSection(
    state: UiState<List<Recommendation>>,
    onOpenRecommendations: () -> Unit,
) {
    val items = (state as? UiState.Success)?.data ?: return
    if (items.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        V3SectionHeading(
            title = stringResource(R.string.home_v3_recs_title),
            linkText = stringResource(R.string.home_v3_deals_see_all),
            onLinkClick = onOpenRecommendations,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
            itemsIndexed(items = items, key = { _, item -> item.placeId }) { index, item ->
                V3RecommendationCard(
                    item = item,
                    // Position-based, deliberately NOT category-based: the payload carries no
                    // category (placeId/placeName/matchedSignals only), so the rail rotates the
                    // approved artwork by index the way the web rail rotates its tints. Nothing
                    // about the artwork is a claim about the place.
                    art = V3_RECOMMENDATION_ART[index % V3_RECOMMENDATION_ART.size],
                    onClick = onOpenRecommendations,
                )
            }
        }
    }
}

/**
 * The five owner-approved illustrations, in the approved order, rotated by card position.
 *
 * Explicitly not a category map: [Recommendation] carries `placeId`, `placeName` and
 * `matchedSignals` and nothing that identifies a category, and `matchedSignals` is free text
 * ("Korean BBQ", "Near Quan 3", "4.5★"), so deriving one would be a guess. The web rail solves the
 * same gap the same way — it rotates four tints by index, with the comment "places carry no photo
 * in the recommendation payload".
 */
private val V3_RECOMMENDATION_ART = listOf(
    R.drawable.category_food,
    R.drawable.category_shopping,
    R.drawable.category_travel,
    R.drawable.category_entertainment,
    R.drawable.category_spa,
)

@Composable
private fun V3RecommendationCard(item: Recommendation, @DrawableRes art: Int, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(190.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, RoundedCornerShape(20.dp))
            .clickable(onClickLabel = item.placeName, onClick = onClick),
    ) {
        // The header keeps its branded gradient and the artwork sits INSET on top of it, framed,
        // with the panel visible all around. A full-bleed photograph here would read as "a photo
        // of this place", which none of these images is — they are approved illustrations rotated
        // by position. Inset-on-a-tinted-panel is the card's existing decorative grammar (it used
        // to hold a centred pin glyph), so this makes the distinction without new copy or a
        // redesign. The image is decorative for TalkBack too: it announces nothing.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp)
                .background(
                    Brush.linearGradient(
                        listOf(HomeV3.Purple.copy(alpha = 0.45f), HomeV3.Blue.copy(alpha = 0.16f)),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(art),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(width = 104.dp, height = 64.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
        }
        Column(
            modifier = Modifier.padding(TappySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(
                text = item.placeName,
                fontSize = 14.sp,
                lineHeight = 19.sp,
                fontWeight = FontWeight.SemiBold,
                color = HomeV3.OnSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            // The real "why this place" signal the ranking API returns. No rating or review
            // count is shown because the model carries neither.
            item.matchedSignals.firstOrNull()?.takeIf { it.isNotBlank() }?.let { signal ->
                Text(
                    text = signal,
                    fontSize = 12.sp,
                    color = HomeV3.OnSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * The "Kham pha them cung TappyAI" discovery banner.
 *
 * The mockup fills it with a night-landscape illustration. No such artwork ships in the Android
 * resources, so the banner is built from the design system's own gradient rather than invented
 * or generated production art; the structure, copy and chevron affordance match. It opens the
 * existing Deals surface, which is what its subtitle promises.
 */
@Composable
private fun V3DiscoverBanner(onClick: () -> Unit) {
    val label = stringResource(R.string.home_v3_banner_title)
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation = 14.dp, shape = shape, ambientColor = HomeV3.Purple.copy(alpha = 0.45f), spotColor = HomeV3.Purple.copy(alpha = 0.45f))
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF5B3FE0), Color(0xFF3D4BE0), Color(0xFF2B62E8))))
            .drawBehind {
                // A soft light behind the arrow, the mockup's "glow in the corner".
                drawCircle(
                    Brush.radialGradient(listOf(Color.White.copy(alpha = 0.22f), Color.Transparent), center = Offset(size.width * 0.9f, size.height * 0.5f), radius = size.height * 1.1f),
                    radius = size.height * 1.1f, center = Offset(size.width * 0.9f, size.height * 0.5f),
                )
            }
            .clickable(onClickLabel = label, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 22.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color.White.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.WorkspacePremium,
                    contentDescription = null,
                    tint = Color(0xFFFFD166),
                    modifier = Modifier.size(34.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                Text(
                    text = label,
                    fontSize = 18.sp,
                    lineHeight = 23.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.home_v3_banner_subtitle),
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    color = Color.White.copy(alpha = 0.78f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}

/** Mockup section heading: 20sp title with a trailing accent link. */
@Composable
private fun V3SectionHeading(title: String, linkText: String, onLinkClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Text(
            text = title,
            fontSize = 22.sp,
            lineHeight = 26.sp,
            fontWeight = FontWeight.Bold,
            color = HomeV3.OnSurface,
            modifier = Modifier.weight(1f),
        )
        V3SeeAll(text = linkText, onClick = onLinkClick)
    }
}

/** "Xem tất cả ›" — the accent link with the mockup's trailing chevron. */
@Composable
private fun V3SeeAll(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(text = text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = HomeV3.Purple)
        Icon(imageVector = Icons.Filled.ChevronRight, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(18.dp))
    }
}

/**
 * Smart Tools — the single home for what used to be three separate Home sections, now in the
 * web's own card ([SmartToolCard], compact) and with the web's way to the full catalogue.
 *
 * "Cong cu & tien ich" (Currency / Split bill / Translate), "Viet content" and "Quet tai lieu"
 * each had their own header and their own card style, which made three unrelated-looking groups
 * out of one family. This is one section over the SAME eight destinations and the SAME callbacks
 * the shell already passes down: no tool is recreated, none is dropped, no navigation destination
 * is added for them. What changed (2026-09-13, web parity): the tiles are the registry's cards —
 * tinted gradient, glyph badge, mascot pose, title, description — and the header's "Xem tất cả"
 * opens the Smart Tools page ([HomeTabRoute.SmartTools]), where the one registry tool not
 * previewed here (Bói) lives with the rest, grouped as the web groups them.
 *
 * The eight previewed here are the eight this section always showed (the web's Home rail previews
 * five — `home: true` — a narrower cut this section deliberately does not adopt, so nothing the
 * Home surface offered is taken away). Their order is the registry's.
 *
 * Games is deliberately absent, as it already was. `GamesScreen` embeds SuperTux in a WebView and
 * that Emscripten/WASM build needs SharedArrayBuffer, which the Android WebView does not expose
 * even when the page is correctly cross-origin isolated — on-device the engine reports its own
 * unsupported message and the game never starts, after a ~246 MB asset download. `GamesRoute` and
 * `GamesScreen` stay wired in `HomeTabHost`, so re-enabling remains a one-line change.
 */
@Composable
private fun SmartToolsSection(
    onOpenScan: () -> Unit,
    onOpenScamShield: () -> Unit,
    onOpenVietWriter: () -> Unit,
    onOpenTranslate: () -> Unit,
    onOpenSplitBill: () -> Unit,
    onOpenCurrency: () -> Unit,
    onOpenMusic: () -> Unit,
    onOpenTappyTogether: () -> Unit,
    onOpenSmartTools: () -> Unit,
) {
    // The section's eight, as registry ids, resolved to the callbacks the shell already passes.
    val previewed = setOf(
        SmartToolId.Scan, SmartToolId.Translate, SmartToolId.Currency, SmartToolId.Split,
        SmartToolId.Safety, SmartToolId.Together, SmartToolId.Music, SmartToolId.Captions,
    )
    // `smartTools()`, not the raw registry: a gated tool (Music) must not appear on Home either.
    val tools = smartTools().filter { it.id in previewed }

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(
            title = stringResource(R.string.home_v3_smart_tools_title),
            showSparkle = true,
            action = { SectionLink(text = stringResource(R.string.smart_tools_see_all), onClick = onOpenSmartTools) },
        )
        SmartToolGrid(
            tools = tools,
            variant = SmartToolCardVariant.Compact,
            onOpen = { id ->
                when (id) {
                    SmartToolId.Scan -> onOpenScan()
                    SmartToolId.Translate -> onOpenTranslate()
                    SmartToolId.Currency -> onOpenCurrency()
                    SmartToolId.Split -> onOpenSplitBill()
                    SmartToolId.Safety -> onOpenScamShield()
                    SmartToolId.Together -> onOpenTappyTogether()
                    SmartToolId.Music -> onOpenMusic()
                    SmartToolId.Captions -> onOpenVietWriter()
                    // Not previewed on Home: reachable from the Smart Tools page.
                    SmartToolId.Fortune -> onOpenSmartTools()
                }
            },
        )
    }
}

/**
 * "Cảnh báo lừa đảo" — the Home section for Scam Shield (owner, 2026-09-17), on the same header
 * rhythm as "Ưu đãi hôm nay" right below it: the 52dp gradient tile, the 21sp title, the one-line
 * subtitle, the "see all" link — and one entry card (the web's identity row: the shield tile,
 * "Kiểm tra link / website", the tagline) that opens the existing Scam Shield route. Nothing here
 * checks anything; the section is a door, and the engine stays behind it.
 */
@Composable
private fun V3ScamShieldSection(onOpenScamShield: () -> Unit) {
    val label = stringResource(R.string.home_scam_shield_title)
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFFF43F5E), Color(0xFFBE123C)))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Shield,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    fontSize = 21.sp,
                    lineHeight = 25.sp,
                    fontWeight = FontWeight.Bold,
                    color = HomeV3.OnSurface,
                )
                Text(
                    text = stringResource(R.string.home_scam_shield_desc),
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    color = HomeV3.OnSurfaceVariant,
                )
            }
            V3SeeAll(text = stringResource(R.string.scam_shield_v3_cta), onClick = onOpenScamShield)
        }

        val shape = RoundedCornerShape(20.dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(HomeV3.Surface)
                .border(1.dp, HomeV3.Outline, shape)
                .clickable(onClickLabel = label, onClick = onOpenScamShield)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(HomeV3.Purple.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Shield, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(26.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = stringResource(R.string.scam_shield_v3_check_title), fontSize = 15.sp, lineHeight = 19.sp, fontWeight = FontWeight.Bold, color = HomeV3.OnSurface)
                Text(text = stringResource(R.string.scam_shield_v3_tagline), fontSize = 12.5.sp, lineHeight = 16.sp, color = HomeV3.OnSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(22.dp))
        }
    }
}

/**
 * "Uu dai hom nay" — the V3 slot for partner offers, over the SAME daily pool the Deals screen
 * reads ([HomeViewModel.dealsState] -> `DealsRepository.getDeals()`).
 *
 * What a card can honestly show is bounded by the [Deal] model, which carries title, category,
 * source and an optional discount and nothing else — no image, price, rating or favourite state.
 * So the card renders exactly those fields over a category-tinted panel; the tinted panel is
 * decoration, not a stand-in for product photography, and no placeholder product, rating or price
 * is invented to fill the space. An empty pool says so with the Deals screen's own wording rather
 * than disappearing, which keeps the section's place in the V3 hierarchy visible.
 */
@Composable
private fun V3DealsSection(state: UiState<List<Deal>>, onOpenDeals: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFFFF9A5C), Color(0xFFFF6A3D)))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.LocalOffer,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.home_v3_deals_title),
                    fontSize = 21.sp,
                    lineHeight = 25.sp,
                    fontWeight = FontWeight.Bold,
                    color = HomeV3.OnSurface,
                )
                Text(
                    text = stringResource(R.string.home_v3_deals_subtitle),
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    color = HomeV3.OnSurfaceVariant,
                )
            }
            V3SeeAll(text = stringResource(R.string.home_v3_deals_see_all), onClick = onOpenDeals)
        }

        when (state) {
            is UiState.Success -> {
                val deals = state.data
                // Reuses the Deals screen's own key helper: `Deal.url` is not guaranteed unique,
                // and duplicate lazy keys crash the list at measure time.
                val keys = remember(deals) { dealListKeys(deals) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
                    items(count = deals.size, key = { keys[it] }) { index ->
                        V3DealCard(deal = deals[index], onClick = onOpenDeals)
                    }
                }
            }
            is UiState.Empty -> V3DealsEmpty()
            // Loading and Error render nothing: Home is a launchpad, and a partner-offer rail is
            // not worth a spinner or an error box at this position.
            else -> Unit
        }
    }
}

@Composable
private fun V3DealsEmpty() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, RoundedCornerShape(20.dp))
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.deals_empty_title),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = HomeV3.OnSurface,
        )
        Text(
            text = stringResource(R.string.deals_empty_message),
            style = MaterialTheme.typography.bodySmall,
            color = HomeV3.OnSurfaceVariant,
        )
    }
}

/**
 * One offer, front-page redesign: an image area (the feed's `bannerImage` when a row carries one,
 * else the category-tinted panel — never a stand-in photograph), the partner's mark, the
 * promotion as the largest line when the feed states one, then the title and the source line.
 * Same data, same destination as before (affiliate routing is a later task).
 */
@Composable
private fun V3DealCard(deal: Deal, onClick: () -> Unit) {
    val accent = dealAccent(deal.category)
    val shape = RoundedCornerShape(22.dp)
    val banner = deal.bannerImage?.takeIf { it.isNotBlank() }
    val discount = deal.discountLabel?.takeIf { it.isNotBlank() }
    Column(
        modifier = Modifier
            .width(248.dp)
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline.copy(alpha = 0.8f), shape)
            .clickable(onClickLabel = deal.title, onClick = onClick),
    ) {
        // With a photo or a promotion the band is tall and the mark sits in its corner; with
        // neither (today's feed) the band is shorter and the mark IS the visual, not an empty box.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(if (banner != null || discount != null) 136.dp else 104.dp)
                .background(Brush.linearGradient(listOf(accent.copy(alpha = 0.55f), accent.copy(alpha = 0.14f)))),
        ) {
            // Real artwork only when the feed sends it; a load failure leaves the tinted panel.
            banner?.let { image ->
                TappyImage(
                    url = image,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            // The bottom scrim keeps the promotion legible on any panel or photo.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.55f))),
            )
            // The partner's mark — the web Deals card's BrandLogo (registry mark → the deal's own
            // logo image → monogram), the SAME component the Deals screen draws.
            Box(modifier = Modifier.align(if (banner != null || discount != null) Alignment.TopStart else Alignment.CenterStart).padding(horizontal = 16.dp, vertical = 14.dp)) {
                PartnerMark(deal = deal, size = 40.dp)
            }
            // Only rendered when the feed actually carries a promotion — most deals have none.
            discount?.let { discount ->
                Text(
                    text = discount,
                    fontSize = 22.sp,
                    lineHeight = 26.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.align(Alignment.BottomStart).padding(horizontal = 14.dp, vertical = 10.dp),
                )
            }
        }
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(
                text = deal.title,
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Bold,
                color = HomeV3.OnSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                // "{category} · via {partner}" — composed from the Deals screen's own `via` string
                // so the two surfaces attribute a partner in exactly the same words.
                text = deal.category + " · " + stringResource(R.string.deals_via_source, deal.partnerName),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                color = HomeV3.OnSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Panel tint per deal category. Presentation only — the feed carries no colour or image.
 *  Composable because the fallback tint is a V3 palette token, which follows light/dark. */
@Composable
@ReadOnlyComposable
private fun dealAccent(category: String): Color = when (category.lowercase()) {
    "food", "an uong", "food & drink" -> Color(0xFFFF8A4C)
    "travel", "du lich" -> Color(0xFF3391FF)
    "shopping", "mua sam" -> Color(0xFFFF5FA2)
    "entertainment", "giai tri" -> Color(0xFF9B6BFF)
    else -> HomeV3.Purple
}

private data class HomeCategory(val id: String, val emoji: String, val labelRes: Int)

// Mirrors the web home's CategoryPills (components/CategoryPills.tsx + CATEGORIES in lib/utils.ts):
// the same five content categories, in the same order, rendered as a horizontally-scrolling pill
// row directly under the ask box. Tapping one opens the Chat tab scoped to that category — the
// native equivalent of the web's `/chat?category=<id>` (HomeRoute.Chat already carries `category`).
private val HOME_CATEGORIES = listOf(
    HomeCategory("food", "🍜", R.string.home_category_food),
    HomeCategory("shopping", "🛍️", R.string.home_category_shopping),
    HomeCategory("entertainment", "🎭", R.string.home_category_entertainment),
    HomeCategory("travel", "✈️", R.string.home_category_travel),
    HomeCategory("spa", "💆", R.string.home_category_spa),
)

private data class HomeSuggestion(@StringRes val textRes: Int, val category: String, val emoji: String)

// Curated prompt cards mirroring web HomeView's Suggestions section. UI parity ONLY — a fixed
// subset of the web WITTY_PROMPTS pool, deliberately NOT the personalization engine (owner: no new
// features). Tapping opens Chat pre-filled with the prompt, like the web `/chat?q=…` link.
private val HOME_SUGGESTIONS = listOf(
    HomeSuggestion(R.string.home_suggestion_1, "food", "🍜"),
    HomeSuggestion(R.string.home_suggestion_2, "entertainment", "🎁"),
    HomeSuggestion(R.string.home_suggestion_3, "food", "🍜"),
    HomeSuggestion(R.string.home_suggestion_4, "travel", "✈️"),
    HomeSuggestion(R.string.home_suggestion_5, "shopping", "🛍️"),
    HomeSuggestion(R.string.home_suggestion_6, "entertainment", "🎮"),
)

// Discoverability fix (2026-07-20): the pill strip used to be a single horizontalScroll Row, so on a
// phone the trailing categories (esp. "Spa & Beauty") scrolled off-screen with only a right-edge
// fade as a hint. Web shows all five at once — CategoryPills wraps on `sm+` (`sm:flex-wrap`). Mirror
// that with a FlowRow so every category is always visible, and add the web's "Explore by category"
// section header (HomeView's Sparkles + `home.exploreByCategory`).
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryChipsSection(onOpenCategory: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) { // mb-3 = 12px
        SectionHeader(title = stringResource(R.string.home_section_explore_by_category), showSparkle = true)
        // Web CategoryPills scroll on mobile / wrap on sm+; kept as a wrap (owner discoverability
        // decision 2026-07-20 so all 5 are always visible) with the exact web pill styling.
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // gap-2 = 8px
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            HOME_CATEGORIES.forEach { category ->
                CategoryPill(
                    emoji = category.emoji,
                    label = stringResource(category.labelRes),
                    onClick = { onOpenCategory(category.id) },
                )
            }
        }
    }
}

/** Web CategoryPills pill: white rounded-full, 1px gray border, shadow-sm, px-4 py-2.5, 14sp/500. */
@Composable
private fun CategoryPill(emoji: String, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .shadow(2.dp, CircleShape)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp), // px-4 py-2.5
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), // gap-1.5 = 6px
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = emoji, fontSize = 16.sp) // text-base
        Text(
            text = label,
            fontSize = 14.sp, // text-sm
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun SuggestionsSection(onOpenChatWithPrefill: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_suggested))
        // 2-column grid of curated prompt cards (web HomeView Suggestions). UI parity only.
        // Art per card, the web's way: unique across the row while the pool allows it.
        val art = remember { assignInspireArt(HOME_SUGGESTIONS.map { it.category }) }
        HOME_SUGGESTIONS.chunked(2).forEachIndexed { rowIndex, pair ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                pair.forEachIndexed { column, suggestion ->
                    SuggestionCard(
                        suggestion = suggestion,
                        art = art[rowIndex * 2 + column],
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        onClick = onOpenChatWithPrefill,
                    )
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/**
 * One "Gợi ý cho bạn" card — the web Home's for-you tile (`HomeV3.tsx`): the photograph on top
 * (`object-cover`, 94px), the category as a small dark badge on the art, the prompt's emoji in a
 * tinted badge top-right, then the prompt text. The art is [assignInspireArt]'s pick for this
 * card — the web's own owner-approved photographs, never an emoji standing in for a picture.
 * Content and behaviour are unchanged: the same prompt, the same category, the same prefill tap.
 */
@Composable
private fun SuggestionCard(
    suggestion: HomeSuggestion,
    @DrawableRes art: Int,
    modifier: Modifier,
    onClick: (String) -> Unit,
) {
    val text = stringResource(suggestion.textRes)
    TappyCard(
        modifier = modifier
            .clip(TappyShapes.card)
            .clickable { onClick(text) },
        contentPadding = PaddingValues(0.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(94.dp), // web h-[94px]
            ) {
                Image(
                    painter = painterResource(art),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                // The category is a badge on the art (web); the value is the card's real category.
                suggestionCategoryLabel(suggestion.category)?.let { labelRes ->
                    Text(
                        text = stringResource(labelRes).uppercase(),
                        color = Color.White,
                        fontSize = 9.5.sp,
                        lineHeight = 12.sp,
                        letterSpacing = 0.6.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(start = 10.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xA8080B12))
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                        .size(32.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(suggestionGradient(suggestion.category)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = suggestion.emoji, fontSize = 15.sp)
                }
            }
            Text(
                text = text,
                modifier = Modifier.padding(TappySpacing.lg), // web p-3 = 12px
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2, // web line-clamp-2
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The web's `CATEGORY_LABEL` for the badge on the art — the app's own category strings. */
@StringRes
private fun suggestionCategoryLabel(category: String): Int? = when (category) {
    "food" -> R.string.home_category_food
    "travel" -> R.string.home_category_travel
    "shopping" -> R.string.home_category_shopping
    "entertainment" -> R.string.home_category_entertainment
    "spa" -> R.string.home_category_spa
    else -> null
}

/** Category → light gradient, mirroring the web DEFAULT_GRADIENT tints for the suggestion header. */
private fun suggestionGradient(category: String): Brush = when (category) {
    "food" -> Brush.verticalGradient(listOf(Color(0xFFFFEDD5), Color(0xFFFFF7ED)))
    "shopping" -> Brush.verticalGradient(listOf(Color(0xFFFCE7F3), Color(0xFFFDF2F8)))
    "entertainment" -> Brush.verticalGradient(listOf(Color(0xFFF3E8FF), Color(0xFFFAF5FF)))
    "travel" -> Brush.verticalGradient(listOf(Color(0xFFDBEAFE), Color(0xFFEFF6FF)))
    "spa" -> Brush.verticalGradient(listOf(Color(0xFFDCFCE7), Color(0xFFF0FDF4)))
    else -> Brush.verticalGradient(listOf(Color(0xFFF3F4F6), Color(0xFFF9FAFB)))
}

@Composable
private fun RecentActivitySection(
    state: UiState<List<Conversation>>,
    onOpenConversation: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_recent_activity))
        when (state) {
            UiState.Loading -> LoadingBlock()
            is UiState.Success -> {
                // A single "now" per composition so every row's relative time is consistent.
                val nowMillis = remember { System.currentTimeMillis() }
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    state.data.forEach { conv ->
                        RecentConversationRow(
                            conversation = conv,
                            nowMillis = nowMillis,
                            onClick = { onOpenConversation(conv.id) },
                        )
                    }
                }
            }
            // Empty / Error / Idle → the honest empty-chat state (web parity: user with no
            // conversations sees the empty prompt, not a fabricated list).
            else -> TappyEmptyState(
                icon = Icons.Filled.History,
                title = stringResource(R.string.home_empty_recent_title),
                message = stringResource(R.string.home_empty_recent_message),
            )
        }
    }
}

@Composable
private fun RecentConversationRow(conversation: Conversation, nowMillis: Long, onClick: () -> Unit) {
    TappyCard(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Web parity: a 40px rounded-xl gray tile with a MessageCircle icon in primary-400
            // (not the conversation's category emoji).
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Chat,
                    contentDescription = null,
                    tint = Primary400,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = conversation.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.home_recent_message_count, conversation.messageCount) +
                        " · " + formatRelativeTime(conversation.updatedAtMillis, nowMillis),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * "Video goi y cho ban" — a horizontal rail over the SAME community feed Explore reads.
 *
 * Data: [HomeViewModel.communityVideosState] → `ReviewsRepository.getFeed(...)`, filtered to
 * items that carry playable media. No new endpoint, DTO or table exists for this rail, and no
 * sample content is synthesised: an empty or failed load renders nothing rather than placeholder
 * cards. Tapping a card or the trailing link opens the existing Explore tab, which owns review
 * playback — this section adds no navigation destination of its own.
 */
@Composable
private fun CommunityVideosSection(
    state: UiState<List<Review>>,
    onOpenExplore: () -> Unit,
) {
    // Loading and empty both render nothing: Home is a launchpad, and a spinner or an empty box
    // for a secondary discovery rail is noisier than simply not being there yet.
    val videos = (state as? UiState.Success)?.data ?: return
    if (videos.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(VideoRailAccent),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.home_videos_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.home_videos_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            SectionLink(text = stringResource(R.string.home_videos_see_more), onClick = onOpenExplore)
        }

        // The rail scrolls horizontally inside Home's single vertical scroll — no nested
        // vertical scrolling, so the outer gesture is never contended.
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            items(items = videos, key = { it.id }) { review ->
                CommunityVideoCard(review = review, onClick = onOpenExplore)
            }
        }
    }
}

/** One clip in the rail: thumbnail + like count, then title and the creator who posted it. */
@Composable
private fun CommunityVideoCard(review: Review, onClick: () -> Unit) {
    val creator = review.profiles?.fullName?.takeIf { it.isNotBlank() }

    Column(
        modifier = Modifier
            .width(VideoCardWidth)
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(bottom = TappySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(VideoThumbHeight)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            TappyImage(
                url = review.thumbnail ?: review.mediaUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
            // Engagement badge: the real like count the feed already returns, never a synthesised
            // "views" number — the model carries no view counter.
            // "12.4K" alone is meaningless to a screen reader, so the whole badge announces
            // itself once with the localized label instead of icon-then-number.
            val likesLabel = stringResource(R.string.home_videos_likes, compactCount(review.likeCount))
            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(TappySpacing.sm)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs)
                    .clearAndSetSemantics { contentDescription = likesLabel },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = compactCount(review.likeCount),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                )
            }
        }

        Text(
            text = videoCardTitle(review),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        if (creator != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                TappyAvatar(
                    name = creator,
                    imageUrl = review.profiles?.avatarUrl,
                    size = TappyAvatarSize.ListRow,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    text = creator,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * Title for one rail card.
 *
 * A video posted without an attached place comes back from the feed with [PLACELESS_VIDEO_LABEL]
 * as its place name, so that value is a placeholder, not a title — left as-is, every place-less
 * card in the rail reads identically. The review body carries what the clip is actually about, so
 * it stands in for those. Presentation only: nothing here changes the response, the model or the
 * stored record.
 */
private fun videoCardTitle(review: Review): String =
    review.placeName.takeIf { it.isNotBlank() && it.trim() != PLACELESS_VIDEO_LABEL } ?: review.body

/** The feed's own label for a place-less video. Compared against, never displayed. */
private const val PLACELESS_VIDEO_LABEL = "Chia sẻ"

/** 12400 -> "12.4K". Presentation only; the underlying count is untouched. */
private fun compactCount(n: Int): String = when {
    n >= 1_000_000 -> String.format(java.util.Locale.US, "%.1fM", n / 1_000_000f).replace(".0M", "M")
    n >= 1_000 -> String.format(java.util.Locale.US, "%.1fK", n / 1_000f).replace(".0K", "K")
    else -> n.toString()
}

private val VideoRailAccent = Color(0xFF7C5CFF)
private val VideoCardWidth = 150.dp
private val VideoThumbHeight = 190.dp

@Composable
private fun SectionHeader(
    title: String,
    showSparkle: Boolean = false,
    action: (@Composable () -> Unit)? = null,
) {
    // Web: `font-semibold text-gray-900 mb-3`, with an optional trailing primary "See all"/"Open"
    // link; the category header additionally leads with a Sparkles icon in accent-500.
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // gap-2
    ) {
        if (showSparkle) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = HeroAccent500, // accent-500 #FF9500
                modifier = Modifier.size(16.dp),
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        action?.invoke()
    }
}

/** Web section "See all"/"Open" trailing link: `text-sm text-primary-500 font-medium`. */
@Composable
private fun SectionLink(text: String, onClick: () -> Unit) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
    )
}

@Composable
private fun LoadingBlock() {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        TappyLoadingIndicator()
    }
}

private const val COLUMNS = 4

private const val PROMPT_ROTATION_MS = 3000L

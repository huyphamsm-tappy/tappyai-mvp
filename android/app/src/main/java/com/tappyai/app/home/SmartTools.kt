package com.tappyai.app.home

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MusicNote
import com.tappyai.app.ProductFlags
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappySpacing

// ── Smart Tools — the registry and THE card (web `src/lib/tools/registry.ts` +
// `src/components/v3/SmartToolCard.tsx`, design/v3-phase4) ─────────────────────────────────────
//
// 🔑 ONE LIST, ONE CARD, TWO SIZES. The web declares its tools once (the registry: identity,
// purpose, route, group, Home membership, sign-in hint) and paints them once (the tile: a tinted
// gradient per tool, the glyph in a solid badge top-left, the mascot top-right, a large title,
// the description, a chevron in the corner) in two sizes — `full` on /tools, `compact` on Home's
// rail. This file is that pair for Android: [SMART_TOOLS] in the web's order and groups, and
// [SmartToolCard] in the web's dress. Nothing about WHAT a tool does lives here: every entry
// resolves to a destination the Home tab already hosts, through the callbacks the host already
// passes — no tool is recreated, none is invented; the one the web lists and Android does not
// (`suggest`) is a deliberate product removal, documented on [SmartToolId].
//
// 🔑 THE SKIN IS THE WEB'S. Hues are the exact `.v3-toolcard[data-hue]` stops from globals.css
// (light and dark), and each tool's mascot is the pose `SMART_TOOL_SKINS` maps it to — one of the
// owner's 18 canonical poses, copied byte-for-byte from `public/tappy/<pose>.png` into
// `drawable-nodpi/tappy_<pose>.png`. Mapped, never drawn: no new artwork exists for any tool.
//
// 🔑 THE GLYPHS. The web draws lucide glyphs (ScanText, Languages, ArrowLeftRight, Calculator,
// ShieldCheck, Star, Users, Music2, Sparkle, PenLine) — a library, not project artwork, with no
// Android asset behind it. The smallest faithful adaptation is the Material glyph of the same
// meaning, drawn exactly as the web does (white, in the badge), so each tool keeps its identity.

/**
 * The tools, in the web registry's order — minus `suggest`.
 *
 * 🔑 NO "GỢI Ý" TOOL ON ANDROID. Home already carries "Gợi ý cho bạn", the personalised
 * discovery section, and a second "Gợi ý" entry among the utilities was the same idea filed
 * twice (product decision, 2026-09-14). Its destination, `RecommendationsRoute.Main`, is
 * untouched: Home's section still opens it. The web registry keeps its row; this list is
 * the web's minus that one.
 */
internal enum class SmartToolId { Scan, Translate, Currency, Split, Safety, Together, Music, Fortune, Captions }

/** The web's three groups (`v3.tools.daily` / `discover` / `fun`), in order. */
internal enum class SmartToolGroup(@StringRes val titleRes: Int) {
    Daily(R.string.smart_tools_group_daily),
    Discover(R.string.smart_tools_group_discover),
    Fun(R.string.smart_tools_group_fun),
}

/** The web `data-hue` values — resolved to colours by [SmartToolPalette]. */
internal enum class SmartToolHue { Blue, Indigo, Emerald, Amber, Olive, Rose, Cobalt, Violet, Pink }

/** One registry row: identity, purpose, skin, group and the two flags the web carries. */
internal data class SmartTool(
    val id: SmartToolId,
    @StringRes val titleRes: Int,
    @StringRes val descRes: Int,
    val icon: ImageVector,
    val hue: SmartToolHue,
    /** The mascot pose (`tappy_<pose>`), from the web's `SMART_TOOL_SKINS`. */
    @DrawableRes val mascotRes: Int,
    val group: SmartToolGroup,
    /** Web `home: true` — the tools the web's Home rail previews. */
    val home: Boolean,
    /** Web `auth: true` — the card says "Cần đăng nhập"; the destination still decides. */
    val auth: Boolean = false,
)

/**
 * The registry — identity, order, grouping, hue and pose all as the web declares them. Scam
 * Shield is gated on the web by `SHOW_SCAM_SHIELD` (true today, and the Android shell routes to
 * it unconditionally), so it is listed unconditionally here too.
 */
internal val SMART_TOOLS: List<SmartTool> = listOf(
    SmartTool(SmartToolId.Scan, R.string.smart_tool_scan, R.string.smart_tool_scan_desc, Icons.Outlined.DocumentScanner, SmartToolHue.Blue, R.drawable.tappy_searching, SmartToolGroup.Daily, home = true),
    SmartTool(SmartToolId.Translate, R.string.smart_tool_translate, R.string.smart_tool_translate_desc, Icons.Filled.Translate, SmartToolHue.Indigo, R.drawable.tappy_speaking, SmartToolGroup.Daily, home = true),
    SmartTool(SmartToolId.Currency, R.string.smart_tool_currency, R.string.smart_tool_currency_desc, Icons.Filled.SwapHoriz, SmartToolHue.Emerald, R.drawable.tappy_deals, SmartToolGroup.Daily, home = true),
    SmartTool(SmartToolId.Split, R.string.smart_tool_split, R.string.smart_tool_split_desc, Icons.Filled.Calculate, SmartToolHue.Amber, R.drawable.tappy_welcome, SmartToolGroup.Daily, home = true),
    SmartTool(SmartToolId.Safety, R.string.smart_tool_safety, R.string.smart_tool_safety_desc, Icons.Filled.VerifiedUser, SmartToolHue.Blue, R.drawable.tappy_recommendation, SmartToolGroup.Daily, home = true),
    SmartTool(SmartToolId.Together, R.string.smart_tool_together, R.string.smart_tool_together_desc, Icons.Filled.Group, SmartToolHue.Rose, R.drawable.tappy_food, SmartToolGroup.Discover, home = false, auth = true),
    SmartTool(SmartToolId.Music, R.string.smart_tool_music, R.string.smart_tool_music_desc, Icons.Filled.MusicNote, SmartToolHue.Cobalt, R.drawable.tappy_aitools, SmartToolGroup.Discover, home = false),
    SmartTool(SmartToolId.Fortune, R.string.smart_tool_fortune, R.string.smart_tool_fortune_desc, Icons.Filled.AutoAwesome, SmartToolHue.Violet, R.drawable.tappy_thinking, SmartToolGroup.Fun, home = false),
    SmartTool(SmartToolId.Captions, R.string.smart_tool_captions, R.string.smart_tool_captions_desc, Icons.Filled.Edit, SmartToolHue.Pink, R.drawable.tappy_phone, SmartToolGroup.Fun, home = false),
)

/**
 * The tools this build actually offers — `smartTools()` on the web.
 *
 * [SMART_TOOLS] stays the full registry (identity, order and grouping, exactly as the web declares
 * them, which `SmartToolsTest` pins). This is the gated view of it: a hidden tool is ABSENT, not
 * greyed out, and it comes back with one boolean. Music is gated on every platform while its
 * licensing is open — web `SHOW_MUSIC`, `flags.showMusic` from `GET /api/config`, and
 * [ProductFlags.SHOW_MUSIC] here.
 */
internal fun smartTools(): List<SmartTool> =
    SMART_TOOLS.filter { it.id != SmartToolId.Music || ProductFlags.SHOW_MUSIC }

/** The registry by group, in group order — `smartToolGroups()` on the web. */
internal fun smartToolGroups(tools: List<SmartTool> = smartTools()): List<Pair<SmartToolGroup, List<SmartTool>>> =
    SmartToolGroup.entries.map { g -> g to tools.filter { it.group == g } }.filter { it.second.isNotEmpty() }

/** A tool's colours: the card's gradient stops, its badge, and the badge glyph colour. */
internal data class SmartToolPalette(val a: Color, val b: Color, val badge: Color, val badgeFg: Color = Color.White)

/**
 * The web's `.v3-toolcard[data-hue]` stops — `--tc-a` / `--tc-b` / `--tc-badge` (and the two
 * dark badges whose glyph is dark on the web, `--tc-badge-fg`), one set per appearance.
 */
internal fun smartToolPalette(hue: SmartToolHue, dark: Boolean): SmartToolPalette = if (dark) {
    when (hue) {
        SmartToolHue.Blue -> SmartToolPalette(Color(0xFF2563E6), Color(0xFF0A1D52), Color(0xFF3B82F6))
        SmartToolHue.Indigo -> SmartToolPalette(Color(0xFF5B46DD), Color(0xFF16163E), Color(0xFF7C6CF6))
        SmartToolHue.Emerald -> SmartToolPalette(Color(0xFF0F8F6C), Color(0xFF062B2C), Color(0xFF14B58A))
        SmartToolHue.Amber -> SmartToolPalette(Color(0xFFB9661C), Color(0xFF35200F), Color(0xFFF59E0B), badgeFg = Color(0xFF1F1200))
        SmartToolHue.Olive -> SmartToolPalette(Color(0xFF7F7229), Color(0xFF202018), Color(0xFFE4B93B), badgeFg = Color(0xFF1F1A05))
        SmartToolHue.Rose -> SmartToolPalette(Color(0xFFAD385C), Color(0xFF371424), Color(0xFFF0648B))
        SmartToolHue.Cobalt -> SmartToolPalette(Color(0xFF3B4DDA), Color(0xFF101843), Color(0xFF7B6BFF))
        SmartToolHue.Violet -> SmartToolPalette(Color(0xFF6C40E3), Color(0xFF1D1444), Color(0xFFA07CFF))
        SmartToolHue.Pink -> SmartToolPalette(Color(0xFFCF3A76), Color(0xFF46152F), Color(0xFFFF5C8A))
    }
} else {
    when (hue) {
        SmartToolHue.Blue -> SmartToolPalette(Color(0xFFE3EEFF), Color(0xFFBFD5FF), Color(0xFF2563EB))
        SmartToolHue.Indigo -> SmartToolPalette(Color(0xFFE8E4FF), Color(0xFFCCC4FA), Color(0xFF5B4FD9))
        SmartToolHue.Emerald -> SmartToolPalette(Color(0xFFDAF6EC), Color(0xFFB3E9D4), Color(0xFF0E8F6A))
        SmartToolHue.Amber -> SmartToolPalette(Color(0xFFFFEFD8), Color(0xFFFBD9A8), Color(0xFFC2620A))
        SmartToolHue.Olive -> SmartToolPalette(Color(0xFFF5F0D3), Color(0xFFE4DCA5), Color(0xFF8F6D0C))
        SmartToolHue.Rose -> SmartToolPalette(Color(0xFFFFE2E9), Color(0xFFFBC2CF), Color(0xFFC92F58))
        SmartToolHue.Cobalt -> SmartToolPalette(Color(0xFFE2E6FF), Color(0xFFC4CCFF), Color(0xFF4353D6))
        SmartToolHue.Violet -> SmartToolPalette(Color(0xFFEEE5FF), Color(0xFFD7C5FF), Color(0xFF7442D6))
        SmartToolHue.Pink -> SmartToolPalette(Color(0xFFFFDFEE), Color(0xFFFFBCD6), Color(0xFFD63A75))
    }
}

/** `full` = the catalogue card on the Smart Tools page; `compact` = Home's preview rail. */
internal enum class SmartToolCardVariant { Full, Compact }

/** Whether the V3 Home palette in force is the dark one — the card's light/dark hue switch. */
private val isV3Dark: Boolean
    @Composable @ReadOnlyComposable get() = HomeV3.Background.luminance() < 0.5f

/**
 * One tool: identity, purpose, and a way in — the web tile, native.
 *
 *   ┌──────────────────────────────┐
 *   │ [badge]              (mascot)│   the glyph in a solid badge top-left; the pose top-right
 *   │                              │
 *   │ Title                        │   full width under the mascot's feet (web: "the copy never
 *   │ description                  │   runs under the mascot")
 *   │ 🔒 Cần đăng nhập        (›) │   the sign-in hint is text + icon, never a colour
 *   └──────────────────────────────┘
 *
 * The whole card is the touch target (ripple + the web's `active:scale(0.99)`). The paint is the
 * web's, in its order: the 135° a → b hue gradient, then (dark only) the bottom scrim that keeps
 * the description readable on the amber and olive tiles, then the sheen behind the mascot's
 * corner (`radial-gradient(110% 85% at 88% 8%)`) — inside a 1dp light border with a soft drop
 * shadow. The chevron is bare, in the card's foreground colour, bottom-right — no disc.
 */
@Composable
internal fun SmartToolCard(
    tool: SmartTool,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: SmartToolCardVariant = SmartToolCardVariant.Full,
) {
    val dark = isV3Dark
    val palette = smartToolPalette(tool.hue, dark)
    val compact = variant == SmartToolCardVariant.Compact
    val fg = if (dark) Color.White else HomeV3.OnSurface
    val fgMuted = if (dark) Color.White.copy(alpha = 0.82f) else HomeV3.OnSurfaceVariant
    val border = if (dark) Color.White.copy(alpha = 0.10f) else Color(0xFF0F172A).copy(alpha = 0.08f)
    val sheen = if (dark) Color.White.copy(alpha = 0.13f) else Color.White.copy(alpha = 0.45f)
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shape = RoundedCornerShape(18.dp)
    val title = stringResource(tool.titleRes)

    val badgeSize = if (compact) 40.dp else 48.dp
    val badgeRadius = if (compact) 12.dp else 14.dp
    val glyph = if (compact) 18.dp else 22.dp
    val mascot = if (compact) 68.dp else 88.dp
    val pad = if (compact) 14.dp else 16.dp
    val minHeight = if (compact) 150.dp else 180.dp
    val mascotInset = if (compact) 6.dp else 8.dp

    Box(
        modifier = modifier
            .scale(if (pressed) 0.99f else 1f)
            .shadow(elevation = 6.dp, shape = shape, ambientColor = Color.Black.copy(alpha = 0.45f), spotColor = Color.Black.copy(alpha = 0.45f))
            .clip(shape)
            .background(Brush.linearGradient(listOf(palette.a, palette.b)))
            .drawBehind {
                if (dark) {
                    // `linear-gradient(to top, rgba(0,0,0,.32), transparent 58%)`.
                    drawRect(Brush.verticalGradient(0.42f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.32f)))
                }
                // `radial-gradient(110% 85% at 88% 8%, sheen, transparent 55%)`.
                val center = Offset(size.width * 0.88f, size.height * 0.08f)
                drawRect(Brush.radialGradient(listOf(sheen, Color.Transparent), center = center, radius = size.width * 0.6f))
            }
            .border(1.dp, border, shape)
            .clickable(
                interactionSource = interaction,
                indication = ripple(color = Color.White),
                role = Role.Button,
                onClickLabel = title,
                onClick = onClick,
            )
            .heightIn(min = minHeight),
    ) {
        // The mascot sits in the top-right corner, behind nothing: the copy starts under it.
        Image(
            painter = painterResource(tool.mascotRes),
            contentDescription = null,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = -mascotInset, y = mascotInset)
                .size(mascot),
        )
        Column(modifier = Modifier.fillMaxSize().padding(pad)) {
            Box(
                modifier = Modifier
                    .size(badgeSize)
                    .clip(RoundedCornerShape(badgeRadius))
                    .background(palette.badge),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = tool.icon, contentDescription = null, tint = palette.badgeFg, modifier = Modifier.size(glyph))
            }
            // The badge row is at least the mascot's height, so title and description start
            // under its feet and run the full width (web SmartToolCard).
            Spacer(modifier = Modifier.height((mascot - badgeSize + 4.dp).coerceAtLeast(12.dp)))
            Text(
                text = title,
                color = fg,
                fontSize = if (compact) 15.sp else 18.sp,
                lineHeight = if (compact) 18.sp else 22.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.2).sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(end = if (compact) 24.dp else 28.dp),
            )
            Text(
                text = stringResource(tool.descRes),
                color = fgMuted,
                fontSize = if (compact) 12.sp else 13.sp,
                lineHeight = if (compact) 16.sp else 18.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = if (compact) 4.dp else 6.dp, end = if (compact) 24.dp else 28.dp),
            )
            if (tool.auth) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    modifier = Modifier.padding(top = TappySpacing.sm, end = 28.dp),
                ) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = fgMuted, modifier = Modifier.size(11.dp))
                    Text(
                        text = stringResource(R.string.smart_tools_auth_hint),
                        color = fgMuted,
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
        // The way in: the web's bare chevron, bottom-right, in the card's foreground colour.
        Icon(
            Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = fg,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(pad)
                .size(if (compact) 18.dp else 20.dp),
        )
    }
}

/**
 * A grid of [SmartToolCard]s. The web's catalogue grid steps 1 → 2 → 3 → 4 columns with the
 * viewport and is ONE column below `sm` — a phone tile wide enough to carry its copy on two lines
 * and its mascot — so the page passes `columns = 1`; Home's compact preview rail keeps two.
 */
@Composable
internal fun SmartToolGrid(
    tools: List<SmartTool>,
    onOpen: (SmartToolId) -> Unit,
    variant: SmartToolCardVariant,
    modifier: Modifier = Modifier,
    columns: Int = 2,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        tools.chunked(columns).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                row.forEach { tool ->
                    SmartToolCard(
                        tool = tool,
                        onClick = { onOpen(tool.id) },
                        variant = variant,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
                // Keeps a short final row aligned with the full rows above.
                repeat(columns - row.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
        }
    }
}

package com.tappyai.app.fortune

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Xem bói — the hub, in the V3 cosmic dress (web `/boi`, `BoiLandingView.tsx` on
 * design/v3-phase4, 2026-09-12; `.v3-boi-*` in `globals.css`).
 *
 *   ←  Xem bói
 *   ┌──────────────────────────────────┐
 *   │   ( rings · planet · ★ ☀ ☾ )     │  ← the hero scene: drawn, like the web's CSS
 *   │   [✦ Xem bói online 🔮]          │
 *   │   Tò mò vận may                  │
 *   │   hôm nay của bạn?               │
 *   │   Tarot, tử vi 12 con giáp và …  │
 *   └──────────────────────────────────┘
 *   ┌ violet ─────────────────────── → ┐
 *   │ [tile]  Rút bài Tarot            │
 *   │         Rút 1-3 lá … · chips     │
 *   └──────────────────────────────────┘
 *   ┌ amber … Tử vi 12 con giáp        ┐
 *   ┌ blue  … Cung hoàng đạo           ┐
 *   (i) Nội dung chỉ mang tính giải trí …
 *
 * The same three destinations, the same routes ([FortuneRoute]), the same copy keys as before:
 * only the composition changed. A nested Home-tab screen — it draws its own back row and the
 * existing bottom navigation stays.
 *
 * 🚨 NO IMAGE ASSETS, ON PURPOSE. The web hub has none either: its tarot plates, rings, planet,
 * wheel and star-field are CSS, and the owner's reference for it is a single opaque mockup that
 * must not be cropped. So the scene here is drawn (shapes + the icon system), never a bitmap,
 * never emoji — exactly what the web renders. The hero and the three cards keep their own dark
 * panels in both appearances (as on the web); the page ground and the note follow [HomeV3].
 *
 * 🚨 THE CHIPS NAME READINGS THAT EXIST. The reference drew "Tình yêu / Công việc / Hướng đi" on
 * Tarot and "Công danh" on tử vi; neither is a mode this product has. Tarot draws 1 or 3 cards in
 * a Past / Present / Future spread ([tarot.TarotScreen]) and both birth-date readings render
 * Love / Career / Money / Health ([tuvi.TuViScreen], [zodiac.ZodiacScreen]) — the labels below
 * are those screens' own strings. Decorative, inside the card's single click target.
 */
@Composable
fun FortuneHubScreen(
    onBack: () -> Unit,
    onOpenTarot: () -> Unit,
    onOpenTuVi: () -> Unit,
    onOpenZodiac: () -> Unit,
) {
    val features = listOf(
        FortuneFeature(
            hue = FortuneHue.Violet,
            icon = Icons.Outlined.AutoFixHigh,
            title = stringResource(R.string.fortune_hub_tarot_title),
            description = stringResource(R.string.fortune_hub_tarot_description),
            chips = listOf(
                stringResource(R.string.fortune_tarot_past),
                stringResource(R.string.fortune_tarot_present),
                stringResource(R.string.fortune_tarot_future),
            ),
            motif = FortuneMotif.Plate,
            onClick = onOpenTarot,
        ),
        FortuneFeature(
            hue = FortuneHue.Amber,
            icon = Icons.Outlined.DarkMode,
            title = stringResource(R.string.fortune_hub_tuvi_title),
            description = stringResource(R.string.fortune_hub_tuvi_description),
            chips = readingChips(),
            motif = FortuneMotif.Rings,
            onClick = onOpenTuVi,
        ),
        FortuneFeature(
            hue = FortuneHue.Blue,
            icon = Icons.Outlined.Public,
            title = stringResource(R.string.fortune_hub_zodiac_title),
            description = stringResource(R.string.fortune_hub_zodiac_description),
            chips = readingChips(),
            motif = FortuneMotif.Wheel,
            onClick = onOpenZodiac,
        ),
    )

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
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
            ) {
                FortuneHubHeader(onBack = onBack)
                FortuneHero()
                features.forEach { feature -> FortuneFeatureCard(feature = feature) }
                FortuneDisclaimer()
            }
        }
    }
}

/** The four readings both birth-date screens render, in their row order. */
@Composable
private fun readingChips(): List<String> = listOf(
    stringResource(R.string.fortune_love),
    stringResource(R.string.fortune_career_life),
    stringResource(R.string.fortune_money),
    stringResource(R.string.fortune_health),
)

private data class FortuneFeature(
    val hue: FortuneHue,
    val icon: ImageVector,
    val title: String,
    val description: String,
    val chips: List<String>,
    val motif: FortuneMotif,
    val onClick: () -> Unit,
)

/** One card's identity — the web's `.v3-boi-card[data-hue]` custom properties, verbatim. */
private enum class FortuneHue(
    val panelA: Color,
    val panelB: Color,
    val glow: Color,
    val border: Color,
    val tileA: Color,
    val tileB: Color,
    val motif: Color,
) {
    Violet(
        panelA = Color(0xFF14113A), panelB = Color(0xFF2A1B5E), glow = Color(0x738B5CF6),
        border = Color(0x59A78BFA), tileA = Color(0xFF7C3AED), tileB = Color(0xFF4C1D95), motif = Color(0x36C4B5FD),
    ),
    Amber(
        panelA = Color(0xFF1A1230), panelB = Color(0xFF3A2318), glow = Color(0x66F59E0B),
        border = Color(0x59FBBF24), tileA = Color(0xFFDC2626), tileB = Color(0xFF7F1D1D), motif = Color(0x36FBBF24),
    ),
    Blue(
        panelA = Color(0xFF0B1633), panelB = Color(0xFF0E2A4F), glow = Color(0x5938BDF8),
        border = Color(0x5960A5FA), tileA = Color(0xFF0EA5E9), tileB = Color(0xFF1E3A8A), motif = Color(0x3693C5FD),
    ),
}

/** Violet: a tarot plate; amber: concentric rings (a medallion); blue: a zodiac wheel. */
private enum class FortuneMotif { Plate, Rings, Wheel }

// The hero's own panel — the web keeps it dark in both appearances.
private val HeroBorder = Color(0x598B84FF)
private val HeroTop = Color(0xFF0B1030)
private val HeroMid = Color(0xFF16114A)
private val HeroBottom = Color(0xFF1E1B5E)
private val HeroAccent = Color(0xFFC4B5FD)
private val HeroMuted = Color(0xDBE2E8FF)
private val CardDesc = Color(0xD1E2E8FF)
private val ChipText = Color(0xEBE2E8FF)
private val Amber = Color(0xFFFBBF24)
private val PlateTop = Color(0xFF1B1740)
private val PlateBottom = Color(0xFF0E0C2C)

/** Back and the title — the web's back-bar (`Header showBack title`), the V3 way on a phone. */
@Composable
private fun FortuneHubHeader(onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.common_back),
                tint = HomeV3.OnSurface,
            )
        }
        Text(
            text = stringResource(R.string.fortune_hub_title),
            color = HomeV3.OnSurface,
            fontSize = 24.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = TappySpacing.md),
        )
    }
}

/**
 * The hero: the web's `.v3-boi-hero` (gradient panel, star-field) with its scene — rings, a
 * planet and three tarot plates. The web shows the scene beside the copy from `md` up and hides
 * it on phones; here it sits above the copy instead, so it stays prominent without ever
 * overlapping the text.
 */
@Composable
private fun FortuneHero() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(Brush.linearGradient(listOf(HeroTop, HeroMid, HeroBottom)))
            .drawBehind {
                // The two coloured washes, then the star-field: eight fixed points, static.
                drawCircle(
                    Brush.radialGradient(listOf(Color(0x8C8B5CF6), Color.Transparent), center = Offset(size.width * 0.8f, size.height * 0.15f), radius = size.width * 0.6f),
                    radius = size.width * 0.6f, center = Offset(size.width * 0.8f, size.height * 0.15f),
                )
                drawCircle(
                    Brush.radialGradient(listOf(Color(0x732563EB), Color.Transparent), center = Offset(size.width * 0.15f, size.height), radius = size.width * 0.5f),
                    radius = size.width * 0.5f, center = Offset(size.width * 0.15f, size.height),
                )
                for ((x, y, r, a) in HeroStars) {
                    drawCircle(Color.White.copy(alpha = a), radius = r.dp.toPx(), center = Offset(size.width * x, size.height * y))
                }
            }
            .border(1.dp, HeroBorder, RoundedCornerShape(28.dp))
            .padding(horizontal = 20.dp, vertical = 22.dp),
    ) {
        FortuneHeroScene(modifier = Modifier.fillMaxWidth().height(156.dp))
        Spacer(Modifier.height(18.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            modifier = Modifier
                .clip(CircleShape)
                .background(Color(0x14FFFFFF))
                .border(1.dp, Color(0x2EFFFFFF), CircleShape)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
            Text(
                text = stringResource(R.string.fortune_hub_hero_eyebrow),
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        Spacer(Modifier.height(14.dp))
        Text(
            text = stringResource(R.string.fortune_hub_hero_title_line1),
            color = Color.White,
            fontSize = 28.sp,
            lineHeight = 31.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.5).sp,
        )
        Text(
            text = stringResource(R.string.fortune_hub_hero_title_line2),
            color = HeroAccent,
            fontSize = 28.sp,
            lineHeight = 31.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.5).sp,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.fortune_hub_hero_description),
            color = HeroMuted,
            fontSize = 14.5.sp,
            lineHeight = 21.sp,
        )
    }
}

/** (x, y) as fractions of the panel, radius in dp, alpha — the web's eight `radial-gradient` dots. */
private val HeroStars = listOf(
    Quad(0.12f, 0.22f, 0.9f, 0.9f), Quad(0.28f, 0.68f, 0.9f, 0.7f), Quad(0.44f, 0.18f, 1.2f, 0.85f),
    Quad(0.61f, 0.74f, 0.9f, 0.6f), Quad(0.73f, 0.30f, 1.2f, 0.9f), Quad(0.86f, 0.58f, 0.9f, 0.7f),
    Quad(0.93f, 0.14f, 0.9f, 0.8f), Quad(0.52f, 0.88f, 0.9f, 0.6f),
)

private data class Quad(val x: Float, val y: Float, val r: Float, val a: Float)

/** Two orbit rings, a planet, three rotated tarot plates carrying a star, a sun and a moon. */
@Composable
private fun FortuneHeroScene(modifier: Modifier) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(300.dp)
                .offset(x = 40.dp, y = (-30).dp)
                .border(1.dp, Color(0x47C4B5FD), CircleShape),
        )
        Box(
            Modifier
                .size(210.dp)
                .offset(x = 70.dp, y = 10.dp)
                .border(1.dp, Color(0x40FBBF24), CircleShape),
        )
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .offset(x = (-8).dp, y = 6.dp)
                .size(48.dp)
                .drawBehind {
                    // The planet: a lit sphere (highlight at 35 %/35 %) inside a soft indigo glow.
                    drawCircle(Color(0x596366F1), radius = size.minDimension / 2 + 12.dp.toPx())
                    drawCircle(
                        Brush.radialGradient(
                            listOf(Color(0xFF6D6AF6), Color(0xFF2E2A8A), Color(0xFF14123F)),
                            center = Offset(size.width * 0.35f, size.height * 0.35f),
                            radius = size.width * 0.75f,
                        ),
                        radius = size.minDimension / 2,
                    )
                },
        )
        TarotPlate(width = 72.dp, height = 106.dp, rotation = -14f, icon = Icons.Outlined.StarOutline, modifier = Modifier.offset(x = (-64).dp, y = 10.dp))
        TarotPlate(width = 72.dp, height = 106.dp, rotation = 12f, icon = Icons.Outlined.DarkMode, modifier = Modifier.offset(x = 64.dp, y = 12.dp))
        TarotPlate(width = 80.dp, height = 118.dp, rotation = -2f, icon = Icons.Outlined.WbSunny, modifier = Modifier.offset(y = (-2).dp))
    }
}

/** The web's `.v3-boi-tarot`: a bordered plate with an inset amber ring and a soft violet sheen. */
@Composable
private fun TarotPlate(width: Dp, height: Dp, rotation: Float, icon: ImageVector, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(width, height)
            .rotate(rotation)
            .clip(RoundedCornerShape(14.dp))
            .background(Brush.linearGradient(listOf(PlateTop, PlateBottom)))
            .drawBehind {
                drawCircle(
                    Brush.radialGradient(listOf(Color(0x59A78BFA), Color.Transparent), center = Offset(size.width / 2, size.height * 0.3f), radius = size.width * 0.6f),
                    radius = size.width * 0.6f, center = Offset(size.width / 2, size.height * 0.3f),
                )
                val inset = 6.dp.toPx()
                drawRoundRect(
                    color = Amber.copy(alpha = 0.35f),
                    topLeft = Offset(inset, inset),
                    size = Size(size.width - inset * 2, size.height - inset * 2),
                    cornerRadius = CornerRadius(9.dp.toPx()),
                    style = Stroke(width = 1.dp.toPx()),
                )
            }
            .border(1.dp, Amber.copy(alpha = 0.55f), RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Amber.copy(alpha = 0.9f), modifier = Modifier.size(width * 0.36f))
    }
}

/** One feature — the web's `.v3-boi-card`: hue panel, glyph tile, copy, chips, the arrow, a faint motif. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FortuneFeatureCard(feature: FortuneFeature) {
    val hue = feature.hue
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(hue.panelA, hue.panelB)))
            .drawBehind {
                drawCircle(
                    Brush.radialGradient(listOf(hue.glow, Color.Transparent), center = Offset(size.width, size.height / 2), radius = size.width * 0.7f),
                    radius = size.width * 0.7f, center = Offset(size.width, size.height / 2),
                )
            }
            .border(1.dp, hue.border, shape)
            .clickable(onClick = feature.onClick),
    ) {
        FortuneMotifArt(motif = feature.motif, color = hue.motif)
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Brush.linearGradient(listOf(hue.tileA, hue.tileB))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(feature.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(30.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = feature.title,
                    color = Color.White,
                    fontSize = 19.sp,
                    lineHeight = 23.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.2).sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(end = 44.dp),
                )
                Text(
                    text = feature.description,
                    color = CardDesc,
                    fontSize = 13.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 12.dp),
                ) {
                    feature.chips.forEach { chip ->
                        Text(
                            text = chip,
                            color = ChipText,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(Color(0x14FFFFFF))
                                .border(1.dp, Color(0x24FFFFFF), CircleShape)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp)
                .size(40.dp)
                .clip(CircleShape)
                .background(Color(0x0FFFFFFF))
                .border(1.dp, Color(0x38FFFFFF), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
        }
    }
}

/**
 * The decorative motif on the card's right — the web's `.v3-boi-motif-*`, sized for a phone and
 * bleeding off the edge as in the reference. Drawn behind the copy, quieter than the web's 35 %
 * tint (about 21 %) because on a phone it sits under the copy rather than beside it.
 */
@Composable
private fun BoxScope.FortuneMotifArt(motif: FortuneMotif, color: Color) {
    val stroke = 1.dp
    when (motif) {
        FortuneMotif.Plate -> Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .offset(x = 40.dp, y = 10.dp)
                .size(96.dp, 136.dp)
                .rotate(12f)
                .drawBehind {
                    val r = CornerRadius(14.dp.toPx())
                    drawRoundRect(color = color, cornerRadius = r, style = Stroke(stroke.toPx()))
                    val inset = 8.dp.toPx()
                    drawRoundRect(color = color, topLeft = Offset(inset, inset), size = Size(size.width - inset * 2, size.height - inset * 2), cornerRadius = CornerRadius(8.dp.toPx()), style = Stroke(stroke.toPx()))
                },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Outlined.WbSunny, contentDescription = null, tint = color, modifier = Modifier.size(32.dp)) }

        FortuneMotif.Rings -> Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .offset(x = 56.dp)
                .size(160.dp)
                .drawBehind {
                    val step = 20.dp.toPx()
                    var radius = size.minDimension / 2
                    while (radius > 0f) {
                        drawCircle(color = color, radius = radius, style = Stroke(stroke.toPx()))
                        radius -= step
                    }
                },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Outlined.DarkMode, contentDescription = null, tint = color, modifier = Modifier.size(32.dp)) }

        FortuneMotif.Wheel -> Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .offset(x = 60.dp)
                .size(168.dp)
                .drawBehind {
                    val outer = size.minDimension / 2
                    drawCircle(color = color, radius = outer, style = Stroke(stroke.toPx()))
                    // Twelve houses: spokes from 58 % out to the rim.
                    for (i in 0 until 12) {
                        rotate(degrees = i * 30f) {
                            drawLine(color, Offset(center.x, center.y - outer * 0.58f), Offset(center.x, center.y - outer), strokeWidth = stroke.toPx())
                        }
                    }
                    drawCircle(
                        color = color, radius = outer * 0.64f,
                        style = Stroke(stroke.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))),
                    )
                },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Outlined.StarOutline, contentDescription = null, tint = color, modifier = Modifier.size(30.dp)) }
    }
}

/** The shared disclaimer the sub-screens already show — the web's quiet glass strip. */
@Composable
private fun FortuneDisclaimer() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(HomeV3.Surface)
            .border(BorderStroke(1.dp, HomeV3.Outline), RoundedCornerShape(18.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Outlined.Info, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(18.dp).padding(top = 1.dp))
        Text(
            text = stringResource(R.string.fortune_disclaimer),
            color = HomeV3.OnSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 18.sp,
            modifier = Modifier.weight(1f),
        )
    }
}

package com.tappyai.app.chat

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Waves
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.LocalBar
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.OutdoorGrill
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RamenDining
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.filled.Terrain
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.chat.ask.AskArea
import com.tappyai.app.chat.ask.AskCardModel
import com.tappyai.app.chat.ask.AskIcon
import com.tappyai.app.chat.ask.AskKind
import com.tappyai.app.chat.ask.AskOptionView
import com.tappyai.app.chat.ask.AskQuestionView
import com.tappyai.app.chat.plan.PlanImageManifest
import com.tappyai.app.chat.plan.planImageRepository
import com.tappyai.core.designsystem.component.TappyImage

/**
 * The consult ASK turn — ask card v2 (Huy 30/09, `docs/design/ask-card/ask-card-mockup.png`, R23 + R23.1 —
 * the pure rules are a 1:1 port of the web `askCardModel.ts`):
 * the search-otter header, numbered questions with their subtitle, IMAGE tiles for the "type"
 * question (multi-choice; image KEY `diem-<loai>` via the manifest, area placeholder until it serves
 * one), ICON tiles for who / when / where / budget (one choice, tap again to clear), the
 * «Hoặc nói thêm ý khác…» box with its send button, and «Tìm cho tôi».
 *
 * The server block and the message sent are UNCHANGED in shape: one text reply, questions joined
 * " · ", a multi-choice question's picks joined ", ", free text last ([AskCardModel.composeAnswer]).
 */
@Composable
fun AskCard(questions: List<AskQuestion>, onSend: (String) -> Unit, modifier: Modifier = Modifier) {
    val views = remember(questions) { AskCardModel.viewOf(questions) }
    val area = remember(questions) { AskCardModel.areaOf(questions) }
    val chosen = remember(questions) { mutableStateMapOf<String, Set<String>>() }
    var free by remember(questions) { mutableStateOf("") }
    // R23.1: «Tìm cho tôi» is always on — nothing chosen sends «Tìm cho tôi»; once sent the card locks.
    var sent by remember(questions) { mutableStateOf(false) }
    val send = { if (!sent) { sent = true; onSend(AskCardModel.sendText(views, chosen, free)) } }
    val header = headerOf(area)
    val manifest = rememberAskManifest()
    val shape = RoundedCornerShape(22.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Color(0xFF15213D), AskPal.Ground)))
            .border(1.dp, AskPal.Line, shape)
            .testTag("ask-card"),
    ) {
        // ── Header: the search otter, the title, the subtitle ──
        Row(modifier = Modifier.padding(start = 10.dp, end = 16.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Image(painterResource(R.drawable.tappy_search), contentDescription = null, modifier = Modifier.size(76.dp))
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(header.first), color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 24.sp)
                Text(stringResource(header.second), color = AskPal.Sub, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 2.dp))
            }
        }

        Column(
            modifier = Modifier
                .padding(10.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(AskPal.Panel)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            views.forEachIndexed { i, v ->
                if (i > 0) Box(Modifier.fillMaxWidth().heightIn(min = 1.dp, max = 1.dp).background(AskPal.Line))
                QuestionBlock(v, area, manifest, chosen[v.id].orEmpty(), enabled = !sent) { label ->
                    val cur = chosen[v.id].orEmpty()
                    chosen[v.id] = when {
                        label in cur -> cur - label
                        v.kind.multi -> cur + label
                        else -> setOf(label)
                    }
                }
            }
            FreeText(free = free, onChange = { free = it }, example = header.third, enabled = !sent, onSend = send)
        }

        // ── «Tìm cho tôi» ──
        Row(
            modifier = Modifier
                .padding(start = 10.dp, end = 10.dp, bottom = 12.dp)
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .alpha(if (sent) 0.6f else 1f)
                .clip(RoundedCornerShape(16.dp))
                .background(Brush.horizontalGradient(listOf(Color(0xFF2563EB), Color(0xFF3B82F6), Color(0xFF60A5FA))))
                .clickable(enabled = !sent, role = Role.Button, onClick = send)
                .testTag("ask-send"),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(stringResource(if (sent) R.string.ask_v2_sending else R.string.ask_v2_cta), color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** R23.1 header per area: (title, sub-line, free-text example). */
private fun headerOf(area: AskArea): Triple<Int, Int, Int> = when (area) {
    AskArea.FOOD -> Triple(R.string.ask_v2_title_food, R.string.ask_v2_sub_food, R.string.ask_v2_example_food)
    AskArea.SHOPPING -> Triple(R.string.ask_v2_title_shopping, R.string.ask_v2_sub_shopping, R.string.ask_v2_example_shopping)
    AskArea.TRAVEL -> Triple(R.string.ask_v2_title_travel, R.string.ask_v2_sub_travel, R.string.ask_v2_example_travel)
    AskArea.SPA -> Triple(R.string.ask_v2_title_spa, R.string.ask_v2_sub_spa, R.string.ask_v2_example_spa)
    AskArea.ENTERTAINMENT -> Triple(R.string.ask_v2_title, R.string.ask_v2_subtitle, R.string.ask_v2_free_example)
    AskArea.MAIN -> Triple(R.string.ask_v2_title, R.string.ask_v2_subtitle, R.string.ask_v2_example_main)
}

/** Placeholder tint per area — the web's `ASK_AREA_TINT`. */
private fun AskArea.tint(): Brush = Brush.linearGradient(
    when (this) {
        AskArea.ENTERTAINMENT -> listOf(Color(0xFF6D28D9), Color(0xFF1E1B4B))
        AskArea.FOOD -> listOf(Color(0xFFC2410C), Color(0xFF431407))
        AskArea.SHOPPING -> listOf(Color(0xFF0E7490), Color(0xFF082F49))
        AskArea.TRAVEL -> listOf(Color(0xFF0369A1), Color(0xFF0C4A6E))
        AskArea.SPA -> listOf(Color(0xFFBE185D), Color(0xFF500724))
        AskArea.MAIN -> listOf(Color(0xFF1D4ED8), Color(0xFF172554))
    },
)

private object AskPal {
    val Ground = Color(0xFF0B1122)
    val Panel = Color(0xFF0F182C)
    val Line = Color(0x1FFFFFFF)
    val Sub = Color(0xFF8FB3FF)
    val Muted = Color(0xFFA7B0C8)
    val Tile = Color(0xFF16213A)
    val On = Color(0xFF3B82F6)
    val OnFill = Color(0x333B82F6)
}

@Composable
private fun rememberAskManifest(): PlanImageManifest {
    if (LocalInspectionMode.current) return PlanImageManifest.EMPTY
    val context = LocalContext.current
    val repo = remember { planImageRepository(context) }
    LaunchedEffect(repo) { repo.ensureLoaded() }
    val manifest by repo.manifest.collectAsState()
    return manifest
}

@Composable
private fun QuestionBlock(v: AskQuestionView, area: AskArea, manifest: PlanImageManifest, picked: Set<String>, enabled: Boolean, onToggle: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(Color(0xFF2563EB)), contentAlignment = Alignment.Center) {
                Text(v.number.toString(), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(v.title, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                subtitleOf(v.kind)?.let { Text(stringResource(it), color = AskPal.Muted, fontSize = 13.sp) }
            }
        }
        if (v.kind == AskKind.TYPE) {
            // R23.1 §7: 3 options → 3 columns; 4 → 2×2 on a phone; 2 → 2 columns.
            val cols = if (v.options.size == 3) 3 else 2
            v.options.chunked(cols).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { o -> ImageTile(o, area, manifest, o.label in picked, enabled, compact = cols == 3, modifier = Modifier.weight(1f)) { onToggle(o.label) } }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        } else {
            // R23.1 §7: 4 options → icon above the label; 2–3 → icon beside the label, one row.
            val stacked = v.options.size >= 4
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                v.options.forEach { o -> IconTile(o, o.label in picked, enabled, stacked, Modifier.weight(1f)) { onToggle(o.label) } }
            }
        }
    }
}

private fun subtitleOf(kind: AskKind): Int? = when (kind) {
    AskKind.TYPE -> R.string.ask_v2_sub_type
    AskKind.PARTY -> R.string.ask_v2_sub_party
    AskKind.TIME -> R.string.ask_v2_sub_time
    AskKind.BUDGET -> R.string.ask_v2_sub_budget
    AskKind.OTHER -> null
}

private fun Modifier.selectable(on: Boolean, enabled: Boolean, shape: RoundedCornerShape, onClick: () -> Unit) = this
    .clip(shape)
    .border(if (on) 2.dp else 1.dp, if (on) AskPal.On else AskPal.Line, shape)
    .semantics { selected = on }
    .clickable(enabled = enabled, role = Role.Checkbox, onClick = onClick)

@Composable
private fun CheckBadge(modifier: Modifier) {
    Box(modifier.size(22.dp).clip(CircleShape).background(AskPal.On), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
    }
}

/** A "type" option: its image (manifest, by key) or the area placeholder, and the label strip below. */
@Composable
private fun ImageTile(o: AskOptionView, area: AskArea, manifest: PlanImageManifest, on: Boolean, enabled: Boolean, compact: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val url = manifest.urlFor(o.imageKey)
    Box(modifier = modifier.aspectRatio(if (compact) 1f else 1.35f).selectable(on, enabled, shape, onClick).testTag("ask-option")) {
        Box(Modifier.fillMaxSize().background(area.tint()), contentAlignment = Alignment.Center) {
            if (url != null) {
                TappyImage(url = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Icon(iconOf(o.icon), contentDescription = null, tint = Color.White.copy(alpha = 0.55f), modifier = Modifier.padding(bottom = 26.dp).size(34.dp))
            }
        }
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0x000B1122), Color(0xE60B1122))))
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(iconOf(o.icon), contentDescription = null, tint = Color(0xFF93C5FD), modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(o.label, color = Color.White, fontSize = if (compact) 12.5.sp else 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (on) CheckBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
    }
}

/** A who / when / where / budget option: icon on top, label below. */
@Composable
private fun IconTile(o: AskOptionView, on: Boolean, enabled: Boolean, stacked: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val iconTint = if (on) Color(0xFF60A5FA) else Color(0xFFB9C6E4)
    val textColor = if (on) Color(0xFF93C5FD) else Color.White
    Box(
        modifier = modifier
            .heightIn(min = if (stacked) 84.dp else 56.dp)
            .selectable(on, enabled, shape, onClick)
            .background(if (on) AskPal.OnFill else AskPal.Tile)
            .testTag("ask-option"),
    ) {
        if (stacked) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(iconOf(o.icon), contentDescription = null, tint = iconTint, modifier = Modifier.size(26.dp))
                Text(o.label, color = textColor, fontSize = 12.5.sp, lineHeight = 15.sp, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().align(Alignment.Center).padding(horizontal = 10.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                Icon(iconOf(o.icon), contentDescription = null, tint = iconTint, modifier = Modifier.size(24.dp))
                Text(o.label, color = textColor, fontSize = 13.5.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (on) CheckBadge(Modifier.align(Alignment.TopEnd).padding(4.dp))
    }
}

@Composable
private fun FreeText(free: String, onChange: (String) -> Unit, example: Int, enabled: Boolean, onSend: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, AskPal.Line, shape)
            .background(Color(0xFF111B31))
            .padding(start = 12.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.ChatBubbleOutline, contentDescription = null, tint = Color(0xFF60A5FA), modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        BasicTextField(
            value = free,
            onValueChange = onChange,
            enabled = enabled,
            textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
            cursorBrush = SolidColor(AskPal.On),
            modifier = Modifier.weight(1f).padding(vertical = 8.dp).testTag("ask-free-text"),
            decorationBox = { inner ->
                if (free.isEmpty()) {
                    Column {
                        Text(stringResource(R.string.ask_v2_free_hint), color = AskPal.Muted, fontSize = 15.sp)
                        Text(stringResource(example), color = AskPal.Muted.copy(alpha = 0.7f), fontSize = 12.sp)
                    }
                }
                inner()
            },
        )
        Box(
            modifier = Modifier
                .size(46.dp)
                .alpha(if (enabled) 1f else 0.45f)
                .clip(CircleShape)
                .background(Color(0xFF2563EB))
                .clickable(enabled = enabled, role = Role.Button, onClick = onSend)
                .testTag("ask-free-send"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.ask_v2_cta), tint = Color.White, modifier = Modifier.size(20.dp))
        }
    }
}

private fun iconOf(icon: AskIcon): ImageVector = when (icon) {
    AskIcon.MUSIC -> Icons.Filled.MusicNote
    AskIcon.FILM -> Icons.Filled.Movie
    AskIcon.MARTINI -> Icons.Filled.LocalBar
    AskIcon.CIRCLE_DOT -> Icons.Filled.TrackChanges
    AskIcon.COFFEE -> Icons.Filled.LocalCafe
    AskIcon.FLAME -> Icons.Filled.OutdoorGrill
    AskIcon.SOUP -> Icons.Filled.RamenDining
    AskIcon.UTENSILS -> Icons.Filled.Restaurant
    AskIcon.FLOWER -> Icons.Filled.Spa
    AskIcon.WAVES -> Icons.Filled.Waves
    AskIcon.MOUNTAIN -> Icons.Filled.Terrain
    AskIcon.SHOPPING_BAG -> Icons.Filled.ShoppingBag
    AskIcon.MIC -> Icons.Filled.Mic
    AskIcon.HELP -> Icons.AutoMirrored.Filled.HelpOutline
    AskIcon.SPARKLES -> Icons.Filled.AutoAwesome
    AskIcon.USER -> Icons.Filled.Person
    AskIcon.USERS -> Icons.Filled.People
    AskIcon.USERS_ROUND -> Icons.Filled.Groups
    AskIcon.CALENDAR -> Icons.Filled.CalendarMonth
    AskIcon.MOON -> Icons.Filled.DarkMode
    AskIcon.SUN -> Icons.Filled.WbSunny
    AskIcon.WALLET -> Icons.Filled.AccountBalanceWallet
    AskIcon.MAP_PIN -> Icons.Filled.LocationOn
    AskIcon.PLANE -> Icons.Filled.Flight
    AskIcon.BUS -> Icons.Filled.DirectionsBus
    AskIcon.CAR -> Icons.Filled.DirectionsCar
    AskIcon.BIKE -> Icons.Filled.TwoWheeler
    AskIcon.STORE -> Icons.Filled.Storefront
}

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
import androidx.compose.material.icons.filled.BeachAccess
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Diversity3
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.FamilyRestroom
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.LocalBar
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Museum
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.OutdoorGrill
import androidx.compose.material.icons.filled.Park
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RamenDining
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SetMeal
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.filled.Terrain
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Villa
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
import com.tappyai.app.chat.ask.AskCardModel
import com.tappyai.app.chat.ask.AskIcon
import com.tappyai.app.chat.ask.AskKind
import com.tappyai.app.chat.ask.AskOptionView
import com.tappyai.app.chat.ask.AskQuestionView
import com.tappyai.app.chat.plan.PlanArea
import com.tappyai.app.chat.plan.PlanImageManifest
import com.tappyai.app.chat.plan.planImageRepository
import com.tappyai.core.designsystem.component.TappyImage

/**
 * The consult ASK turn — ask card v2 (Huy 30/09, `docs/design/ask-card/ask-card-mockup.png`, R23):
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
    val area = remember(views) { AskCardModel.areaOf(views) }
    val chosen = remember(questions) { mutableStateMapOf<String, Set<String>>() }
    var free by remember(questions) { mutableStateOf("") }
    val answer = AskCardModel.composeAnswer(views, chosen, free)
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
                Text(stringResource(R.string.ask_v2_title), color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 24.sp)
                Text(stringResource(R.string.ask_v2_subtitle), color = AskPal.Sub, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 2.dp))
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
                QuestionBlock(v, area, manifest, chosen[v.id].orEmpty()) { label ->
                    val cur = chosen[v.id].orEmpty()
                    chosen[v.id] = when {
                        label in cur -> cur - label
                        v.kind.multi -> cur + label
                        else -> setOf(label)
                    }
                }
            }
            FreeText(free = free, onChange = { free = it }, canSend = answer.isNotEmpty(), onSend = { onSend(answer) })
        }

        // ── «Tìm cho tôi» ──
        val enabled = answer.isNotEmpty()
        Row(
            modifier = Modifier
                .padding(start = 10.dp, end = 10.dp, bottom = 12.dp)
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .alpha(if (enabled) 1f else 0.45f)
                .clip(RoundedCornerShape(16.dp))
                .background(Brush.horizontalGradient(listOf(Color(0xFF2563EB), Color(0xFF3B82F6), Color(0xFF60A5FA))))
                .clickable(enabled = enabled, role = Role.Button) { onSend(answer) }
                .testTag("ask-send"),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.ask_v2_cta), color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

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
private fun QuestionBlock(v: AskQuestionView, area: PlanArea, manifest: PlanImageManifest, picked: Set<String>, onToggle: (String) -> Unit) {
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
            v.options.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { o -> ImageTile(o, area, manifest, o.label in picked, Modifier.weight(1f)) { onToggle(o.label) } }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                v.options.forEach { o -> IconTile(o, o.label in picked, Modifier.weight(1f)) { onToggle(o.label) } }
            }
        }
    }
}

private fun subtitleOf(kind: AskKind): Int? = when (kind) {
    AskKind.TYPE -> R.string.ask_v2_sub_type
    AskKind.PARTY -> R.string.ask_v2_sub_party
    AskKind.TIME -> R.string.ask_v2_sub_time
    AskKind.PLACE -> R.string.ask_v2_sub_place
    AskKind.BUDGET -> R.string.ask_v2_sub_budget
    AskKind.OTHER -> null
}

private fun Modifier.selectable(on: Boolean, shape: RoundedCornerShape, onClick: () -> Unit) = this
    .clip(shape)
    .border(if (on) 2.dp else 1.dp, if (on) AskPal.On else AskPal.Line, shape)
    .semantics { selected = on }
    .clickable(role = Role.Checkbox, onClick = onClick)

@Composable
private fun CheckBadge(modifier: Modifier) {
    Box(modifier.size(22.dp).clip(CircleShape).background(AskPal.On), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
    }
}

/** A "type" option: its image (manifest, by key) or the area placeholder, and the label strip below. */
@Composable
private fun ImageTile(o: AskOptionView, cardArea: PlanArea, manifest: PlanImageManifest, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val url = manifest.urlFor(o.imageKey)
    Box(modifier = modifier.aspectRatio(1.35f).selectable(on, shape, onClick).testTag("ask-option")) {
        Box(Modifier.fillMaxSize().background((o.area ?: cardArea).placeholder()), contentAlignment = Alignment.Center) {
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
            Text(o.label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (on) CheckBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
    }
}

/** A who / when / where / budget option: icon on top, label below. */
@Composable
private fun IconTile(o: AskOptionView, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier = modifier
            .heightIn(min = 84.dp)
            .selectable(on, shape, onClick)
            .background(if (on) AskPal.OnFill else AskPal.Tile)
            .testTag("ask-option"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(iconOf(o.icon), contentDescription = null, tint = if (on) Color(0xFF60A5FA) else Color(0xFFB9C6E4), modifier = Modifier.size(26.dp))
            Text(
                o.label,
                color = if (on) Color(0xFF93C5FD) else Color.White,
                fontSize = 12.5.sp,
                lineHeight = 15.sp,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (on) CheckBadge(Modifier.align(Alignment.TopEnd).padding(4.dp))
    }
}

@Composable
private fun FreeText(free: String, onChange: (String) -> Unit, canSend: Boolean, onSend: () -> Unit) {
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
            textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
            cursorBrush = SolidColor(AskPal.On),
            modifier = Modifier.weight(1f).padding(vertical = 8.dp).testTag("ask-free-text"),
            decorationBox = { inner ->
                if (free.isEmpty()) {
                    Column {
                        Text(stringResource(R.string.ask_v2_free_hint), color = AskPal.Muted, fontSize = 15.sp)
                        Text(stringResource(R.string.ask_v2_free_example), color = AskPal.Muted.copy(alpha = 0.7f), fontSize = 12.sp)
                    }
                }
                inner()
            },
        )
        Box(
            modifier = Modifier
                .size(46.dp)
                .alpha(if (canSend) 1f else 0.45f)
                .clip(CircleShape)
                .background(Color(0xFF2563EB))
                .clickable(enabled = canSend, role = Role.Button, onClick = onSend)
                .testTag("ask-free-send"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.ask_v2_cta), tint = Color.White, modifier = Modifier.size(20.dp))
        }
    }
}

private fun iconOf(icon: AskIcon): ImageVector = when (icon) {
    AskIcon.PERSON_1 -> Icons.Filled.Person
    AskIcon.PERSON_2 -> Icons.Filled.People
    AskIcon.GROUP_SMALL -> Icons.Filled.Groups
    AskIcon.GROUP_BIG -> Icons.Filled.Diversity3
    AskIcon.SUN -> Icons.Filled.WbSunny
    AskIcon.MOON -> Icons.Filled.DarkMode
    AskIcon.CALENDAR -> Icons.Filled.CalendarMonth
    AskIcon.CLOCK -> Icons.Filled.Schedule
    AskIcon.PIN -> Icons.Filled.LocationOn
    AskIcon.MONEY -> Icons.Filled.Payments
    AskIcon.HELP -> Icons.AutoMirrored.Filled.HelpOutline
    AskIcon.TUNE -> Icons.Filled.Tune
    AskIcon.MUSIC -> Icons.Filled.MusicNote
    AskIcon.MOVIE -> Icons.Filled.Movie
    AskIcon.BAR -> Icons.Filled.LocalBar
    AskIcon.TARGET -> Icons.Filled.TrackChanges
    AskIcon.CAFE -> Icons.Filled.LocalCafe
    AskIcon.GRILL -> Icons.Filled.OutdoorGrill
    AskIcon.BOWL -> Icons.Filled.RamenDining
    AskIcon.RESTAURANT -> Icons.Filled.Restaurant
    AskIcon.SPA -> Icons.Filled.Spa
    AskIcon.BEACH -> Icons.Filled.BeachAccess
    AskIcon.MOUNTAIN -> Icons.Filled.Terrain
    AskIcon.SHOPPING -> Icons.Filled.ShoppingBag
    AskIcon.MIC -> Icons.Filled.Mic
    AskIcon.PARK -> Icons.Filled.Park
    AskIcon.MUSEUM -> Icons.Filled.Museum
    AskIcon.FAMILY -> Icons.Filled.FamilyRestroom
    AskIcon.NAIL -> Icons.Filled.Face
    AskIcon.TECH -> Icons.Filled.Computer
    AskIcon.BEAUTY -> Icons.Filled.Face
    AskIcon.SEAFOOD -> Icons.Filled.SetMeal
    AskIcon.RESORT -> Icons.Filled.Villa
}

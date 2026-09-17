package com.tappyai.app.scamshield

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.GppGood
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Sms
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.personal.V3Chip
import com.tappyai.app.personal.V3PageHeader
import com.tappyai.app.personal.V3PanelShape
import com.tappyai.app.personal.V3Tone
import com.tappyai.app.tools.ToolBubble
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolOrbit
import com.tappyai.app.tools.ToolTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.launch

/**
 * Cảnh báo lừa đảo — the current web `/scam-shield` (`design/v3-phase4` `ScamShieldView.tsx`,
 * `ScamShieldResult.tsx`, `ScamMessageResult.tsx`, `ScamKnowledgeSection.tsx`), 2026-09-17.
 *
 * The page, top to bottom, exactly as the web composes it:
 *  1. header — the brand tile, the name, the tagline, and the "Lịch sử kiểm tra →" chip that
 *     jumps to the history panel further down (an anchor on the web; a scroll here);
 *  2. hero — eyebrow, the two-line title with the accent second line, the body, the scene
 *     (globe, orbit, three icon-only chips, Tappy holding the shield — the `recommendation`
 *     pose) and the FOUR capability tiles, each naming a provider the engine runs;
 *  3. the tool — THREE tabs (`url` | `qr` | `message`: Kiểm tra URL · Quét mã QR · Phân tích
 *     tin nhắn), wrapping, never scrolling; the URL field + CTA, the QR drop zone, or the
 *     Analyze Message form (text, optional link, optional screenshot, the shared-quota hint,
 *     the CTA); the rose error box;
 *  4. the verdict — the URL card, or the message card;
 *  5. the official anti-fraud knowledge (Bộ Công an) — [ScamKnowledgeSection];
 *  6. recent checks, on this device.
 *
 * 🚨 FAIL-CLOSED. No path renders reassurance without a backend verdict; a failed check reads as
 * "we could not check this". Platform adaptations: the pickers are the photo picker (the web's
 * QR tab opens the camera on a phone); the history row's relative time is hidden below `sm` on
 * the web and is not drawn here.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScamShieldScreen(
    onBack: () -> Unit,
    viewModel: ScamShieldViewModel = hiltViewModel(),
) {
    val checking = viewModel.state is ScamShieldUiState.Checking
    val pickQr = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) viewModel.checkQrImage(uri) }
    val pickScreenshot = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) viewModel.pickScreenshot(uri) }
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    var historyY by remember { mutableIntStateOf(0) }

    V3HomeTheme {
        Column(
            modifier = Modifier.fillMaxSize().background(HomeV3.Background).verticalScroll(scroll).imePadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier.widthIn(max = TappyContainers.content).fillMaxWidth().padding(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                // ── 1. Header ──
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    V3PageHeader(title = stringResource(R.string.scam_shield_v3_name), subtitle = stringResource(R.string.scam_shield_v3_tagline), onBack = onBack)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .clip(CircleShape)
                            .background(HomeV3.SurfaceVariant)
                            .border(1.dp, HomeV3.Outline, CircleShape)
                            .clickable(role = Role.Button) { scope.launch { scroll.animateScrollTo(historyY) } }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                    ) {
                        Icon(Icons.Filled.Schedule, contentDescription = null, tint = HomeV3.OnSurface, modifier = Modifier.size(16.dp))
                        Text(text = stringResource(R.string.scam_v3_historyLink), color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = HomeV3.OnSurface, modifier = Modifier.size(15.dp))
                    }
                }

                // ── 2. Hero + the four capability tiles ──
                ToolHero(
                    hue = ToolHue.Navy,
                    eyebrow = stringResource(R.string.scam_v3_heroEyebrow),
                    title1 = stringResource(R.string.scam_v3_heroTitle1),
                    title2 = stringResource(R.string.scam_v3_heroTitle2),
                    body = stringResource(R.string.scam_v3_heroBody),
                    mascotRes = R.drawable.tappy_recommendation,
                    scene = { ScamScene() },
                    footer = { FeatureTiles() },
                )

                // ── 3. The tool ──
                ToolPanel {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        TabChip(stringResource(R.string.scam_v3_tabUrl), Icons.Filled.Link, viewModel.tab == ScamShieldTab.Url) { viewModel.selectTab(ScamShieldTab.Url) }
                        TabChip(stringResource(R.string.scam_shield_v3_qr_upload), Icons.Filled.QrCode, viewModel.tab == ScamShieldTab.Qr) { viewModel.selectTab(ScamShieldTab.Qr) }
                        TabChip(stringResource(R.string.scam_v3_tabMessage), Icons.Outlined.Sms, viewModel.tab == ScamShieldTab.Message) { viewModel.selectTab(ScamShieldTab.Message) }
                    }

                    when (viewModel.tab) {
                        ScamShieldTab.Url -> Column(modifier = Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            ToolTextField(
                                value = viewModel.url,
                                onValueChange = viewModel::onUrlChange,
                                placeholder = stringResource(R.string.scam_shield_v3_url_placeholder),
                                keyboardType = KeyboardType.Uri,
                                enabled = !checking,
                                leadingIcon = { Icon(Icons.Filled.Link, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(18.dp)) },
                                trailingIcon = if (checking) ({ CircularProgressIndicator(color = HomeV3.Purple, strokeWidth = 2.dp, modifier = Modifier.size(18.dp)) }) else null,
                                textSize = 15.sp,
                            )
                            BrandCta(
                                text = stringResource(if (checking) R.string.scam_shield_checking else R.string.scam_shield_v3_cta),
                                icon = Icons.Filled.Search,
                                busy = checking,
                                enabled = viewModel.url.isNotBlank() && !checking,
                                onClick = viewModel::check,
                            )
                        }
                        ScamShieldTab.Qr -> DropZone(busy = checking, label = stringResource(if (checking) R.string.scam_shield_checking else R.string.scam_shield_v3_qr_upload)) {
                            pickQr.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }
                        ScamShieldTab.Message -> Column(modifier = Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column {
                                Text(text = stringResource(R.string.scam_v3_msg_title), color = HomeV3.OnSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                Text(text = stringResource(R.string.scam_v3_msg_subtitle), color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 2.dp))
                            }
                            ToolTextField(
                                value = viewModel.message,
                                onValueChange = viewModel::onMessageChange,
                                placeholder = stringResource(R.string.scam_v3_msg_placeholder),
                                singleLine = false,
                                minLines = 5,
                                maxLines = 12,
                                enabled = !checking,
                                textSize = 14.5.sp,
                            )
                            ToolTextField(
                                value = viewModel.messageUrl,
                                onValueChange = viewModel::onMessageUrlChange,
                                placeholder = stringResource(R.string.scam_v3_msg_urlPlaceholder),
                                keyboardType = KeyboardType.Uri,
                                enabled = !checking,
                                leadingIcon = { Icon(Icons.Filled.Link, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(17.dp)) },
                                textSize = 14.sp,
                            )
                            val shot = viewModel.screenshot
                            if (shot != null) {
                                Row(
                                    modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).background(HomeV3.SurfaceVariant).border(1.dp, HomeV3.Outline, CircleShape).padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, tint = HomeV3.OnSurface, modifier = Modifier.size(16.dp))
                                    Text(text = shot.name, color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp))
                                    Box(
                                        modifier = Modifier.size(28.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = stringResource(R.string.scam_v3_msg_removeScreenshot), onClick = viewModel::removeScreenshot),
                                        contentAlignment = Alignment.Center,
                                    ) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.scam_v3_msg_removeScreenshot), tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(14.dp)) }
                                }
                            } else {
                                Row(
                                    modifier = Modifier
                                        .heightIn(min = 44.dp)
                                        .clip(CircleShape)
                                        .background(HomeV3.SurfaceVariant)
                                        .border(1.dp, HomeV3.Outline, CircleShape)
                                        .clickable(enabled = !checking, role = Role.Button) { pickScreenshot.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                                        .padding(horizontal = 16.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, tint = HomeV3.OnSurface, modifier = Modifier.size(16.dp))
                                    Text(text = stringResource(R.string.scam_v3_msg_upload), color = HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Text(
                                text = stringResource(R.string.scam_v3_msg_quotaHint, ScamShieldViewModel.ANON_LIFETIME_LIMIT.toString(), ScamShieldViewModel.FREE_DAILY_LIMIT.toString()),
                                color = HomeV3.OnSurfaceVariant,
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                            )
                            BrandCta(
                                text = stringResource(if (checking) R.string.scam_v3_msg_analyzing else R.string.scam_v3_msg_cta),
                                icon = Icons.Outlined.Sms,
                                busy = checking,
                                enabled = viewModel.canAnalyze && !checking,
                                onClick = viewModel::analyzeMessage,
                            )
                        }
                    }

                    (viewModel.state as? ScamShieldUiState.Failed)?.let { failed -> UnresolvedCard(failed.failure, forMessage = viewModel.tab == ScamShieldTab.Message) }
                }

                // ── 4. The verdict ──
                (viewModel.state as? ScamShieldUiState.Result)?.let { VerdictCard(it.result) }
                (viewModel.state as? ScamShieldUiState.MessageResult)?.let { MessageResultCard(it.result) }

                // ── 5. Official anti-fraud knowledge ──
                ScamKnowledgeSection(viewModel = viewModel)

                // ── 6. Recent checks, on this device ──
                Box(modifier = Modifier.onGloballyPositioned { historyY = it.positionInParent().y.toInt() }) {
                    HistoryPanel(
                        entries = viewModel.recent,
                        expanded = viewModel.historyExpanded,
                        busy = checking,
                        onToggle = viewModel::toggleHistory,
                        onRecheck = viewModel::recheck,
                        onClear = viewModel::clearHistory,
                    )
                }
            }
        }
    }
}

/** `.v3-scam-tool`: the elevated 20dp card the tool, the knowledge and the history stand on. */
@Composable
internal fun ToolPanel(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = Modifier.fillMaxWidth().clip(shape).background(HomeV3.Surface).border(1.dp, HomeV3.Outline, shape).padding(16.dp),
        content = content,
    )
}

/** `.v3-chip.v3-scam-tab` (+ `.v3-chip-active`): a tab or a filter chip with its glyph. */
@Composable
internal fun TabChip(label: String, icon: ImageVector?, active: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = 40.dp)
            .clip(CircleShape)
            .background(if (active) HomeV3.Purple else HomeV3.SurfaceVariant)
            .border(1.dp, if (active) HomeV3.Purple else HomeV3.Outline, CircleShape)
            .clickable(role = Role.Tab, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = if (active) Color.White else HomeV3.OnSurface, modifier = Modifier.size(16.dp))
        Text(text = label, color = if (active) Color.White else HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** `.v3-scam-brand.v3-scam-cta`: the blue→violet brand gradient, 52dp, 16dp radius. */
@Composable
private fun BrandCta(text: String, icon: ImageVector, busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF2F6BFF), Color(0xFF6D28D9))), alpha = if (enabled) 1f else 0.45f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        if (busy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(17.dp))
        else Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
        Text(text = text, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** `.v3-scam-drop`: the dashed picker zone. */
@Composable
private fun DropZone(busy: Boolean, label: String, onPick: () -> Unit) {
    val outline = HomeV3.Outline
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeV3.SurfaceVariant)
            .drawBehind {
                val stroke = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx())))
                drawRoundRect(color = outline, cornerRadius = CornerRadius(16.dp.toPx()), style = stroke)
            }
            .clickable(enabled = !busy, role = Role.Button, onClick = onPick)
            .padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (busy) CircularProgressIndicator(color = HomeV3.Purple, strokeWidth = 2.5.dp, modifier = Modifier.size(30.dp))
        else Icon(Icons.Filled.Upload, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(30.dp))
        Text(text = label, color = HomeV3.OnSurfaceVariant, fontSize = 13.5.sp)
    }
}

/** The hero scene: a globe outline, an orbit, three icon-only chips (nothing has been checked yet) and Tappy holding the shield. */
@Composable
private fun BoxScope.ScamScene() {
    ToolOrbit(size = 220.dp, alignment = Alignment.Center, modifier = Modifier.offset(y = 6.dp))
    Box(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .offset(x = (-30).dp, y = 4.dp)
            .size(72.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF7C3AED), Color(0xFF4F6BFF)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Shield, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
    }
    // `.v3-scam-float[data-tone=https|ok|risk]` — icon-only, no verdict words.
    ToolBubble(text = "https://", a = Color(0xFF4338CA), b = Color(0xFF6366F1), alignment = Alignment.TopStart, modifier = Modifier.offset(x = 6.dp, y = 10.dp))
    Box(modifier = Modifier.align(Alignment.CenterStart).offset(x = 12.dp, y = 28.dp).size(36.dp).clip(CircleShape).background(Color(0x3810B981)).border(1.dp, Color(0x8C34D399), CircleShape), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.GppGood, contentDescription = null, tint = Color(0xFFD1FAE5), modifier = Modifier.size(18.dp))
    }
    Box(modifier = Modifier.align(Alignment.CenterEnd).offset(x = (-8).dp, y = (-4).dp).size(36.dp).clip(CircleShape).background(Color(0x38F43F5E)).border(1.dp, Color(0x8CFB7185), CircleShape), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.GppMaybe, contentDescription = null, tint = Color(0xFFFFE4E6), modifier = Modifier.size(18.dp))
    }
}

/** The four capability tiles (`.v3-scam-feat`), each naming a provider the engine runs. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FeatureTiles() {
    data class Feat(val icon: ImageVector, val titleRes: Int, val descRes: Int, val soft: Color, val fg: Color)
    val feats = listOf(
        Feat(Icons.Filled.Radar, R.string.scam_v3_featDetect, R.string.scam_v3_featDetectDesc, Color(0x2EFB7185), Color(0xFFFDA4AF)),
        Feat(Icons.Filled.Bolt, R.string.scam_v3_featFast, R.string.scam_v3_featFastDesc, Color(0x2E34D399), Color(0xFF6EE7B7)),
        Feat(Icons.Filled.Lock, R.string.scam_v3_featHttps, R.string.scam_v3_featHttpsDesc, Color(0x3360A5FA), Color(0xFF93C5FD)),
        Feat(Icons.Filled.Verified, R.string.scam_v3_featBrand, R.string.scam_v3_featBrandDesc, Color(0x33A78BFA), Color(0xFFC4B5FD)),
    )
    Spacer(modifier = Modifier.height(16.dp))
    FlowRow(maxItemsInEachRow = 2, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        feats.forEach { f ->
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0x14FFFFFF))
                    .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(14.dp))
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(f.soft), contentAlignment = Alignment.Center) {
                    Icon(f.icon, contentDescription = null, tint = f.fg, modifier = Modifier.size(20.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = stringResource(f.titleRes), color = Color.White, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold)
                    Text(text = stringResource(f.descRes), color = Color(0xB8E2E8FF), fontSize = 11.5.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
    }
}

/** The recent-checks panel (`#scam-shield-history`). */
@Composable
private fun HistoryPanel(
    entries: List<ScamCheckHistoryEntry>,
    expanded: Boolean,
    busy: Boolean,
    onToggle: () -> Unit,
    onRecheck: (ScamCheckHistoryEntry) -> Unit,
    onClear: () -> Unit,
) {
    ToolPanel {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(HomeV3.Purple.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Schedule, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(16.dp))
            }
            Text(text = stringResource(R.string.scam_shield_v3_history_title), color = HomeV3.OnSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (entries.size > ScamShieldViewModel.HISTORY_PREVIEW) {
                Row(
                    modifier = Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onToggle).padding(horizontal = 6.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(text = stringResource(if (expanded) R.string.scam_shield_v3_history_less else R.string.scam_shield_v3_history_all), color = HomeV3.Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(14.dp))
                }
            }
        }

        if (entries.isEmpty()) {
            Text(text = stringResource(R.string.scam_shield_v3_history_empty), color = HomeV3.OnSurfaceVariant, fontSize = 13.5.sp, modifier = Modifier.padding(top = 16.dp))
        } else {
            val shown = if (expanded) entries else entries.take(ScamShieldViewModel.HISTORY_PREVIEW)
            Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                shown.forEach { entry ->
                    val tone = toneFor(entry.level)
                    val recheck = stringResource(R.string.scam_shield_v3_recheck)
                    // Re-runs the check rather than replaying the stored verdict.
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(HomeV3.SurfaceVariant)
                            .border(1.dp, HomeV3.Outline, RoundedCornerShape(14.dp))
                            .clickable(enabled = !busy, role = Role.Button, onClickLabel = recheck) { onRecheck(entry) }
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tone.soft), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.Language, contentDescription = null, tint = tone.fg, modifier = Modifier.size(17.dp))
                        }
                        Text(text = displayHost(entry.url), color = HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        LevelBadge(level = entry.level, small = true)
                    }
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = stringResource(R.string.scam_shield_v3_history_local), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.weight(1f))
            if (entries.isNotEmpty()) {
                Row(
                    modifier = Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onClear).padding(horizontal = 6.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(13.dp))
                    Text(text = stringResource(R.string.scam_shield_v3_history_clear), color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** `https://vietcombank.com.vn/login` → `vietcombank.com.vn`. */
internal fun displayHost(url: String): String = runCatching { java.net.URI(url).host }.getOrNull()?.takeIf { it.isNotBlank() } ?: url

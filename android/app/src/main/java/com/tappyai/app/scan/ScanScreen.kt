package com.tappyai.app.scan

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolBubble
import com.tappyai.app.tools.ToolButton
import com.tappyai.app.tools.ToolCard
import com.tappyai.app.tools.ToolChip
import com.tappyai.app.tools.ToolCta
import com.tappyai.app.tools.ToolError
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolV3Page
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * Scan — the web `/scan` page (design/v3-phase4 `src/app/scan/page.tsx`), native: the OCR hero
 * ("Biến hình ảnh thành văn bản", capability chips, floating documents + the reading pose), two
 * big camera/gallery ACTION panels, then the preview card with the scan CTA, the error strip,
 * the result card with Copy/Share and the tips card.
 *
 * Behaviour is exactly what it was: pick a photo (camera or gallery), the ViewModel downsizes
 * and sends it to the existing `POST /api/scan` (server-side vision AI), the extracted text is
 * rendered with Copy/Share. No sign-in required (IP rate-limited), same as Translate. The web's
 * `.txt`/`.docx` downloads stay un-ported on purpose: the native Share sheet covers "send this
 * text elsewhere" — a scope decision, not a silent gap.
 */
@Composable
fun ScanScreen(
    onBack: () -> Unit,
    viewModel: ScanViewModel = hiltViewModel(),
) {
    val context = LocalContext.current

    val takePhoto = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview(),
    ) { bitmap -> bitmap?.let(viewModel::onPhotoCaptured) }

    val pickFromGallery = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::onGalleryUriPicked) }

    ToolV3Page(onBack = onBack) {
        ToolHero(
            hue = ToolHue.Blue,
            eyebrow = stringResource(R.string.tool_scan_eyebrow),
            title1 = stringResource(R.string.tool_scan_title1),
            title2 = stringResource(R.string.tool_scan_title2),
            body = stringResource(R.string.tool_scan_body),
            chips = listOf(
                ToolChip(Icons.Filled.PhotoCamera, stringResource(R.string.tool_scan_cap_capture)),
                ToolChip(Icons.Outlined.Translate, stringResource(R.string.tool_scan_cap_langs)),
            ),
            mascotRes = R.drawable.tappy_reading,
            scene = { ScanScene() },
        )

        val preview = viewModel.preview
        if (preview == null) {
            val noCameraMessage = stringResource(R.string.scan_error_no_camera)
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                ScanAction(
                    icon = Icons.Filled.PhotoCamera,
                    title = stringResource(R.string.tool_scan_camera_title),
                    desc = stringResource(R.string.tool_scan_camera_desc),
                    cta = stringResource(R.string.tool_scan_camera_cta),
                    tone = listOf(Color(0xFF0EA5E9), Color(0xFF2F6BFF)),
                    onClick = {
                        try {
                            takePhoto.launch(null)
                        } catch (_: ActivityNotFoundException) {
                            // No app resolves ACTION_IMAGE_CAPTURE — real on the ChromeOS/PC form
                            // factor this app's manifest explicitly supports, and on bare emulators.
                            Toast.makeText(context, noCameraMessage, Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
                ScanAction(
                    icon = Icons.Filled.PhotoLibrary,
                    title = stringResource(R.string.tool_scan_gallery_title),
                    desc = stringResource(R.string.tool_scan_gallery_desc),
                    cta = stringResource(R.string.tool_scan_gallery_cta),
                    tone = listOf(Color(0xFFF97316), Color(0xFFF43F5E)),
                    onClick = {
                        pickFromGallery.launch(
                            androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
            }
        } else {
            ToolCard(title = stringResource(R.string.tool_scan_preview_label), icon = Icons.Outlined.Image) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF060B1F)),
                ) {
                    Image(
                        bitmap = preview.asImageBitmap(),
                        contentDescription = stringResource(R.string.scan_preview_alt),
                        modifier = Modifier.fillMaxWidth().height(280.dp),
                        contentScale = ContentScale.Fit,
                    )
                    IconButton(
                        onClick = viewModel::clear,
                        modifier = Modifier
                            .padding(TappySpacing.sm)
                            .align(Alignment.TopEnd)
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.6f)),
                    ) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = stringResource(R.string.scan_clear_image),
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
                ToolCta(
                    text = if (viewModel.isScanning) stringResource(R.string.scan_action_scanning) else stringResource(R.string.scan_action_scan),
                    hue = ToolHue.Blue,
                    icon = Icons.Filled.DocumentScanner,
                    onClick = viewModel::scan,
                    loading = viewModel.isScanning,
                )
            }
        }

        viewModel.errorMessage?.let { ToolError(it) }

        viewModel.result?.let { text ->
            ScanResultCard(
                text = text,
                onCopy = { copyToClipboard(context, text) },
                onShare = { shareText(context, text) },
            )
        }

        if (viewModel.result == null && !viewModel.isScanning) {
            ToolCard(title = stringResource(R.string.scan_tips_title), icon = Icons.Outlined.Lightbulb) {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    for (tip in listOf(R.string.scan_tip_flat, R.string.scan_tip_lighting, R.string.scan_tip_limit)) {
                        Text(text = stringResource(tip), color = HomeV3.OnSurfaceVariant, fontSize = 13.5.sp, lineHeight = 18.sp)
                    }
                }
            }
        }
    }
}

/** The hero scene: two tilted document sheets, a spark and the "scanned" bubble, as on the web. */
@Composable
private fun BoxScope.ScanScene() {
    ScanDocument(width = 78.dp, height = 104.dp, rotation = 10f, modifier = Modifier.align(Alignment.TopEnd).offset(x = (-30).dp, y = 22.dp))
    ScanDocument(width = 58.dp, height = 78.dp, rotation = -8f, modifier = Modifier.align(Alignment.CenterEnd).offset(x = 6.dp, y = 36.dp))
    Icon(
        Icons.Filled.AutoAwesome, contentDescription = null, tint = Color(0xFFFBBF24),
        modifier = Modifier.align(Alignment.CenterStart).offset(x = 8.dp, y = 10.dp).size(22.dp),
    )
    Icon(
        Icons.Filled.AutoAwesome, contentDescription = null, tint = Color(0xFF60A5FA),
        modifier = Modifier.align(Alignment.TopEnd).offset(x = (-118).dp, y = 8.dp).size(16.dp),
    )
    ToolBubble(text = "OCR ✓", a = Color(0xFF0EA5E9), b = Color(0xFF2F6BFF), alignment = Alignment.TopStart)
}

@Composable
private fun ScanDocument(width: androidx.compose.ui.unit.Dp, height: androidx.compose.ui.unit.Dp, rotation: Float, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .size(width, height)
            .rotate(rotation)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFF8FAFC))
            .border(1.dp, Color(0x5960A5FA), RoundedCornerShape(10.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        for (w in listOf(0.9f, 0.7f, 0.85f, 0.5f, 0.75f)) {
            Box(modifier = Modifier.fillMaxWidth(w).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFCBD5E1)))
        }
    }
}

/** One of the two entry panels (`.v3-scan-action`): a framed orb glyph, title, blurb and a CTA pill. */
@Composable
private fun ScanAction(
    icon: ImageVector,
    title: String,
    desc: String,
    cta: String,
    tone: List<Color>,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, shape)
            .clickable(onClickLabel = title, onClick = onClick)
            .padding(TappySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(RoundedCornerShape(24.dp))
                .border(1.dp, tone[0].copy(alpha = 0.45f), RoundedCornerShape(24.dp))
                .background(tone[0].copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(tone)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(30.dp))
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(text = title, color = HomeV3.OnSurface, fontSize = 17.sp, lineHeight = 21.sp, fontWeight = FontWeight.ExtraBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(text = desc, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 17.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.weight(1f))
        Spacer(Modifier.height(14.dp))
        ToolButton(text = cta, icon = icon, onClick = onClick, selected = true)
    }
}

@Composable
private fun ScanResultCard(text: String, onCopy: () -> Unit, onShare: () -> Unit) {
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }
    ToolCard(title = stringResource(R.string.scan_result_label), icon = Icons.Filled.DocumentScanner, accent = true) {
        Text(text = text, color = HomeV3.OnSurface, fontSize = 15.sp, lineHeight = 22.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            ToolButton(
                text = if (copied) stringResource(R.string.scan_action_copied) else stringResource(R.string.scan_action_copy),
                icon = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                onClick = { onCopy(); copied = true },
            )
            ToolButton(text = stringResource(R.string.scan_action_share), icon = Icons.Filled.Share, onClick = onShare)
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("TappyAI Scan", text))
}

private fun shareText(context: Context, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_TITLE, "TappyAI")
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.scan_share_chooser_title)))
}

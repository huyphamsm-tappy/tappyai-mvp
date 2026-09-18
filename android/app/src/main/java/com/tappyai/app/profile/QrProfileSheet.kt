package com.tappyai.app.profile

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.app.personal.V3Tone
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * QR Profile — the web `/profile/qr` (`QRProfileView.tsx`, V3), as a sheet over the hub.
 *
 * The web page is one `.v3-panel`: the title, the code on a white 16px card with a soft shadow,
 * the name as stored (no handle — `profiles` has no username column), the scan hint, then two
 * full-width actions — Share (accent fill) and Download (elevated, bordered) — and the save hint.
 * That panel is what this sheet holds, on the V3 tokens, in both themes.
 *
 * THE QR IS DELIBERATELY PLAIN, as on the web: black on white with a full quiet zone, no logo,
 * no gradient, no dark-mode inversion — it exists to be read by a stranger's camera in a café.
 * It encodes `<origin>/users/<id>`, the public profile route and nothing else.
 *
 * Platform adaptations: the code is ZXing's (the standard native encoder; the web's is its own
 * SVG one), Share is the system chooser (`ACTION_SEND` — `navigator.share` on the web), and
 * Download writes the PNG to the device's Pictures through `MediaStore` (the web downloads a
 * 3× PNG). MediaStore needs no permission from API 29; below it the action is not offered
 * rather than requesting legacy storage access for one image.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrProfileSheet(userId: String, name: String?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val profileUrl = remember(userId) { "${BuildConfig.WEB_APP_URL}/users/$userId" }

    // Generated off the main thread: encoding + building the pixel buffer is real work, and
    // `remember`'s init block runs on the composing thread. `null` doubles as "still loading"
    // and "failed"; `qrFailed` disambiguates.
    var qrBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var qrFailed by remember { mutableStateOf(false) }
    LaunchedEffect(profileUrl) {
        qrBitmap = null
        qrFailed = false
        val result = withContext(Dispatchers.Default) { generateQrBitmap(profileUrl, QR_SIZE_PX) }
        if (result != null) qrBitmap = result else qrFailed = true
    }

    val shareChooserTitle = stringResource(R.string.profile_qr_share_chooser_title)
    val savedToast = stringResource(R.string.profile_qr_saved)
    val saveFailedToast = stringResource(R.string.profile_qr_save_failed)
    val canSave = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    // The whole panel at once — the web shows it as one piece; a half sheet would cut the actions off.
    TappyBottomSheet(onDismiss = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        V3HomeTheme {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.profile_qr_title),
                    color = HomeV3.OnSurface,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Center,
                )

                val bitmap = qrBitmap
                when {
                    bitmap != null -> {
                        // The white card: a full quiet zone in dark mode too, plus the web's soft shadow.
                        Box(
                            modifier = Modifier
                                .padding(top = 20.dp)
                                .shadow(elevation = 14.dp, shape = RoundedCornerShape(16.dp), clip = false)
                                .clip(RoundedCornerShape(16.dp))
                                .background(androidx.compose.ui.graphics.Color.White)
                                .padding(12.dp),
                        ) {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = stringResource(R.string.profile_qr_code_content_description),
                                modifier = Modifier.size(220.dp),
                            )
                        }
                    }
                    qrFailed -> Text(
                        text = stringResource(R.string.profile_qr_generate_error),
                        color = V3Tone.Rose,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(vertical = 56.dp),
                    )
                    else -> Box(modifier = Modifier.padding(top = 20.dp).size(244.dp), contentAlignment = Alignment.Center) { TappyLoadingIndicator() }
                }

                // The name as stored, and nothing beneath it.
                val displayName = name?.trim().orEmpty()
                if (displayName.isNotEmpty()) {
                    Text(
                        text = displayName,
                        color = HomeV3.OnSurface,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 20.dp),
                    )
                }
                Text(
                    text = stringResource(R.string.profile_qr_scan_subtitle),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 12.5.sp,
                    lineHeight = 17.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = if (displayName.isNotEmpty()) 6.dp else 20.dp),
                )

                Column(modifier = Modifier.fillMaxWidth().padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    QrAction(
                        text = stringResource(R.string.profile_qr_share_button),
                        icon = Icons.Filled.Share,
                        accent = true,
                        enabled = true,
                        onClick = { shareProfileLink(context, profileUrl, shareChooserTitle) },
                    )
                    if (canSave) {
                        QrAction(
                            text = stringResource(R.string.profile_qr_download_button),
                            icon = Icons.Filled.Download,
                            accent = false,
                            enabled = bitmap != null,
                            onClick = {
                                val toSave = bitmap ?: return@QrAction
                                scope.launch {
                                    val ok = withContext(Dispatchers.IO) { saveQrToPictures(context, toSave) }
                                    Toast.makeText(context, if (ok) savedToast else saveFailedToast, Toast.LENGTH_SHORT).show()
                                }
                            },
                        )
                    }
                }
                Text(
                    text = stringResource(R.string.profile_qr_save_hint),
                    color = HomeV3.OnSurfaceVariant,
                    fontSize = 11.5.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }
    }
}

/** The web's two full-width 46px actions: accent fill, or the elevated bordered one. */
@Composable
private fun QrAction(text: String, icon: ImageVector, accent: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    val fg = if (accent) androidx.compose.ui.graphics.Color.White else HomeV3.OnSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 46.dp)
            .clip(shape)
            .background(if (accent) HomeV3.Purple else HomeV3.SurfaceVariant)
            .then(if (accent) Modifier else Modifier.border(1.dp, HomeV3.Outline, shape))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        Icon(icon, contentDescription = null, tint = fg.copy(alpha = if (enabled) 1f else 0.5f), modifier = Modifier.size(17.dp))
        Text(text = text, color = fg.copy(alpha = if (enabled) 1f else 0.5f), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

private const val QR_SIZE_PX = 660
/** Modules of quiet zone — 4 is the spec's minimum for reliable scanning (the web's `QR_MARGIN`). */
private const val QR_MARGIN = 4

// Runs on Dispatchers.Default (see the LaunchedEffect above), never the main thread.
private fun generateQrBitmap(content: String, sizePx: Int): Bitmap? = try {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, mapOf(EncodeHintType.MARGIN to QR_MARGIN))
    // One IntArray built in-memory + a single Bitmap.createBitmap call, instead of `sizePx *
    // sizePx` individual `setPixel` calls (each a JNI crossing).
    val pixels = IntArray(sizePx * sizePx)
    for (y in 0 until sizePx) {
        val rowOffset = y * sizePx
        for (x in 0 until sizePx) {
            pixels[rowOffset + x] = if (matrix[x, y]) Color.BLACK else Color.WHITE
        }
    }
    Bitmap.createBitmap(pixels, sizePx, sizePx, Bitmap.Config.RGB_565)
} catch (_: Exception) {
    null
}

private fun shareProfileLink(context: Context, url: String, chooserTitle: String) {
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
    }
    context.startActivity(Intent.createChooser(sendIntent, chooserTitle))
}

/**
 * `download()`: the code the sheet is showing, as a PNG in Pictures/TappyAI. White ground
 * already — the bitmap IS the white card's content — so it scans when dropped on a dark chat.
 * Runs on Dispatchers.IO. False when MediaStore refused; the code on screen stays scannable.
 */
private fun saveQrToPictures(context: Context, bitmap: Bitmap): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    return try {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "tappyai-qr-${System.currentTimeMillis()}.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/TappyAI")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
        val written = resolver.openOutputStream(uri)?.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } ?: false
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        if (!written) resolver.delete(uri, null, null)
        written
    } catch (_: Exception) {
        false
    }
}

package com.tappyai.app.profile

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyBottomSheet
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * QR Profile sheet — mirrors the web's `QRProfileButton` modal: a QR code encoding the profile's
 * public share link (`<origin>/users/<id>`, same path shape as the web) plus a share action.
 * Generated entirely on-device, no backend call — same as the web's own "zero-dependency" client-
 * side QR rendering, just using ZXing's encoder (the standard native choice) instead of the web's
 * hand-rolled SVG encoder, and Android's native share sheet (`Intent.ACTION_SEND`) instead of the
 * web's `navigator.share`/clipboard-copy fallback — the same user-facing capability, adapted to
 * platform-native primitives, not new behavior.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrProfileSheet(userId: String, name: String?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val profileUrl = remember(userId) { "${BuildConfig.WEB_APP_URL}/users/$userId" }

    // Generated off the main thread: encoding + building the 512×512 pixel buffer is real work
    // (ZXing's Reed-Solomon encode + a quarter-million-pixel bitmap), and `remember`'s init block
    // runs synchronously on the composing (main) thread — doing this inline was jank-risk on the
    // sheet's open animation. `null` doubles as "still loading" and "failed"; `qrFailed`
    // disambiguates so the sheet doesn't flash an error before the first attempt even starts.
    var qrBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var qrFailed by remember { mutableStateOf(false) }
    LaunchedEffect(profileUrl) {
        qrBitmap = null
        qrFailed = false
        val result = withContext(Dispatchers.Default) { generateQrBitmap(profileUrl, QR_SIZE_PX) }
        if (result != null) qrBitmap = result else qrFailed = true
    }

    // Hoisted here (rather than inline inside shareProfileLink's non-composable body) since
    // Intent.createChooser's title needs a localized string but shareProfileLink itself isn't
    // a @Composable — same pattern as AccountEditScreen's LaunchedEffect string hoisting.
    val shareChooserTitle = stringResource(R.string.profile_qr_share_chooser_title)

    TappyBottomSheet(onDismiss = onDismiss) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Text(
                text = name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.profile_qr_default_name),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.profile_qr_scan_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            val bitmap = qrBitmap
            when {
                bitmap != null -> {
                    // White frame so the code still scans cleanly in dark mode, matching the
                    // web's own "white frame" note.
                    Column(
                        modifier = Modifier
                            .clip(TappyShapes.card)
                            .background(androidx.compose.ui.graphics.Color.White)
                            .padding(TappySpacing.md),
                    ) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = stringResource(R.string.profile_qr_code_content_description),
                            modifier = Modifier.size(200.dp),
                        )
                    }
                }
                qrFailed -> Text(
                    text = stringResource(R.string.profile_qr_generate_error),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
                else -> Box(modifier = Modifier.size(200.dp)) { TappyLoadingIndicator() }
            }

            TappyButton(
                text = stringResource(R.string.profile_qr_share_button),
                onClick = { shareProfileLink(context, profileUrl, shareChooserTitle) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private const val QR_SIZE_PX = 512

// Runs on Dispatchers.Default (see the LaunchedEffect above), never the main thread.
private fun generateQrBitmap(content: String, sizePx: Int): Bitmap? = try {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
    // One IntArray built in-memory + a single Bitmap.createBitmap call, instead of `sizePx *
    // sizePx` individual `setPixel` calls (each a JNI crossing — a documented Android
    // anti-pattern for exactly this kind of per-pixel loop).
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

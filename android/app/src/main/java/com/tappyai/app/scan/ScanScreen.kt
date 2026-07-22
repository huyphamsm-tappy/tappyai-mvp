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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * Scan — mirrors the web `/scan` page: pick a photo (camera or gallery), downsize/compress it
 * client-side, send to the existing `POST /api/scan` (server-side vision AI, no client business
 * logic), then render the extracted text with Copy/Share. No sign-in required (IP rate-limited,
 * 20/day), same as Translate. Reached from Home's "Scan" quick action, replacing its former
 * coming-soon sheet.
 *
 * The web also offers `.txt`/`.docx` file downloads on the result; Android's native Share sheet
 * already covers "send this text elsewhere" (any app that accepts plain text, incl. file managers
 * and cloud-storage apps), so dedicated export-format buttons were deliberately not ported —
 * a scope decision, not a silent gap.
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.scan_title), style = MaterialTheme.typography.titleLarge)
            }

            HeroBanner()

            val preview = viewModel.preview
            if (preview == null) {
                val noCameraMessage = stringResource(R.string.scan_error_no_camera)
                PickerRow(
                    onTakePhoto = {
                        try {
                            takePhoto.launch(null)
                        } catch (_: ActivityNotFoundException) {
                            // No app resolves ACTION_IMAGE_CAPTURE — real on the ChromeOS/PC form
                            // factor this app's manifest explicitly supports (see the touchscreen
                            // and hardware.type.pc flags), and on some bare emulator images.
                            Toast.makeText(context, noCameraMessage, Toast.LENGTH_SHORT).show()
                        }
                    },
                    onPickFromGallery = {
                        pickFromGallery.launch(
                            androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                )
            } else {
                PreviewCard(bitmap = preview, onClear = viewModel::clear)
                TappyButton(
                    text = if (viewModel.isScanning) stringResource(R.string.scan_action_scanning) else stringResource(R.string.scan_action_scan),
                    onClick = viewModel::scan,
                    loading = viewModel.isScanning,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            viewModel.errorMessage?.let { ErrorBanner(it) }

            viewModel.result?.let { text ->
                ResultCard(
                    text = text,
                    onCopy = { copyToClipboard(context, text) },
                    onShare = { shareText(context, text) },
                )
            }

            if (viewModel.result == null && !viewModel.isScanning) {
                TipsCard()
            }
        }
    }
}

@Composable
private fun HeroBanner() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Icon(Icons.Filled.DocumentScanner, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
        Text(
            text = stringResource(R.string.scan_hero_title),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Text(
            text = stringResource(R.string.scan_hero_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun PickerRow(onTakePhoto: () -> Unit, onPickFromGallery: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        PickerOption(
            icon = Icons.Filled.PhotoCamera,
            title = stringResource(R.string.scan_take_photo),
            subtitle = stringResource(R.string.scan_use_camera),
            onClick = onTakePhoto,
            modifier = Modifier.weight(1f).fillMaxSize(),
        )
        PickerOption(
            icon = Icons.Filled.PhotoLibrary,
            title = stringResource(R.string.scan_pick_image),
            subtitle = stringResource(R.string.scan_from_gallery),
            onClick = onPickFromGallery,
            modifier = Modifier.weight(1f).fillMaxSize(),
        )
    }
}

@Composable
private fun PickerOption(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TappyCard(modifier = modifier.clickable(onClick = onClick)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = TappySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
            Text(text = title, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun PreviewCard(bitmap: android.graphics.Bitmap, onClear: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.inverseSurface),
    ) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = stringResource(R.string.scan_preview_alt),
            modifier = Modifier.fillMaxWidth().height(280.dp),
            contentScale = ContentScale.Fit,
        )
        IconButton(
            onClick = onClear,
            modifier = Modifier
                .padding(TappySpacing.sm)
                .align(Alignment.TopEnd)
                .size(32.dp)
                .clip(TappyShapes.input)
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f)),
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.scan_clear_image),
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.errorContainer)
            .padding(TappySpacing.lg),
    ) {
        Text(text = message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
    }
}

@Composable
private fun ResultCard(text: String, onCopy: () -> Unit, onShare: () -> Unit) {
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Text(
                text = stringResource(R.string.scan_result_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(text = text, style = MaterialTheme.typography.bodyLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                AssistChip(
                    label = if (copied) stringResource(R.string.scan_action_copied) else stringResource(R.string.scan_action_copy),
                    icon = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    onClick = { onCopy(); copied = true },
                )
                AssistChip(
                    label = stringResource(R.string.scan_action_share),
                    icon = Icons.Filled.Share,
                    onClick = onShare,
                )
            }
        }
    }
}

@Composable
private fun AssistChip(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(MaterialTheme.colorScheme.surfaceVariant, TappyShapes.input)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(2.dp).width(16.dp),
        )
        Text(text = label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TipsCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(TappySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.scan_tips_title),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text = stringResource(R.string.scan_tip_flat), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = stringResource(R.string.scan_tip_lighting), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = stringResource(R.string.scan_tip_limit), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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

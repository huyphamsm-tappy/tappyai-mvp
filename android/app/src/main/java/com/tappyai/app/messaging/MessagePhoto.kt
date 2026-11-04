package com.tappyai.app.messaging

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.messaging.data.ChatMessageMedia
import com.tappyai.app.messaging.data.ChatPhotoFiles
import com.tappyai.core.designsystem.component.TappyImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The picture of one message — the web's `MessagePhoto`. While the server still has it: its SHORT-LIVED signed link (https only), and this device keeps its own copy the first time
 * it is shown ([ChatPhotoFiles]). After the retention period ([ChatMessageMedia.expired]) or when no link could be made: this device's copy if it has one, otherwise
 * "expired" / "unavailable". Never a broken image. The size is reserved from the server's measurement, so the list does not jump while it loads.
 */
@Composable
internal fun MessagePhoto(messageId: String, media: ChatMessageMedia, modifier: Modifier = Modifier) {
    val filesDir = LocalContext.current.filesDir
    val link = media.url?.takeIf { it.startsWith("https://", ignoreCase = true) }
    var copy by remember(messageId, link) { mutableStateOf<String?>(null) }

    LaunchedEffect(messageId, link) {
        withContext(Dispatchers.IO) {
            if (link != null) {
                if (!ChatPhotoFiles.has(filesDir, messageId)) downloadCopy(filesDir, messageId, link)
            } else {
                ChatPhotoFiles.load(filesDir, messageId)?.let { copy = Uri.fromFile(it).toString() }
            }
        }
    }

    val source = link ?: copy
    if (source == null) {
        Text(
            text = stringResource(if (media.expired) R.string.msg_v3_photo_expired else R.string.msg_v3_photo_unavailable),
            color = HomeV3.OnSurfaceVariant,
            fontSize = 12.5.sp,
            modifier = modifier,
        )
        return
    }
    val ratio = if ((media.width ?: 0) > 0 && (media.height ?: 0) > 0) (media.width!!.toFloat() / media.height!!).coerceIn(0.5f, 2f) else 4f / 3f
    Box(modifier = modifier.widthIn(max = 240.dp).fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(12.dp))) {
        TappyImage(
            url = source,
            contentDescription = stringResource(R.string.msg_v3_photo_alt),
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(ratio),
        )
    }
}

/** Saves the picture behind [link] as this device's copy. Best effort and silent: any failure just means "no copy". The link is a signed storage URL — no credentials ride along. */
private fun downloadCopy(filesDir: File, messageId: String, link: String) {
    runCatching {
        val connection = (URL(link).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000; readTimeout = 15_000; instanceFollowRedirects = false
        }
        try {
            if (connection.responseCode !in 200..299) return
            if (connection.contentType?.startsWith("image/", ignoreCase = true) != true) return
            if (connection.contentLength > ChatPhotoFiles.MAX_COPY_BYTES) return
            val bytes = connection.inputStream.use { it.readBytes() }
            ChatPhotoFiles.save(filesDir, messageId, bytes)
        } finally {
            connection.disconnect()
        }
    }
}

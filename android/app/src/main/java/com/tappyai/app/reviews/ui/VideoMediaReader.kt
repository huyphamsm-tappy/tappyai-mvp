package com.tappyai.app.reviews.ui

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream

/** Probed metadata for a picked review video — the Android analog of the web composer reading a
 *  `<video>`'s `duration`, `file.size` and `file.type` before validating/uploading. */
data class VideoMeta(
    val durationSec: Double,
    val sizeBytes: Long,
    val mimeType: String,
)

/**
 * Reads a picked video's duration, size and MIME type from a content [uri] — all synchronous,
 * potentially-blocking I/O, so callers must invoke it off the main thread (the ViewModel wraps it
 * in `Dispatchers.IO`). Returns null if the media can't be probed (mirrors the web's
 * `getVideoDuration` reject → "Couldn't read video info").
 */
fun readVideoMeta(context: Context, uri: Uri): VideoMeta? {
    val sizeBytes = querySize(context, uri)
    val mimeType = context.contentResolver.getType(uri) ?: return null
    val retriever = MediaMetadataRetriever()
    return try {
        retriever.setDataSource(context, uri)
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            ?.toLongOrNull() ?: return null
        VideoMeta(durationSec = durationMs / 1000.0, sizeBytes = sizeBytes, mimeType = mimeType)
    } catch (e: Exception) {
        null
    } finally {
        runCatching { retriever.release() }
    }
}

/**
 * Extracts a poster frame near the start of the video and encodes it as a JPEG — the Android analog
 * of the web's `generateVideoThumbnail`. Best-effort: returns null if no frame can be decoded, in
 * which case the video still uploads without a thumbnail (matching the web's non-fatal handling).
 */
fun extractThumbnailJpeg(context: Context, uri: Uri): ByteArray? {
    val retriever = MediaMetadataRetriever()
    return try {
        retriever.setDataSource(context, uri)
        val frame: Bitmap = retriever.getFrameAtTime(THUMB_FRAME_US, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            ?: retriever.frameAtTime
            ?: return null
        ByteArrayOutputStream().use { out ->
            frame.compress(Bitmap.CompressFormat.JPEG, THUMB_JPEG_QUALITY, out)
            frame.recycle()
            out.toByteArray()
        }
    } catch (e: Exception) {
        null
    } finally {
        runCatching { retriever.release() }
    }
}

private fun querySize(context: Context, uri: Uri): Long {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (idx >= 0 && cursor.moveToFirst() && !cursor.isNull(idx)) return cursor.getLong(idx)
    }
    return -1L
}

private const val THUMB_FRAME_US = 500_000L // 0.5s in, matching the web's seek target
private const val THUMB_JPEG_QUALITY = 80

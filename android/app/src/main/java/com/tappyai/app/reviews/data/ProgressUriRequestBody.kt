package com.tappyai.app.reviews.data

import android.content.ContentResolver
import android.net.Uri
import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.IOException

/**
 * An OkHttp [RequestBody] that streams a content [Uri] (a picked video) straight from the
 * ContentResolver to the socket — never buffering the whole file into memory — and reports upload
 * progress as bytes are written. Mirrors the web composer's `onUploadProgress` callback so the
 * Android composer can show the same percentage during a video upload.
 *
 * [contentLength] must be the real file size (from `OpenableColumns.SIZE`) so multipart framing and
 * the progress percentage are correct. Cancelling the calling coroutine cancels the OkHttp call,
 * which interrupts [writeTo].
 */
class ProgressUriRequestBody(
    private val contentResolver: ContentResolver,
    private val uri: Uri,
    private val mediaType: MediaType?,
    private val contentLength: Long,
    private val onProgress: (bytesSent: Long, total: Long) -> Unit,
) : RequestBody() {

    override fun contentType(): MediaType? = mediaType

    override fun contentLength(): Long = contentLength

    override fun writeTo(sink: BufferedSink) {
        val input = contentResolver.openInputStream(uri)
            ?: throw IOException("Cannot open video stream for $uri")
        input.use { stream ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var sent = 0L
            while (true) {
                val read = stream.read(buffer)
                if (read == -1) break
                sink.write(buffer, 0, read)
                sent += read
                onProgress(sent, contentLength)
            }
        }
    }

    private companion object {
        const val DEFAULT_BUFFER_SIZE = 16 * 1024
    }
}

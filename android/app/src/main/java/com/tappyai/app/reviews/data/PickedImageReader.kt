package com.tappyai.app.reviews.data

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** An image the system photo picker returned: its bytes and the MIME type the provider reports. */
data class PickedImage(val bytes: ByteArray, val mimeType: String?)

/**
 * Reads a picker `Uri` for the Edit Profile avatar upload. An interface so the ViewModel that
 * decides what to do with the bytes (size cap, type check, upload) can be unit-tested without an
 * Android `Context`; the one real implementation is [ContentResolverImageReader].
 */
interface PickedImageReader {
    /** Null when the provider cannot be opened or read. */
    suspend fun read(uri: Uri): PickedImage?
}

class ContentResolverImageReader @Inject constructor(
    @ApplicationContext private val context: Context,
) : PickedImageReader {
    // The byte read runs on IO: a picker Uri's provider can be slow storage or a large file, and
    // blocking Main.immediate for it stalls the UI thread (same reasoning as AccountViewModel).
    override suspend fun read(uri: Uri): PickedImage? = withContext(Dispatchers.IO) {
        runCatching {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()?.let { PickedImage(it, context.contentResolver.getType(uri)) }
    }
}

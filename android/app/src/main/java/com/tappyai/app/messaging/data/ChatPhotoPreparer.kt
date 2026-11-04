package com.tappyai.app.messaging.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.inject.Inject

/** A picture ready to upload: bytes the server accepts, and their MIME type. */
class PreparedPhoto(val bytes: ByteArray, val mimeType: String)

/**
 * Gets a picked picture into what the server accepts (JPEG, PNG or WebP, at most [CHAT_MEDIA_MAX_BYTES]) — an interface so the screen's logic is tested without Android graphics.
 * A picture the server already accepts is sent AS IS (the server re-encodes it without metadata). Anything else — a phone-camera original over 5 MB, HEIC, GIF — is re-encoded
 * to JPEG here, so the person is not told "too big" for a photo they just took.
 */
interface ChatPhotoPreparer {
    /** Null when the picture cannot be read as an image at all. */
    suspend fun prepare(bytes: ByteArray, mimeType: String?): PreparedPhoto?
}

/** True when [mimeType] and [size] are already acceptable to the upload route — no re-encoding. Pure. */
fun chatPhotoAcceptable(mimeType: String?, size: Int): Boolean =
    mimeType?.lowercase() in CHAT_MEDIA_MIME_TYPES && size in 1..CHAT_MEDIA_MAX_BYTES

/** The sample size that keeps the longest side under twice [maxSide] (the usual BitmapFactory rule: a power of two, at least 1). Pure. */
fun chatPhotoSampleSize(width: Int, height: Int, maxSide: Int = REENCODE_MAX_SIDE): Int {
    var sample = 1
    var longest = maxOf(width, height)
    while (longest / 2 >= maxSide) { sample *= 2; longest /= 2 }
    return sample
}

const val REENCODE_MAX_SIDE = 2048

class AndroidChatPhotoPreparer @Inject constructor() : ChatPhotoPreparer {
    override suspend fun prepare(bytes: ByteArray, mimeType: String?): PreparedPhoto? = withContext(Dispatchers.Default) {
        if (chatPhotoAcceptable(mimeType, bytes.size)) return@withContext PreparedPhoto(bytes, mimeType!!.lowercase())
        runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
            val opts = BitmapFactory.Options().apply { inSampleSize = chatPhotoSampleSize(bounds.outWidth, bounds.outHeight) }
            var bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return@runCatching null
            bitmap = upright(bitmap, bytes)
            var quality = 88
            var out: ByteArray
            while (true) {
                val buffer = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, buffer)
                out = buffer.toByteArray()
                if (out.size <= CHAT_MEDIA_MAX_BYTES || quality <= 40) break
                quality -= 12
            }
            if (out.size > CHAT_MEDIA_MAX_BYTES) null else PreparedPhoto(out, "image/jpeg")
        }.getOrNull()
    }

    /** BitmapFactory ignores the EXIF orientation, so a re-encoded camera photo would turn sideways: apply it before the metadata is dropped. */
    private fun upright(bitmap: Bitmap, original: ByteArray): Bitmap {
        val degrees = runCatching {
            when (ExifInterface(ByteArrayInputStream(original)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        }.getOrDefault(0f)
        if (degrees == 0f) return bitmap
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees) }, true)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatPhotoPreparerModule {
    @Binds abstract fun bindPreparer(impl: AndroidChatPhotoPreparer): ChatPhotoPreparer
}

package com.tappyai.app.scan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.scan.data.ScanErrorMessages
import com.tappyai.app.scan.data.ScanRepository
import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import kotlin.math.min

/**
 * State for Scan (`/scan` on the web): pick a photo (camera or gallery) → downsize/compress it
 * client-side (mirrors the web's canvas-based `resizeImage`, max 2048px JPEG q0.85) → send as
 * base64 to `POST /api/scan` → render the extracted text. No sign-in required (IP rate-limited,
 * 20/day), same as Translate. Reached from Home's "Scan" quick action, replacing its former
 * coming-soon sheet.
 */
@HiltViewModel
class ScanViewModel @Inject constructor(
    private val repository: ScanRepository,
    private val logger: LoggerProvider,
    private val scanErrorMessages: ScanErrorMessages,
    private val stringProvider: StringProvider,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    var preview by mutableStateOf<Bitmap?>(null)
        private set
    var isScanning by mutableStateOf(false)
        private set
    var result by mutableStateOf<String?>(null)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    /** From the system camera app ([androidx.activity.result.contract.ActivityResultContracts.TakePicturePreview]). */
    fun onPhotoCaptured(bitmap: Bitmap) = applyPreview(bitmap)

    /** From the system photo picker — decoded off the main thread since it's a real file read. */
    fun onGalleryUriPicked(uri: Uri) {
        viewModelScope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                try {
                    decodeSampledBitmap(uri, TARGET_PREVIEW_PX)
                } catch (e: Exception) {
                    logger.e(TAG, "Failed to decode picked image", e)
                    null
                }
            }
            if (bitmap == null) {
                errorMessage = stringProvider.get(R.string.scan_error_decode_failed)
                return@launch
            }
            applyPreview(bitmap)
        }
    }

    /**
     * Two-pass decode: first read only the image's dimensions (`inJustDecodeBounds`, no pixel
     * allocation), then decode at the coarsest power-of-two [BitmapFactory.Options.inSampleSize]
     * that still covers [targetPx] on the longer side. A phone/tablet camera photo from the
     * gallery can be 48-108MP — decoding it at full resolution first (as this used to do) risks an
     * OOM crash on a 200-800MB ARGB_8888 allocation before [toScaledJpegBase64] ever gets to
     * downscale it; [ContentResolver.openInputStream] is re-opened per pass since a content-URI
     * stream generally can't be reset after bounds-only reading it once.
     */
    private fun decodeSampledBitmap(uri: Uri, targetPx: Int): Bitmap? {
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, boundsOptions) }
            ?: return null

        var inSampleSize = 1
        val longerSide = maxOf(boundsOptions.outWidth, boundsOptions.outHeight)
        while (longerSide / (inSampleSize * 2) >= targetPx) inSampleSize *= 2

        val decodeOptions = BitmapFactory.Options().apply { this.inSampleSize = inSampleSize }
        return context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, decodeOptions) }
    }

    private fun applyPreview(bitmap: Bitmap) {
        preview = bitmap
        result = null
        errorMessage = null
    }

    fun clear() {
        preview = null
        result = null
        errorMessage = null
    }

    fun scan() {
        val bitmap = preview ?: return
        if (isScanning) return
        isScanning = true
        errorMessage = null
        result = null
        viewModelScope.launch {
            val (base64, mimeType) = withContext(Dispatchers.Default) { bitmap.toScaledJpegBase64() }
            when (val apiResult = repository.scan(base64, mimeType)) {
                is NetworkResult.Success -> result = apiResult.data
                is NetworkResult.Error -> {
                    logger.e(TAG, "Scan failed: ${apiResult.error}")
                    errorMessage = scanErrorMessages.toUserMessage(apiResult.error)
                }
            }
            isScanning = false
        }
    }

    /** Downsizes to at most [maxPx] on the longer side (no upscaling) and JPEG-compresses at
     *  [quality] — matches the web's canvas-based `resizeImage(file, 2048, 0.85)` so both clients
     *  send comparable payloads within the backend's ~6MB binary cap. */
    private fun Bitmap.toScaledJpegBase64(maxPx: Int = 2048, quality: Int = 85): Pair<String, String> {
        val scale = min(1f, maxPx.toFloat() / maxOf(width, height))
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(this, (width * scale).toInt(), (height * scale).toInt(), true)
        } else {
            this
        }
        val stream = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        return base64 to "image/jpeg"
    }

    private companion object {
        const val TAG = "ScanViewModel"

        /** Matches [toScaledJpegBase64]'s own `maxPx` — no point decoding sharper than the final
         *  scan payload will be scaled down to anyway. */
        const val TARGET_PREVIEW_PX = 2048
    }
}

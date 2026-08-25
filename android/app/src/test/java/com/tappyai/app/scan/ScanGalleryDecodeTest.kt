package com.tappyai.app.scan

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.tappyai.app.R
import com.tappyai.app.scan.data.ScanErrorMessages
import com.tappyai.app.scan.data.ScanRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream
import java.util.concurrent.Executors

/**
 * Gallery-scan decode regression (vc8 / 0.1.3). `decodeSampledBitmap` did a bounds-only first pass
 * — `inJustDecodeBounds = true`, which makes `BitmapFactory.decodeStream` return null BY DESIGN
 * (it only fills outWidth/outHeight) — and put the null-guard on that pass:
 *
 *     openInputStream(uri)?.use { decodeStream(bounds) } ?: return null
 *
 * so it bailed on EVERY gallery image even when the stream opened fine, and the real second decode
 * never ran. `onGalleryUriPicked` then showed "Couldn't read that image. Please try another one."
 * (`scan_error_decode_failed`). The camera path (`onPhotoCaptured`) bypasses the decode and was
 * unaffected.
 *
 * IMPORTANT — why a custom shadow: Robolectric's stock ShadowBitmapFactory returns a NON-null
 * bitmap even for an `inJustDecodeBounds` call, i.e. it does NOT model the exact contract this bug
 * hinges on, so the stock shadow makes the buggy code pass (a false green). [BoundsAwareBitmap
 * Factory] below replicates the real Android contract — bounds pass → null (+ dimensions), real
 * pass → a bitmap — so these tests go RED on the old code and GREEN on the fix.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], shadows = [BoundsAwareBitmapFactory::class])
class ScanGalleryDecodeTest {

    // A real dispatcher for Main: viewModelScope.launch dispatches here, the decode hops to a real
    // Dispatchers.IO thread, and applyPreview resumes here — so we just poll the observable state.
    private val mainDispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()

    @Before fun setUp() = Dispatchers.setMain(mainDispatcher)

    @After fun tearDown() {
        Dispatchers.resetMain()
        mainDispatcher.close()
    }

    /** Records whether the network scan was reached, and with what. */
    private class FakeScanRepository(private val result: NetworkResult<String> = NetworkResult.Success("EXTRACTED")) :
        ScanRepository {
        var calls = 0
        var lastBase64: String? = null
        override suspend fun scan(imageBase64: String, mimeType: String): NetworkResult<String> {
            calls++
            lastBase64 = imageBase64
            return result
        }
    }

    private val logger = object : LoggerProvider {
        override fun d(tag: String, message: String) = Unit
        override fun i(tag: String, message: String) = Unit
        override fun w(tag: String, message: String, throwable: Throwable?) = Unit
        override fun e(tag: String, message: String, throwable: Throwable?) = Unit
    }

    // Echoes the resource id so a test can assert exactly WHICH message was shown.
    private val stringProvider = object : StringProvider {
        override fun get(resId: Int) = "str:$resId"
        override fun get(resId: Int, vararg args: Any) = "str:$resId"
    }

    private fun viewModel(repository: ScanRepository) = ScanViewModel(
        repository = repository,
        logger = logger,
        scanErrorMessages = ScanErrorMessages(stringProvider),
        stringProvider = stringProvider,
        context = RuntimeEnvironment.getApplication(),
    )

    private fun awaitUntil(timeoutMs: Long = 5_000, predicate: () -> Boolean) {
        val deadline = System.nanoTime() + timeoutMs * 1_000_000
        while (!predicate() && System.nanoTime() < deadline) Thread.sleep(10)
        assertTrue("timed out waiting for state", predicate())
    }

    /** A content:// URI that serves a real, openable stream (fresh per open, like a real gallery
     *  URI). The bytes are irrelevant — [BoundsAwareBitmapFactory] decides the decode outcome. */
    private fun openableGalleryUri(): Uri {
        val file = File.createTempFile("scan-fixture", ".bin").apply {
            deleteOnExit()
            writeBytes(ByteArray(64) { it.toByte() })
        }
        Robolectric.setupContentProvider(FileImageProvider::class.java, AUTHORITY)
        return Uri.parse("content://$AUTHORITY/image?path=${Uri.encode(file.absolutePath)}")
    }

    // --- Case 1 (regression guard): a valid gallery image decodes and previews, no error. ---
    // On the buggy code this FAILS: the bounds pass returns null, the guard bails, preview stays
    // null and errorMessage becomes scan_error_decode_failed. This is the "exact previous failure".
    @Test
    fun `valid gallery image sets the preview and reaches no decode error`() {
        val vm = viewModel(FakeScanRepository())
        vm.onGalleryUriPicked(openableGalleryUri())

        awaitUntil { vm.preview != null || vm.errorMessage != null }
        assertNotNull("second decode pass must run and return a bitmap", vm.preview)
        assertNull("no decode error on a valid image", vm.errorMessage)
    }

    // --- Case 2: a valid gallery image actually reaches repository.scan(). ---
    @Test
    fun `valid gallery image then scan reaches the network layer`() {
        val repo = FakeScanRepository(NetworkResult.Success("HELLO WORLD"))
        val vm = viewModel(repo)

        vm.onGalleryUriPicked(openableGalleryUri())
        awaitUntil { vm.preview != null }

        vm.scan()
        awaitUntil { vm.result != null || vm.errorMessage != null }

        assertEquals("repository.scan must be called exactly once", 1, repo.calls)
        assertTrue("a non-empty base64 payload is sent", (repo.lastBase64?.length ?: 0) > 0)
        assertEquals("HELLO WORLD", vm.result)
    }

    // --- Case 3: an unopenable URI still fails closed with the decode-failed message. ---
    @Test
    fun `unopenable gallery uri shows the decode-failed message and no preview`() {
        Robolectric.setupContentProvider(FileImageProvider::class.java, AUTHORITY)
        val missing = Uri.parse("content://$AUTHORITY/image?path=${Uri.encode("/no/such/file.png")}")
        val vm = viewModel(FakeScanRepository())

        vm.onGalleryUriPicked(missing)
        awaitUntil { vm.errorMessage != null }

        assertNull(vm.preview)
        assertEquals("str:${R.string.scan_error_decode_failed}", vm.errorMessage)
    }

    // --- Case 4: the camera path is unchanged — it bypasses decodeSampledBitmap entirely. ---
    @Test
    fun `camera capture sets the preview directly and clears any error`() {
        val vm = viewModel(FakeScanRepository())
        val captured = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)

        vm.onPhotoCaptured(captured)

        assertEquals(captured, vm.preview)
        assertNull(vm.errorMessage)
    }

    /** Serves the file named by the URI's `path` query param, fresh per open (mirrors a real
     *  content-URI stream that can't be re-read after the bounds pass). */
    class FileImageProvider : ContentProvider() {
        override fun onCreate() = true
        override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
            val path = uri.getQueryParameter("path") ?: throw FileNotFoundException("no path")
            val file = File(path)
            if (!file.exists()) throw FileNotFoundException(path)
            return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }
        override fun getType(uri: Uri) = "image/png"
        override fun query(uri: Uri, p: Array<out String>?, s: String?, sa: Array<out String>?, o: String?): Cursor? = null
        override fun insert(uri: Uri, values: ContentValues?): Uri? = null
        override fun delete(uri: Uri, s: String?, sa: Array<out String>?) = 0
        override fun update(uri: Uri, values: ContentValues?, s: String?, sa: Array<out String>?) = 0
    }

    private companion object {
        const val AUTHORITY = "com.tappyai.app.test.images"
    }
}

/**
 * A [BitmapFactory] shadow that models the REAL `inJustDecodeBounds` contract, which the stock
 * Robolectric shadow does not: the bounds-only pass returns null (after filling the dimensions);
 * the real pass returns a bitmap. This is what makes the decode-guard bug observable in a JVM test.
 */
@Implements(BitmapFactory::class)
class BoundsAwareBitmapFactory {
    companion object {
        @JvmStatic
        @Implementation
        fun decodeStream(input: InputStream?, outPadding: Rect?, opts: BitmapFactory.Options?): Bitmap? {
            input?.readBytes() // consume, as the real decoder would
            if (opts != null && opts.inJustDecodeBounds) {
                opts.outWidth = 40
                opts.outHeight = 30
                return null
            }
            return Bitmap.createBitmap(40, 30, Bitmap.Config.ARGB_8888)
        }
    }
}

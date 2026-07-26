package com.tappyai.app.reviews.data

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import java.io.IOException
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.random.Random

/**
 * STEP 2 of the Vercel Blob client-upload handshake: PUT the raw bytes DIRECTLY to Vercel Blob's
 * ingestion API using a client token minted in STEP 1 (`POST /api/upload/video`). This is the exact
 * transport the web's `@vercel/blob/client` `upload()` performs internally — replicated here so a
 * 60s/50MB video bypasses Vercel's ~4.5MB serverless function body limit (the file never touches our
 * backend). Verified against `@vercel/blob` v2.4.1's compiled `upload()` path.
 *
 * The wire protocol is a VERSIONED, non-public contract (`x-api-version: 12`, base
 * `https://vercel.com/api/blob`). The pin below MUST be reviewed whenever `@vercel/blob` is bumped —
 * the web SDK updates its own pin in lockstep, so a mismatch is the first thing to check if uploads
 * start 4xx-ing after a dependency upgrade.
 *
 * Runs on a DEDICATED OkHttp client ([Named]"blobUpload") — never the shared app client — so:
 *  - no `AuthInterceptor`/`TokenAuthenticator` (the Supabase JWT must never reach vercel.com; the
 *    blob PUT authenticates ONLY with the per-upload client token), and
 *  - no BODY logging (would buffer the whole 50MB video into memory / Logcat), and
 *  - a write timeout generous enough for a large mobile upload.
 */
@Singleton
class VercelBlobUploader @Inject constructor(
    @Named("blobUpload") private val client: OkHttpClient,
    private val json: Json,
) {

    /**
     * Uploads [body] to Blob at [pathname] using [clientToken], reporting nothing itself — progress
     * is emitted by the [body] (a [ProgressUriRequestBody]) as bytes stream to the socket. Returns
     * the public Blob URL. Throws [IOException] on any non-2xx or transport failure (mapped upstream
     * by `safeApiCall`). Cancelling the calling coroutine cancels the in-flight [Call].
     */
    suspend fun put(clientToken: String, pathname: String, body: RequestBody, contentType: String): String {
        // storeId is the 4th underscore-segment of the client token — the SAME parse the SDK uses
        // (`token.split('_')[3]`); it's echoed back in the x-vercel-blob-store-id header.
        val storeId = clientToken.split("_").getOrNull(STORE_ID_SEGMENT).orEmpty()
        val url = "$BLOB_API_BASE/?pathname=" + URLEncoder.encode(pathname, "UTF-8")
        // Trace/idempotency id in the SDK's own format: `<storeId>:<epochMs>:<randomHex>`.
        val requestId = "$storeId:${System.currentTimeMillis()}:${Random.nextInt().toUInt().toString(16)}"

        val request = Request.Builder()
            .url(url)
            .put(body)
            .header("authorization", "Bearer $clientToken")
            .header("x-api-version", API_VERSION)
            .header("x-vercel-blob-store-id", storeId)
            .header("x-api-blob-request-id", requestId)
            .header("x-api-blob-request-attempt", "0")
            .header("x-vercel-blob-access", "public")
            .header("x-content-type", contentType)
            .build()

        return suspendCancellableCoroutine { cont ->
            val call = client.newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { res ->
                        if (!res.isSuccessful) {
                            cont.resumeWithException(IOException("Blob upload failed: HTTP ${res.code}"))
                            return
                        }
                        val payload = res.body?.string().orEmpty()
                        val resultUrl = try {
                            json.decodeFromString(BlobPutResponseDto.serializer(), payload).url
                        } catch (e: Exception) {
                            cont.resumeWithException(IOException("Blob upload: malformed response", e))
                            return
                        }
                        if (resultUrl.isBlank()) {
                            cont.resumeWithException(IOException("Blob upload: empty url in response"))
                        } else {
                            cont.resume(resultUrl)
                        }
                    }
                }
            })
        }
    }

    private companion object {
        const val BLOB_API_BASE = "https://vercel.com/api/blob"
        // Pinned to @vercel/blob v2.4.1 (BLOB_API_VERSION = 12). Review on every dependency bump.
        const val API_VERSION = "12"
        const val STORE_ID_SEGMENT = 3
    }
}

package com.tappyai.app.reviews.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import java.io.File
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/** Why an upload did not finish — the server's machine [code] when it sent one (e.g. `unsupported_format`). */
class VideoUploadException(message: String, val status: Int = 0, val code: String? = null) : Exception(message)

/**
 * The composer's clip upload — the Android twin of the web's `uploadMedia` (src/lib/media/client.ts),
 * against the SAME `/api/upload/video` endpoint:
 *  1. `POST {type: "media.create-upload-session", kind, contentType, size}` → `{uploadUrl, url, key}`;
 *  2. `PUT` the bytes to `uploadUrl` (a Cloud Storage resumable session — NOT our host, so no auth
 *     header rides along: the shared client's interceptors are host-scoped), with progress;
 *  3. `POST {type: "media.complete-upload", kind, key}` → `{ok, url}` — the server reads the object
 *     itself and only then answers the URL to persist. It refuses a clip that still carries
 *     identifying metadata, which is why [ClipMetadata.neutralize] runs on the copy BEFORE the PUT.
 */
@Singleton
class VideoUploader @Inject constructor(
    private val client: OkHttpClient,
    @Named("baseUrl") private val baseUrl: String,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val endpoint get() = baseUrl.trimEnd('/') + "/api/upload/video"

    private fun postJson(body: JsonObject): Pair<Int, JsonObject?> {
        val req = Request.Builder().url(endpoint).post(body.toString().toRequestBody("application/json".toMediaType())).build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { json.parseToJsonElement(res.body?.string().orEmpty()).jsonObject }.getOrNull()
            return res.code to obj
        }
    }

    /** Uploads [file] as [kind] (`video` / `videoThumbnail`); returns the durable public URL. */
    suspend fun upload(kind: String, file: File, contentType: String, onProgress: (Int) -> Unit = {}): String = withContext(Dispatchers.IO) {
        if (kind == "video") ClipMetadata.neutralize(file)
        val (status, session) = postJson(buildJsonObject {
            put("type", "media.create-upload-session"); put("kind", kind); put("contentType", contentType); put("size", file.length())
        })
        val uploadUrl = session?.get("uploadUrl")?.jsonPrimitive?.content
        if (status != 200 || uploadUrl.isNullOrBlank()) {
            throw VideoUploadException(session?.get("message")?.jsonPrimitive?.content ?: session?.get("error")?.jsonPrimitive?.content ?: "session", status, session?.get("error")?.jsonPrimitive?.content)
        }
        val sessionType = session["contentType"]?.jsonPrimitive?.content ?: contentType
        val put = Request.Builder().url(uploadUrl).put(ProgressBody(file, sessionType.toMediaType(), onProgress)).build()
        val putStatus = client.newCall(put).execute().use { it.code }
        if (putStatus !in 200..299) throw VideoUploadException("put", putStatus)
        val key = session["key"]?.jsonPrimitive?.content
        val (doneStatus, done) = postJson(buildJsonObject { put("type", "media.complete-upload"); put("kind", kind); put("key", key) })
        val ok = runCatching { done?.get("ok")?.jsonPrimitive?.boolean }.getOrNull() == true
        val url = done?.get("url")?.jsonPrimitive?.content
        if (doneStatus != 200 || !ok || url.isNullOrBlank()) {
            throw VideoUploadException(done?.get("message")?.jsonPrimitive?.content ?: "complete", doneStatus, done?.get("error")?.jsonPrimitive?.content)
        }
        url
    }

    private class ProgressBody(private val file: File, private val type: MediaType, private val onProgress: (Int) -> Unit) : RequestBody() {
        override fun contentType() = type
        override fun contentLength() = file.length()
        override fun writeTo(sink: BufferedSink) {
            val total = file.length().coerceAtLeast(1)
            var sent = 0L
            var last = -1
            file.source().use { src ->
                val buf = okio.Buffer()
                while (true) {
                    val n = src.read(buf, 64 * 1024)
                    if (n == -1L) break
                    sink.write(buf, n)
                    sent += n
                    val pct = (sent * 100 / total).toInt()
                    if (pct != last) { last = pct; onProgress(pct) }
                }
            }
        }
    }
}

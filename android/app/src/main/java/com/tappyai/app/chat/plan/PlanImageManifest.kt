package com.tappyai.app.chat.plan

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.http.GET
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The plan image manifest (proposed contract, ANDROID-REQUESTS R22): the ONE place an image key
 * becomes a URL.
 *
 * ```
 * GET /api/plan-images/manifest
 * { "version": "2026-09-30.1",
 *   "images": {
 *     "du-lich-bien-1": { "status": "active",   "url": "https://…/du-lich-bien-1.webp" },
 *     "diem-hai-san":   { "status": "replaced", "replacement": "diem-hai-san-2" } } }
 * ```
 * `active` → its https `url`; `replaced` → follow `replacement` (at most [MAX_HOPS], a cycle ends
 * it); any other status, a missing key, a non-https URL → no URL → the caller draws the placeholder.
 * The app never substitutes another key of its own choosing.
 */
data class PlanImageManifest(val version: String?, val entries: Map<String, Entry>) {
    data class Entry(val status: String, val url: String?, val replacement: String?)

    fun urlFor(key: String?): String? {
        var k = key ?: return null
        val seen = HashSet<String>()
        repeat(MAX_HOPS + 1) {
            if (!seen.add(k)) return null
            val e = entries[k] ?: return null
            when (e.status) {
                "active" -> return e.url?.takeIf { it.startsWith("https://") }
                "replaced" -> k = e.replacement?.takeIf(PlanImageKeys::isKey) ?: return null
                else -> return null
            }
        }
        return null
    }

    companion object {
        const val MAX_HOPS = 3
        val EMPTY = PlanImageManifest(null, emptyMap())

        /** Lenient: a malformed entry is skipped, a malformed body is [EMPTY]. */
        fun parse(json: JsonObject?): PlanImageManifest {
            val images = runCatching { json?.get("images")?.jsonObject }.getOrNull() ?: return EMPTY
            val entries = images.mapNotNull { (key, v) ->
                if (!PlanImageKeys.isKey(key)) return@mapNotNull null
                val o = runCatching { v.jsonObject }.getOrNull() ?: return@mapNotNull null
                fun str(name: String) = runCatching { o[name]?.jsonPrimitive?.contentOrNull }.getOrNull()
                val status = str("status") ?: return@mapNotNull null
                key to Entry(status, str("url"), str("replacement"))
            }.toMap()
            val version = runCatching { json?.get("version")?.jsonPrimitive?.contentOrNull }.getOrNull()
            return PlanImageManifest(version, entries)
        }
    }
}

interface PlanImageApi {
    @GET("api/plan-images/manifest")
    suspend fun manifest(): JsonObject
}

/**
 * Fetches the manifest once per process and keeps it; a failure (offline, or the route not deployed
 * yet — every image is then a placeholder, which is the agreed fallback) is retried at most every
 * [RETRY_MS] when a plan card asks again. Never blocks drawing: the card shows placeholders until a
 * manifest arrives, then recomposes.
 */
@Singleton
class PlanImageRepository @Inject constructor(private val api: PlanImageApi) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _manifest = MutableStateFlow(PlanImageManifest.EMPTY)
    val manifest: StateFlow<PlanImageManifest> = _manifest
    @Volatile private var loaded = false
    @Volatile private var inFlight = false
    @Volatile private var lastAttempt = 0L

    fun ensureLoaded(now: Long = System.currentTimeMillis()) {
        if (loaded || inFlight || now - lastAttempt < RETRY_MS && lastAttempt != 0L) return
        inFlight = true
        lastAttempt = now
        scope.launch {
            runCatching { api.manifest() }
                .onSuccess { _manifest.value = PlanImageManifest.parse(it); loaded = true }
            inFlight = false
        }
    }

    /** The uat offline preview only (src/uat): show the card against a fixture manifest. */
    fun seedForPreview(fixture: PlanImageManifest) {
        _manifest.value = fixture
        loaded = true
    }

    private companion object {
        const val RETRY_MS = 10 * 60 * 1000L
    }
}

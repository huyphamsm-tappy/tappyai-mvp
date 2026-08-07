package com.tappyai.app.config

import com.tappyai.app.onboarding.data.AppConfigDto
import com.tappyai.app.onboarding.data.OnboardingApi
import com.tappyai.core.logging.LoggerProvider
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/** Upload caps from `/api/config`. Defaults mirror the current prod values. */
data class UploadLimits(val maxPhotos: Int, val maxVideoSizeMb: Int, val maxVideoDurationSec: Int) {
    val maxVideoSizeBytes: Long get() = maxVideoSizeMb * 1024L * 1024L

    /** Tolerant reject threshold = advertised + 2s. NEVER shown to the user (the "62 never in any
     *  UI" rule) — the advertised cap [maxVideoDurationSec] is the only value a message may show. */
    val maxVideoDurationAcceptSec: Double get() = (maxVideoDurationSec + 2).toDouble()

    companion object {
        val DEFAULT = UploadLimits(maxPhotos = 6, maxVideoSizeMb = 50, maxVideoDurationSec = 60)
    }
}

/** Gated feature flags from `/api/config` (both currently false in prod). */
data class AppFlags(val showProUpgrade: Boolean, val showAppConnections: Boolean) {
    companion object { val DEFAULT = AppFlags(showProUpgrade = false, showAppConnections = false) }
}

/**
 * Reads product numbers (upload caps, flags, freemium limits) from `GET /api/config` — web parity,
 * instead of hardcoding them Kotlin-side, which is exactly how the 15s/60s drift bug happened. The
 * config is fetched once and cached; every getter falls back to the current prod defaults on any
 * failure, so the app stays fully usable offline / at first launch. Uses [OnboardingApi] because the
 * `/api/config` Retrofit binding already lives there.
 */
@Singleton
class AppConfigRepository @Inject constructor(
    private val api: OnboardingApi,
    private val logger: LoggerProvider,
) {
    private val mutex = Mutex()
    @Volatile private var cached: AppConfigDto? = null

    private suspend fun config(): AppConfigDto? {
        cached?.let { return it }
        return mutex.withLock {
            cached ?: runCatching { api.getConfig() }
                .onFailure { logger.w(TAG, "Config fetch failed, using defaults: ${it.message}") }
                .getOrNull()
                ?.also { cached = it }
        }
    }

    suspend fun uploadLimits(): UploadLimits = config()?.upload?.let {
        UploadLimits(it.maxPhotosPerReview, it.maxVideoSizeMb, it.maxVideoDurationSec)
    } ?: UploadLimits.DEFAULT

    suspend fun flags(): AppFlags = config()?.flags?.let {
        AppFlags(it.showProUpgrade, it.showAppConnections)
    } ?: AppFlags.DEFAULT

    private companion object {
        const val TAG = "AppConfigRepository"
    }
}

package com.tappyai.app.reviews.data

import com.tappyai.app.music.data.MusicRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Resolves the audio URL of a review's borrowed ("use this sound") track — the web's
 * `useMusicTrack(attachedTrackId)` → `getPreviewUrl(track)`. A review row only carries the track id
 * (`music.origin == "attached"`), so the feed fetches the track to learn its audio URL. Cached by id
 * (audio URLs are stable) so scrolling back to a clip doesn't refetch. Failures cache as null so the
 * player falls back to the clip's own audio without retry-storming.
 */
@Singleton
class AttachedSoundResolver @Inject constructor(
    private val musicRepository: MusicRepository,
    private val logger: LoggerProvider,
) {
    private val cache = ConcurrentHashMap<String, String>()
    private val failed = ConcurrentHashMap.newKeySet<String>()

    /** The borrowed track's audio URL, or null if unavailable (→ fall back to the clip's own audio). */
    suspend fun soundUrl(trackId: String): String? {
        cache[trackId]?.let { return it }
        if (trackId in failed) return null
        return when (val result = musicRepository.getSoundDetail(trackId)) {
            is NetworkResult.Success -> {
                val url = result.data.track.previewUrl ?: result.data.track.audioUrl
                if (url != null) cache[trackId] = url else failed.add(trackId)
                url
            }
            is NetworkResult.Error -> {
                logger.w(TAG, "Attached sound resolve failed for $trackId: ${result.error}")
                failed.add(trackId)
                null
            }
        }
    }

    private companion object {
        const val TAG = "AttachedSoundResolver"
    }
}

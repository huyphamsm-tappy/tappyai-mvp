package com.tappyai.app.reviews.ui

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** One-shot outcome of a submit, delivered once to the screen (Toast + navigate on success). */
sealed interface ComposerEvent {
    data object Posted : ComposerEvent
    data class Failed(val message: String) : ComposerEvent
}

data class ReviewComposerUiState(val isPosting: Boolean = false)

/** The video-upload pipeline's step, mirroring the web composer's `uploadStep`
 *  (thumb → video → ai → done) plus the pre-upload validation and error states. */
enum class VideoStep { Idle, Validating, Thumbnail, Uploading, AiProcessing, Done, Error }

/**
 * State of the review composer's video lane — the Android analog of the web composer's video state
 * (`video_url`, `thumbnail`, `uploadProgress`, `uploadStep`). [posterJpeg] is the extracted
 * poster-frame JPEG shown as the preview (parity with the web's thumbnail poster). [uploadedVideoUrl]
 * / [uploadedThumbnailUrl] are the Blob URLs the publish step sends as `media_url` / `thumbnail`.
 */
data class VideoComposerState(
    val step: VideoStep = VideoStep.Idle,
    val uri: Uri? = null,
    val durationSec: Double? = null,
    val sizeBytes: Long = 0,
    val mimeType: String? = null,
    val progress: Float = 0f,
    val posterJpeg: ByteArray? = null,
    val uploadedVideoUrl: String? = null,
    val uploadedThumbnailUrl: String? = null,
    // AI enrichment from /api/explore/process (post-upload) — hashtags ride along to publish;
    // suggestedCaption is applied to an empty body by the composer host (matches the web).
    val hashtags: List<String> = emptyList(),
    val suggestedCaption: String = "",
    val error: String? = null,
) {
    val isBusy: Boolean get() = step == VideoStep.Validating || step == VideoStep.Thumbnail ||
        step == VideoStep.Uploading || step == VideoStep.AiProcessing
    val isReady: Boolean get() = step == VideoStep.Done && uploadedVideoUrl != null
}

/** Photo lane — the Android analog of the web composer's `photos`/`photoUploading`. [photos] are the
 *  uploaded Blob URLs (from /api/reviews/upload) shown as a preview grid and sent on publish. */
data class PhotoComposerState(
    val photos: List<String> = emptyList(),
    val isUploading: Boolean = false,
    val error: String? = null,
)

/** URL lane — the Android analog of the web composer's `source_url`/`source_type`/`urlMeta`. On a
 *  recognised link the detected [sourceType] (youtube/tiktok/facebook wire value) is set and a poster
 *  [thumbnailUrl] (+ [title]) is resolved (YouTube from the id, TikTok/Facebook via oEmbed). */
data class UrlComposerState(
    val url: String = "",
    val sourceType: String? = null,
    val thumbnailUrl: String = "",
    val title: String = "",
    val isFetching: Boolean = false,
    val hashtags: List<String> = emptyList(),
) {
    /** Web parity (`canCreate` url branch): a non-blank URL whose source was recognised. */
    val isValid: Boolean get() = url.isNotBlank() && sourceType != null
}

@HiltViewModel
class ReviewComposerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    private val stringProvider: StringProvider,
    private val appConfigRepository: com.tappyai.app.config.AppConfigRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    // Upload caps sourced from /api/config (web parity) rather than hardcoded — the 15s/60s drift
    // vector. Starts at the current prod defaults and is refreshed from the server on construction,
    // so validation before the fetch resolves still uses today's correct values.
    private var uploadLimits = com.tappyai.app.config.UploadLimits.DEFAULT

    init {
        viewModelScope.launch { uploadLimits = appConfigRepository.uploadLimits() }
    }

    /** Present only when reached via [com.tappyai.app.navigation.AppRoute.ComposerWithSound]
     *  (Sound Detail's "Use this sound") — absent for a normal compose-from-Reviews-tab visit,
     *  since that route carries no such nav args. [attachedTrackTitle] rides along purely for
     *  display (the "Using: {title}" chip) so the screen doesn't need a second fetch. */
    val attachedTrackId: String? = savedStateHandle["trackId"]
    val attachedTrackTitle: String? = savedStateHandle["trackTitle"]

    /**
     * Set only when reached via [com.tappyai.app.navigation.AppRoute.ComposerForPlace] (a past
     * booking's Review button). When present, [submit] sends this real `place_id` instead of
     * slugifying the typed name, and [prefilledPlaceName] seeds the place field.
     */
    private val presetPlaceId: String? = savedStateHandle["placeId"]
    val prefilledPlaceName: String? = savedStateHandle["placeName"]

    private val _uiState = MutableStateFlow(ReviewComposerUiState())
    val uiState: StateFlow<ReviewComposerUiState> = _uiState.asStateFlow()

    private val _events = Channel<ComposerEvent>(Channel.BUFFERED)
    val events: Flow<ComposerEvent> = _events.receiveAsFlow()

    private val _videoState = MutableStateFlow(VideoComposerState())
    val videoState: StateFlow<VideoComposerState> = _videoState.asStateFlow()

    private val _photoState = MutableStateFlow(PhotoComposerState())
    val photoState: StateFlow<PhotoComposerState> = _photoState.asStateFlow()

    private val _urlState = MutableStateFlow(UrlComposerState())
    val urlState: StateFlow<UrlComposerState> = _urlState.asStateFlow()

    private var videoJob: Job? = null
    private var urlJob: Job? = null
    // The composer body at the moment the video was picked — passed to /api/explore/process as the
    // AI-enrichment caption input, exactly like the web sends `caption: body.trim() || undefined`.
    private var lastBodyForAi: String = ""

    /**
     * Runs the full video pipeline for a freshly-picked [uri], mirroring the web composer's
     * `handleVideoSelect` in order: validate (format → size → duration) → extract+upload a poster
     * thumbnail (best-effort, non-fatal) → upload the video with progress → AI enrich (hashtags +
     * caption, non-blocking) → ready to publish. Duration is rejected above the 62s tolerance but
     * the error the user sees says 60s (standing product rule). Re-picking cancels any in-flight
     * upload first. [currentBody] is the composer's body text used as the AI caption input.
     */
    fun onVideoPicked(uri: Uri, currentBody: String) {
        lastBodyForAi = currentBody
        videoJob?.cancel()
        videoJob = viewModelScope.launch {
            // Stage 1 — read metadata + validate (off the main thread).
            _videoState.value = VideoComposerState(step = VideoStep.Validating, uri = uri)
            val meta = withContext(Dispatchers.IO) { readVideoMeta(context, uri) }
            if (meta == null) {
                resetVideoWithError(R.string.reviews_composer_video_read_error); return@launch
            }
            if (meta.mimeType !in ALLOWED_VIDEO_TYPES) {
                resetVideoWithError(R.string.reviews_composer_video_unsupported); return@launch
            }
            if (meta.sizeBytes > uploadLimits.maxVideoSizeBytes) {
                resetVideoWithError(R.string.reviews_composer_video_too_large); return@launch
            }
            // Reject on the tolerant threshold (advertised + 2s); the message shows the advertised cap.
            if (meta.durationSec > uploadLimits.maxVideoDurationAcceptSec) {
                _videoState.value = VideoComposerState(
                    step = VideoStep.Error,
                    error = stringProvider.get(R.string.reviews_composer_video_too_long, uploadLimits.maxVideoDurationSec),
                )
                return@launch
            }

            runVideoUpload(uri, meta)
        }
    }

    /** Retries the upload for the already-validated, already-picked video (after an upload failure). */
    fun retryVideoUpload() {
        val uri = _videoState.value.uri ?: return
        val meta = VideoMeta(
            durationSec = _videoState.value.durationSec ?: return,
            sizeBytes = _videoState.value.sizeBytes,
            mimeType = _videoState.value.mimeType ?: return,
        )
        videoJob?.cancel()
        videoJob = viewModelScope.launch { runVideoUpload(uri, meta) }
    }

    /** Cancels an in-flight upload and drops the video (matches the web's cancel → reset + toast). */
    fun cancelVideoUpload() {
        videoJob?.cancel()
        videoJob = null
        _videoState.value = VideoComposerState(
            step = VideoStep.Error,
            error = stringProvider.get(R.string.reviews_composer_upload_cancelled),
        )
    }

    /** Removes a finished/failed video so the composer returns to the empty "Choose video" state. */
    fun removeVideo() {
        videoJob?.cancel()
        videoJob = null
        _videoState.value = VideoComposerState()
    }

    private suspend fun runVideoUpload(uri: Uri, meta: VideoMeta) {
        // Stage 2 — poster thumbnail (best-effort; a decode/upload failure never blocks the video).
        _videoState.update {
            it.copy(step = VideoStep.Thumbnail, uri = uri, durationSec = meta.durationSec, sizeBytes = meta.sizeBytes, mimeType = meta.mimeType, error = null)
        }
        val posterJpeg = withContext(Dispatchers.IO) { extractThumbnailJpeg(context, uri) }
        var thumbnailUrl: String? = null
        if (posterJpeg != null) {
            _videoState.update { it.copy(posterJpeg = posterJpeg) }
            when (val r = repository.uploadReviewThumbnail(posterJpeg)) {
                is NetworkResult.Success -> thumbnailUrl = r.data
                is NetworkResult.Error -> logger.w(TAG, "Thumbnail upload failed (non-fatal): ${r.error}")
            }
        }

        // Stage 3 — video upload with progress.
        _videoState.update { it.copy(step = VideoStep.Uploading, progress = 0f, uploadedThumbnailUrl = thumbnailUrl) }
        val result = try {
            repository.uploadReviewVideo(uri, meta.sizeBytes, meta.mimeType) { p ->
                _videoState.update { it.copy(progress = p.coerceIn(0f, 1f)) }
            }
        } catch (e: CancellationException) {
            throw e // cancelVideoUpload() already set the state + toast
        }
        when (result) {
            is NetworkResult.Success -> {
                // Stage 4 — AI enrichment (hashtags + caption). Non-blocking, exactly like the web:
                // a failure just means the post goes out without tags — it never blocks reaching Done.
                _videoState.update { it.copy(step = VideoStep.AiProcessing, progress = 1f, uploadedVideoUrl = result.data, uploadedThumbnailUrl = thumbnailUrl) }
                var hashtags = emptyList<String>()
                var suggestedCaption = ""
                when (val ai = repository.processVideoAi(thumbnailUrl = thumbnailUrl, caption = lastBodyForAi)) {
                    is NetworkResult.Success -> {
                        hashtags = ai.data.hashtags
                        // Only offer a caption when the user hasn't typed one (matches the web).
                        if (lastBodyForAi.isBlank()) suggestedCaption = ai.data.caption
                    }
                    is NetworkResult.Error -> logger.w(TAG, "AI enrich failed (non-fatal): ${ai.error}")
                }
                _videoState.update {
                    it.copy(step = VideoStep.Done, uploadedVideoUrl = result.data, uploadedThumbnailUrl = thumbnailUrl, hashtags = hashtags, suggestedCaption = suggestedCaption, error = null)
                }
            }
            is NetworkResult.Error -> {
                logger.e(TAG, "Video upload failed: ${result.error}")
                // Keep the uri so the user can Retry (unlike a validation failure, which resets).
                _videoState.update {
                    it.copy(step = VideoStep.Error, error = stringProvider.get(R.string.reviews_composer_video_upload_error))
                }
            }
        }
    }

    private fun resetVideoWithError(errorRes: Int) {
        _videoState.value = VideoComposerState(step = VideoStep.Error, error = stringProvider.get(errorRes))
    }

    // ── Photo lane ───────────────────────────────────────────────────────────────────────────────

    /** Uploads each newly-picked image to /api/reviews/upload (up to the config photo cap), appending
     *  the returned Blob URLs — mirrors the web `handlePhotoSelect` loop. Stops + surfaces the error
     *  on the first failure (e.g. >5MB / wrong type / 401), keeping any already-uploaded photos. */
    fun onPhotosPicked(uris: List<Uri>) {
        if (uris.isEmpty()) return
        val state = _photoState.value
        // Ignore a second pick while a batch is still uploading — otherwise two loops race the cap.
        val maxPhotos = uploadLimits.maxPhotos
        if (state.isUploading || state.photos.size >= maxPhotos) return
        val room = maxPhotos - state.photos.size
        _photoState.update { it.copy(isUploading = true, error = null) }
        viewModelScope.launch {
            for (uri in uris.take(room)) {
                when (val r = repository.uploadReviewPhoto(uri)) {
                    // Re-check the cap at append time so a concurrent append can never exceed the cap.
                    is NetworkResult.Success -> _photoState.update {
                        if (it.photos.size >= maxPhotos) it else it.copy(photos = it.photos + r.data)
                    }
                    is NetworkResult.Error -> {
                        logger.e(TAG, "Photo upload failed: ${r.error}")
                        _photoState.update { it.copy(isUploading = false, error = reviewErrorMessages.toPostFailureMessage(r.error)) }
                        return@launch
                    }
                }
            }
            _photoState.update { it.copy(isUploading = false) }
        }
    }

    fun removePhoto(url: String) {
        _photoState.update { it.copy(photos = it.photos.filterNot { p -> p == url }) }
    }

    // ── URL lane ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Mirrors the web `handleUrlChange`: detect the source; for YouTube build the poster from the
     * video id, for TikTok/Facebook fetch the oEmbed poster+title; then (non-blocking) run AI
     * enrichment for hashtags. Unrecognised URLs clear the detected source so Post stays disabled.
     */
    fun onUrlChanged(value: String, currentBody: String) {
        urlJob?.cancel()
        val trimmed = value.trim()
        val source = detectSource(trimmed)
        _urlState.value = UrlComposerState(url = value, sourceType = source)
        if (source == null) return

        urlJob = viewModelScope.launch {
            when (source) {
                "youtube" -> {
                    val id = extractYoutubeId(trimmed)
                    val thumb = if (id != null) "https://i.ytimg.com/vi/$id/maxresdefault.jpg" else ""
                    _urlState.update { it.copy(thumbnailUrl = thumb) }
                    enrichUrl(thumb, "", currentBody)
                }
                else -> {
                    _urlState.update { it.copy(isFetching = true) }
                    val meta = repository.oembed(trimmed)
                    val thumb = (meta as? NetworkResult.Success)?.data?.thumbnailUrl.orEmpty()
                    val title = (meta as? NetworkResult.Success)?.data?.title.orEmpty()
                    _urlState.update { it.copy(thumbnailUrl = thumb, title = title, isFetching = false) }
                    enrichUrl(thumb, title, currentBody)
                }
            }
        }
    }

    /** Best-effort hashtags for a URL review (web `triggerUrlAI`), never blocking Post. */
    private suspend fun enrichUrl(thumbnail: String, title: String, currentBody: String) {
        if (thumbnail.isBlank() && title.isBlank()) return
        when (val ai = repository.processVideoAi(thumbnailUrl = thumbnail.ifBlank { null }, caption = currentBody, title = title.ifBlank { null })) {
            is NetworkResult.Success -> _urlState.update { it.copy(hashtags = ai.data.hashtags) }
            is NetworkResult.Error -> logger.w(TAG, "URL AI enrich failed (non-fatal): ${ai.error}")
        }
    }

    private fun detectSource(url: String): String? = when {
        url.contains("youtube.com") || url.contains("youtu.be") -> "youtube"
        url.contains("tiktok.com") -> "tiktok"
        url.contains("facebook.com") || url.contains("fb.com") || url.contains("fb.watch") -> "facebook"
        else -> null
    }

    private fun extractYoutubeId(url: String): String? =
        Regex("(?:youtube\\.com/watch\\?v=|youtu\\.be/)([^&?/]+)").find(url)?.groupValues?.getOrNull(1)

    /**
     * Submits a text review via POST /api/reviews. The current composer UI collects only body,
     * rating and a free-text place name — it has no structured place picker or media picker — so
     * [placeId] is derived as a slug of [placeName]. The backend requires a place, so a blank
     * place name yields a 400 which we surface as a Toast (leaving validation to the backend,
     * which owns that business rule). [includeSound] lets the screen drop the pre-attached track
     * (its "x" on the "Using: {title}" chip) without needing a mutable copy of [attachedTrackId].
     */
    fun submit(body: String, rating: Int, placeName: String, mode: ComposerMediaMode, includeSound: Boolean = true) {
        if (_uiState.value.isPosting) return
        val video = _videoState.value
        val photo = _photoState.value
        val url = _urlState.value
        _uiState.update { it.copy(isPosting = true) }
        viewModelScope.launch {
            // placeId matches the web's rule (reviews/new/page.tsx): a photo review with a typed
            // place slugs under `community_<name>`; every other case (photo-no-name, video, url) uses
            // `<mode>_<timestamp>`. A booking-sourced review always uses its real place_id.
            val ts = System.currentTimeMillis()
            val placeId = presetPlaceId ?: when (mode) {
                ComposerMediaMode.Photo -> if (placeName.isBlank()) "photo_$ts" else slugify(placeName)
                // Web parity (reviews/new/page.tsx:522-524): only photo+named place slugs to a shared
                // `community_<name>` id; video and url always get a unique `<mode>_<timestamp>` id so a
                // second post at the same (or no) place isn't rejected as a duplicate (409).
                ComposerMediaMode.Video -> "video_$ts"
                ComposerMediaMode.Link -> "url_$ts"
            }
            val result = repository.createReview(
                placeId = placeId,
                // Web parity (page.tsx:528): the backend rejects an empty placeName, so a placeless
                // post falls back to the "Chia sẻ" sentinel (which the feed hides via isShareOnlyName).
                placeName = placeName.trim().ifBlank { SHARE_PLACE_NAME },
                body = body.trim(),
                rating = rating.takeIf { it in 1..5 },
                musicTrackId = attachedTrackId.takeIf { includeSound },
                // Photo mode: the uploaded photo Blob URLs + content_type="photo".
                photos = photo.photos.takeIf { mode == ComposerMediaMode.Photo && it.isNotEmpty() },
                // Video: uploaded Blob URL. URL: the external link as media_url (web parity).
                mediaUrl = when (mode) {
                    ComposerMediaMode.Video -> video.uploadedVideoUrl.takeIf { video.isReady }
                    ComposerMediaMode.Link -> url.url.trim().takeIf { url.isValid }
                    else -> null
                },
                thumbnail = when (mode) {
                    ComposerMediaMode.Video -> video.uploadedThumbnailUrl.takeIf { video.isReady }
                    ComposerMediaMode.Link -> url.thumbnailUrl.takeIf { url.isValid && it.isNotBlank() }
                    else -> null
                },
                contentType = when (mode) {
                    ComposerMediaMode.Photo -> "photo"
                    ComposerMediaMode.Video -> "video".takeIf { video.isReady }
                    ComposerMediaMode.Link -> "video".takeIf { url.isValid }
                },
                // URL reviews carry the detected external source; native uploads stay null (default).
                sourceType = url.sourceType.takeIf { mode == ComposerMediaMode.Link && url.isValid },
                sourceUrl = url.url.trim().takeIf { mode == ComposerMediaMode.Link && url.isValid },
                durationSec = video.durationSec.takeIf { mode == ComposerMediaMode.Video && video.isReady },
                hashtags = when (mode) {
                    ComposerMediaMode.Video -> video.hashtags.takeIf { video.isReady && it.isNotEmpty() }
                    ComposerMediaMode.Link -> url.hashtags.takeIf { url.isValid && it.isNotEmpty() }
                    else -> null
                },
            )
            _uiState.update { it.copy(isPosting = false) }
            when (result) {
                is NetworkResult.Success -> _events.send(ComposerEvent.Posted)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Create review failed: ${result.error}")
                    _events.send(ComposerEvent.Failed(reviewErrorMessages.toPostFailureMessage(result.error)))
                }
            }
        }
    }

    /**
     * Stable per-place key from a free-text display name — byte-for-byte the web's own algorithm
     * for the identical case (`src/app/reviews/new/page.tsx`: `'community_' + placeName.trim()
     * .toLowerCase().replace(/\s+/g, '_')`). Must match exactly: this is the join key two reviews
     * of the same real-world place group under, and a divergent algorithm here would silently
     * fragment the same place into separate placeIds depending on which platform posted first.
     */
    private fun slugify(name: String): String = "community_" + name.trim().lowercase().replace(Regex("\\s+"), "_")

    private companion object {
        const val TAG = "ReviewComposerViewModel"

        // Mirror the web/product config (src/lib/config/product.ts) exactly.
        val ALLOWED_VIDEO_TYPES = setOf("video/mp4", "video/quicktime", "video/webm")
        // Upload caps now come from /api/config via AppConfigRepository ([UploadLimits]); the
        // former hardcoded const vals were the drift vector this consolidates away.
        // Web's placeless-post sentinel (reviews/new/page.tsx:528); recognised by isShareOnlyName.
        const val SHARE_PLACE_NAME = "Chia sẻ"
    }
}

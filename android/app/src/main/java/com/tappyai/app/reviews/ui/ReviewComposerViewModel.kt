package com.tappyai.app.reviews.ui

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.reviews.data.LinkAttachment
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
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

    /**
     * The row was stored but the safety gate did not publish it.
     *
     * 🚨 A THIRD OUTCOME, not a flavour of [Posted] and not a flavour of [Failed]. Nothing went
     * wrong — the request succeeded, the post exists, it belongs to the author and it is in their
     * profile — but it is not public, and saying "posted!" would be a lie the author only
     * discovers by noticing their video never appears. Nor is it a failure: telling someone their
     * upload failed when it did not is equally untrue, and would invite them to post it again.
     *
     * [title] and [detail] are the server's own words, already in the request language. They are
     * rendered verbatim; see [com.tappyai.app.reviews.data.ReviewModeration] for why there is no
     * string resource for them here.
     */
    data class Held(val title: String, val detail: String, val assertsViolation: Boolean) : ComposerEvent

    data class Failed(val message: String) : ComposerEvent
}

data class ReviewComposerUiState(
    val isPosting: Boolean = false,
    /** Public Blob URLs of photos already uploaded for this draft (max [MAX_PHOTOS]). */
    val photoUrls: List<String> = emptyList(),
    /** True while at least one picked photo is still uploading. */
    val isUploadingPhoto: Boolean = false,
    /** Raw text in the Link tab's URL field. */
    val linkUrl: String = "",
    /** Detected provider for [linkUrl], or null when it is not one the backend accepts. */
    val linkSourceType: String? = null,
    /** Best-effort poster frame for the link (YouTube: derived from the video id, no network). */
    val linkThumbnailUrl: String? = null,
    /** True while a poster lookup is in flight. */
    val isFetchingLinkMeta: Boolean = false,
    /** The uploaded clip (Video tab), once `/api/upload/video` completed. */
    val video: com.tappyai.app.reviews.data.UploadedVideo? = null,
    /** The poster shown while / after uploading (local file uri until the server one exists). */
    val videoPreview: String? = null,
    val isUploadingVideo: Boolean = false,
    /** 0..100 while the clip's bytes are being sent. */
    val videoProgress: Int = 0,
)

/** The web's place fallback for a post with no place typed: "Chia sẻ" (`placeName.trim() || 'Chia sẻ'`). */
internal fun composerPlaceName(placeName: String): String = placeName.trim().ifEmpty { "Chia sẻ" }

/**
 * The web's place id: a photo post WITH a place → `community_<slug>`; anything else →
 * `${mediaMode}_${Date.now()}` (src/app/(app)/reviews/new/page.tsx).
 */
internal fun composerPlaceId(mode: ComposerMediaMode, placeName: String, nowMs: Long = System.currentTimeMillis()): String =
    if (mode == ComposerMediaMode.Photo && placeName.isNotBlank()) {
        "community_" + placeName.trim().lowercase().replace(Regex("\\s+"), "_")
    } else {
        mode.name.lowercase() + "_" + nowMs
    }

@HiltViewModel
class ReviewComposerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    @ApplicationContext private val context: Context,
    private val videoUploader: com.tappyai.app.reviews.data.VideoUploader,
) : ViewModel() {

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

    /**
     * The platforms a user may attach a video link from. The backend owns this list
     * (`GET /api/config` → `video.linkProviders`, from web `LINK_VIDEO_PROVIDERS`) and it is the
     * SINGLE point gating [detectSource] — no provider list is hardcoded in the detection logic.
     *
     * Seeded with the V1 contract so the Link tab works before the fetch lands, and deliberately
     * left untouched when the fetch fails: falling back to "everything" would restore exactly the
     * drift this replaces. Narrowing is the only safe failure direction.
     */
    private var supportedLinkProviders: Set<String> = DEFAULT_LINK_PROVIDERS

    init {
        viewModelScope.launch {
            when (val result = repository.getLinkProviders()) {
                is NetworkResult.Success -> {
                    val providers = result.data.filter { it.isNotBlank() }.toSet()
                    if (providers.isNotEmpty()) supportedLinkProviders = providers
                }
                is NetworkResult.Error -> logger.w(TAG, "link providers fetch failed; keeping $supportedLinkProviders")
            }
        }
    }

    /**
     * Submits a text review via POST /api/reviews. The current composer UI collects only body,
     * rating and a free-text place name — it has no structured place picker or media picker — so
     * [placeId] is derived as a slug of [placeName]. The backend requires a place, so a blank
     * place name yields a 400 which we surface as a Toast (leaving validation to the backend,
     * which owns that business rule).
     */
    fun submit(body: String, rating: Int, placeName: String, mode: ComposerMediaMode = ComposerMediaMode.Photo) {
        // Block posting while a photo or the clip is still uploading, so the created review can't
        // miss a URL that is a moment away from being ready.
        val s = _uiState.value
        if (s.isPosting || s.isUploadingPhoto || s.isUploadingVideo) return
        if (mode == ComposerMediaMode.Video && s.video == null) return
        _uiState.update { it.copy(isPosting = true) }
        viewModelScope.launch {
            val result = repository.createReview(
                // A booking-sourced review carries the venue's real place_id; a free-text place
                // has none, so it falls back to a slug of the typed name as before.
                placeId = presetPlaceId ?: composerPlaceId(mode, placeName),
                placeName = composerPlaceName(placeName),
                body = body.trim(),
                rating = rating.takeIf { it in 1..5 },
                // Each tab posts its own media only, like the web's three payloads.
                photos = s.photoUrls.takeIf { it.isNotEmpty() && mode == ComposerMediaMode.Photo },
                link = currentLinkAttachment()?.takeIf { mode == ComposerMediaMode.Link },
                video = s.video?.takeIf { mode == ComposerMediaMode.Video },
            )
            _uiState.update { it.copy(isPosting = false) }
            when (result) {
                is NetworkResult.Success -> {
                    // The SERVER decides whether this was published. Saving the row is not the
                    // same as publishing it, and reporting success for content the gate has just
                    // refused is the one thing this screen must never do — the web composer's
                    // comment says the same, and this is the half that was missing.
                    //
                    // 🔑 This renders the server's outcome; it does not compute one. There is no
                    // second moderation engine in the client. A null moderation means the gate is
                    // inactive, which must behave exactly as it did before the gate existed.
                    val moderation = result.data
                    if (moderation != null && !moderation.state.isPublished) {
                        _events.send(
                            ComposerEvent.Held(
                                title = moderation.title,
                                detail = moderation.detail,
                                assertsViolation = moderation.assertsViolation,
                            ),
                        )
                    } else {
                        _events.send(ComposerEvent.Posted)
                    }
                }
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

    /**
     * Reads each picked [uris] photo and uploads it via [ReviewsRepository.uploadReviewPhoto],
     * appending the returned Blob URL to [ReviewComposerUiState.photoUrls]. Mirrors the web's
     * upload-on-select flow. Enforces the same limits the backend does — max [MAX_PHOTOS] total
     * and [MAX_PHOTO_BYTES] per file — and validates the MIME is an image before hitting the
     * network (the server re-sniffs the bytes regardless). The byte read runs on [Dispatchers.IO]
     * since a photo-picker Uri may be backed by slow storage; blocking the main thread there
     * stalls the UI. Per-file failures are surfaced as a Toast and skip only that file.
     */
    fun onPhotosPicked(uris: List<Uri>) {
        if (uris.isEmpty() || _uiState.value.isUploadingPhoto) return
        val remaining = MAX_PHOTOS - _uiState.value.photoUrls.size
        if (remaining <= 0) {
            viewModelScope.launch {
                _events.send(ComposerEvent.Failed(context.getString(R.string.reviews_composer_photo_max, MAX_PHOTOS)))
            }
            return
        }
        val toUpload = uris.take(remaining)
        _uiState.update { it.copy(isUploadingPhoto = true) }
        viewModelScope.launch {
            for (uri in toUpload) {
                val bytes = try {
                    withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    }
                } catch (e: Exception) {
                    logger.e(TAG, "Failed to read picked photo", e)
                    null
                }
                if (bytes == null) {
                    _events.send(ComposerEvent.Failed(context.getString(R.string.reviews_composer_photo_read_failed)))
                    continue
                }
                if (bytes.size > MAX_PHOTO_BYTES) {
                    _events.send(ComposerEvent.Failed(context.getString(R.string.reviews_composer_photo_too_large)))
                    continue
                }
                val mimeType = context.contentResolver.getType(uri)
                if (mimeType == null || !mimeType.startsWith("image/")) {
                    _events.send(ComposerEvent.Failed(context.getString(R.string.reviews_composer_photo_invalid_type)))
                    continue
                }
                when (val result = repository.uploadReviewPhoto(bytes, mimeType)) {
                    is NetworkResult.Success ->
                        _uiState.update { it.copy(photoUrls = it.photoUrls + result.data) }
                    is NetworkResult.Error -> {
                        logger.e(TAG, "Photo upload failed: ${result.error}")
                        _events.send(ComposerEvent.Failed(reviewErrorMessages.toUserMessage(result.error)))
                    }
                }
            }
            _uiState.update { it.copy(isUploadingPhoto = false) }
        }
    }

    /**
     * The Video tab — the web composer's clip lane: MP4/MOV only, ≤ [MAX_VIDEO_SIZE_MB], ≤
     * [MAX_VIDEO_DURATION_ACCEPT_SEC]; a poster frame first (best-effort, a JPEG with no EXIF), then
     * the clip itself, both through [com.tappyai.app.reviews.data.VideoUploader] (the web's
     * three-step media session, with the clip's metadata neutralised before the PUT).
     */
    fun onVideoPicked(uri: Uri) {
        if (_uiState.value.isUploadingVideo) return
        viewModelScope.launch {
            val fail: suspend (Int) -> Unit = { res ->
                _uiState.update { it.copy(isUploadingVideo = false, videoProgress = 0, videoPreview = null, video = null) }
                _events.send(ComposerEvent.Failed(context.getString(res)))
            }
            val mime = context.contentResolver.getType(uri)
            if (mime !in VIDEO_TYPES) return@launch fail(R.string.reviews_composer_video_unsupported)
            _uiState.update { it.copy(isUploadingVideo = true, videoProgress = 0, video = null) }
            val local = withContext(Dispatchers.IO) {
                runCatching {
                    val f = java.io.File(context.cacheDir, "composer-clip-${System.currentTimeMillis()}." + (if (mime == "video/quicktime") "mov" else "mp4"))
                    context.contentResolver.openInputStream(uri)!!.use { input -> f.outputStream().use { input.copyTo(it) } }
                    f
                }.getOrNull()
            } ?: return@launch fail(R.string.reviews_composer_video_read_error)
            if (local.length() > MAX_VIDEO_SIZE_MB * 1024L * 1024L) { local.delete(); return@launch fail(R.string.reviews_composer_video_too_large) }
            val (durationSec, poster) = withContext(Dispatchers.IO) {
                val r = android.media.MediaMetadataRetriever()
                try {
                    r.setDataSource(local.absolutePath)
                    val d = r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.div(1000.0)
                    val frame = r.getFrameAtTime(0)
                    val jpg = frame?.let { bmp ->
                        java.io.File(context.cacheDir, "composer-poster-${System.currentTimeMillis()}.jpg").also { out ->
                            out.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, it) }
                        }
                    }
                    d to jpg
                } catch (e: Exception) {
                    null to null
                } finally {
                    r.release()
                }
            }
            if (durationSec == null) { local.delete(); return@launch fail(R.string.reviews_composer_video_read_error) }
            if (durationSec > MAX_VIDEO_DURATION_ACCEPT_SEC) { local.delete(); return@launch fail(R.string.reviews_composer_video_too_long) }
            _uiState.update { it.copy(videoPreview = poster?.let { f -> Uri.fromFile(f).toString() }) }
            // 1. Poster — best-effort: a clip must still upload and play without one (web does the same).
            val thumbUrl = poster?.let { f -> runCatching { videoUploader.upload("videoThumbnail", f, "image/jpeg") }.getOrNull() }
            // 2. The clip, with progress.
            val result = runCatching {
                videoUploader.upload("video", local, mime!!) { pct -> _uiState.update { it.copy(videoProgress = pct) } }
            }
            local.delete()
            result.fold(
                onSuccess = { url ->
                    _uiState.update { it.copy(isUploadingVideo = false, videoProgress = 100, video = com.tappyai.app.reviews.data.UploadedVideo(url, thumbUrl, durationSec)) }
                },
                onFailure = { e ->
                    logger.e(TAG, "Video upload failed", e)
                    val code = (e as? com.tappyai.app.reviews.data.VideoUploadException)?.code
                    fail(if (code == "unsupported_format") R.string.reviews_composer_video_unsupported else R.string.reviews_composer_video_upload_error)
                },
            )
        }
    }

    fun onRemoveVideo() {
        if (_uiState.value.isUploadingVideo) return
        _uiState.update { it.copy(video = null, videoPreview = null, videoProgress = 0) }
    }

    /** Drops one already-uploaded photo from the draft (removes its URL; no server call needed). */
    fun onRemovePhoto(url: String) {
        _uiState.update { it.copy(photoUrls = it.photoUrls - url) }
    }

    /**
     * Handles every keystroke in the Link tab's URL field. Detects the provider like the web's
     * `detectSource`, then derives the YouTube poster from the video id with no network call.
     * An unrecognized URL leaves [ReviewComposerUiState.linkSourceType] null, which is what stops
     * the post — see [currentLinkAttachment].
     */
    fun onLinkUrlChanged(url: String) {
        val trimmed = url.trim()
        val source = detectSource(trimmed)
        _uiState.update {
            it.copy(linkUrl = url, linkSourceType = source, linkThumbnailUrl = null, isFetchingLinkMeta = false)
        }
        if (source == "youtube") {
            extractYoutubeId(trimmed)?.let { id ->
                // `hqdefault` mirrors the web's `youTubeThumbnail` (src/lib/links/platforms.ts): it
                // exists for EVERY public video, while `maxresdefault` 404s for many videos and most
                // Shorts — and nothing here would notice, since the poster is never fetched.
                _uiState.update { it.copy(linkThumbnailUrl = "https://i.ytimg.com/vi/$id/hqdefault.jpg") }
            }
        }
    }

    /** The current Link tab state as a [LinkAttachment], or null if no recognized URL is entered. */
    private fun currentLinkAttachment(): LinkAttachment? {
        val s = _uiState.value
        val type = s.linkSourceType ?: return null
        val u = s.linkUrl.trim().ifEmpty { return null }
        return LinkAttachment(sourceType = type, sourceUrl = u, thumbnailUrl = s.linkThumbnailUrl)
    }

    /**
     * Provider detection — mirrors the web's `detectSource` (src/lib/links/platforms.ts), including
     * its structure: a URL matcher per provider, intersected with the backend-owned list in
     * [supportedLinkProviders]. A provider is offered only when this client can parse it AND the
     * backend accepts it, so the composer can never attach something the backend will not serve.
     *
     * Returning null is what blocks the post: [currentLinkAttachment] yields no attachment, so the
     * review is never created with an unsupported source.
     */
    private fun detectSource(url: String): String? {
        val provider = LINK_MATCHERS.entries.firstOrNull { (_, matches) -> matches(url) }?.key
        return provider?.takeIf { it in supportedLinkProviders }
    }

    /** YouTube id extraction — mirrors the web's `extractYoutubeId` regex. */
    private fun extractYoutubeId(url: String): String? =
        Regex("(?:youtube\\.com/watch\\?v=|youtu\\.be/)([^&?/]+)").find(url)?.groupValues?.getOrNull(1)

    companion object {
        private const val TAG = "ReviewComposerViewModel"
        /** Web MAX_VIDEO_SIZE_MB / MAX_VIDEO_DURATION_ACCEPT_SEC (src/lib/config/product.ts); MP4/MOV only (F-102). */
        const val MAX_VIDEO_SIZE_MB = 150
        const val MAX_VIDEO_DURATION_ACCEPT_SEC = 305
        val VIDEO_TYPES = setOf("video/mp4", "video/quicktime")

        /**
         * The V1 backend contract (`LINK_VIDEO_PROVIDERS`), used until `GET /api/config` answers.
         * A default is required because the composer may be opened offline; it matches the backend
         * so the offline behaviour is the correct behaviour rather than a guess.
         */
        private val DEFAULT_LINK_PROVIDERS = setOf("youtube")

        /**
         * URL matchers for the providers this client can parse, mirroring the web's `MATCHERS`
         * (src/lib/links/platforms.ts). Being listed here is NOT permission to use a provider —
         * [detectSource] intersects these with the backend's list. Re-enabling a provider is a
         * coordinated change: its id in the backend's LINK_VIDEO_PROVIDERS, a resolver branch
         * server-side, and a matcher here.
         */
        private val LINK_MATCHERS: Map<String, (String) -> Boolean> = mapOf(
            "youtube" to { u: String -> u.contains("youtube.com") || u.contains("youtu.be") },
        )
        // Matches the web's MAX_PHOTOS_PER_REVIEW (src/lib/config/product.ts) and the backend's
        // photos.slice(0, 6) cap; and the per-file limit the upload route enforces.
        //
        // Both numbers are served by GET /api/config as `upload.maxPhotosPerReview` and
        // `upload.maxPhotoSizeMb` (the size one was added in the Phase 7 RC pass — until then no
        // client could read it, which is how three platforms came to carry the same literal).
        // These stay as the offline fallback; binary megabytes, the same convention web uses.
        const val MAX_PHOTOS = 6
        const val MAX_PHOTO_SIZE_MB = 5
        const val MAX_PHOTO_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024
    }
}

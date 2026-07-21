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

data class ReviewComposerUiState(
    val isPosting: Boolean = false,
    /** Public Blob URLs of photos already uploaded for this draft (max [MAX_PHOTOS]). */
    val photoUrls: List<String> = emptyList(),
    /** True while at least one picked photo is still uploading. */
    val isUploadingPhoto: Boolean = false,
    /** Raw text in the Link tab's URL field. */
    val linkUrl: String = "",
    /** Detected provider for [linkUrl] — "youtube"/"tiktok"/"facebook", or null if unrecognized. */
    val linkSourceType: String? = null,
    /** Best-effort poster frame for the link (YouTube: derived; TikTok/FB: via oEmbed). */
    val linkThumbnailUrl: String? = null,
    /** True while a TikTok/Facebook thumbnail lookup is in flight. */
    val isFetchingLinkMeta: Boolean = false,
    /** Attached background music, mutable now that the composer can pick/replace/trim a track in-
     *  place (web parity: the MusicPickerSheet + SelectedMusicCard). Null when no track is attached. */
    val attachedTrackId: String? = null,
    val attachedTrackTitle: String? = null,
    /** Start offset (sec) + volume (0–1) chosen in the picker's trim panel — web MusicSelectionPanel. */
    val attachedStartSec: Int = 0,
    val attachedVolume: Double = 1.0,
)

@HiltViewModel
class ReviewComposerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    /**
     * Set only when reached via [com.tappyai.app.navigation.AppRoute.ComposerForPlace] (a past
     * booking's Review button). When present, [submit] sends this real `place_id` instead of
     * slugifying the typed name, and [prefilledPlaceName] seeds the place field.
     */
    private val presetPlaceId: String? = savedStateHandle["placeId"]
    val prefilledPlaceName: String? = savedStateHandle["placeName"]

    // Seed the attached track from the nav args when reached via `ComposerWithSound` (Sound Detail's
    // "Use this sound"); it's mutable state now, so the in-composer picker can add/replace/trim too.
    private val _uiState = MutableStateFlow(
        ReviewComposerUiState(
            attachedTrackId = savedStateHandle["trackId"],
            attachedTrackTitle = savedStateHandle["trackTitle"],
        ),
    )
    val uiState: StateFlow<ReviewComposerUiState> = _uiState.asStateFlow()

    private val _events = Channel<ComposerEvent>(Channel.BUFFERED)
    val events: Flow<ComposerEvent> = _events.receiveAsFlow()

    /**
     * Submits a text review via POST /api/reviews. The current composer UI collects only body,
     * rating and a free-text place name — it has no structured place picker or media picker — so
     * [placeId] is derived as a slug of [placeName]. The backend requires a place, so a blank
     * place name yields a 400 which we surface as a Toast (leaving validation to the backend,
     * which owns that business rule). The attached track (id/startSec/volume) lives in [uiState].
     */
    fun submit(body: String, rating: Int, placeName: String) {
        // Block posting while a photo is still uploading, so the created review can't miss a URL
        // that is a moment away from being ready.
        val s = _uiState.value
        if (s.isPosting || s.isUploadingPhoto) return
        _uiState.update { it.copy(isPosting = true) }
        viewModelScope.launch {
            val result = repository.createReview(
                // A booking-sourced review carries the venue's real place_id; a free-text place
                // has none, so it falls back to a slug of the typed name as before.
                placeId = presetPlaceId ?: slugify(placeName),
                placeName = placeName.trim(),
                body = body.trim(),
                rating = rating.takeIf { it in 1..5 },
                musicTrackId = s.attachedTrackId,
                musicStartSec = s.attachedStartSec,
                musicVolume = s.attachedVolume,
                photos = s.photoUrls.takeIf { it.isNotEmpty() },
                link = currentLinkAttachment(),
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

    /** Drops one already-uploaded photo from the draft (removes its URL; no server call needed). */
    fun onRemovePhoto(url: String) {
        _uiState.update { it.copy(photoUrls = it.photoUrls - url) }
    }

    /** Attaches (or replaces) the background track chosen in the in-composer MusicPickerSheet, with
     *  the start offset + volume from its trim panel (web parity: onSelect(MusicSelection)). */
    fun onMusicSelected(trackId: String, title: String, startSec: Int, volume: Double) {
        _uiState.update {
            it.copy(
                attachedTrackId = trackId,
                attachedTrackTitle = title,
                attachedStartSec = startSec.coerceAtLeast(0),
                attachedVolume = volume.coerceIn(0.0, 1.0),
            )
        }
    }

    /** Removes the attached track (the "x" on the SelectedMusicCard). */
    fun onRemoveSound() {
        _uiState.update {
            it.copy(attachedTrackId = null, attachedTrackTitle = null, attachedStartSec = 0, attachedVolume = 1.0)
        }
    }

    private var linkMetaJob: Job? = null

    /**
     * Handles every keystroke in the Link tab's URL field. Detects the provider (YouTube/TikTok/
     * Facebook) byte-for-byte like the web's `detectSource`, then resolves a poster thumbnail:
     * YouTube's is derived from the video id with no network call; TikTok/Facebook go through the
     * server oEmbed proxy (best-effort — a missing thumbnail never blocks posting). A newer
     * keystroke cancels the previous in-flight lookup so a stale thumbnail can't land.
     */
    fun onLinkUrlChanged(url: String) {
        linkMetaJob?.cancel()
        val trimmed = url.trim()
        val source = detectSource(trimmed)
        _uiState.update {
            it.copy(linkUrl = url, linkSourceType = source, linkThumbnailUrl = null, isFetchingLinkMeta = false)
        }
        when (source) {
            null -> return
            "youtube" -> extractYoutubeId(trimmed)?.let { id ->
                _uiState.update { it.copy(linkThumbnailUrl = "https://i.ytimg.com/vi/$id/maxresdefault.jpg") }
            }
            else -> {
                _uiState.update { it.copy(isFetchingLinkMeta = true) }
                linkMetaJob = viewModelScope.launch {
                    val thumb = when (val r = repository.getLinkThumbnail(trimmed)) {
                        is NetworkResult.Success -> r.data
                        is NetworkResult.Error -> null
                    }
                    _uiState.update { it.copy(linkThumbnailUrl = thumb, isFetchingLinkMeta = false) }
                }
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

    /** Provider detection — mirrors the web's `detectSource` (src/app/reviews/new/page.tsx). */
    private fun detectSource(url: String): String? = when {
        url.contains("youtube.com") || url.contains("youtu.be") -> "youtube"
        url.contains("tiktok.com") -> "tiktok"
        url.contains("facebook.com") || url.contains("fb.com") || url.contains("fb.watch") -> "facebook"
        else -> null
    }

    /** YouTube id extraction — mirrors the web's `extractYoutubeId` regex. */
    private fun extractYoutubeId(url: String): String? =
        Regex("(?:youtube\\.com/watch\\?v=|youtu\\.be/)([^&?/]+)").find(url)?.groupValues?.getOrNull(1)

    private companion object {
        const val TAG = "ReviewComposerViewModel"
        // Matches the web's MAX_PHOTOS_PER_REVIEW (src/lib/config/product.ts) and the backend's
        // photos.slice(0, 6) cap; and the 5MB-per-file limit the upload route enforces.
        const val MAX_PHOTOS = 6
        const val MAX_PHOTO_BYTES = 5 * 1024 * 1024
    }
}

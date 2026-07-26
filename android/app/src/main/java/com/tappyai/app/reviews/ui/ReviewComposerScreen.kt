package com.tappyai.app.reviews.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Longest edge (px) the poster preview is downsampled to — the preview box is ~200dp tall. */
private const val POSTER_PREVIEW_MAX_PX = 720

/**
 * Decodes [bytes] downsampled so its longest edge is ≈[reqPx], using a power-of-two `inSampleSize`
 * (the only sampling BitmapFactory guarantees). Must be called off the main thread.
 */
private fun decodeSampledPoster(bytes: ByteArray, reqPx: Int): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    if (longest <= 0) return null
    var sample = 1
    while (longest / (sample * 2) >= reqPx) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
}

private val ComposerBackground = Color(0xFF000000)
private val ComposerSurface = Color(0xFF1A1A1A)
private val ComposerTextPrimary = Color(0xFFFFFFFF)
private val ComposerTextSecondary = Color(0xB3FFFFFF)
private val ComposerTextPlaceholder = Color(0x66FFFFFF)
private val ComposerDivider = Color(0x33FFFFFF)
private val ComposerAccent = Color(0xFFFE2C55)
private val ComposerAccentDisabled = Color(0x66FE2C55)
private val MediaTabActive = Color(0xFF2A2A2A)
private val MediaTabInactive = Color.Transparent
private val MediaTabText = Color(0xFFFFFFFF)
private val MediaTabTextInactive = Color(0x80FFFFFF)
private val MediaPlaceholderBorder = Color(0x4DFFFFFF)
private val MediaPlaceholderIcon = Color(0x66FFFFFF)
private val ActionRowIcon = Color(0xFFFE2C55)
private val CharCountColor = Color(0x66FFFFFF)

enum class ComposerMediaMode { Photo, Video, Link }

@Composable
fun ReviewComposerScreen(
    body: String,
    onBodyChange: (String) -> Unit,
    rating: Int,
    onRatingChange: (Int) -> Unit,
    placeName: String,
    onPlaceNameChange: (String) -> Unit,
    mediaMode: ComposerMediaMode,
    onMediaModeChange: (ComposerMediaMode) -> Unit,
    showPlaceInput: Boolean,
    onTogglePlaceInput: () -> Unit,
    showRating: Boolean,
    onToggleRating: () -> Unit,
    onBack: () -> Unit,
    onPost: () -> Unit,
    modifier: Modifier = Modifier,
    attachedSoundTitle: String? = null,
    onRemoveSound: () -> Unit = {},
    videoState: VideoComposerState = VideoComposerState(),
    onPickVideo: () -> Unit = {},
    onCancelVideo: () -> Unit = {},
    onRetryVideo: () -> Unit = {},
    onRemoveVideo: () -> Unit = {},
    photoState: PhotoComposerState = PhotoComposerState(),
    onPickPhotos: () -> Unit = {},
    onRemovePhoto: (String) -> Unit = {},
    urlState: UrlComposerState = UrlComposerState(),
    onUrlChange: (String) -> Unit = {},
) {
    // Post-enabled rule per mode, mirroring the web `canCreate`: photo needs body OR ≥1 photo;
    // video needs body OR a finished upload; url needs a recognised link.
    val canPost = when (mediaMode) {
        ComposerMediaMode.Photo -> body.isNotBlank() || photoState.photos.isNotEmpty()
        // Web parity (page.tsx:510): the Video tab requires a COMPLETED upload — not just body text —
        // otherwise a body-only "video" post would go out with no media and a video placeId.
        ComposerMediaMode.Video -> videoState.isReady
        ComposerMediaMode.Link -> urlState.isValid
    }
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(ComposerBackground)
            .imePadding(),
    ) {
        ComposerHeader(onBack = onBack, onPost = onPost, canPost = canPost)
        HorizontalDivider(color = ComposerDivider, thickness = 0.5.dp)

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Spacer(modifier = Modifier.height(TappySpacing.md))

            if (attachedSoundTitle != null) {
                AttachedSoundChip(title = attachedSoundTitle, onRemove = onRemoveSound)
            }

            MediaModeTabs(selected = mediaMode, onSelect = onMediaModeChange)

            when (mediaMode) {
                ComposerMediaMode.Video -> VideoComposer(
                    state = videoState,
                    onPick = onPickVideo,
                    onCancel = onCancelVideo,
                    onRetry = onRetryVideo,
                    onRemove = onRemoveVideo,
                )
                ComposerMediaMode.Photo -> PhotoComposer(
                    state = photoState,
                    onPick = onPickPhotos,
                    onRemove = onRemovePhoto,
                )
                ComposerMediaMode.Link -> UrlComposer(state = urlState, onUrlChange = onUrlChange)
            }

            ComposerBody(body = body, onBodyChange = onBodyChange)

            HorizontalDivider(color = ComposerDivider, thickness = 0.5.dp)

            ComposerActionRow(
                icon = Icons.Filled.LocationOn,
                label = stringResource(R.string.reviews_composer_add_location),
                isExpanded = showPlaceInput,
                onToggle = onTogglePlaceInput,
            ) {
                TextField(
                    value = placeName,
                    onValueChange = onPlaceNameChange,
                    placeholder = {
                        Text(
                            stringResource(R.string.reviews_composer_place_name_placeholder),
                            color = ComposerTextPlaceholder,
                            fontSize = 14.sp,
                        )
                    },
                    singleLine = true,
                    colors = composerTextFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            ComposerActionRow(
                icon = Icons.Filled.Star,
                label = stringResource(R.string.reviews_composer_add_rating),
                isExpanded = showRating,
                onToggle = onToggleRating,
            ) {
                ReviewStarRating(rating = rating, onRatingChange = onRatingChange)
            }

            Spacer(modifier = Modifier.height(TappySpacing.xl))
        }
    }
}

@Composable
private fun ComposerHeader(onBack: () -> Unit, onPost: () -> Unit, canPost: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TappySpacing.xs, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.common_back),
                tint = ComposerTextPrimary,
            )
        }
        Text(
            text = stringResource(R.string.reviews_new_post_label),
            color = ComposerTextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f),
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (canPost) ComposerAccent else ComposerAccentDisabled)
                .clickable(enabled = canPost, onClick = onPost)
                .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.reviews_composer_post_button),
                color = ComposerTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun MediaModeTabs(
    selected: ComposerMediaMode,
    onSelect: (ComposerMediaMode) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(ComposerSurface)
            .padding(TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        MediaTab(
            icon = Icons.Filled.CameraAlt,
            label = stringResource(R.string.reviews_composer_tab_photo),
            isSelected = selected == ComposerMediaMode.Photo,
            onClick = { onSelect(ComposerMediaMode.Photo) },
            modifier = Modifier.weight(1f),
        )
        MediaTab(
            icon = Icons.Filled.Videocam,
            label = stringResource(R.string.reviews_composer_tab_video),
            isSelected = selected == ComposerMediaMode.Video,
            onClick = { onSelect(ComposerMediaMode.Video) },
            modifier = Modifier.weight(1f),
        )
        MediaTab(
            icon = Icons.Filled.Link,
            label = stringResource(R.string.reviews_composer_tab_link),
            isSelected = selected == ComposerMediaMode.Link,
            onClick = { onSelect(ComposerMediaMode.Link) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun MediaTab(
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (isSelected) MediaTabActive else MediaTabInactive)
            .clickable(onClick = onClick)
            .padding(vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spacer(modifier = Modifier.weight(1f))
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (isSelected) MediaTabText else MediaTabTextInactive,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            color = if (isSelected) MediaTabText else MediaTabTextInactive,
            fontSize = 13.sp,
            fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
        )
        Spacer(modifier = Modifier.weight(1f))
    }
}

/** "Using: {title}" bar — mirrors TikTok/the web's attached-sound indicator on the composer,
 *  shown when this session was reached via Sound Detail's "Use this sound". */
@Composable
private fun AttachedSoundChip(title: String, onRemove: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(ComposerSurface)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.MusicNote,
            contentDescription = null,
            tint = ActionRowIcon,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(R.string.reviews_composer_using_sound, title),
            color = ComposerTextPrimary,
            fontSize = 13.sp,
            modifier = Modifier.weight(1f).padding(start = TappySpacing.sm),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.reviews_composer_remove_sound),
                tint = ComposerTextSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/**
 * The Video tab's content — the Android analog of the web composer's video area. Renders the
 * pick-empty state, the pipeline states (validating/thumbnail/uploading with progress + cancel),
 * the ready state (poster preview + "Video uploaded" + remove), and error states (with Retry when
 * the failure was the upload itself). The preview is the extracted poster frame, matching the web's
 * thumbnail poster (not an inline player). "Maximum 60 seconds" is the only limit ever shown.
 */
@Composable
private fun VideoComposer(
    state: VideoComposerState,
    onPick: () -> Unit,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onRemove: () -> Unit,
) {
    // Decode the poster off the main thread and downsampled to the ~200dp preview box — a full-res
    // video frame (often 1080×1920) decoded synchronously in composition would jank/ANR the composer.
    val posterBitmap by produceState<ImageBitmap?>(initialValue = null, state.posterJpeg) {
        val bytes = state.posterJpeg
        value = if (bytes == null) null else withContext(Dispatchers.Default) {
            decodeSampledPoster(bytes, reqPx = POSTER_PREVIEW_MAX_PX)
        }
    }
    when (state.step) {
        VideoStep.Idle -> VideoEmpty(onPick = onPick)

        VideoStep.Error -> Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            VideoEmpty(onPick = onPick)
            Text(text = state.error.orEmpty(), color = ComposerAccent, fontSize = 13.sp)
            // A failed *upload* keeps the picked video → offer Retry; a validation failure resets.
            if (state.uri != null) {
                VideoActionButton(label = stringResource(R.string.reviews_composer_video_retry), filled = true, onClick = onRetry)
            }
        }

        VideoStep.Validating, VideoStep.Thumbnail, VideoStep.Uploading, VideoStep.AiProcessing, VideoStep.Done -> {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ComposerSurface),
                    contentAlignment = Alignment.Center,
                ) {
                    val poster = posterBitmap
                    if (poster != null) {
                        Image(
                            bitmap = poster,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)),
                        )
                    }
                    when (state.step) {
                        VideoStep.Validating, VideoStep.Thumbnail, VideoStep.AiProcessing ->
                            TappyLoadingIndicator()
                        VideoStep.Uploading -> Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                            modifier = Modifier.fillMaxWidth().padding(TappySpacing.xl),
                        ) {
                            Text(
                                text = stringResource(R.string.reviews_composer_video_uploading),
                                color = ComposerTextPrimary,
                                fontSize = 13.sp,
                            )
                            LinearProgressIndicator(
                                progress = { state.progress },
                                color = ComposerAccent,
                                trackColor = ComposerDivider,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text(
                                text = "${(state.progress * 100).toInt()}%",
                                color = ComposerTextSecondary,
                                fontSize = 12.sp,
                            )
                        }
                        VideoStep.Done -> Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(TappySpacing.sm)
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0xCC000000))
                                .clickable(onClick = onRemove)
                                .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
                        ) {
                            Text(
                                text = stringResource(R.string.reviews_composer_video_remove),
                                color = ComposerTextPrimary,
                                fontSize = 12.sp,
                            )
                        }
                        else -> Unit
                    }
                }
                val statusLabel = when (state.step) {
                    VideoStep.Thumbnail -> stringResource(R.string.reviews_composer_video_creating_thumbnail)
                    VideoStep.AiProcessing -> stringResource(R.string.reviews_composer_video_analyzing)
                    VideoStep.Done -> stringResource(R.string.reviews_composer_video_uploaded)
                    else -> null
                }
                if (statusLabel != null) {
                    Text(text = statusLabel, color = ComposerTextSecondary, fontSize = 13.sp)
                }
                if (state.step == VideoStep.Uploading) {
                    VideoActionButton(label = stringResource(R.string.reviews_composer_video_cancel), filled = false, onClick = onCancel)
                }
            }
        }
    }
}

@Composable
private fun VideoEmpty(onPick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.5.dp, MediaPlaceholderBorder, RoundedCornerShape(12.dp))
            .clickable(onClick = onPick),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Icon(
                imageVector = Icons.Filled.Videocam,
                contentDescription = null,
                tint = MediaPlaceholderIcon,
                modifier = Modifier.size(40.dp),
            )
            Text(
                text = stringResource(R.string.reviews_composer_placeholder_video),
                color = ComposerTextSecondary,
                fontSize = 14.sp,
            )
            Text(
                text = stringResource(R.string.reviews_composer_video_hint),
                color = ComposerTextPlaceholder,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun VideoActionButton(label: String, filled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (filled) ComposerAccent else Color.Transparent)
            .then(if (filled) Modifier else Modifier.border(1.dp, ComposerDivider, RoundedCornerShape(20.dp)))
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.md),
    ) {
        Text(text = label, color = ComposerTextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Photo tab — pick multiple images, upload each to /api/reviews/upload, preview them in a scrollable
 *  strip with a remove affordance + an "add more" tile (up to [MAX_COMPOSER_PHOTOS]). Web parity for
 *  the composer's photo mode. */
@Composable
private fun PhotoComposer(
    state: PhotoComposerState,
    onPick: () -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        if (state.photos.isEmpty() && !state.isUploading) {
            MediaEmptyBox(
                icon = Icons.Filled.CameraAlt,
                label = stringResource(R.string.reviews_composer_placeholder_photo),
                hint = stringResource(R.string.reviews_composer_photo_hint, MAX_COMPOSER_PHOTOS),
                onClick = onPick,
            )
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                state.photos.forEach { url ->
                    Box(modifier = Modifier.size(100.dp).clip(RoundedCornerShape(12.dp)).background(ComposerSurface)) {
                        TappyImage(
                            url = url,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(4.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0xCC000000))
                                .clickable { onRemove(url) }
                                .padding(2.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = stringResource(R.string.reviews_composer_photo_remove),
                                tint = ComposerTextPrimary,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }
                if (state.isUploading) {
                    Box(modifier = Modifier.size(100.dp), contentAlignment = Alignment.Center) { TappyLoadingIndicator() }
                } else if (state.photos.size < MAX_COMPOSER_PHOTOS) {
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(1.5.dp, MediaPlaceholderBorder, RoundedCornerShape(12.dp))
                            .clickable(onClick = onPick),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.reviews_composer_photo_add_more), tint = MediaPlaceholderIcon, modifier = Modifier.size(28.dp))
                    }
                }
            }
        }
        if (state.error != null) {
            Text(text = state.error, color = ComposerAccent, fontSize = 13.sp)
        }
    }
}

/** Link tab — paste a YouTube/TikTok/Facebook video URL; shows the detected source's poster (built
 *  from the YouTube id, or fetched via oEmbed for TikTok/Facebook) + title. Web parity for url mode. */
@Composable
private fun UrlComposer(state: UrlComposerState, onUrlChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        TextField(
            value = state.url,
            onValueChange = onUrlChange,
            placeholder = {
                Text(stringResource(R.string.reviews_composer_url_placeholder), color = ComposerTextPlaceholder, fontSize = 14.sp)
            },
            singleLine = true,
            colors = composerTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
        )
        when {
            state.isFetching -> Box(modifier = Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { TappyLoadingIndicator() }
            state.thumbnailUrl.isNotBlank() -> Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(12.dp)).background(ComposerSurface)) {
                    TappyImage(url = state.thumbnailUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
                if (state.title.isNotBlank()) {
                    Text(text = state.title, color = ComposerTextSecondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            // A typed-but-unrecognised URL: nudge the user toward a supported source (web parity:
            // Post stays disabled until detectSource matches).
            state.url.isNotBlank() && state.sourceType == null ->
                Text(text = stringResource(R.string.reviews_composer_url_unsupported), color = ComposerTextPlaceholder, fontSize = 12.sp)
        }
    }
}

/** Shared empty-picker box used by the Photo (and Video) tabs. */
@Composable
private fun MediaEmptyBox(icon: ImageVector, label: String, hint: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.5.dp, MediaPlaceholderBorder, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Icon(imageVector = icon, contentDescription = null, tint = MediaPlaceholderIcon, modifier = Modifier.size(40.dp))
            Text(text = label, color = ComposerTextSecondary, fontSize = 14.sp)
            Text(text = hint, color = ComposerTextPlaceholder, fontSize = 12.sp)
        }
    }
}

/** Mirrors MAX_PHOTOS_PER_REVIEW (product.ts) — kept in sync with the ViewModel's own cap. */
private const val MAX_COMPOSER_PHOTOS = 6

@Composable
private fun ComposerBody(body: String, onBodyChange: (String) -> Unit) {
    Column {
        TextField(
            value = body,
            onValueChange = { if (it.length <= 1000) onBodyChange(it) },
            placeholder = {
                Text(
                    stringResource(R.string.reviews_composer_body_placeholder),
                    color = ComposerTextPlaceholder,
                    fontSize = 15.sp,
                )
            },
            minLines = 4,
            colors = composerTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = "${body.length}/1000",
            color = CharCountColor,
            fontSize = 11.sp,
            textAlign = TextAlign.End,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ComposerActionRow(
    icon: ImageVector,
    label: String,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    expandedContent: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = ActionRowIcon,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = label,
                color = ActionRowIcon,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        if (isExpanded) {
            expandedContent()
        }
    }
}

@Composable
private fun composerTextFieldColors() = TextFieldDefaults.colors(
    focusedTextColor = ComposerTextPrimary,
    unfocusedTextColor = ComposerTextPrimary,
    cursorColor = ComposerAccent,
    focusedContainerColor = Color.Transparent,
    unfocusedContainerColor = Color.Transparent,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
)

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ComposerEmptyPreview() {
    ReviewComposerScreen(
        body = "",
        onBodyChange = {},
        rating = 0,
        onRatingChange = {},
        placeName = "",
        onPlaceNameChange = {},
        mediaMode = ComposerMediaMode.Photo,
        onMediaModeChange = {},
        showPlaceInput = false,
        onTogglePlaceInput = {},
        showRating = false,
        onToggleRating = {},
        onBack = {},
        onPost = {},
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF000000, widthDp = 390, heightDp = 844)
@Composable
private fun ComposerFilledPreview() {
    ReviewComposerScreen(
        body = "Quán cà phê này view đẹp lắm, đồ uống cũng ngon. Recommend mọi người ghé thử!",
        onBodyChange = {},
        rating = 4,
        onRatingChange = {},
        placeName = "The Coffee House",
        onPlaceNameChange = {},
        mediaMode = ComposerMediaMode.Photo,
        onMediaModeChange = {},
        showPlaceInput = true,
        onTogglePlaceInput = {},
        showRating = true,
        onToggleRating = {},
        onBack = {},
        onPost = {},
    )
}

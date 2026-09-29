package com.tappyai.app.reviews.ui

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.core.content.FileProvider
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.app.profile.data.ShareHistoryRecorder
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewSourceType
import com.tappyai.app.reviews.data.isShareOnlyName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The Android system share of a review — the platform's own contract, so that every installed
 * app able to receive the payload is offered by the chooser. The RESOLVER decides who appears;
 * nothing here names, prefers or launches any app.
 *
 * What is shared mirrors the web's ShareModal (`feedShared.tsx` → `ShareMenu(url, title)`): the
 * canonical review URL `/reviews/{id}` on the configured web app, titled with the place name —
 * plus the caption, in `EXTRA_TEXT`. And, when the review carries media of its own, the media
 * ITSELF ([shareMediaFor]): the clip as a `video/…` type, the photo as an `image/…` type, fetched
 * into this app's cache and handed over as a `content://` URI of its FileProvider
 * (`<applicationId>.share`, see the manifest and `res/xml/share_paths.xml`) with a temporary read
 * grant and matching ClipData.
 *
 * Why the media, not only text: apps that only post media (a video-first network, a gallery)
 * register `video/…` / `image/…` and never `text/plain`, so a text-only payload could not reach
 * them; a media payload can, while text apps keep receiving the caption + link. When the media
 * cannot be fetched (imported clip, network, oversized), the share degrades to the text form —
 * never to nothing.
 *
 * Distinct from any in-app "send to a TappyAI user" flow: this is the OS sheet, external only.
 */
internal suspend fun shareReview(context: Context, review: Review) {
    val subject = shareSubjectFor(review, context.getString(R.string.reviews_share_fallback_text))
    val text = shareTextFor(review, BuildConfig.WEB_APP_URL, subject)
    val media = shareMediaFor(review)
    if (media != null) {
        Toast.makeText(context, R.string.reviews_share_preparing, Toast.LENGTH_SHORT).show()
    }
    val stream = media?.let { fetchForShare(context, review.id, it) }

    val send = Intent(Intent.ACTION_SEND).apply {
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TITLE, subject)
        if (stream != null) {
            type = stream.mimeType
            putExtra(Intent.EXTRA_STREAM, stream.uri)
            clipData = ClipData.newUri(context.contentResolver, subject, stream.uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            type = "text/plain"
        }
    }
    // "Đã share" history: the chooser tells this sender which app was chosen — a completed share.
    // A dismissed sheet reports nothing and records nothing. See ShareHistoryRecorder.
    val chooser = Intent.createChooser(
        send,
        context.getString(R.string.reviews_action_share),
        ShareHistoryRecorder.chooserSender(context, review.id),
    ).apply {
        // The grant must ride on the chooser too: it is the chooser that starts the chosen app.
        if (stream != null) addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(chooser)
}

/**
 * An Explore post's share: the approved sheet (sample #6, variant "post" — web `feedShared.tsx`
 * ShareModal). Its "Ảnh chia sẻ" offers the post's own card (review / clip) first and the TappyAI QR
 * card second; Save and TikTok get that file. An UPLOADED clip goes to TikTok as its own video.
 * "Ứng dụng khác" keeps the platform share of the media ([shareReview]). A completed share is a
 * row of the author's "Đã share" history.
 */
@androidx.compose.runtime.Composable
internal fun ReviewShareSheetHost(review: Review, onDismiss: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val post = androidx.compose.runtime.remember(review) { com.tappyai.app.share.card.postCardOf(review) }
    val artifact = androidx.compose.runtime.remember(review) {
        val url = reviewShareUrl(review.id, BuildConfig.WEB_APP_URL)
        com.tappyai.app.share.ShareArtifact(
            kind = com.tappyai.app.share.ShareArtifact.Kind.PLACES,
            title = post.title, subject = post.title,
            text = shareTextFor(review, BuildConfig.WEB_APP_URL, post.title),
            url = url, places = emptyList(),
        )
    }
    val isUploadedClip = shareMediaFor(review)?.family == "video"
    com.tappyai.app.share.TappyShareSheet(
        artifact = artifact,
        onDismiss = onDismiss,
        variant = com.tappyai.app.share.card.ShareSheetVariant.POST,
        displayName = post.title,
        post = post,
        clipVideo = if (isUploadedClip) ({ uploadedClipUri(context, review) }) else null,
        onNativeShare = { scope.launch { shareReview(context, review) } },
        onShared = { channel -> ShareHistoryRecorder.recordChannel(context, review.id, channel) },
    )
}

/** An uploaded clip's own video as a shareable content URI (TikTok) — null for photos and imports. */
internal suspend fun uploadedClipUri(context: Context, review: Review): Uri? {
    val media = shareMediaFor(review)?.takeIf { it.family == "video" } ?: return null
    return fetchForShare(context, review.id, media)?.uri
}

/** The media file worth sharing, or null for a post that has none of its own. */
internal data class ReviewShareMedia(
    val url: String,
    /** `video` or `image` — the top-level MIME family the stream must belong to. */
    val family: String,
    /** Used when the server does not name a type in that family. */
    val fallbackMimeType: String,
)

/** A fetched media file, ready for `EXTRA_STREAM`. */
internal data class ReviewShareStream(val uri: Uri, val mimeType: String)

/**
 * A natively uploaded clip → its video file; a photo post → its first photo; otherwise null.
 * Clips imported from YouTube / TikTok / Facebook are embeds of the source, not files of ours
 * (see `ReviewFeedVideo`), so they share as text + links, never as a download.
 */
internal fun shareMediaFor(review: Review): ReviewShareMedia? {
    val video = review.mediaUrl
    val isNativeClip = review.sourceType == null || review.sourceType == ReviewSourceType.Upload
    return when {
        review.contentType == ReviewContentType.Video && !video.isNullOrBlank() && isNativeClip ->
            ReviewShareMedia(url = video, family = "video", fallbackMimeType = "video/mp4")
        !review.photos.isNullOrEmpty() ->
            ReviewShareMedia(url = review.photos.first(), family = "image", fallbackMimeType = "image/jpeg")
        else -> null
    }
}

/** The canonical review page — what the web's ShareModal shares. */
internal fun reviewShareUrl(reviewId: String, webAppUrl: String): String =
    webAppUrl.trimEnd('/') + "/reviews/" + reviewId

/** The share's title: the place name, unless the post is a bare share (`isShareOnlyName`). */
internal fun shareSubjectFor(review: Review, fallback: String): String =
    review.placeName.trim().takeIf { it.isNotBlank() && !isShareOnlyName(it) } ?: fallback

/**
 * `EXTRA_TEXT`: the title line, the caption, then the canonical URL — and for an imported clip
 * the source link too, as before, since the content lives there.
 */
internal fun shareTextFor(review: Review, webAppUrl: String, subject: String): String = buildString {
    appendLine(subject)
    if (review.body.isNotBlank()) appendLine(review.body.trim())
    appendLine()
    append(reviewShareUrl(review.id, webAppUrl))
    val source = review.sourceUrl
    if (review.sourceType != null && review.sourceType != ReviewSourceType.Upload && !source.isNullOrBlank()) {
        appendLine()
        append(source)
    }
}.trim()

/**
 * Fetches [media] into `cacheDir/share/` and wraps it in a FileProvider URI. Null on any failure
 * (non-2xx, unreachable, over [MAX_SHARE_BYTES]) — the caller falls back to the text share.
 * The MIME type is the server's when it is in the expected family, else the fallback; the file
 * extension follows the type so receiving apps that sniff names agree with the declared type.
 * The bytes land in a `.part` file renamed only once complete, so a cancelled fetch can never be
 * shared; a complete file fetched within the last hour is reused rather than fetched again.
 */
private suspend fun fetchForShare(context: Context, reviewId: String, media: ReviewShareMedia): ReviewShareStream? =
    withContext(Dispatchers.IO) {
        runCatching {
            val dir = File(context.cacheDir, SHARE_CACHE_DIR).apply { mkdirs() }
            val now = System.currentTimeMillis()
            dir.listFiles()?.filter { now - it.lastModified() > STALE_SHARE_MS }?.forEach { it.delete() }

            val connection = (URL(media.url).openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                instanceFollowRedirects = true
            }
            try {
                if (connection.responseCode !in 200..299) return@runCatching null
                if (connection.contentLengthLong > MAX_SHARE_BYTES) return@runCatching null
                val mimeType = connection.contentType
                    ?.substringBefore(';')?.trim()?.lowercase()
                    ?.takeIf { it.startsWith(media.family + "/") }
                    ?: media.fallbackMimeType
                val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
                    ?: media.fallbackMimeType.substringAfter('/')
                val file = File(dir, "$reviewId.$extension")
                if (!file.isFile) {
                    val part = File(dir, "$reviewId.$extension.part")
                    var total = 0L
                    connection.inputStream.use { input ->
                        part.outputStream().use { output ->
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                val read = input.read(buffer)
                                if (read < 0) break
                                total += read
                                if (total > MAX_SHARE_BYTES) {
                                    part.delete()
                                    return@runCatching null
                                }
                                output.write(buffer, 0, read)
                            }
                        }
                    }
                    if (!part.renameTo(file)) return@runCatching null
                }
                val uri = FileProvider.getUriForFile(context, context.packageName + SHARE_AUTHORITY_SUFFIX, file)
                ReviewShareStream(uri = uri, mimeType = mimeType)
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }

/** `cacheDir/share/` — the one folder `share_paths.xml` exposes. */
internal const val SHARE_CACHE_DIR = "share"

/** The FileProvider authority is `<applicationId>.share` (manifest: `${applicationId}.share`). */
internal const val SHARE_AUTHORITY_SUFFIX = ".share"

/** A share bigger than this is not fetched; the post shares as text + link instead. */
internal const val MAX_SHARE_BYTES = 150L * 1024 * 1024

private const val STALE_SHARE_MS = 60L * 60 * 1000
private const val CONNECT_TIMEOUT_MS = 15_000
private const val READ_TIMEOUT_MS = 30_000

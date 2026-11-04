package com.tappyai.app.messaging

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.messaging.data.CHAT_MEDIA_MAX_BYTES
import com.tappyai.app.messaging.data.ChatMessage
import com.tappyai.app.messaging.data.ChatPhotoPreparer
import com.tappyai.app.messaging.data.ChatThreadSummary
import com.tappyai.app.messaging.data.MESSAGE_MAX_BODY
import com.tappyai.app.messaging.data.MessagingRepository
import com.tappyai.app.messaging.data.UploadedMedia
import com.tappyai.app.reviews.data.PickedImageReader
import com.tappyai.app.safety.SafetySession
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * One conversation — the web's `ThreadView`. History (oldest → newest, paged further back with the keyset `before` + `beforeId`), the read cursor moved on open and on every
 * incoming message, and send: the SERVER's row is appended (its real id and `created_at`), so a later re-read dedupes against it cleanly. No "Online", no "Typing…": there is
 * no presence infrastructure, and nothing here claims to know.
 *
 * Web release 2026-11-04, mirrored here:
 *  - **Pictures.** Picking one uploads it AT ONCE (`.../media`; the route scans it and answers with a path), kept as a pending photo until the message is sent or it is removed.
 *    A message is text, a picture, or both.
 *  - **One id per send attempt** (`clientId`), tied to the exact text AND picture: a retry of the SAME attempt repeats it and the server returns the stored row instead of a second
 *    copy; other content, or the next send after a success, gets a new one.
 *  - **Neutral refusals.** The server answers "not a participant" and "blocked" with the same 404 (no oracle for who blocked whom), so a 404 only locks the writing area with the
 *    same neutral sentence ([locked]); nothing here ever says "blocked". 429 = too fast. 422 / 503 / 403 on a picture = not allowed / scan unavailable / AI data sharing not agreed.
 *
 * The thread id arrives as the route's `threadId` argument — the same name on both hosts' routes (`ReviewsRoute.MessageThread`, `ProfileRoute.MessageThread`). The header's title and
 * roster come from the caller's own thread list (`GET /api/messaging/threads`), which is also what a deep link resolves through: a thread the caller is not in is simply absent.
 *
 * Realtime stands in for: [poll] re-reads the newest page every [POLL_MS] while the screen is resumed and merges by id — new rows land, nothing is duplicated, nothing is invented.
 */
@HiltViewModel
class ThreadViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: MessagingRepository,
    private val session: SafetySession,
    private val imageReader: PickedImageReader,
    private val photoPreparer: ChatPhotoPreparer,
    private val logger: LoggerProvider,
) : ViewModel() {

    val threadId: String = savedStateHandle.get<String>("threadId").orEmpty()
    val meId: String? = session.userId()

    var thread by mutableStateOf<ChatThreadSummary?>(null)
        private set
    var messages by mutableStateOf<List<ChatMessage>>(emptyList())
        private set
    var hasMore by mutableStateOf(false)
        private set
    var isLoading by mutableStateOf(true)
        private set
    var loadingOlder by mutableStateOf(false)
        private set
    /** Null = fine; otherwise the screen shows the caller's i18n text for it. */
    var failed by mutableStateOf<ThreadFailure?>(null)
        private set
    var draft by mutableStateOf("")
        private set
    var sending by mutableStateOf(false)
        private set
    /** Bumped when a row is appended, so the list scrolls to the end. */
    var appendTick by mutableStateOf(0)
        private set

    /** The picture chosen for the next message, already uploaded: [path] is what the message carries; [previewUri] is the picker's own Uri, for the thumbnail. */
    var photo by mutableStateOf<PendingPhoto?>(null)
        private set
    var uploading by mutableStateOf(false)
        private set
    /**
     * Set when the server answered a send (or an upload) with the neutral 404 — not a participant any more, or a block; it never says which. The writing area is then replaced by
     * that same neutral sentence, so nobody keeps typing into a conversation that refuses every message.
     */
    var locked by mutableStateOf(false)
        private set

    /** The id of the send attempt in flight or just failed, tied to the exact text and picture it was made for (see the class note). */
    private var attempt: Pair<String, String>? = null

    init {
        viewModelScope.launch {
            (repository.getThreads() as? NetworkResult.Success)?.data?.firstOrNull { it.id == threadId }?.let { thread = it }
        }
        load()
    }

    fun load() {
        isLoading = true; failed = null
        viewModelScope.launch {
            when (val result = repository.getMessages(threadId)) {
                is NetworkResult.Success -> {
                    messages = result.data.messages; hasMore = result.data.hasMore; appendTick++
                    // Opening a thread IS reading it: the mark is unconditional (no per-message receipts).
                    repository.markRead(threadId)
                }
                is NetworkResult.Error -> { logger.e(TAG, "Thread load failed: ${result.error}"); failed = ThreadFailure.Load }
            }
            isLoading = false
        }
    }

    /** Older history, prepended; the keyset is the oldest loaded message — its stamp AND its id, so rows sharing a timestamp are neither skipped nor repeated. */
    fun loadOlder() {
        val oldest = messages.firstOrNull() ?: return
        if (loadingOlder || !hasMore) return
        loadingOlder = true
        viewModelScope.launch {
            when (val result = repository.getMessages(threadId, before = oldest.createdAt, beforeId = oldest.id)) {
                is NetworkResult.Success -> {
                    val known = messages.map { it.id }.toSet()
                    messages = result.data.messages.filter { it.id !in known } + messages
                    hasMore = result.data.hasMore
                }
                is NetworkResult.Error -> logger.e(TAG, "Older page failed: ${result.error}")
            }
            loadingOlder = false
        }
    }

    /** The newest page, merged by id. Incoming rows from others move the read cursor, as the web does on a realtime INSERT. */
    fun poll() {
        if (isLoading || sending) return
        viewModelScope.launch {
            val page = (repository.getMessages(threadId) as? NetworkResult.Success)?.data ?: return@launch
            val known = messages.map { it.id }.toSet()
            val fresh = page.messages.filter { it.id !in known }
            if (fresh.isEmpty()) return@launch
            messages = (messages + fresh).sortedBy { it.createdAt }
            appendTick++
            if (fresh.any { it.senderId != meId }) repository.markRead(threadId)
        }
    }

    fun onDraftChange(value: String) { draft = value.take(MESSAGE_MAX_BODY) }

    /** A picture was picked: read it, bring it to what the server accepts, upload it at once. A failure says why and keeps nothing pending. */
    fun pickPhoto(uri: Uri) {
        if (uploading || sending || locked) return
        uploading = true; failed = null
        viewModelScope.launch {
            val picked = imageReader.read(uri)
            val prepared = picked?.let { photoPreparer.prepare(it.bytes, it.mimeType) }
            if (prepared == null) {
                failed = ThreadFailure.PhotoType
            } else if (prepared.bytes.size > CHAT_MEDIA_MAX_BYTES) {
                failed = ThreadFailure.PhotoTooLarge
            } else {
                when (val result = repository.uploadMedia(threadId, prepared.bytes, prepared.mimeType)) {
                    is NetworkResult.Success -> photo = PendingPhoto(previewUri = uri.toString(), media = result.data)
                    is NetworkResult.Error -> {
                        logger.e(TAG, "Upload failed: ${result.error}")
                        val status = (result.error as? NetworkError.Http)?.code
                        if (status == 404) locked = true
                        failed = uploadFailureFor(status)
                    }
                }
            }
            uploading = false
        }
    }

    fun removePhoto() { photo = null }

    fun send() {
        val body = draft.trim()
        val pending = photo
        if ((body.isEmpty() && pending == null) || sending || uploading || locked) return
        sending = true; failed = null
        // the attempt is tied to the exact text AND picture it was made for
        val key = "$body\u0000${pending?.media?.path.orEmpty()}"
        val current = attempt
        val clientId = if (current == null || current.first != key) UUID.randomUUID().toString().also { attempt = key to it } else current.second
        viewModelScope.launch {
            when (val result = repository.sendMessage(threadId, body, clientId = clientId, media = pending?.media)) {
                is NetworkResult.Success -> {
                    attempt = null // delivered: the next message is a new send, even with the same text
                    val row = result.data
                    if (messages.none { it.id == row.id }) messages = messages + row
                    draft = ""; photo = null; appendTick++
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Send failed: ${result.error}")
                    val status = (result.error as? NetworkError.Http)?.code
                    if (status == 404) locked = true
                    failed = sendFailureFor(status)
                }
            }
            sending = false
        }
    }

    /** A picture that was uploaded and is ready to go with the next message. */
    data class PendingPhoto(val previewUri: String, val media: UploadedMedia)

    enum class ThreadFailure { Load, Send, SendLocked, SendTooFast, PhotoType, PhotoTooLarge, PhotoBlocked, PhotoScanUnavailable, PhotoConsent, PhotoUpload }

    companion object {
        private const val TAG = "ThreadVM"
        const val POLL_MS = 5_000L

        /** What a refused SEND says (neutral: it must not reveal who blocked whom). Pure. */
        fun sendFailureFor(status: Int?): ThreadFailure = when (status) {
            404 -> ThreadFailure.SendLocked
            429 -> ThreadFailure.SendTooFast
            else -> ThreadFailure.Send
        }

        /** What a refused UPLOAD says. Pure. */
        fun uploadFailureFor(status: Int?): ThreadFailure = when (status) {
            400 -> ThreadFailure.PhotoType
            403 -> ThreadFailure.PhotoConsent
            404 -> ThreadFailure.SendLocked
            413 -> ThreadFailure.PhotoTooLarge
            422 -> ThreadFailure.PhotoBlocked
            429 -> ThreadFailure.SendTooFast
            503 -> ThreadFailure.PhotoScanUnavailable
            else -> ThreadFailure.PhotoUpload
        }
    }
}

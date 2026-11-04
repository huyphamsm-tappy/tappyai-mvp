package com.tappyai.app.messaging

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import com.tappyai.app.messaging.data.CHAT_MEDIA_MAX_BYTES
import com.tappyai.app.messaging.data.ChatMessage
import com.tappyai.app.messaging.data.ChatPhotoPreparer
import com.tappyai.app.messaging.data.ChatThreadSummary
import com.tappyai.app.messaging.data.MessagePage
import com.tappyai.app.messaging.data.MessageUnread
import com.tappyai.app.messaging.data.MessagingRepository
import com.tappyai.app.messaging.data.PreparedPhoto
import com.tappyai.app.messaging.data.UploadedMedia
import com.tappyai.app.reviews.data.PickedImage
import com.tappyai.app.reviews.data.PickedImageReader
import com.tappyai.app.safety.SafetySession
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The conversation screen's logic after the web release 2026-11-04, driven for real against a fake repository: the idempotent send (one client id per attempt, tied to the
 * exact text and picture), the neutral refusals (a 404 locks the writing area and never says "blocked"), pictures (upload at once, send with the path, every refusal says why),
 * and the keyset paging of older history. Robolectric only for `android.net.Uri`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ThreadViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private class SentCall(val body: String, val clientId: String?, val media: UploadedMedia?)

    private class FakeRepo : MessagingRepository {
        var history: List<ChatMessage> = listOf(msg("m1", "u2", "2026-11-04T01:00:00Z"), msg("m2", "u2", "2026-11-04T01:01:00Z"))
        var hasMore = false
        val reads = mutableListOf<String>()
        val pages = mutableListOf<Pair<String?, String?>>()
        val sent = mutableListOf<SentCall>()
        val uploads = mutableListOf<Pair<Int, String>>()
        /** Answers for the next sends, in order; empty = success. */
        val sendErrors = ArrayDeque<Int>()
        var uploadError: Int? = null
        private var n = 0

        override suspend fun getThreads(): NetworkResult<List<ChatThreadSummary>> = NetworkResult.Success(emptyList())
        override suspend fun startDirect(userId: String): NetworkResult<String> = NetworkResult.Success("t1")
        override suspend fun startGroup(userIds: List<String>, title: String?): NetworkResult<String> = NetworkResult.Success("t1")
        override suspend fun getMessages(threadId: String, before: String?, beforeId: String?): NetworkResult<MessagePage> {
            pages += before to beforeId
            return NetworkResult.Success(MessagePage(if (before == null) history else listOf(msg("m0", "u2", "2026-11-04T00:59:00Z")), hasMore && before == null))
        }
        override suspend fun sendMessage(threadId: String, body: String, clientId: String?, media: UploadedMedia?): NetworkResult<ChatMessage> {
            sent += SentCall(body, clientId, media)
            sendErrors.removeFirstOrNull()?.let { return NetworkResult.Error(NetworkError.Http(it, "x")) }
            return NetworkResult.Success(msg("s${++n}", "me", "2026-11-04T02:0$n:00Z", body))
        }
        override suspend fun uploadMedia(threadId: String, bytes: ByteArray, mimeType: String): NetworkResult<UploadedMedia> {
            uploads += bytes.size to mimeType
            uploadError?.let { return NetworkResult.Error(NetworkError.Http(it, "x")) }
            return NetworkResult.Success(UploadedMedia("t1/me/${bytes.size}.webp", 800, 600))
        }
        override suspend fun markRead(threadId: String): NetworkResult<Unit> { reads += threadId; return NetworkResult.Success(Unit) }
        override suspend fun getUnread(): NetworkResult<MessageUnread> = NetworkResult.Success(MessageUnread(0, 0))
    }

    private object Member : SafetySession {
        override fun userId() = "me"
        override fun isAnonymous() = false
    }

    private class FakeReader(var image: PickedImage? = PickedImage(ByteArray(2_000), "image/webp")) : PickedImageReader {
        override suspend fun read(uri: Uri): PickedImage? = image
    }

    private class FakePreparer(var prepared: PreparedPhoto? = null) : ChatPhotoPreparer {
        override suspend fun prepare(bytes: ByteArray, mimeType: String?): PreparedPhoto? = prepared ?: PreparedPhoto(bytes, mimeType ?: "image/jpeg")
    }

    private object NoLog : LoggerProvider {
        override fun d(tag: String, message: String) {}
        override fun i(tag: String, message: String) {}
        override fun w(tag: String, message: String, throwable: Throwable?) {}
        override fun e(tag: String, message: String, throwable: Throwable?) {}
    }

    private companion object {
        fun msg(id: String, sender: String?, at: String, body: String = id) = ChatMessage(id = id, threadId = "t1", senderId = sender, body = body, createdAt = at)
        val URI: Uri = Uri.parse("content://media/external/images/1")
    }

    private fun TestScope.vm(repo: FakeRepo = FakeRepo(), reader: FakeReader = FakeReader(), preparer: FakePreparer = FakePreparer()): Triple<ThreadViewModel, FakeRepo, FakeReader> {
        val model = ThreadViewModel(SavedStateHandle(mapOf("threadId" to "t1")), repo, Member, reader, preparer, NoLog)
        advanceUntilIdle()
        return Triple(model, repo, reader)
    }

    // ── history ──

    @Test
    fun `opening the thread loads the history and moves the read cursor`() = runTest(dispatcher) {
        val (m, repo, _) = vm()
        assertEquals(listOf("m1", "m2"), m.messages.map { it.id })
        assertEquals(listOf("t1"), repo.reads)
        assertFalse(m.isLoading); assertNull(m.failed)
    }

    @Test
    fun `older history pages by the keyset - the oldest loaded message's stamp AND id`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.hasMore = true }
        val (m, _, _) = vm(repo)
        m.loadOlder(); advanceUntilIdle()
        assertEquals("the second page asks with before AND beforeId", "2026-11-04T01:00:00Z" to "m1", repo.pages.last())
        assertEquals(listOf("m0", "m1", "m2"), m.messages.map { it.id })
    }

    // ── the idempotent send ──

    @Test
    fun `a send carries a client id, a retry of the SAME text repeats it, and the next send after a success gets a new one`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.sendErrors += 500 }
        val (m, _, _) = vm(repo)
        m.onDraftChange("xin chào"); m.send(); advanceUntilIdle()
        assertEquals(ThreadViewModel.ThreadFailure.Send, m.failed)
        assertEquals("the draft is kept after a failure", "xin chào", m.draft)
        m.send(); advanceUntilIdle()
        assertEquals("one attempt = one id, however many tries", repo.sent[0].clientId, repo.sent[1].clientId)
        assertNotNull(repo.sent[0].clientId)
        assertEquals("", m.draft)
        m.onDraftChange("xin chào"); m.send(); advanceUntilIdle()
        assertNotEquals("delivered: the next message is a new send, even with the same text", repo.sent[1].clientId, repo.sent[2].clientId)
    }

    @Test
    fun `different text, or a different picture, is a different attempt`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.sendErrors += listOf(500, 500) }
        val (m, _, _) = vm(repo)
        m.onDraftChange("một"); m.send(); advanceUntilIdle()
        m.onDraftChange("hai"); m.send(); advanceUntilIdle()
        assertNotEquals(repo.sent[0].clientId, repo.sent[1].clientId)
    }

    @Test
    fun `the server's row is appended once, with its real id`() = runTest(dispatcher) {
        val (m, _, _) = vm()
        m.onDraftChange("ok"); m.send(); advanceUntilIdle()
        assertEquals(listOf("m1", "m2", "s1"), m.messages.map { it.id })
        assertTrue(m.appendTick > 0)
    }

    @Test
    fun `an empty draft with no picture sends nothing`() = runTest(dispatcher) {
        val (m, repo, _) = vm()
        m.onDraftChange("   "); m.send(); advanceUntilIdle()
        assertTrue(repo.sent.isEmpty())
    }

    // ── neutral refusals ──

    @Test
    fun `a 404 locks the writing area and says only the neutral sentence - never that anyone was blocked`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.sendErrors += 404 }
        val (m, _, _) = vm(repo)
        m.onDraftChange("còn gửi được không"); m.send(); advanceUntilIdle()
        assertTrue(m.locked)
        assertEquals(ThreadViewModel.ThreadFailure.SendLocked, m.failed)
        val before = repo.sent.size
        m.send(); advanceUntilIdle()
        assertEquals("a locked conversation sends nothing more", before, repo.sent.size)
        assertEquals(R_CANNOT_SEND, failureTextRes(ThreadViewModel.ThreadFailure.SendLocked))
    }

    @Test
    fun `a 429 says to slow down and does NOT lock, and any other failure is the generic one`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.sendErrors += listOf(429, 500) }
        val (m, _, _) = vm(repo)
        m.onDraftChange("a"); m.send(); advanceUntilIdle()
        assertEquals(ThreadViewModel.ThreadFailure.SendTooFast, m.failed); assertFalse(m.locked)
        m.send(); advanceUntilIdle()
        assertEquals(ThreadViewModel.ThreadFailure.Send, m.failed); assertFalse(m.locked)
    }

    // ── pictures ──

    @Test
    fun `a picked picture is uploaded at once, kept pending, and goes with the message - which may have no text`() = runTest(dispatcher) {
        val (m, repo, _) = vm()
        m.pickPhoto(URI); advanceUntilIdle()
        assertEquals(1, repo.uploads.size); assertEquals("image/webp", repo.uploads[0].second)
        assertNotNull(m.photo); assertEquals(URI.toString(), m.photo!!.previewUri)
        m.send(); advanceUntilIdle()
        val call = repo.sent.single()
        assertEquals("", call.body); assertEquals("t1/me/2000.webp", call.media!!.path); assertEquals(800, call.media!!.width)
        assertNull("the pending picture is cleared once sent", m.photo)
    }

    @Test
    fun `a picture can be removed before sending`() = runTest(dispatcher) {
        val (m, repo, _) = vm()
        m.pickPhoto(URI); advanceUntilIdle()
        m.removePhoto()
        m.send(); advanceUntilIdle()
        assertNull(m.photo); assertTrue("nothing to send", repo.sent.isEmpty())
    }

    @Test
    fun `a retry of a failed picture send repeats the same client id and the same path`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.sendErrors += 500 }
        val (m, _, _) = vm(repo)
        m.pickPhoto(URI); advanceUntilIdle()
        m.onDraftChange("ảnh nè"); m.send(); advanceUntilIdle()
        m.send(); advanceUntilIdle()
        assertEquals(repo.sent[0].clientId, repo.sent[1].clientId)
        assertEquals(repo.sent[0].media!!.path, repo.sent[1].media!!.path)
    }

    @Test
    fun `every refusal of an upload says why and leaves nothing pending`() = runTest(dispatcher) {
        for ((status, expected) in listOf(
            422 to ThreadViewModel.ThreadFailure.PhotoBlocked,
            503 to ThreadViewModel.ThreadFailure.PhotoScanUnavailable,
            403 to ThreadViewModel.ThreadFailure.PhotoConsent,
            400 to ThreadViewModel.ThreadFailure.PhotoType,
            429 to ThreadViewModel.ThreadFailure.SendTooFast,
            500 to ThreadViewModel.ThreadFailure.PhotoUpload,
        )) {
            val repo = FakeRepo().also { it.uploadError = status }
            val (m, _, _) = vm(repo)
            m.pickPhoto(URI); advanceUntilIdle()
            assertEquals("HTTP $status", expected, m.failed)
            assertNull(m.photo); assertFalse(m.uploading); assertFalse(m.locked)
        }
    }

    @Test
    fun `an upload answered with the neutral 404 locks the conversation too`() = runTest(dispatcher) {
        val repo = FakeRepo().also { it.uploadError = 404 }
        val (m, _, _) = vm(repo)
        m.pickPhoto(URI); advanceUntilIdle()
        assertTrue(m.locked)
    }

    @Test
    fun `a file that is not a picture, or cannot be read, or stays over 5 MB, never reaches the server`() = runTest(dispatcher) {
        val unreadable = FakeReader(image = null)
        val (a, repoA, _) = vm(reader = unreadable)
        a.pickPhoto(URI); advanceUntilIdle()
        assertEquals(ThreadViewModel.ThreadFailure.PhotoType, a.failed); assertTrue(repoA.uploads.isEmpty())

        // a file the preparer cannot turn into a picture (a PDF picked by mistake)
        val declining = object : ChatPhotoPreparer { override suspend fun prepare(bytes: ByteArray, mimeType: String?): PreparedPhoto? = null }
        val repoB = FakeRepo()
        val b = ThreadViewModel(SavedStateHandle(mapOf("threadId" to "t1")), repoB, Member, FakeReader(PickedImage(ByteArray(10), "application/pdf")), declining, NoLog)
        advanceUntilIdle()
        b.pickPhoto(URI); advanceUntilIdle()
        assertEquals(ThreadViewModel.ThreadFailure.PhotoType, b.failed); assertTrue(repoB.uploads.isEmpty())

        val tooBig = FakePreparer(prepared = PreparedPhoto(ByteArray(CHAT_MEDIA_MAX_BYTES + 1), "image/jpeg"))
        val (c, repoC, _) = vm(preparer = tooBig)
        c.pickPhoto(URI); advanceUntilIdle()
        assertEquals(ThreadViewModel.ThreadFailure.PhotoTooLarge, c.failed); assertTrue(repoC.uploads.isEmpty())
    }

    @Test
    fun `the failure texts are the web's, one for one - and the 404 sentence is neutral`() {
        val all = ThreadViewModel.ThreadFailure.entries
        assertEquals("every failure has its own text mapping", all.size, all.map { failureTextRes(it) }.size)
        assertEquals(ThreadViewModel.ThreadFailure.SendLocked, ThreadViewModel.sendFailureFor(404))
        assertEquals(ThreadViewModel.ThreadFailure.SendTooFast, ThreadViewModel.sendFailureFor(429))
        assertEquals(ThreadViewModel.ThreadFailure.Send, ThreadViewModel.sendFailureFor(500))
        assertEquals(ThreadViewModel.ThreadFailure.Send, ThreadViewModel.sendFailureFor(null))
        assertEquals(ThreadViewModel.ThreadFailure.PhotoBlocked, ThreadViewModel.uploadFailureFor(422))
        assertEquals(ThreadViewModel.ThreadFailure.PhotoUpload, ThreadViewModel.uploadFailureFor(null))
    }

    private val R_CANNOT_SEND = com.tappyai.app.R.string.msg_v3_cannot_send
}

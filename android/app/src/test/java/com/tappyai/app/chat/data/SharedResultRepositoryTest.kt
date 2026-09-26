package com.tappyai.app.chat.data

import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/**
 * G1 share-out on Android — the wire → outcome mapping and the preview projection, on the JVM.
 *
 * What must hold for the loop to work from the app: the sanitized preview shown is exactly the
 * server's public payload (never the private turn), a 403 becomes "sign in" rather than a
 * generic error, and a successful publish yields a `/r/<slug>` URL that the app's own share
 * guard accepts.
 */
class SharedResultRepositoryTest {

    private class FakeApi(
        private val previewResult: () -> SharePreviewResponseDto,
        private val publishResult: () -> SharePublishResponseDto,
    ) : SharedResultApi {
        var lastRequest: ShareRequestDto? = null
        override suspend fun preview(body: ShareRequestDto): SharePreviewResponseDto { lastRequest = body; return previewResult() }
        override suspend fun publish(body: ShareRequestDto): SharePublishResponseDto { lastRequest = body; return publishResult() }
    }

    private fun http(code: Int): Nothing =
        throw HttpException(Response.error<Any>(code, "{}".toResponseBody("application/json".toMediaType())))

    private val previewDto = SharePreviewResponseDto(
        payload = SharePreviewPayloadDto(
            title = "Quán cà phê yên tĩnh ở Đà Lạt",
            query = "quán cà phê yên tĩnh ở Đà Lạt",
            body = "## Ba quán\n**A** rất *ngon*, B và C.\n" + "x".repeat(600),
            images = listOf("https://cdn.example/a.jpg"),
            buttons = listOf(SharePreviewButtonDto("Maps", "https://maps.app.goo.gl/x")),
        ),
        listed = false,
    )

    @Test
    fun `preview is the server's public payload, projected for display`() = runTest {
        val api = FakeApi({ previewDto }, { error("unused") })
        val repo = RealSharedResultRepository(api)
        val outcome = repo.preview("conv-1", 3, "vi")
        assertTrue(outcome is ShareOutcome.Success)
        val p = (outcome as ShareOutcome.Success).data
        assertEquals("Quán cà phê yên tĩnh ở Đà Lạt", p.title)
        assertEquals(1, p.imageCount)
        assertEquals(1, p.buttonCount)
        assertFalse(p.listed)
        // Markdown stripped, capped, and marked as truncated.
        assertTrue(p.excerpt.startsWith("Ba quán A rất ngon, B và C."))
        assertTrue(p.excerpt.endsWith("…"))
        assertTrue(p.excerpt.length <= 421)
        assertEquals(ShareRequestDto("conv-1", 3, title = null, locale = "vi"), api.lastRequest)
    }

    @Test
    fun `publish sends the edited title only when non-blank and returns a shareable public URL`() = runTest {
        val api = FakeApi({ previewDto }, { SharePublishResponseDto(id = "id1", slug = "AbCdEfGh12", url = "https://www.tappyai.com/r/AbCdEfGh12", title = "T", domain = "food") })
        val repo = RealSharedResultRepository(api)
        val outcome = repo.publish("conv-1", 3, "   ", "en")
        assertEquals(null, api.lastRequest!!.title)
        val share = (outcome as ShareOutcome.Success).data
        assertEquals("AbCdEfGh12", share.slug)
        assertTrue(com.tappyai.app.share.TappyShare.isShareableUrl(share.url))
        repo.publish("conv-1", 3, "Custom", "en")
        assertEquals("Custom", api.lastRequest!!.title)
    }

    @Test
    fun `403 means sign in, 429 means tomorrow, 422 means not shareable, the rest is a network failure`() = runTest {
        assertEquals(ShareOutcome.AccountRequired, RealSharedResultRepository(FakeApi({ http(403) }, { http(403) })).preview("c", 1, null))
        assertEquals(ShareOutcome.AccountRequired, RealSharedResultRepository(FakeApi({ http(401) }, { http(401) })).publish("c", 1, null, null))
        assertEquals(ShareOutcome.RateLimited, RealSharedResultRepository(FakeApi({ http(429) }, { http(429) })).publish("c", 1, null, null))
        assertEquals(ShareOutcome.NotShareable, RealSharedResultRepository(FakeApi({ http(422) }, { http(422) })).preview("c", 1, null))
        val failed = RealSharedResultRepository(FakeApi({ http(500) }, { http(500) })).preview("c", 1, null)
        assertTrue(failed is ShareOutcome.Failed)
        assertEquals(500, ((failed as ShareOutcome.Failed).error as NetworkError.Http).code)
    }

    @Test
    fun `outcome mapping is exhaustive over network errors`() {
        assertTrue(ShareOutcome.fromNetwork<Unit>(NetworkResult.Error(NetworkError.NoConnectivity)) is ShareOutcome.Failed)
        assertTrue(ShareOutcome.fromNetwork<Unit>(NetworkResult.Error(NetworkError.Timeout)) is ShareOutcome.Failed)
        assertEquals(ShareOutcome.Success(Unit), ShareOutcome.fromNetwork(NetworkResult.Success(Unit)))
    }
}

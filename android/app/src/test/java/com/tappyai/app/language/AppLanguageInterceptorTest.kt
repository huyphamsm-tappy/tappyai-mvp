package com.tappyai.app.language

import com.tappyai.core.network.AppLanguageInterceptor
import com.tappyai.core.network.AppLanguageProvider
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The app language must reach the backend on EVERY request, not just the one endpoint that
 * remembered to ask.
 *
 * The backend localizes from `?lang=` first and `Accept-Language` second. OkHttp sends no
 * `Accept-Language` of its own, so Android sent none, so every such endpoint fell through to its
 * Vietnamese default — including `POST /api/reviews`, whose response tells an author their post
 * was held. An English user was told so in Vietnamese, on the one screen where being understood
 * matters most.
 *
 * These are behavioural tests, not source scans: a second interceptor short-circuits the chain
 * with a synthetic response, so the whole call runs in memory with no server and no network, and
 * what is asserted is the request the server would actually have received.
 */
class AppLanguageInterceptorTest {

    private val baseUrl = "https://api.tappyai.test/"

    /** Captures the request as it looks after [AppLanguageInterceptor] has run. */
    private class Capture : Interceptor {
        var request: Request? = null
        override fun intercept(chain: Interceptor.Chain): Response {
            request = chain.request()
            return Response.Builder()
                .request(chain.request())
                .protocol(Protocol.HTTP_1_1)
                .code(200)
                .message("OK")
                .body("{}".toResponseBody("application/json".toMediaType()))
                .build()
        }
    }

    private fun requestAfterInterceptor(
        url: String,
        languageTag: String,
        build: Request.Builder.() -> Unit = {},
    ): Request {
        val capture = Capture()
        val client = OkHttpClient.Builder()
            .addInterceptor(AppLanguageInterceptor(AppLanguageProvider { languageTag }, baseUrl))
            .addInterceptor(capture)
            .build()
        val request = Request.Builder().url(url).apply(build).build()
        client.newCall(request).execute().close()
        return requireNotNull(capture.request) { "the chain never reached the capture interceptor" }
    }

    @Test
    fun `an English app asks the backend for English`() {
        val request = requestAfterInterceptor("${baseUrl}api/reviews", "en")
        assertEquals("en", request.header("Accept-Language"))
    }

    @Test
    fun `a Vietnamese app asks the backend for Vietnamese`() {
        val request = requestAfterInterceptor("${baseUrl}api/reviews", "vi")
        assertEquals("vi", request.header("Accept-Language"))
    }

    @Test
    fun `the header is attached to every endpoint, not a chosen few`() {
        // The point of doing this in an interceptor. Each of these localizes from the request
        // language server-side, and each one used to receive nothing.
        for (path in listOf("api/reviews", "api/reviews/feed?page=0&limit=12", "api/deals")) {
            val request = requestAfterInterceptor(baseUrl + path, "en")
            assertEquals("en on $path", "en", request.header("Accept-Language"))
        }
    }

    @Test
    fun `a third-party host is told nothing about this user`() {
        // Same rule AuthInterceptor follows, and for the same reason: the OkHttp client is a
        // process-wide singleton, so an unscoped interceptor would hand a user attribute to
        // whatever SDK reused it next.
        val request = requestAfterInterceptor("https://maps.example.com/v1/place", "en")
        assertNull(request.header("Accept-Language"))
    }

    @Test
    fun `a caller that set its own Accept-Language keeps it`() {
        val request = requestAfterInterceptor("${baseUrl}api/reviews", "en") {
            header("Accept-Language", "fr")
        }
        assertEquals("fr", request.header("Accept-Language"))
    }
}

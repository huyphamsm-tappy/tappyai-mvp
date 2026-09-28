package com.tappyai.app.uat

import com.tappyai.core.network.DeploymentProtectionInterceptor
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
 * The `uat` build talks to a Vercel deployment that sits behind Deployment Protection, so every
 * request to that host must carry `x-vercel-protection-bypass`. The secret is supplied at build
 * time and is EMPTY in every other variant — an empty secret must add nothing at all, and the
 * header must never reach a host other than our own API (the OkHttp client is a process-wide
 * singleton, so a third-party call through it would otherwise receive the secret).
 */
class DeploymentProtectionInterceptorTest {

    private val baseUrl = "https://uat.tappyai.test/"

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

    private fun send(url: String, secret: String): Request {
        val capture = Capture()
        val client = OkHttpClient.Builder()
            .addInterceptor(DeploymentProtectionInterceptor(secret, baseUrl))
            .addInterceptor(capture)
            .build()
        client.newCall(Request.Builder().url(url).build()).execute().close()
        return requireNotNull(capture.request)
    }

    @Test
    fun `the uat build sends the bypass header to its own API`() {
        val request = send("${baseUrl}api/chat", "s3cret")
        assertEquals("s3cret", request.header(DeploymentProtectionInterceptor.HEADER))
    }

    @Test
    fun `an empty secret - every non-uat variant - adds no header`() {
        val request = send("${baseUrl}api/chat", "")
        assertNull(request.header(DeploymentProtectionInterceptor.HEADER))
    }

    @Test
    fun `the secret never reaches another host`() {
        val request = send("https://images.example.org/a.jpg", "s3cret")
        assertNull(request.header(DeploymentProtectionInterceptor.HEADER))
    }
}

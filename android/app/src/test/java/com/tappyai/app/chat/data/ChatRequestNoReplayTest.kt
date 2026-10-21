package com.tappyai.app.chat.data

import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * `POST /api/chat` takes one question from the quota when the server accepts it. OkHttp's
 * `retryOnConnectionFailure(true)` (the shared client) re-sends a repeatable POST on the NEXT route
 * when the first connection breaks while waiting for the response — and `tappyai.com` resolves to
 * more than one address. That is a second, invisible charge for one tap. The chat request's body is
 * one-shot, so it is never replayed once sending started; only the person's own «Retry» is a second
 * attempt. Nothing here decides what counts as a question — that stays the server's call.
 */
class ChatRequestNoReplayTest {

    private val json = "application/json".toMediaType()
    private val payload = """{"messages":[{"role":"user","content":"xin chào"}]}"""

    @Test
    fun `the chat request body is one-shot and otherwise identical`() {
        val plain = payload.toRequestBody(json)
        val body = chatRequest("http://10.0.2.2:3200/", plain).body!!

        assertTrue(body.isOneShot())
        assertEquals(plain.contentType(), body.contentType())
        assertEquals(plain.contentLength(), body.contentLength())
        val written = Buffer().also { body.writeTo(it) }.readUtf8()
        assertEquals(payload, written)
    }

    /**
     * A host with two addresses. The first connection accepts the request and drops it without
     * answering; the second would answer. Returns how many POSTs the server saw.
     */
    private fun postsSeen(oneShot: Boolean): Int {
        val seen = AtomicInteger(0)
        ServerSocket(0).use { server ->
            server.soTimeout = 3_000
            val acceptor = Thread {
                try {
                    while (true) {
                        val socket = server.accept()
                        val input = socket.getInputStream()
                        val head = StringBuilder()
                        while (!head.endsWith("\r\n\r\n")) {
                            val b = input.read()
                            if (b < 0) break
                            head.append(b.toChar())
                        }
                        val length = Regex("(?i)content-length: (\\d+)").find(head)?.groupValues?.get(1)?.toInt() ?: 0
                        repeat(length) { input.read() }
                        if (head.startsWith("POST ")) {
                            val n = seen.incrementAndGet()
                            if (n >= 2) {
                                socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                                socket.getOutputStream().flush()
                            }
                        }
                        socket.close() // the first POST: dropped before any response byte
                    }
                } catch (_: IOException) {
                    // accept() timed out: no more attempts are coming.
                }
            }.also { it.isDaemon = true; it.start() }

            val twoAddresses = object : Dns {
                override fun lookup(hostname: String): List<InetAddress> = listOf(
                    InetAddress.getByAddress(hostname, byteArrayOf(127, 0, 0, 1)),
                    InetAddress.getByAddress(hostname, byteArrayOf(127, 0, 0, 2)),
                )
            }
            val client = OkHttpClient.Builder()
                .dns(twoAddresses)
                .retryOnConnectionFailure(true)
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(2, TimeUnit.SECONDS)
                .build()
            val base = "http://chat.test:${server.localPort}/"
            val request = if (oneShot) {
                chatRequest(base, payload.toRequestBody(json))
            } else {
                okhttp3.Request.Builder().url("${base}api/chat").post(payload.toRequestBody(json)).build()
            }
            try {
                client.newCall(request).execute().close()
            } catch (_: IOException) {
                // expected for the one-shot request: the first (dropped) attempt is the only one
            }
            acceptor.join(4_000)
        }
        return seen.get()
    }

    @Test
    fun `a chat request that broke while waiting for the answer is not sent a second time`() {
        assertEquals("the dropped request must be seen exactly once", 1, postsSeen(oneShot = true))
    }

    @Test
    fun `control - an ordinary repeatable POST IS replayed on the next address by the same client`() {
        // Proves the test above discriminates: without the one-shot body OkHttp sends the POST again.
        assertEquals("control: a repeatable body is replayed", 2, postsSeen(oneShot = false))
    }
}
